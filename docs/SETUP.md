# Provisioning & deployment setup

Steps to take the platform live on Vercel with Neon, Clerk, Blob, Resend, Google
SSO and the custom subdomain. Items marked **(you)** are dashboard/DNS actions
outside the repo; once done, add the listed secrets to the Cursor agent
**Secrets** panel so the environment can run everything end-to-end here too.

## 1. Vercel project **(you)**
1. Import `github.com/wrightl/accounts-management` into the Vercel team.
2. Framework preset: **Next.js** (auto-detected).
3. Production branch: **`main`** → deploys on every merge to `main` (default).
4. Preview deployments for pull requests: leave enabled (default).

## 2. Neon Postgres (Vercel integration) **(you)**
1. Vercel → Storage / Integrations → **Neon** → connect to the project.
2. This injects `DATABASE_URL` (pooled) and `DATABASE_URL_UNPOOLED` (direct).
3. Enable **"create a database branch per preview"** so PR previews and CI get
   isolated databases.
4. Apply the schema: `npm run db:migrate` (uses the unpooled URL).

## 3. Clerk (Vercel integration + Clerk dashboard) **(you)**
1. Vercel → Integrations → **Clerk** → connect. Injects
   `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY`.
2. In the Clerk dashboard:
   - **Google SSO**: enable Google as a social connection, linked to the
     `dotanddashconsulting.com` Google Workspace. **Do not** restrict the
     allowed domain (the accountant signs in with a non-Workspace Google
     account).
   - **Invite-only accountant**: disable open sign-up (or restrict), and invite
     the accountant explicitly.
   - **Roles**: set each user's `publicMetadata` to `{ "role": "admin" | "user" | "accountant" }`.
     Initial users: `lee@…` → `admin`, `angel@…` → `user`.
   - **Session token (optional, faster role reads)**: add
     `{"metadata": "{{user.public_metadata}}"}` to the session token claims.
   - **Paths**: sign-in `/sign-in`, sign-up `/sign-up`, after sign-in/up `/dashboard`.

## 4. Vercel Blob **(you)**
1. Vercel → Storage → **Blob** → create a store.
2. Injects `BLOB_READ_WRITE_TOKEN`.

## 5. Email — Resend **(you)**
1. Create a Resend account/API key → set `RESEND_API_KEY` and `EMAIL_PROVIDER=resend`.
2. Verify the sending domain (add the DNS records Resend provides).
3. The provider is abstracted in `src/lib/email` — swap it later without touching call sites.

## 6. Custom subdomain **(you)**
1. Vercel → Project → **Domains** → add `accounts.dotanddashconsulting.com`.
2. In **Squarespace DNS**, add the record Vercel shows — typically a `CNAME`
   for `accounts` → `cname.vercel-dns.com`.
3. Set `NEXT_PUBLIC_APP_URL=https://accounts.dotanddashconsulting.com`.

## 7. Secrets to add to the Cursor agent **(you)**
So the Cloud Agent environment can build/run/test with real services, add these
in the Secrets panel:

- `DATABASE_URL`, `DATABASE_URL_UNPOOLED`
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`
- `BLOB_READ_WRITE_TOKEN`
- `RESEND_API_KEY` (+ set `EMAIL_PROVIDER=resend`)

Use **test/development** credentials here where possible; production values live
in Vercel.
