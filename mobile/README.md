# Mobile App - Alfa by Dot+Dash

Flutter mobile application for Alfa, providing on-the-go access to expense management and dashboard features.

## Features

- **Dashboard**: View KPIs, outstanding invoices, pending expenses, and attention items
- **Expense Management**: 
  - Capture expenses with camera
  - Upload receipts
  - Approve/reject pending expenses
  - View expense history
- **Secure Authentication**: Clerk sign-in (Google and other dashboard providers), same instance as the web app

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

3. API URL and Clerk: debug builds load `.env.development`.
   Set `CLERK_PUBLISHABLE_KEY` to the same value as the web app's
   `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`. Never add `CLERK_SECRET_KEY` to the
   mobile app.

   For a device-specific API URL, copy `.env.example` to `.env.local` and run:

```bash
flutter run --dart-define-from-file=.env.local
```

## Running the App

### Development

Start the Next.js API (`npm run dev` in the repo root), then:

```bash
flutter run
```

Debug/profile builds load `mobile/.env.development` (`API_BASE_URL=http://localhost:3001`). `--dart-define` / `--dart-define-from-file` override the file.

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

Sign-in uses the Clerk Flutter SDK against the same Clerk application as the
website. Google opens in the **system browser** (not an in-app WebView), then
returns to the app via `com.clerk.flutter://callback`. After sign-in the app
sends the Clerk session JWT to `/api/mobile/*` as `Authorization: Bearer`.

In the Clerk Dashboard, enable **Native applications** for this instance.

## Development Notes

- The app uses Provider for state management
- Dio is used for HTTP requests
- Flutter Secure Storage stores authentication tokens
- Image Picker handles camera and gallery access
