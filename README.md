# Dot + Dash Consulting — Accounts

Internal accounting platform for **Dot and Dash Consulting Ltd** (stylised
_Dot + Dash Consulting_). Replaces spreadsheets and shared folders with a single
secure app for invoicing, expenses, receipts, reimbursements and reporting.

> **Status:** Phases 1–6 are implemented. Invoicing, expenses, reimbursements,
> bank CSV import, reports, quotes (create/convert), reminder/recurring cron,
> in-app user roles, and the audit log are in the app. Remaining gaps: quote
> send/PDF, and a recurring-invoice UI (cron is behind a flag). See
> [Roadmap](#roadmap).

## Stack

| Concern      | Choice                                                        |
| ------------ | ------------------------------------------------------------- |
| Framework    | Next.js 16 (App Router, RSC, Server Actions), React 19, TS    |
| Styling      | Tailwind CSS v4, brand-themed design tokens                   |
| Auth & roles | Clerk (identity + Google SSO); roles stored in Postgres        |
| Database     | Neon Postgres + Drizzle ORM (PGlite for tests)                |
| File storage | Vercel Blob (private, streamed via authorised routes)         |
| Email        | Pluggable provider (Resend), `console` transport in dev       |
| Testing      | Vitest (unit + integration), Playwright (e2e)                 |
| Hosting/CI   | Vercel (deploy on merge to `main`, PR previews) + GitHub CI   |

## Roles

- **admin** — full access, incl. user & settings management (`lee@dotanddashconsulting.com`).
- **user** — co-founder, full day-to-day accounting access (`angel@dotanddashconsulting.com`).
- **accountant** — external accountant, read-only + export (invite-only, any Google account).
- **pending** — signed in but not yet assigned a role; cannot read or write the books. Assigned from Dashboard → Users.

## Getting started

```bash
npm install
cp .env.example .env.local   # fill in when integrations are ready
npm run dev                  # http://localhost:3000
```

The app runs **without credentials**: public pages work, and auth/DB activate
automatically once their env vars are present (see [Configuration](#configuration)).

When `DATABASE_URL` is set, apply schema then seed the admin:

```bash
npm run db:migrate
npm run db:seed    # inserts BOOTSTRAP_ADMIN_EMAILS as admin
```

## Scripts

| Command               | Description                                    |
| --------------------- | ---------------------------------------------- |
| `npm run dev`         | Next.js dev server                             |
| `npm run build`       | Migrate (if DATABASE_URL is set) then Next.js production build |
| `npm run lint`        | ESLint                                         |
| `npm run typecheck`   | TypeScript, no emit                            |
| `npm test`            | Vitest unit + integration (PGlite)             |
| `npm run test:e2e`    | Playwright end-to-end                          |
| `npm run db:generate` | Generate a Drizzle migration from the schema   |
| `npm run db:migrate`  | Apply migrations over a direct Postgres connection (`pg`) |
| `npm run db:seed`     | Seed the bootstrap admin user (`BOOTSTRAP_ADMIN_EMAILS`) |

## Configuration

Environment variables are documented in [`.env.example`](./.env.example) and
validated in [`src/env.ts`](./src/env.ts). Feature flags derive from presence:

- `isAuthConfigured()` — both Clerk keys present → Clerk mounts and routes are protected.
- `isDatabaseConfigured()` — `DATABASE_URL` present → live data.

On Vercel these are injected by the **Neon**, **Clerk** and **Blob**
integrations. See [`docs/SETUP.md`](./docs/SETUP.md) for the full provisioning
guide (Vercel project, integrations, Google SSO, custom subdomain, DNS).

## Security

- All non-public routes are gated in [`src/proxy.ts`](./src/proxy.ts) (Next.js 16
  proxy = former middleware) and re-checked server-side via
  [`src/lib/auth.ts`](./src/lib/auth.ts) — the client is never trusted.
- Fine-grained RBAC in [`src/lib/roles.ts`](./src/lib/roles.ts).
- Uploaded files are stored as **private** Vercel Blob objects and streamed
  through authorised routes — never public URLs.
- Cron routes fail closed unless `CRON_SECRET` is set and matches.
- Baseline security headers in [`next.config.ts`](./next.config.ts).

## Roadmap

| Phase | Scope | State |
| ----- | ----- | ----- |
| 0     | Foundations: Next.js, Clerk, Drizzle + Neon, branding, security, CI/CD | Done |
| 1     | Invoicing: clients, invoices, PDF, email, payments, dashboard | Done |
| 2     | Expenses & receipts (private Vercel Blob) | Done |
| 3     | Reimbursements to founders | Done |
| 4     | Bank import & reconciliation (Starling CSV) | MVP |
| 5     | Reporting & accountant export pack | Done |
| 6     | Quotes, recurring cron, reminders, audit UI, in-app roles | Partial — quotes have no send/PDF; recurring has no UI |
