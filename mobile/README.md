# Mobile App - Alfa by Dot+Dash

Flutter mobile application for Alfa, providing on-the-go access to expense management and dashboard features.

## Features

The phone does capture, review and "what needs me today"; everything else
opens on the web app. See `MOBILE_IMPLEMENTATION.md` at the repo root.

- **Overview**: needs attention, headline figures, safe to pay, next deadline;
  the web's charts behind "More insights"
- **Expenses**: capture with receipt reading, mileage, foreign currency and
  PDFs; saved offline and sent later; receipts, labels and notes; review
  emailed receipts with the same approve choices as the web
- **Sales**: invoices (with Record payment), quotes (if in your menu) and clients
- **More**: weekly close, AI bookkeeper (with questions), queries, deadlines,
  spending, reimbursements (Mark as paid), dividends, notifications, app lock,
  links to the web, sign out
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

3. API URL and Clerk come from a defines file passed at build time; nothing is
   bundled into the app. Set `API_BASE_URL` and `CLERK_PUBLISHABLE_KEY` (the
   same value as the web app's `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`) in
   `.env.development`, or copy `.env.example` to `.env.local` for a
   device-specific API URL. Never add `CLERK_SECRET_KEY` to the mobile app.

## Running the App

### Development

Start the Next.js API (`npm run dev` in the repo root), then:

```bash
flutter run --dart-define-from-file=.env.development
```

Without `API_BASE_URL`, debug and profile builds use `http://localhost:3001`.
The app stops at a settings screen if `CLERK_PUBLISHABLE_KEY` is missing.

### Sharing receipts into Alfa

On Android, a photo or PDF shared from another app (Photos, Files, Gmail)
opens the capture form; the intent filters are in `AndroidManifest.xml`.

iOS needs a Share Extension target, which has to be added in Xcode because it
needs its own bundle id, an App Group and signing:

1. In Xcode, File → New → Target → Share Extension, named `Share Extension`,
   with the same deployment target as Runner.
2. Add an App Group (e.g. `group.com.dotanddash.alfa`) to both Runner
   and the extension under Signing & Capabilities.
3. Follow the iOS steps in the `receive_sharing_intent` README: replace the
   extension's `Info.plist` (allow images and one file), set its
   `ShareViewController` to subclass `RSIShareViewController`, and add
   `AppGroupId` and the `ShareMedia-$(PRODUCT_BUNDLE_IDENTIFIER)` URL scheme to
   `ios/Runner/Info.plist`.

Until then, choosing a PDF with **Choose a PDF or file** on the capture form
works on both platforms.

### Home-screen widget

The widget shows what clients owe and, for limited companies, Safe to pay. The
app writes the figures each time the Overview loads (`HomeWidgetSync`), and
writes none while the app lock is on or after signing out.

Android is ready: `AlfaWidgetProvider` with `res/layout/alfa_widget.xml`.

iOS needs a WidgetKit extension, added in Xcode:

1. File → New → Target → Widget Extension, named `AlfaWidget` (the `iOSName`
   in `lib/core/widget/home_widget_sync.dart`), without a configuration intent.
2. Give Runner and the extension the same App Group, and call
   `HomeWidget.setAppGroupId` with it before the first `saveWidgetData`.
3. In the widget's timeline provider, read `owed`, `safe_to_pay` and `updated`
   from `UserDefaults(suiteName:)` for that group. Show "Open Alfa to see your
   figures" when `owed` is missing.

The figures refresh when the app opens; there is no background refresh,
because that would need a session outside the app.

### Build for Release

Release builds need both `API_BASE_URL` and `CLERK_PUBLISHABLE_KEY`. Without
them the app shows a settings screen rather than using a default server.

iOS:
```bash
flutter build ios --release --dart-define-from-file=.env.production
```

Android:
```bash
flutter build apk --release --dart-define-from-file=.env.production
```

## Releasing

`scripts/release.sh` (or `npm run mobile:release` from the repo root) bumps the
build number, runs the tests, drafts the store copy, takes the screenshots,
builds, and uploads to **TestFlight** and the **Play internal track**. Nothing
is submitted for review: promote the build to production in App Store Connect
and the Play Console. It then commits the version and copy and tags
`mobile-v<version>+<build>`.

```bash
scripts/release.sh                      # both platforms
scripts/release.sh ios --version 1.1.0  # new marketing version
scripts/release.sh android --no-upload  # build only
```

Other flags: `--skip-narrative`, `--skip-screenshots`, `--yes` (don't stop to
review the copy). Upload changed copy or screenshots without a new build with
`bundle exec fastlane ios beta metadata_only:true` (or `android`).

### Store copy

`npm run mobile:narrative` asks Claude, through your local `claude` CLI and its
sign-in, to draft the listing from this README, `MOBILE_IMPLEMENTATION.md` and
the commits since the last `mobile-v*` tag, into `fastlane/metadata/`. Only
docs and commit subjects go into the prompt. Fields over the store limits are
shortened; any still too long are listed for you to trim. The release script
stops for you to review and edit the diff. `--dry-run` prints the copy instead.
It uses Opus; set `NARRATIVE_MODEL` to another `claude --model` value (e.g.
`sonnet`) to change it.

`support_url`, `privacy_url`, `marketing_url`, `copyright`, the categories and
the review notes are kept by hand; the script never touches them.

### Screenshots

`scripts/screenshots.sh` (`--ios`, `--android`) runs
`integration_test/store_screenshots_test.dart` on an iPhone 6.9" and iPad 13"
simulator and the Android phone and tablet emulators. The test renders the
real screens with fictional data from `integration_test/fixtures/` through
`ApiClient.adapterOverride`, so it needs no sign-in or server. Screenshots are
generated, not committed, and the script fails on any size the stores reject.
Change devices with `IOS_PHONE`, `IOS_TABLET`, `ANDROID_PHONE` and
`ANDROID_TABLET`.

### One-off setup

1. **Apps**: create the app in App Store Connect (`com.dotanddash.alfa`)
   and the Play Console (`com.dotanddash.alfa`). Fill in the privacy
   details, content rating and data safety forms there.
2. **iOS signing**: in Xcode, Runner → Signing & Capabilities, choose the team.
   Create an App Store Connect API key (Users and Access → Integrations) and
   export `ASC_KEY_ID`, `ASC_ISSUER_ID` and `ASC_KEY_PATH` (the `.p8` file).
3. **Android signing**: create an upload key and `android/key.properties`
   (`storeFile` relative to `android/`, `storePassword`, `keyAlias`,
   `keyPassword`). Without it release builds use the debug key and the release
   script refuses to run. Enrol in Play App Signing.
4. **Play API**: create a service account with release access and export
   `PLAY_JSON_KEY_PATH`. Upload the first `.aab` by hand in the Play Console;
   Google doesn't allow the API to create the first release. Uploads arrive as
   draft releases, the only kind Play accepts before the app is first
   published; roll each one out in the console. After that, export
   `PLAY_RELEASE_STATUS=completed` so testers get builds straight away.
5. **App Review**: in `fastlane/metadata/ios/review_information/`, put the
   contact Apple calls in `first_name.txt`, `last_name.txt`,
   `email_address.txt` and `phone_number.txt` (with country code, e.g.
   `+44 20 7946 0000`), and a demo account in `demo_user.txt` and
   `demo_password.txt`. None are committed. Without the contact, the upload
   stops after the build reaches TestFlight.
6. **Push**: add `ios/Runner/GoogleService-Info.plist` and
   `android/app/google-services.json`, or the build ships with push off (the
   release script warns).
7. `bundle install` in `mobile/` for fastlane.

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
| `GET/POST /expenses` | List (`limit`, `offset`, `label`); create (same validation as the web form, deduped on `clientRequestId`) |
| `GET /expenses/options` | Payers, clients, orders, currencies, VAT and mileage defaults |
| `POST /expenses/extract` | Read a receipt photo or PDF |
| `GET /expenses/:id`, `POST /expenses/:id/approve`, `/reject`, `/receipts`, `/annotations` | One expense; review; receipt upload; labels and note |
| `GET/POST /labels` | List and create labels |
| `GET/POST /deadlines` | List; mark done or undo |
| `GET/POST /close` | Weekly close checklist; close the week |
| `GET/POST /bookkeeper` | AI suggestions; accept, dismiss, find |
| `GET/POST /bookkeeper/ask` | Questions left today; ask a question |
| `GET /records?resource=` | Lists (`limit`, `offset`): clients, invoices, quotes, reimbursements, spending, dividends |
| `POST /invoices/:id/payments` | Record a payment |
| `POST /reimbursements/:id/paid` | Mark a run paid |
| `GET /queries`, `GET /queries/:id`, `POST /queries/:id/reply` | Accountant queries and replies |
| `/notifications/*` | Inbox, unread count, preferences (including lock-screen privacy), push token |

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
