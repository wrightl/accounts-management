# Provisioning & deployment setup

Steps to take the platform live on Vercel with Neon, Clerk, Blob, Resend, Google
SSO and the custom subdomain. Items marked **(you)** are dashboard/DNS actions
outside the repo; once done, add the listed secrets to the Cursor agent
**Secrets** panel so the environment can run everything end-to-end here too.

## 1. Vercel project **(you)**

1. Import `github.com/wrightl/accounts-management` into the Vercel team.
2. Framework preset: **Next.js** (auto-detected).
3. Production branch: `main` → deploys on every merge to `main` (default).
4. Preview deployments for pull requests: leave enabled (default).

## 2. Neon Postgres (Vercel integration) **(you)**

1. Vercel → Storage / Integrations → **Neon** → connect to the project.
2. This injects `DATABASE_URL` (pooled) and `DATABASE_URL_UNPOOLED` (direct).
3. Enable **"create a database branch per preview"** so PR previews get
   isolated databases. **Verify this is on** — if Preview shares Production's
   `DATABASE_URL`, every PR build will migrate production. Confirm in Neon
   dashboard (branch per preview) and that Preview env vars are branch-scoped.
4. Schema migrations run automatically on every Vercel **build** (`npm run build`
   → `scripts/migrate-on-build.mjs` → Drizzle migrator over a direct `pg`
   connection when `DATABASE_URL` or `DATABASE_URL_UNPOOLED` is set). Prefer
   `DATABASE_URL_UNPOOLED` for migrations. CI builds without a database skip
   migrate. Do **not** use `npm run db:push` against Neon — meta snapshots after
   `0010` are incomplete, so push can invent wrong diffs. Always use
   `db:generate` + `db:migrate` (or rely on migrate-on-build).
5. After migrate, seed platform operators locally with `npm run db:seed`. That
   inserts `PLATFORM_ADMIN_EMAILS` (default `admin@dotanddashconsulting.com`) with
   role `platform_admin` and no company, and sends Clerk invitations so they set a
   password on first login. Platform operators use `/platform` **only** — they
   never join a tenant or complete company onboarding. Do **not** run seed on
   every production deploy. Seed refuses production / Vercel Preview unless
   `ALLOW_PROD_SEED=1`.

## 3. Clerk (Vercel integration + Clerk dashboard) **(you)**

1. Vercel → Integrations → **Clerk** → connect. Injects
   `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY`.
2. In the Clerk dashboard:

- **Google SSO**: enable Google as a social connection, linked to the
  `dotanddashconsulting.com` Google Workspace. **Do not** restrict the
  allowed domain (the accountant signs in with a non-Workspace Google
  account).
- **Invite-only accountant**: disable open sign-up (or restrict), and invite
  the accountant explicitly. Admins can also invite from **Dashboard → Users**.
  The same accountant Google account can be invited to **multiple companies**
  (read-only + export); founders remain one company per login.
- **Roles**: do **not** put roles in Clerk metadata. First sign-in creates a
  `users` row as **pending**. Self-serve onboarding makes the founder
  **admin** of their new company. Platform operators come from
  `PLATFORM_ADMIN_EMAILS` / `npm run db:seed` (or the portal Users page) and
  go to `/platform` — they never join a company. Assign company roles
  from **Dashboard → Users**. Keep sign-up invite-only so random Google
  accounts cannot wander in.
- **Paths**: sign-in `/sign-in`, sign-up `/sign-up`, after sign-in
  `/dashboard` (platform operators are redirected to `/platform`; tenants
  without a company go to `/onboarding`), after sign-up `/onboarding` (set
  `NEXT_PUBLIC_CLERK_SIGN_IN_FORCE_REDIRECT_URL` and
  `NEXT_PUBLIC_CLERK_SIGN_UP_FORCE_REDIRECT_URL`).

## 4. Vercel Blob **(you)**

1. Vercel → Storage → **Blob** → create a store.
2. Injects `BLOB_READ_WRITE_TOKEN` (required in production — the app will not
   fall back to in-memory storage).
