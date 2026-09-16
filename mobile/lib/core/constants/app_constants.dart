class AppConstants {
  static const String appName = 'Dot + Dash Accounts';
  static const String appVersion = '1.0.0';
  
  // API Configuration
  static const String apiBaseUrl = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: 'http://localhost:3000',
  );
  
  // Storage Keys
  static const String keyAuthToken = 'auth_token';
  static const String keyUserId = 'user_id';
  static const String keyCompanyId = 'company_id';
  static const String keyUserEmail = 'user_email';
  
  // API Endpoints
  static const String authValidateEndpoint = '/api/mobile/auth/validate';
  static const String dashboardEndpoint = '/api/mobile/dashboard';
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
}
