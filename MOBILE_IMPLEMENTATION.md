# Mobile app

The Flutter app in `mobile/` is the phone companion to the web portal. It does three jobs: capture expenses, review what's waiting, and show what needs attention today. Everything else opens on the web app.

Setup, running and the endpoint list are in [mobile/README.md](mobile/README.md). This file covers how the app is organised and the rules that keep it consistent with the portal.

## Screens

| Tab | Holds |
| --- | --- |
| Overview | Needs attention, headline figures for the chosen period, Safe to pay yourself (limited companies), next deadline. The web's other charts sit behind "More insights". The bell opens the inbox. |
| Expenses | Expense list filtered by status. Capture reads the receipt photo, supports mileage, and asks the same status, payer, client/order and VAT questions as the web form. Pending (emailed) receipts are approved with the same choices as the web review, or rejected (deleted). |
| Sales | Invoices, Quotes (if in the person's menu) and Clients, read-only. |
| More | Weekly close, AI bookkeeper, Deadlines, Spending, Reimbursements, Dividends, Notifications, then "Open Alfa on the web", Settings (on the web), profile and Sign out. |

Bank reconciliation, reports, orders, recurring invoices, shareholders, settings and the team are deliberately left to the web. Notification links to those pages open the web app.

## Staying consistent with the portal

**Same rules, one implementation.** Each `/api/mobile/*` route that changes data calls the same `src/lib` function as the web action:

| Area | Shared function |
| --- | --- |
| Create expense | `createExpenseRecord` (`src/lib/expenses/create.ts`) |
| Approve / reject / receipt upload | `src/lib/expenses/review.ts` |
| Read receipt | `readReceiptFields` (`src/lib/expenses/receipt-extract.ts`) |
| Deadlines | `setDeadlineDone` (`src/lib/deadlines/filings.ts`) |
| Weekly close | `recordWeeklyClose` (`src/lib/close/record.ts`) |
| AI bookkeeper | `src/lib/bookkeeper/review.ts` |

Web actions wrap these in `mutate`. Mobile routes use `requireMobileAuth` (pass `checkSuspended: true` for writes) and write the same audit entry. Don't write to the database directly from a mobile route.

**Same menu.** `POST /api/mobile/auth/validate` returns `menuFeatures`, the optional pages this person shows on the web, worked out from the web menu itself (`src/lib/mobile/menu.ts`). Gate optional screens with `user.showsFeature('<feature>')`; core pages (deadlines, invoices, clients, expenses) always show.

**Same permissions.** `validate` also returns `permissions` for the person's role. Gate actions with `user.canWriteAccounts`, `canReadReports` and so on, and hide write actions when `isBillingReadOnly`. Never compare role names in the app.

**Same words.** Use the portal's page names and sentence case. Copy the web's wording for labels and messages (status labels come from `expenseStatusLabel`, which mirrors the web's).

## Code layout

- `lib/data/models`: JSON models. `user.g.dart` is generated, so put defaults in `@JsonKey` on the source, never in the generated file.
- `lib/data/repositories`: one per area; `ApiClient` adds the Clerk session token, and `apiErrorFrom` turns server errors (including field errors) into messages.
- `lib/features/<area>`: screens and providers. The deadlines, weekly close and bookkeeper screens use the shared `LoadedList` widget (pull to refresh and retry).
- `lib/core/utils/web_links.dart`: `openOnWeb(context, path)` for anything left to the web.

Regenerate JSON code and test mocks with `dart run build_runner build` from `mobile/`.

## Tests

- Server: `tests/integration/mobile-api.test.ts` (expense rules, roles, menu) and `tests/integration/mobile-next.test.ts` (receipts, mileage, deadlines, weekly close, bookkeeper, dashboard).
- App: `mobile/test/unit` for models and providers; `mobile/test/widget` for the dashboard layout, More and Sales menu filtering, and role gating on deadlines. `test/support/signed_in.dart` gives a signed-in `AuthProvider` with chosen permissions and menu.

## Roadmap

The shared Mobile app roadmap doc tracks what's done and what's next.
