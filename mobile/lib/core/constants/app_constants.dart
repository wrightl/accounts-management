import 'package:flutter/foundation.dart';

class AppConstants {
  static const String appName = 'Alfa by Dot+Dash';
  static const String appVersion = '1.0.0';

  // Set with `--dart-define-from-file` (see mobile/README.md). Nothing is
  // bundled into the app, so a build carries only what it was built with.
  static const String _definedApiBaseUrl = String.fromEnvironment('API_BASE_URL');
  static const String _definedClerkPublishableKey =
      String.fromEnvironment('CLERK_PUBLISHABLE_KEY');
  static const String _definedClerkPublishableKeyAlias =
      String.fromEnvironment('NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY');
  static const String _debugApiBaseUrl = 'http://localhost:3001';

  /// Debug builds fall back to the local Next.js server. Release builds never
  /// do: see [apiBaseUrlConfigured].
  static String get apiBaseUrl {
    if (_definedApiBaseUrl.isNotEmpty) return _definedApiBaseUrl;
    return kReleaseMode ? '' : _debugApiBaseUrl;
  }

  /// False for a release build made without `API_BASE_URL`.
  static bool get apiBaseUrlConfigured => apiBaseUrl.isNotEmpty;

  /// Same value as the web app's `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`.
  static String get clerkPublishableKey {
    if (_definedClerkPublishableKey.isNotEmpty) {
      return _definedClerkPublishableKey;
    }
    return _definedClerkPublishableKeyAlias;
  }
  
  // Storage Keys
  static const String keyAuthToken = 'auth_token';
  static const String keyUserId = 'user_id';
  static const String keyCompanyId = 'company_id';
  static const String keyUserEmail = 'user_email';
  
  // API Endpoints
  static const String authValidateEndpoint = '/api/mobile/auth/validate';
  static const String dashboardEndpoint = '/api/mobile/dashboard';
  static const String recordsEndpoint = '/api/mobile/records';
  static const String expensesEndpoint = '/api/mobile/expenses';
  static const String expenseOptionsEndpoint = '/api/mobile/expenses/options';
  static const String expenseExtractEndpoint = '/api/mobile/expenses/extract';
  static const String deadlinesEndpoint = '/api/mobile/deadlines';
  static const String closeEndpoint = '/api/mobile/close';
  static const String bookkeeperEndpoint = '/api/mobile/bookkeeper';
  static const String expenseEndpoint = '/api/mobile/expenses/:id';
  static const String expenseApproveEndpoint = '/api/mobile/expenses/:id/approve';
  static const String expenseRejectEndpoint = '/api/mobile/expenses/:id/reject';
  static const String uploadReceiptEndpoint = '/api/mobile/expenses/:id/receipts';
  static const String expenseAnnotationsEndpoint =
      '/api/mobile/expenses/:id/annotations';
  static const String labelsEndpoint = '/api/mobile/labels';
  static const String queriesEndpoint = '/api/mobile/queries';
  static const String notificationsEndpoint = '/api/mobile/notifications';
  static const String notificationsUnreadEndpoint =
      '/api/mobile/notifications/unread-count';
  static const String notificationsActionsEndpoint =
      '/api/mobile/notifications/actions';
  static const String notificationsPrefsEndpoint =
      '/api/mobile/notifications/prefs';
  static const String notificationsPushTokenEndpoint =
      '/api/mobile/notifications/push-token';
  
  // UI Constants
  static const double defaultPadding = 16.0;
  static const double defaultBorderRadius = 8.0;
  static const int animationDuration = 300;

  // Currency
  static const String currencySymbol = '£';
  static const String currencyCode = 'GBP';

  /// A page on the web app, e.g. `/settings`.
  static String webUrl(String path) {
    final base = apiBaseUrl.replaceAll(RegExp(r'/$'), '');
    return '$base$path';
  }
}
