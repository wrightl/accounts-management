# Dot + Dash Accounts

Accounting software for **UK limited companies and sole traders**, built by
**Dot and Dash Consulting Ltd** (stylised _Dot + Dash Consulting_). Replaces
spreadsheets and shared folders with one app for quotes, orders, invoicing,
expenses, reimbursements, bank reconciliation, and reporting.

Production: [accounts.dotanddashconsulting.com](https://accounts.dotanddashconsulting.com)

Each organisation is a **tenant** (one legal entity). Founders belong to one
company; accountants can be invited to many and switch between them. New users
sign up with Google, then complete **onboarding** (limited company or sole
trader) before they can open the books.

> **Status:** Day-to-day accounting is in the app — including quote PDF/email,
> orders with payment milestones, recurring invoices, inbound expense
> email, and receipt OCR. Bank import is Starling CSV (no live feed). Books are
> **GBP only**; VAT/MTD is not enabled. See [What’s next](#whats-next).

## Stack

| Concern      | Choice                                                              |
| ------------ | ------------------------------------------------------------------- |
| Framework    | Next.js 16 (App Router, RSC, Server Actions), React 19, TypeScript  |
| Styling      | Tailwind CSS v4, brand-themed design tokens                         |
| Auth & roles | Clerk (identity + Google SSO); roles in Postgres, not Clerk metadata |
| Database     | Neon Postgres + Drizzle ORM (PGlite for tests)                      |
| File storage | Vercel Blob (private, streamed via authorised routes)               |
| Email        | Pluggable provider (Resend); `console` in dev (rejected in production) |
| AI / OCR     | Local Tesseract, or Vercel AI Gateway (optional)                    |
| Testing      | Vitest (unit + integration), Playwright (e2e)                       |
| Hosting/CI   | Vercel (merge to `main` + PR previews) + GitHub Actions             |

## What it does

**Sales**

- **Clients** — contact details, notes, quote/invoice history.
- **Quotes** — numbered drafts, version history and rollback, branded PDF,
  email send, accept/decline (with decline reasons), optional payment
  schedule. Accepting a quote creates an **order**.
- **Orders** — copied from a quote (line items + milestones). Raise invoices
  against milestones as work is billed.
- **Invoices** — draft → sent → paid/void; overdue is computed from the due
  date. Branded PDF, email with PDF attached, manual payments. Numbering is
  `{prefix}-{year}-{seq}` (configurable per company).
- **Recurring invoices** — monthly schedules (day 1–28) with line templates,
  optional end date / max count, and per-template **draft** or **auto-send**.
  Daily cron creates invoices when the platform flag is on; founders can also
  generate once per month from the UI.

**Expenses**

- Manual entry, CSV import, or **inbound email**: each user gets
  `expenses+{companySlug}.{userSlug}@domain`. Forward a receipt; the app
  creates a pending expense for that person and company.
- Receipts stored as private blobs; streamed through authorised routes.
- **OCR** on upload (Tesseract locally, or an AI Gateway model from Settings).
  Foreign currencies on receipts are flagged, not converted — amounts stay GBP.
- Mileage allowance (HMRC-style pence-per-mile, default 45p).
- Statuses: pending → recorded / reimbursable / reimbursed / company-paid.

**Banking & money out**

- **Transactions** — import a Starling business CSV; de-dupe; suggest and
  confirm matches to invoice payments or expenses.
- **Spending** — category snapshot from imported bank rows.
- **Reimbursements** — batch reimbursable expenses per founder; mark paid;
  export a run summary.
- **Shareholders & dividends** — Ltd only (hidden for sole traders). Declare
  a dividend and split by shareholding.

**Reporting & admin**

- Dashboard KPIs, aged receivables, income vs expense.
- **Reports** — accrual P&L, VAT summary (0% until registered), accountant
  pack (zip of CSVs, invoice PDFs, receipts, bank, dividends).
- **Audit log** (admins), **inbound email** job queue, **settings** (company
  profile, bank details, numbering, logo, OCR), **users** (invite, role).
- Command palette (`⌘K` / `Ctrl+K`) for navigation.

## Roles

Clerk is identity only. Role and company come from Postgres
(`users` + `company_memberships`). First sign-in creates a local user as
**pending** unless the email is in the bootstrap lists.

| Role          | Access                                                                 |
| ------------- | ---------------------------------------------------------------------- |
| **admin**     | Full access, including users and settings.                             |
| **user**      | Co-founder: day-to-day accounting, reports, and export.                |
| **accountant**| Read-only + export. May belong to **multiple** companies.              |
| **pending**   | Signed in, no books access. Assigned from Dashboard → Users.           |

Self-serve onboarding creates a company and makes that user **admin**. Invited
users skip onboarding and attach to the inviting company. Platform operators
are provisioned separately via `PLATFORM_ADMIN_EMAILS` / `npm run db:seed`
(not a company role).

## Getting started

```bash
npm install
cp .env.example .env.local   # fill in when integrations are ready
npm run dev                  # http://localhost:3001
```

The app runs **without credentials**: public pages work, and auth/DB activate
once their env vars are present (see [Configuration](#configuration)).

When `DATABASE_URL` is set, apply schema then seed platform admins:

```bash
npm run db:migrate
npm run db:seed    # inserts PLATFORM_ADMIN_EMAILS + Clerk invites
```

Seeded operators get the `platform_admin` role (no company) and use `/platform` only —
they never join a tenant. Clerk sends an invitation so they set a password on
first login. Do not run seed on every production deploy.

## Scripts

| Command                 | Description                                                          |
| ----------------------- | -------------------------------------------------------------------- |
| `npm run dev`           | Next.js dev server on port **3001**                                  |
| `npm run build`         | Migrate (if a database URL is set) then production build             |
| `npm run start`         | Next.js production server                                            |
| `npm run lint`          | ESLint                                                               |
| `npm run typecheck`     | TypeScript, no emit                                                  |
| `npm test`              | Vitest unit + integration (PGlite)                                   |
| `npm run test:watch`    | Vitest watch mode                                                    |
| `npm run test:e2e`      | Playwright e2e (own server on port 3100)                             |
| `npm run db:generate`   | Generate a Drizzle migration from the schema                         |
| `npm run db:migrate`    | Apply migrations over a direct Postgres connection (`pg`)            |
| `npm run db:seed`       | Seed platform admins (`PLATFORM_ADMIN_EMAILS` + Clerk invites). Refuses production/remote URLs unless `ALLOW_PROD_SEED=1`. |
| `npm run db:push`       | **Unsafe** while Drizzle meta snapshots lag behind hand migrations (after `0010`). Prefer `db:generate` + `db:migrate`. Do not point at Neon production. |
| `npm run db:studio`     | Drizzle Studio                                                       |
| `npm run tunnel`        | ngrok to port 3001 (inbound webhooks in local dev)                   |
| `npm run promo:all`     | Seed demo data, record UI, assemble the promo video                  |

Promo video notes: [`docs/promo-video.md`](./docs/promo-video.md).

## Configuration

Environment variables are documented in [`.env.example`](./.env.example) and
validated lazily in [`src/env.ts`](./src/env.ts) so public pages and tests can
run before every secret is set.

Feature flags derive from presence:

- `BLOB_READ_WRITE_TOKEN` — Vercel Blob in production (required). Dev/test
  fall back to in-memory storage.
- `EMAIL_PROVIDER` — `console` (default) or `resend`.
- `AI_GATEWAY_API_KEY` — required only when Settings uses the `ai_gateway`
  receipt OCR provider.
- `CRON_SECRET` — required; `/api/cron/*` returns 503 until it matches.

Clerk paths in `.env.example`: sign-in `/sign-in`, sign-up `/sign-up`, after
sign-in `/dashboard`, after sign-up `/onboarding`.

On Vercel, Neon, Clerk, and Blob integrations inject the core secrets. Full
provisioning (SSO, Resend inbound MX, custom domain, DNS):
[`docs/SETUP.md`](./docs/SETUP.md).

### Cron

Vercel Hobby only allows cron jobs **once per day**, so scheduling is split:

**Vercel Cron** (`vercel.json`) — daily at 07:00 UTC, `Authorization: Bearer $CRON_SECRET`:

| Path                | Schedule    | Purpose                                                      |
| ------------------- | ----------- | ------------------------------------------------------------ |
| `/api/cron/daily`   | 07:00 daily | Recurring invoice generation + overdue reminders   |

Manual triggers (same auth) still available: `/api/cron/reminders`,
`/api/cron/recurring`, `/api/cron/inbound-email`.

**GitHub Actions** (`.github/workflows/cron-inbound-email.yml`) — every 15 minutes:

| Path                         | Purpose                                 |
| ---------------------------- | --------------------------------------- |
| `/api/cron/inbound-email`    | Retry stuck/failed inbound expense jobs |

Requires GitHub Actions secrets `CRON_SECRET` and `APP_URL` (production base URL,
no trailing slash).

Inbound receipt email is primarily handled by the Resend webhook
(`/api/webhooks/resend`), which also opportunistically drains a few pending jobs;
the scheduled Action is the drain/retry when no new mail arrives.

## Conventions

- **Money** is integer pence (`src/lib/money.ts`). Books are **GBP**.
- **Dates** use `Europe/London` (`src/lib/dates.ts`), not UTC, so overdue and
  financial-year windows do not flip a day early.
- **VAT** fields exist on line items; the UI stays at 0% until the company is
  VAT registered (MTD is out of scope).
- Every mutation is a Server Action or route handler that re-checks
  permissions (`requirePermission` in `src/lib/auth.ts`). The client is never
  trusted. Queries take `companyId` from the session tenant.
- Schema lives in [`src/db/schema.ts`](./src/db/schema.ts). Migrations run on
  Vercel build via `scripts/migrate-on-build.mjs` when a database URL is set.

## Security

- Clerk session handshake stays in [`src/proxy.ts`](./src/proxy.ts) (Next.js 16
  proxy = former middleware). Auth is enforced in pages, layouts, route
  handlers, and server actions (`requirePermission` in `src/lib/auth.ts`).
  Fine-grained RBAC: [`src/lib/roles.ts`](./src/lib/roles.ts).
- Tenants cannot read each other’s rows (enforced in queries +
  `tests/integration/tenant-isolation.test.ts`).
- Uploaded files are **private** Blob objects, never public URLs.
- Cron and the Resend webhook fail closed without their secrets.
- Security headers and a Clerk-aware CSP in [`next.config.ts`](./next.config.ts).

## Testing

```bash
npm test          # unit + integration (in-memory PGlite)
npm run test:e2e  # Playwright against a production build
```

GitHub Actions (`.github/workflows/ci.yml`) runs lint, typecheck, Vitest,
`next build`, and Playwright on every push to `main` and on pull requests.

## What’s next

| Area                    | State                                                                 |
| ----------------------- | --------------------------------------------------------------------- |
| Recurring invoices      | UI + cron; monthly retainers; draft or auto-send; platform flag defaults off |
| Live bank feed          | CSV import only (Starling adapter seam for a future API)              |
| VAT / Making Tax Digital| Fields reserved; not registered, no HMRC submission                   |
| Multi-currency books    | GBP only; foreign receipt currency is informational                   |

The original phased plan (invoicing → expenses → reimbursements → bank →
reports → quotes/cron) is in [`docs/plan.md`](./docs/plan.md). Treat unfinished
items there as follow-ups, not unstarted work.

Competitor landscape (Sep 2026): [`docs/competitor-research.md`](./docs/competitor-research.md).  
Roadmap for gaps, billing, and public pricing: [`docs/plans/gaps-subscriptions-pricing.md`](./plans/gaps-subscriptions-pricing.md).
