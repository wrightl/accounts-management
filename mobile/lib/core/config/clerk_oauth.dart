import 'package:app_links/app_links.dart';
import 'package:clerk_auth/clerk_auth.dart';
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