3. Receipts and invoice PDFs are stored with `access: "private"` and streamed
   through authorised routes.

## 4b. Cron secret **(you)**

1. Generate a long random string and set `CRON_SECRET` on the Vercel project
   (Production + Preview).
2. Vercel Cron calls `/api/cron/daily` once per day (Hobby limit) with
   `Authorization: Bearer $CRON_SECRET`. If the variable is missing,
   `/api/cron/*` returns 503 — it does **not** run open.
3. For inbound-email retries every 15 minutes (blocked on Hobby Vercel Cron),
   add GitHub Actions secrets on the repo:

- `CRON_SECRET` — same value as Vercel Production
- `APP_URL` — `https://accounts-manager.dotanddashconsulting.com` (no trailing slash) Workflow: `.github/workflows/cron-inbound-email.yml`.

## 5. Email — Resend **(you)**

1. Create a Resend account/API key → set `RESEND_API_KEY` and `EMAIL_PROVIDER=resend`.
   In production, `EMAIL_PROVIDER=console` is **rejected** (sends throw) — do not
   leave the default console transport on the live project.
2. Verify the sending domain (add the DNS records Resend provides for **outbound**).
3. Enable **Receiving** on `dotanddashconsulting.com` (MX records — separate from sending DNS).
4. Create a webhook → `https://accounts-manager.dotanddashconsulting.com/api/webhooks/resend` with event `email.received`. Copy the signing secret → `RESEND_WEBHOOK_SECRET`.
5. Set inbound routing env:

- `EXPENSE_INBOUND_DOMAIN=dotanddashconsulting.com` (the receiving domain)
- `EXPENSE_INBOUND_PREFIX=expenses` (local-part prefix)
  Each founder gets a personal address shown on **Expenses**:
  `expenses+{companySlug}.{userSlug}@dotanddashconsulting.com`
  (e.g. `expenses+dot-dash-consulting.lee@dotanddashconsulting.com`).
  Forward or send receipt emails to that address; the app creates **pending**
  expenses for that user and company. Unrelated aliases (`info@`, `hello@`, …)
  are ignored.

6. The provider is abstracted in `src/lib/email` — swap it later without touching call sites.

## 6. Custom subdomain **(you)**

1. Vercel → Project → **Domains** → add `accounts.dotanddashconsulting.com`.
2. In **Squarespace DNS**, add the record Vercel shows — typically a `CNAME`
   for `accounts` → `cname.vercel-dns.com`.
3. Set `NEXT_PUBLIC_APP_URL=https://accounts-manager.dotanddashconsulting.com`.

## 7. Secrets to add to the Cursor agent **(you)**

So the Cloud Agent environment can build/run/test with real services, add these
in the Secrets panel:

- `DATABASE_URL`, `DATABASE_URL_UNPOOLED`
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`
- `BLOB_READ_WRITE_TOKEN`
- `CRON_SECRET` (required — cron routes return 503 until this is set)
- `RESEND_API_KEY` (+ set `EMAIL_PROVIDER=resend`)
- `RESEND_WEBHOOK_SECRET`, `EXPENSE_INBOUND_DOMAIN`, `EXPENSE_INBOUND_PREFIX` (inbound expense emails)

Use **test/development** credentials here where possible; production values live
in Vercel.

## Go-live checklist

- [ ] Neon **"branch per preview"** enabled (Preview must not share Production `DATABASE_URL`)
- [ ] `DATABASE_URL_UNPOOLED` on Production (and Preview branches)
- [ ] `EMAIL_PROVIDER=resend` + verified domain + `RESEND_*` (`console` is rejected in production)
- [ ] `CRON_SECRET` set; Vercel cron firing; GH secrets `CRON_SECRET` + `APP_URL`
- [ ] Resend webhook → production `/api/webhooks/resend`
- [ ] One-time `ALLOW_PROD_SEED=1 npm run db:seed` for platform admins
- [ ] `/platform` health all green
- [ ] Errors appear in `/platform` logs (`reportError` / `onRequestError`); add Sentry when you outgrow `platform_logs`
