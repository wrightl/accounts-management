import '../config/app_env.dart';

class AppConstants {
  static const String appName = 'Alfa by Dot+Dash';
  static const String appVersion = '1.0.0';

  static const String _definedApiBaseUrl = String.fromEnvironment('API_BASE_URL');
  static const String _definedClerkPublishableKey =
      String.fromEnvironment('CLERK_PUBLISHABLE_KEY');
  static const String _definedClerkPublishableKeyAlias =
      String.fromEnvironment('NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY');
  static const String _defaultApiBaseUrl = 'http://localhost:3001';

  /// Compile-time `--dart-define` wins, then dotenv files, then localhost:3001.
  static String get apiBaseUrl {
    if (_definedApiBaseUrl.isNotEmpty) return _definedApiBaseUrl;
    return AppEnv.get('API_BASE_URL') ?? _defaultApiBaseUrl;
  }

  /// Same value as the web app's `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`.
  static String get clerkPublishableKey {
    if (_definedClerkPublishableKey.isNotEmpty) {
      return _definedClerkPublishableKey;
    }
    if (_definedClerkPublishableKeyAlias.isNotEmpty) {
      return _definedClerkPublishableKeyAlias;
    }
    return AppEnv.get('CLERK_PUBLISHABLE_KEY') ??
        AppEnv.get('NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY') ??
        '';
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
  static const String expenseEndpoint = '/api/mobile/expenses/:id';
  static const String expenseApproveEndpoint = '/api/mobile/expenses/:id/approve';
  static const String expenseRejectEndpoint = '/api/mobile/expenses/:id/reject';
  static const String uploadReceiptEndpoint = '/api/mobile/expenses/:id/receipts';
  
  // UI Constants
  static const double defaultPadding = 16.0;
  static const double defaultBorderRadius = 8.0;
  static const int animationDuration = 300;

  // Currency
  static const String currencySymbol = '£';
  static const String currencyCode = 'GBP';

  /// Web billing settings (manage plan / upgrade).
  static String get webBillingUrl {
    final base = apiBaseUrl.replaceAll(RegExp(r'/$'), '');
    return '$base/settings/billing';
  }
}
