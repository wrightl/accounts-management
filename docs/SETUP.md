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
5. After schema migrate, the same install step runs **data migrations**
   (`src/db/data-migrations/`). The first one bootstraps the platform operator
   (`lee+admin@dotanddashconsulting.com` as `platform_admin`, no company) and
   sends a Clerk invitation when `CLERK_SECRET_KEY` is set. Platform operators
   use `/platform` **only** — they never join a tenant or complete company
   onboarding. Later operators are invited from **Platform → Users**. Do not
   run ad-hoc SQL or CLI seeds against production; add a new data migration
   (or use the app) instead.

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
  **admin** of their new company. Platform operators come from install-time
  data migrations / the portal Users page and go to `/platform` — they never
  join a company. Assign company roles from **Dashboard → Users**. Keep
  sign-up invite-only so random Google accounts cannot wander in.
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
- `APP_URL` — `https://alfa.dotanddashconsulting.com` (no trailing slash) Workflow: `.github/workflows/cron-inbound-email.yml`.

## 5. Email — Resend **(you)**

1. Create a Resend account/API key → set `RESEND_API_KEY` and `EMAIL_PROVIDER=resend`.
   In production, `EMAIL_PROVIDER=console` is **rejected** (sends throw) — do not
   leave the default console transport on the live project.
2. Verify the sending domain (add the DNS records Resend provides for **outbound**).
3. Enable **Receiving** on `inbound.dotanddashconsulting.com` (MX on the `inbound` host — separate from the `alfa` website CNAME and from apex mail). This domain is shared with other apps; each app uses its own local-part prefix.
4. Create a webhook → `https://alfa.dotanddashconsulting.com/api/webhooks/resend` with event `email.received`. Copy the signing secret → `RESEND_WEBHOOK_SECRET`. Other apps on this domain get their own webhook for the same event and ignore addresses that are not theirs.
5. Set inbound routing env:

- `EXPENSE_INBOUND_DOMAIN=inbound.dotanddashconsulting.com` (the receiving domain)
- `EXPENSE_INBOUND_PREFIX=alfa.expenses` (local-part prefix)
  Each founder gets a personal address shown on **Expenses**:
  `alfa.expenses+{companySlug}.{userSlug}@inbound.dotanddashconsulting.com`
  (e.g. `alfa.expenses+dot-dash-consulting.lee@inbound.dotanddashconsulting.com`).
  Forward or send receipt emails to that address; the app creates **pending**
  expenses for that user and company. Unrelated aliases (`info@`, `hello@`, …)
  are ignored.

6. The provider is abstracted in `src/lib/email` — swap it later without touching call sites.

## 5b. Stripe Billing **(you)** — manual account (not Vercel Marketplace)

1. Create a **UK** Stripe account at stripe.com (GBP settlement).
2. Create four Products/Prices in `gbp` (amounts are whatever you set in Stripe):
    - Essentials monthly
    - Essentials yearly
    - Premium monthly
    - Premium yearly
3. Create a restricted API key (Checkout, Billing, Customers, Webhooks) → `STRIPE_SECRET_KEY`.
4. Publishable key → `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`.
5. Webhook endpoint → `https://alfa.dotanddashconsulting.com/api/webhooks/stripe`  
   Events: `checkout.session.completed`, `customer.subscription.created|updated|deleted`,
   `invoice.paid`, `invoice.payment_failed`, `invoice.upcoming`.  
   Signing secret → `STRIPE_WEBHOOK_SECRET`.
6. In-app billing on **Settings → Billing**: plan changes (Subscriptions API with
   proration), invoice history, and cancel / resume at period end. **Update card**
   opens Stripe Customer Portal (`payment_method_update` flow) — enable payment
   method updates in Stripe → Settings → Billing → Customer portal.
7. Paste the four `price_…` IDs into **Platform → Settings → Stripe plans** (not Vercel env).
   Name, description, and amounts are loaded from Stripe and cached.
8. Optional: enable Stripe Tax + UK VAT registration, then set `STRIPE_TAX_ENABLED=true`.
9. Confirm `/platform/health` shows Stripe keys and price IDs as configured.

### Client invoice payments (Stripe Connect)

