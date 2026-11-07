import 'dart:async';

import 'package:app_links/app_links.dart';
import 'package:clerk_auth/clerk_auth.dart';
import 'package:clerk_flutter/clerk_flutter.dart' show ClerkAuth, ClerkAuthState;
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
    _debug('callback params=${uri.queryParameters.keys.toList()}', auth); // OAUTH-DEBUG
    if (auth.isSignedIn) return;
    try {
      final nonce = uri.queryParameters['rotating_token_nonce'];
      if (nonce != null && (auth.signIn ?? auth.signUp) != null) {
        await auth.completeOAuthSignIn(token: nonce);
        _debug('after completeOAuthSignIn', auth); // OAUTH-DEBUG
      } else {
        await auth.refreshClient();
        _debug('after refreshClient', auth); // OAUTH-DEBUG
      }
      // A Google account with no Clerk user yet comes back transferable.
      await auth.transfer();
      _debug('after transfer', auth); // OAUTH-DEBUG
    } catch (error) {
      _debug('error ${error.runtimeType}: $error', auth); // OAUTH-DEBUG
      auth.handleError(error);
    }
  }

  // OAUTH-DEBUG: temporary; logs state only, never tokens.
  static void _debug(String step, Auth auth) {
    final c = auth.client;
    debugPrint('[oauth-debug] $step | signedIn=${auth.isSignedIn} '
        'signIn=${c.signIn?.id}/${c.signIn?.status} '
        'verification=${c.signIn?.verification?.strategy}/${c.signIn?.verification?.status} '
        'signUp=${c.signUp?.id}/${c.signUp?.status} '
        'sessions=${c.sessions.map((s) => '${s.id}/${s.status}').toList()} '
        'lastActive=${c.lastActiveSessionId}');
  }

  static Stream<Uri?> deepLinkStream() async* {
    final initial = await _appLinks.getInitialLink();
    if (initial != null) yield _clerkLink(initial);
    yield* _appLinks.uriLinkStream.map(_clerkLink);
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
      debugPrint('[oauth-debug] link received isCallback=${uri != null}'); // OAUTH-DEBUG
      if (uri == null || !mounted) return;
      ClerkOAuth.complete(ClerkAuth.of(context, listen: false), uri);
    });
  }

  // OAUTH-DEBUG: log every signed-in/out flip.
  bool? _wasSignedIn;
  ClerkAuthState? _auth;
  void _watch() {
    final auth = _auth!;
    if (auth.isSignedIn != _wasSignedIn) {
      _wasSignedIn = auth.isSignedIn;
      ClerkOAuth._debug('state changed', auth);
    }
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _auth ??= ClerkAuth.of(context, listen: false)..addListener(_watch); // OAUTH-DEBUG
  }

  @override
  void dispose() {
    _auth?.removeListener(_watch); // OAUTH-DEBUG
    _links?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => widget.child;
}
