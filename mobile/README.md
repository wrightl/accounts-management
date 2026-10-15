# Mobile App - Alfa by Dot+Dash

Flutter mobile application for Alfa, providing on-the-go access to expense management and dashboard features.

## Features

The phone does capture, review and "what needs me today"; everything else
opens on the web app. See `MOBILE_IMPLEMENTATION.md` at the repo root.

- **Overview**: needs attention, headline figures, safe to pay, next deadline;
  the web's charts behind "More insights"
- **Expenses**: capture with receipt reading and mileage; review emailed
  receipts with the same approve choices as the web
- **Sales**: invoices, quotes (if in your menu) and clients
- **More**: weekly close, AI bookkeeper, deadlines, spending, reimbursements,
  dividends, notifications, links to the web, sign out
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
dart run build_runner build
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

The app talks to `/api/mobile/*` on the web app. Each route calls the same
`src/lib` function as the matching web action, so both apply the same rules.

| Endpoint | Purpose |
| --- | --- |
| `POST /auth/validate` | Session user, permissions, menu features, billing |
| `GET /dashboard` | Overview figures, safe to pay, next deadline |
| `GET/POST /expenses` | List; create (same validation as the web form) |
| `GET /expenses/options` | Payers, clients, orders, VAT and mileage defaults |
| `POST /expenses/extract` | Read a receipt photo |
| `GET /expenses/:id`, `POST /expenses/:id/approve`, `/reject`, `/receipts` | One expense; review; receipt upload |
| `GET/POST /deadlines` | List; mark done or undo |
| `GET/POST /close` | Weekly close checklist; close the week |
| `GET/POST /bookkeeper` | AI suggestions; accept, dismiss, find |
| `GET /records?resource=` | Read-only lists: clients, invoices, quotes, reimbursements, spending, dividends |
| `/notifications/*` | Inbox, unread count, preferences, push token |

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
