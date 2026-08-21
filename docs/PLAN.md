# Delivery plan — Dot + Dash Accounts

Detailed plan for the remaining phases. Phase 0 (foundations) is complete — see
[`README.md`](../README.md) and PR #2. Each phase below is independently
shippable behind the existing auth/RBAC and produces a demoable increment.

**Conventions used throughout**
- Money stored as integer **pence** (`src/lib/money.ts`); GBP only.
- Not VAT registered — invoices default to 0% VAT; VAT fields exist for a future
  MTD phase and stay hidden in the UI until enabled.
- Every mutation is a Server Action / Route Handler that re-checks permissions
  server-side (`requirePermission` in `src/lib/auth.ts`); the client is never
  trusted.
- Reads use Next.js caching with tag-based revalidation; mutations call
  `revalidateTag`/`revalidatePath` so cached pages stay correct.
- Each phase adds Vitest unit + PGlite integration tests and Playwright e2e
  (including RBAC negative tests), and keeps CI green.

---

## Phase 1 — Invoicing (priority #1)

**Goal:** replace the invoicing spreadsheet end to end — create, send and get
paid, with a branded PDF and a live dashboard.

**Scope**
- **Clients**: CRUD (name, email, address, notes); list + detail.
- **Invoices**: draft → send → paid/overdue/void lifecycle; auto invoice
  numbering (configurable prefix + sequence); line items (description, qty, unit
  price); notes; issue/due dates; totals from `invoiceTotals`.
- **Branded PDF**: server-rendered invoice PDF (`pdf-lib`/React-PDF) with the
  Dot + Dash wordmark, company + bank (Starling) details, stored in Blob.
- **Email delivery**: send invoice to client via the email abstraction (Resend),
  PDF attached; record `sentAt`.
- **Payments**: record manual payments against an invoice; auto-flip status to
  `paid` when fully settled; overdue detection by `dueDate`.
- **Dashboard**: wire the real KPIs (outstanding, overdue, invoiced this month).
- **Settings (company)**: complete the Phase 0 settings stub — company profile,
  Starling bank details, FY end, invoice number format, logo upload.

**Data model:** `clients`, `invoices`, `invoice_line_items`, `payments`,
`company_settings` (all exist in schema — add invoice-number sequence + settings
form).

**Acceptance / demo:** create a client, build an invoice, download the branded
PDF, email it (console transport in dev / Resend with a key), record a payment,
watch status + dashboard update.

**Risks/decisions:** PDF layout iteration; invoice-number scheme (confirm prefix,
e.g. `DD-2026-0001`); email sending domain must be verified in Resend.

---

## Phase 2 — Expenses & receipts (priority #2)

**Goal:** log expenses and capture receipts, ready for reimbursement/reporting.

**Scope**
- **Expenses**: CRUD (description, category, date, amount, paid-by founder,
  billable + optional client, status).
- **Receipts**: upload one or more files per expense to **private** Vercel Blob
  via `src/lib/storage`; download streamed through an authorised, role-checked
  route handler (never a public URL).
- **Categories**: a small managed list for consistent reporting.
- **Filters/search**: by date range, category, paid-by, billable.

**Data model:** `expenses`, `expense_receipts` (exist).

**Acceptance / demo:** log an expense, upload a receipt image/PDF, reopen and
download it as the owner; verify another role is refused the raw file.

**Risks/decisions:** file-type/size limits; image thumbnailing (optional);
malware/scan policy (out of scope for MVP).

---

## Phase 3 — Reimbursements (priority #3)

**Goal:** track what the company owes each founder and settle in batches.

**Scope**
- Mark expenses `reimbursable`; group unreimbursed reimbursable expenses per
  founder into a **reimbursement run**.
- Run lifecycle `pending → paid`; on paying, flip linked expenses to
  `reimbursed` and stamp `paidAt`.
- "Owed to me / owed to co-founder" summary on the dashboard.
- Export a reimbursement summary (CSV/PDF) for records.

