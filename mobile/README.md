# Mobile App - Dot + Dash Accounts

Flutter mobile application for Dot + Dash Accounts, providing on-the-go access to expense management and dashboard features.

## Features

- **Dashboard**: View KPIs, outstanding invoices, pending expenses, and attention items
- **Expense Management**: 
  - Capture expenses with camera
  - Upload receipts
  - Approve/reject pending expenses
  - View expense history
- **Secure Authentication**: JWT-based authentication via Clerk

## Requirements

- Flutter 3.47.4 or later
- Dart 3.13.3 or later
- iOS 12.0+ / Android 5.0+

## Setup

1. Install Flutter dependencies:
```bash
cd mobile
flutter pub get
```

2. Generate JSON serialization code:
```bash
flutter pub run build_runner build --delete-conflicting-outputs
```

3. Configure API base URL:
Set the `API_BASE_URL` environment variable or update the default in `lib/core/constants/app_constants.dart`.

## Running the App

### Development
```bash
flutter run
```

### Build for Release

iOS:
```bash
flutter build ios --release
```

Android:
```bash
flutter build apk --release
```

## Testing

Run unit tests:
```bash
flutter test
```

Run integration tests:
```bash
flutter test integration_test/
```

## Project Structure

```
mobile/
├── lib/
│   ├── core/              # Core utilities, constants, theme
│   ├── data/              # Data layer (models, repositories, API)
│   ├── features/          # Feature modules
│   │   ├── auth/          # Authentication
│   │   ├── dashboard/     # Dashboard
│   │   └── expenses/      # Expense management
│   ├── shared/            # Shared widgets
│   └── main.dart          # App entry point
├── test/                  # Unit and widget tests
└── integration_test/      # Integration tests
```

## API Endpoints

The mobile app communicates with these API endpoints:

- `POST /api/mobile/auth/validate` - Validate JWT token
- `GET /api/mobile/dashboard` - Get dashboard data
- `GET /api/mobile/expenses` - List expenses
- `POST /api/mobile/expenses` - Create expense
- `GET /api/mobile/expenses/:id` - Get expense details
- `POST /api/mobile/expenses/:id/approve` - Approve expense
- `POST /api/mobile/expenses/:id/reject` - Reject expense
- `POST /api/mobile/expenses/:id/receipts` - Upload receipt

## Authentication

The app uses JWT tokens from Clerk for authentication. Users need to:
1. Sign in to the web portal
2. Copy their authentication token
3. Enter the token in the mobile app

## Development Notes

- The app uses Provider for state management
- Dio is used for HTTP requests
- Flutter Secure Storage stores authentication tokens
- Image Picker handles camera and gallery access
