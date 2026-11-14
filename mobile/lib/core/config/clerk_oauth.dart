import 'dart:async';

import 'package:app_links/app_links.dart';
import 'package:clerk_auth/clerk_auth.dart';
import 'package:clerk_flutter/clerk_flutter.dart' show ClerkAuth;
import 'package:flutter/widgets.dart';

/// Google (and other OAuth) sign-in via the system browser, not WKWebView.
///
/// Clerk's in-app WebView hits pigeon channel errors on current Flutter iOS
/// builds, and Google blocks OAuth inside embedded web views.
class ClerkOAuth {
  ClerkOAuth._();

  /// Clerk Flutter's default native OAuth callback.
  static final Uri redirectUri = Uri.parse(ClerkConstants.oauthRedirect);

  static final AppLinks _appLinks = AppLinks();

  static Uri? redirectFor(BuildContext context, Strategy strategy) {
    if (strategy.isOauth || strategy.isEmailLink) {
      return redirectUri;
    }
    return null;
  }

  /// Finishes a sign-in from the browser's callback link.
  ///
  /// Clerk's own handler only swaps the nonce while the OAuth verification is
  /// still unverified. Its client refresh (every ~10s) marks it verified while
  /// the user is in the browser, so it skipped the swap and left them signed
  /// out. Swap it whenever we're signed out instead.
  static Future<void> complete(Auth auth, Uri uri) async {
    if (auth.isSignedIn) return;
    try {
      final nonce = uri.queryParameters['rotating_token_nonce'];
      if (nonce != null && (auth.signIn ?? auth.signUp) != null) {
        await auth.completeOAuthSignIn(token: nonce);
      } else {
        await auth.refreshClient();
      }
      // A Google account with no Clerk user yet comes back transferable.
      await auth.transfer();
    } catch (error) {
      auth.handleError(error);
    }
  }

  /// Callback links from the platform, each one once.
  ///
  /// On a cold start app_links returns the launch link from
  /// [AppLinks.getInitialLink] and sends it down [AppLinks.uriLinkStream] too.
  /// Swapping the same single-use nonce twice fails the second swap.
  static Stream<Uri?> deepLinkStream() =>
      onlyOnce(_platformLinks()).map(_clerkLink);

  static Stream<Uri?> _platformLinks() async* {
    yield await _appLinks.getInitialLink();
    yield* _appLinks.uriLinkStream;
  }

  /// Drops links already seen, and nulls.
  @visibleForTesting
  static Stream<Uri> onlyOnce(Stream<Uri?> links) {
    final seen = <Uri>{};
    return links.where((uri) => uri != null && seen.add(uri)).cast<Uri>();
  }

  static bool isCallback(Uri uri) {
    if (uri.scheme == redirectUri.scheme) return true;
    final params = uri.queryParameters;
    return params.containsKey('rotating_token_nonce') ||
        params.containsKey('created_session_id');
  }

  static bool isCallbackRoute(String? name) {
    if (name == null || name.isEmpty) return false;
    return isCallback(Uri.parse(name));
  }

  static Uri? _clerkLink(Uri uri) => isCallback(uri) ? uri : null;
}

/// Completes OAuth sign-in when the browser hands the callback link back.
class ClerkOAuthCallbacks extends StatefulWidget {
  const ClerkOAuthCallbacks({super.key, required this.child});

  final Widget child;

  @override
  State<ClerkOAuthCallbacks> createState() => _ClerkOAuthCallbacksState();
}

class _ClerkOAuthCallbacksState extends State<ClerkOAuthCallbacks> {
  StreamSubscription<Uri?>? _links;

  @override
  void initState() {
    super.initState();
    _links = ClerkOAuth.deepLinkStream().listen((uri) {
      if (uri == null || !mounted) return;
      ClerkOAuth.complete(ClerkAuth.of(context, listen: false), uri);
    });
  }

  @override
  void dispose() {
    _links?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => widget.child;
}