**Data model:** `reimbursements`, `reimbursement_items` (exist).

**Acceptance / demo:** select several reimbursable expenses for a founder, create
a run, mark it paid, confirm expenses move to `reimbursed` and balances zero out.

**Risks/decisions:** partial reimbursements (defer); rounding rules already
handled in pence.

---

## Phase 4 — Bank import & reconciliation (Starling)

**Goal:** reconcile the Starling business account against invoices/expenses.

**Scope (MVP = manual, per Q12)**
- **Manual import**: upload a Starling **CSV** (later OFX) statement; parse into
  bank transactions; de-duplicate on import.
- **Reconciliation**: suggest and confirm matches (transaction ↔ invoice payment
  or expense); flag unreconciled items.
- Foundation for a future **live feed**: keep an adapter seam so the Starling
  API can replace CSV import without changing the reconciliation UI.

**Data model (new):** `bank_accounts`, `bank_transactions`,
`reconciliation_matches` (add migration).

**Acceptance / demo:** import a sample Starling CSV, auto-match an invoice
payment and an expense, leave the rest flagged; re-import is idempotent.

**Risks/decisions:** confirm Starling CSV column format; the live API (business
account scopes, OAuth app registration) is a later, separately-scoped upgrade.

---

## Phase 5 — Reporting & accountant export

**Goal:** give the accountant (read + export role) everything they need.

**Scope**
- **Reports**: P&L summary, aged receivables, income vs expense by
  month/category, VAT summary (0% for now).
- **Accountant pack**: export a period (e.g. FY to March) as a zip of CSVs +
  PDFs — invoices, payments, expenses, receipts index — in a generic,
  import-friendly format (accountant's software TBC per Q5).
- **Dividend records** (per Q3): simple register of dividend declarations
  (date, amount per shareholder, notes) for the accountant.
- Ensure the `accountant` role can view reports and export but not mutate
  (RBAC negative tests).

**Data model (new):** `dividends` (add migration); reports are derived queries.

**Acceptance / demo:** sign in as the accountant, open reports, download the
period pack; confirm write actions are hidden/blocked.

**Risks/decisions:** finalise export format once the accountant's tool is known;
keep the generator format-agnostic.

---

## Phase 6 — Automation & extras

**Goal:** reduce manual chasing and round out expected features.

**Scope**
- **Quotes/estimates** (per Q9): create a quote, convert to an invoice.
- **Recurring invoices/retainers** (foundation; per Q8 "not yet" — build behind a
  flag): schedule generation via **Vercel Cron**.
- **Reminders**: automated overdue-invoice emails via Vercel Cron + the email
  abstraction.
- **Audit log UI**: surface the existing `audit_log` for admins.
- **Caching hardening**: adopt Cache Components / `use cache` where it helps,
  tighten a Clerk-aware Content-Security-Policy.
- **MTD for VAT** (future, per Q2): only if/when VAT registered — HMRC MTD
  submission is a regulated integration, scoped separately.

**Data model (new):** `quotes`, `quote_line_items`, `recurring_invoices` (add
migrations).

**Acceptance / demo:** create a quote and convert it; trigger the reminder cron
in dev and observe a queued email; view the audit log as admin.

---

## Cross-cutting, ongoing

- **Security**: keep every new route/action permission-checked; add the tight
  CSP in Phase 6; keep receipts/exports access-controlled.
- **Testing**: maintain unit + integration + e2e per phase; RBAC negative tests
  for each new capability; keep CI green and previews deploying.
- **Migrations**: one Drizzle migration per phase; run on deploy against Neon;
  preview branches get isolated DBs.
- **Observability**: add structured logging + error reporting before/at Phase 1
  go-live.

## Sequencing summary

1. Invoicing → 2. Expenses/receipts → 3. Reimbursements → 4. Bank reconciliation
→ 5. Reporting/accountant → 6. Automation & extras.

Phases 1–3 deliver the core day-to-day replacement for spreadsheets; 4–5 close
the loop with the bank and the accountant; 6 automates and polishes.