Tenants can let clients pay invoices by card from the invoice link (`/i/{token}`).
Each tenant connects **their own** Stripe account (Standard-style: full Stripe
dashboard, they pay Stripe's fees, Stripe handles disputes). Alfa takes no fee.

1. Stripe → **Connect** → get started as a platform (UK). Complete the platform
   profile so Stripe will create connected accounts.
2. Add these permissions to the restricted key: **Connect** (Accounts, Account
   links) write, and **Checkout Sessions** write (used on connected accounts).
3. Add a second webhook endpoint, set to **Listen to events on Connected accounts**:
   `https://alfa.dotanddashconsulting.com/api/webhooks/stripe-connect`  
   Events: `checkout.session.completed`, `checkout.session.async_payment_succeeded`,
   `account.updated`.  
   Signing secret → `STRIPE_CONNECT_WEBHOOK_SECRET` (separate from `STRIPE_WEBHOOK_SECRET`).
4. Tenants connect from **Settings → Online payments**. Pay buttons appear only once
   Stripe reports `charges_enabled` for their account.

Card payments are recorded on the invoice (method `card`). Stripe pays out to the
tenant's bank in batches net of fees, so payout bank rows won't match individual
invoices one-to-one.

Legacy: `STRIPE_PRICE_ESSENTIALS_MONTHLY` / `_YEARLY` / `STRIPE_PRICE_PREMIUM_*` env vars only
seed empty DB columns on first read after migration `0041_stripe_price_ids`. Prefer
Platform Settings going forward; you can remove the env vars once the DB is seeded.

## 6. Custom subdomain **(you)**

1. Vercel → Project → **Domains** → add `accounts.dotanddashconsulting.com`.
2. In **Squarespace DNS**, add the record Vercel shows — typically a `CNAME`
   for `accounts` → `cname.vercel-dns.com`.
3. Set `NEXT_PUBLIC_APP_URL=https://alfa.dotanddashconsulting.com`.

## 7. Secrets to add to the Cursor agent **(you)**

So the Cloud Agent environment can build/run/test with real services, add these
in the Secrets panel:

- `DATABASE_URL`, `DATABASE_URL_UNPOOLED`
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`
- `BLOB_READ_WRITE_TOKEN`
- `CRON_SECRET` (required — cron routes return 503 until this is set)
- `RESEND_API_KEY` (+ set `EMAIL_PROVIDER=resend`)
- `RESEND_WEBHOOK_SECRET`, `EXPENSE_INBOUND_DOMAIN`, `EXPENSE_INBOUND_PREFIX` (inbound expense emails)
- `STRIPE_SECRET_KEY`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET`
- (Optional legacy seed) `STRIPE_PRICE_ESSENTIALS_MONTHLY`, `STRIPE_PRICE_ESSENTIALS_YEARLY`, `STRIPE_PRICE_PREMIUM_MONTHLY`, `STRIPE_PRICE_PREMIUM_YEARLY` — prefer Platform → Settings

Use **test/development** credentials here where possible; production values live
in Vercel.

## 8. Preview environment (`preview` branch) **(you)**

A long-lived staging copy at `https://alfa.preview.dotanddashconsulting.com`,
deployed from the `preview` branch. It is Vercel's built-in **Preview**
environment with **branch-scoped** env vars (Git branch = `preview`), which
override the general Preview values for that branch only. PR previews keep the
general Preview values. It never shares users, data, email or payments with
production.

### 8.1 Branch and domain

1. Create the branch: `git switch -c preview origin/main && git push -u origin preview`.
2. Vercel → Project → **Settings → Domains** → add
   `alfa.preview.dotanddashconsulting.com` → connect to **Preview**, Git branch
   `preview`.
3. Squarespace DNS: `CNAME` host `alfa.preview` → the target Vercel shows
   (usually `cname.vercel-dns.com`).

### 8.2 Deployment protection

Standard Protection puts Vercel login in front of every domain except
production's. That blocks Resend and Stripe webhooks and the cron call.

1. Settings → **Deployment Protection** → **Protection Bypass for
   Automation** → create a secret.
2. Append `?x-vercel-protection-bypass=<secret>` to every webhook URL below.
   The cron call sends it as the `x-vercel-protection-bypass` header.
3. Testers need a Vercel account on the team. If they don't have one, turn
   protection off instead (on Hobby that unprotects all PR previews too).

### 8.3 Neon database

1. With branch-per-preview on, the `preview` git branch gets its own Neon
   branch, which is reused on every deploy. Migrations and data migrations run on
   build, and `0001_platform_admin` invites the operator through the **dev**
   Clerk instance.
2. **A Neon branch is a copy of its parent's data.** Created from production,
   it holds real customer data. Before the first deploy, create the
   `preview` Neon branch **schema-only**, or from an empty parent. Then point the
   branch-scoped `DATABASE_URL` / `DATABASE_URL_UNPOOLED` at it.

### 8.4 Clerk: Development instance

1. Clerk dashboard → this app → **Development** instance → API keys.
2. Configure it like production (§3): Google social connection (dev instance
   uses Clerk's shared OAuth credentials), sign-up restricted, same paths.
   `*.clerk.accounts.dev` is already allowed in the CSP (`next.config.ts`).

### 8.5 Resend

1. **Outbound**: reuse the verified sending domain. You can use a separate
   API key so it can be revoked on its own.
2. **Inbound**: add `inbound-preview.dotanddashconsulting.com` as a receiving
   domain and add its `MX` record (host `inbound-preview`) in Squarespace.
   Preview must **not** share `inbound.…`: short aliases (`lee@…`) exist in
   both databases, so both environments would claim the same email. Each
   environment ignores mail for the other's domain.
3. Webhook → `https://alfa.preview.dotanddashconsulting.com/api/webhooks/resend?x-vercel-protection-bypass=<secret>`,
   event `email.received` → signing secret → `RESEND_WEBHOOK_SECRET`.

### 8.6 Stripe: test mode

1. In **test mode**, create the four Products/Prices (§5b), the restricted key
   and Connect.
2. Two test-mode webhooks with the same events as production:
   `…/api/webhooks/stripe?x-vercel-protection-bypass=<secret>` and
   `…/api/webhooks/stripe-connect?x-vercel-protection-bypass=<secret>`
   (connected accounts).
3. After the first deploy, paste the test `price_…` IDs into the preview app's
   **Platform → Settings → Stripe plans**.

### 8.7 Env vars: Preview, Git branch `preview`

| Variable | Value |
| --- | --- |
| `NEXT_PUBLIC_APP_URL` | `https://alfa.preview.dotanddashconsulting.com` |
| `DATABASE_URL`, `DATABASE_URL_UNPOOLED` | the schema-only `preview` Neon branch (§8.3) |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY` | dev instance `pk_test_…` / `sk_test_…` |
| `NEXT_PUBLIC_CLERK_SIGN_IN_FORCE_REDIRECT_URL`, `NEXT_PUBLIC_CLERK_SIGN_UP_FORCE_REDIRECT_URL` | same paths as production |
| `EMAIL_PROVIDER` | `resend` |
| `RESEND_API_KEY` | preview key (or production's) |
| `RESEND_WEBHOOK_SECRET` | from the preview webhook (§8.5) |
| `EMAIL_FROM` | e.g. `Alfa (Preview) <accounts@dotanddashconsulting.com>` |
| `EXPENSE_INBOUND_DOMAIN` | `inbound-preview.dotanddashconsulting.com` |
| `EXPENSE_INBOUND_PREFIX` | `alfa.expenses` |
| `STRIPE_SECRET_KEY`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | test mode `sk_test_…` / `pk_test_…` |
| `STRIPE_WEBHOOK_SECRET`, `STRIPE_CONNECT_WEBHOOK_SECRET` | from the test webhooks (§8.6) |
| `CRON_SECRET` | new random value, not production's |
| `BLOB_READ_WRITE_TOKEN` | token for a separate preview Blob store |
| `PLATFORM_ADMIN_EMAILS` | optional break-glass list |

`AI_GATEWAY_API_KEY`, `COMPANIES_HOUSE_API_KEY` and the VAPID keys can be shared
with production. Leave `FCM_*` unset unless you test mobile push.

### 8.8 Cron

Vercel Cron only fires on production. To drain inbound email on preview, call
`https://alfa.preview.dotanddashconsulting.com/api/cron/inbound-email` with
`Authorization: Bearer <preview CRON_SECRET>` and the bypass header, either by
hand or from a GitHub Actions `preview` environment.

### 8.9 Verify

- [ ] Push to `preview` → deployment is assigned `alfa.preview.dotanddashconsulting.com`
- [ ] `/robots.txt` disallows everything (non-production `VERCEL_ENV`)
- [ ] Sign in works via the Clerk dev instance (dev-mode badge visible)
- [ ] `/platform/health` all green
- [ ] Email to an alias `@inbound-preview…` shows up as a pending expense on preview only
- [ ] Stripe test checkout updates the subscription (webhook delivered, 2xx)

## Go-live checklist

- [ ] Neon **"branch per preview"** enabled (Preview must not share Production `DATABASE_URL`)
- [ ] `DATABASE_URL_UNPOOLED` on Production (and Preview branches)
- [ ] `EMAIL_PROVIDER=resend` + verified domain + `RESEND_*` (`console` is rejected in production)
- [ ] `CRON_SECRET` set; Vercel cron firing; GH secrets `CRON_SECRET` + `APP_URL`
- [ ] Resend webhook → production `/api/webhooks/resend`
- [ ] First Production deploy applied data migration `0001_platform_admin` (Clerk invite received)
- [ ] Remove unused `ALLOW_PROD_SEED` from Vercel if it was set for the old CLI seed
- [ ] `/platform` health all green
- [ ] Errors appear in `/platform` logs (`reportError` / `onRequestError`); add Sentry when you outgrow `platform_logs`
