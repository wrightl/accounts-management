# Plan: Feature gaps, subscriptions, and public pricing

**Status:** Planning document (not yet implemented)  
**Date:** 18 September 2026  
**Inputs:** [Competitor research](../competitor-research.md), current product (recurring invoices UI shipped), README “What’s next”

This plan covers three workstreams that should ship as a coherent go-to-market slice:

1. **Product gaps** that matter for the UK consultancy/studio ICP  
2. **Subscriptions and tiers** (billing + entitlements)  
3. **Public pricing page** (marketing)

Do **not** chase Xero parity (payroll, multi-currency, 1,000 apps, full MTD filing). Stay the weekly ops layer.

---

## Goals

- Close the remaining high-value gaps so paid plans feel complete for non-VAT or lightly VAT-registered service firms.
- Charge money with a clear, honest price under FreeAgent Ltd / Xero Grow.
- Publish a `/pricing` page that matches the product story (spreadsheet replacement, quote → order → invoice).

## Non-goals

- Full HMRC MTD VAT/ITSA filing in this programme.
- Live Open Banking as a hard dependency for v1 paid launch (CSV-first remains primary).
- Per-seat pricing, contracts/e-sign, time tracking, accountant partner channel build-out.

---

## Workstream A — Feature gaps

Ordered by ICP impact from the research. Recurring invoices UI is **done** and out of scope here.

### A1. Multi-bank CSV import (next)

**Why:** Research ranked “live feed or multi-bank CSV beyond Starling” as the #2 gap. Schema already has `bank_provider` and `csv_mapping` ([`drizzle/0028_multi_bank_csv_import.sql`](../drizzle/0028_multi_bank_csv_import.sql)).

**Ship:**

- Detect/map CSV formats for at least: Starling (existing), Monzo, Tide, Revolut Business, and a generic column-mapper fallback.
- Settings UX: choose bank provider, preview mapping, save per `bank_accounts.csv_mapping`.
- Import flow: show provider-specific help; keep de-dupe + match-to-invoice/expense behaviour.
- Tests: fixture CSVs per provider; unknown format → guided mapper.

**Explicitly later (A1b):** True Open Banking / live feed behind a higher tier once CSV coverage is trusted.

### A2. VAT readiness without full MTD

**Why:** VAT-registered studios currently bounce to Xero/FreeAgent. A bridging path unblocks them without becoming a tax product.

**Ship:**

- Company setting: VAT registered (use existing `vatNumber` / registration flag), default rate (e.g. 20%).
- Invoice/quote/expense lines: selectable VAT rate (0 / 20 / custom); stop hard-coding `vatRate: 0` on create paths.
- Reports: real VAT summary for the period (output/input), not a permanent £0 placeholder.
- Export: CSV (and optional PDF summary) suitable for accountant or bridging software — **no HMRC submit** in this slice.
- Recurring templates: inherit VAT on line template.

**Explicitly later (A2b):** MTD-compatible filing APIs.

### A3. Quote / invoice client polish (Bonsai cues)

**Why:** Steal presentation quality, not contracts.

**Ship (thin slice):**

- Quote accept page / email: clearer status, branded PDF already exists — tighten accept/decline CTA and “viewed” if cheap.
- Invoice PDF v2: ensure recurring and VAT lines render cleanly.
- Optional: one-click “duplicate last month’s invoice” already covered by recurring — skip unless demand.

### A4. Out of scope for this programme

- Time tracking, contracts/e-sign, payroll, multi-currency books, mobile apps.

---

## Workstream B — Subscriptions and tiers

### Pricing model (locked defaults)

From competitor research hypothesis, refined to publishable numbers:

| Plan | Price (ex VAT) | Billing | Who |
| --- | --- | --- | --- |
| **Trial** | £0 | 30 days | New orgs after onboarding |
| **Studio** | £19 / org / mo | Monthly or annual (−2 months) | Default paid plan for 1–5 person firms |
| **Practice** | £29 / org / mo | Monthly or annual (−2 months) | Higher limits + earlier access to bank/VAT extras |

**Principles:**

- **Per organisation, not per seat** (avoid Bonsai/Harvest seat tax).
- Price sits under FreeAgent Ltd (£33) and Xero Grow (£39).
- Market as “books for the week, not tax filing.”
- Accountant multi-company access remains invite-based; seat count is soft (fair-use), not billed.

### Entitlements (v1)

| Capability | Trial | Studio | Practice |
| --- | --- | --- | --- |
| Core books (clients, quotes, orders, invoices, expenses, reimbursements, dividends, reports, accountant pack) | Yes | Yes | Yes |
| Recurring invoices | Yes | Yes | Yes |
| Users (founders + accountant) | Up to 5 | Up to 5 | Up to 15 |
| Multi-bank CSV providers | Starling + 1 | All supported | All supported |
| VAT rates + VAT export | Summary only / £0 | Yes | Yes |
| Live bank feed (when built) | No | No | Yes (future) |
| Priority support / early features | No | No | Soft flag |

Adjust numbers in Stripe products; keep a single `entitlements` module in code so UI and API check one place.

### Billing provider

**Stripe** via **Vercel Marketplace payments** (subscriptions, no product catalog).

At implementation time (not in this doc’s authorship):

1. `vercel integration discover --category payments`
2. `vercel integration add` Stripe (or preferred Marketplace payments integration)
3. `vercel env pull` — do **not** hand-roll Stripe keys or mock billing.

### Data model (sketch)

On `companies` (or a dedicated `subscriptions` table keyed by `company_id`):

- `stripe_customer_id`
- `stripe_subscription_id`
- `plan` — `trial` | `studio` | `practice`
- `status` — `trialing` | `active` | `past_due` | `canceled` | `none`
- `trial_ends_at`, `current_period_end`
- `cancel_at_period_end`

Webhook handler: `checkout.session.completed`, `customer.subscription.*`, `invoice.paid` / `invoice.payment_failed`.

### Product UX

- After onboarding: start Trial; banner with days remaining + “Choose a plan.”
- Settings → Billing: current plan, upgrade/downgrade (Stripe Checkout or Customer Portal), invoices from Stripe.
- Soft gate: when trial ends without payment → read-only books + upgrade CTA (do not wipe data).
- Platform admin: view plan/status; ability to grant complimentary Practice.

### Enforcement

Central helper: `requireEntitlement(companyId, feature)` used by server actions (recurring already platform-flagged; migrate to plan entitlements where appropriate). Keep `RECURRING_INVOICES_ENABLED` as a platform kill switch above plan checks.

---

## Workstream C — Public pricing page

### Route and chrome

- New page: [`src/app/pricing/page.tsx`](../src/app/pricing/page.tsx) (public, same shell as home/guides).
- Add **Pricing** to [`PublicHeader`](../src/components/marketing/public-header.tsx) and footer.
- CTAs: “Start free trial” → `/sign-up`; “Sign in” for existing.

### Page content (one composition, brand-first)

Align with marketing rules: not a dashboard of cards; clear brand, one primary offer story.

Suggested sections:

1. **Hero** — Brand + “Books for the week. Price under FreeAgent.” One supporting line. Primary CTA: Start free trial.
2. **Plans** — Trial / Studio / Practice comparison (honest inclusions; VAT note: “VAT export, not HMRC filing”).
3. **What’s included** — quote → order → invoice, expenses/receipts, bank CSV, accountant pack — not a feature dump vs Xero.
4. **Who it’s for** — UK consultancies, studios, small agencies (Ltd + sole trader).
5. **FAQ** — accountant still files returns; GBP only; CSV not live feed yet; cancel anytime; annual discount.
6. **Final CTA**

Copy must attack **spreadsheets**, not Xero. Mention accountant invite as the answer to “my accountant uses Xero.”

### SEO

Title/description aimed at “UK consultancy invoicing software” / “books for small agency UK” — not head-on “Xero alternative” as H1.

---

## Suggested delivery phases

```mermaid
flowchart LR
  p0[Phase0 Recurring done]
  p1[Phase1 Pricing page static]
  p2[Phase2 Stripe + Trial Studio]
  p3[Phase3 Multi-bank CSV]
  p4[Phase4 VAT rates and export]
  p5[Phase5 Practice tier extras]
  p0 --> p1 --> p2 --> p3 --> p4 --> p5
```

| Phase | Deliverable | Depends on |
| --- | --- | --- |
| 0 | Recurring invoices UI | **Done** |
| 1 | Static `/pricing` with proposed tiers + trial messaging (Checkout CTAs can be “coming soon” or wait for Phase 2) | Copy lock |
| 2 | Stripe Marketplace install, Checkout, Portal, webhooks, trial→Studio | Phase 1 copy |
| 3 | Multi-bank CSV (A1) | Stable import UX |
| 4 | VAT rates + export (A2); unlock on Studio+ | Phase 2 entitlements |
| 5 | Practice entitlements for higher limits / future live feed flag | Phase 2–4 |

**Recommended launch cut:** Phase 1–2 + A1 (multi-bank) so paid customers get immediate bank value; VAT export can follow within one sprint if Studio messaging promises it.

---

## Implementation checklist (when executing)

### Pricing page

- [ ] `/pricing` page + header/footer links
- [ ] FAQ + plan comparison matching entitlement table
- [ ] Analytics events on CTA clicks (if already instrumented elsewhere)

### Billing

- [ ] Provision Stripe via Vercel Marketplace; pull env
- [ ] Schema migration for subscription fields
- [ ] `lib/billing/entitlements.ts` + gate critical writes after trial
- [ ] Checkout session create action; Customer Portal link
- [ ] Webhook route (raw body verify) + idempotent updates
- [ ] Settings → Billing UI
- [ ] Platform admin: plan/status + complimentary grant
- [ ] Tests: webhook fixtures; entitlement matrix; trial expiry soft-lock

### Gaps

- [ ] Multi-bank CSV adapters + fixtures (A1)
- [ ] VAT rate on lines + report/export (A2)
- [ ] Help guide + README “What’s next” updates

### Docs to update on ship

- [ ] [`docs/competitor-research.md`](../competitor-research.md) — mark gaps closed
- [ ] [`README.md`](../README.md) — pricing, Stripe env, entitlements
- [ ] [`docs/SETUP.md`](../SETUP.md) — Marketplace Stripe steps

---

## Risks

| Risk | Mitigation |
| --- | --- |
| Bank-tied FreeAgent/Starling free tiers | Don’t compete on £0; win on milestones + reimbursements + pack |
| Accountant demands Xero | Keep invite + pack; never claim “replace Xero” |
| VAT buyers expect MTD submit | Pricing/FAQ: export only; accountant still files |
| Stripe complexity delays launch | Ship static pricing (Phase 1) then Checkout; soft-lock trial with manual upgrade path only as emergency |
| Over-building Open Banking | CSV-first; live feed as Practice future flag |

---

## Success criteria

- Public `/pricing` live with Studio £19 / Practice £29 (ex VAT) and 30-day trial.
- New companies can start trial and convert via Stripe without ops intervention.
- At least two non-Starling bank CSVs import cleanly in production.
- VAT-registered Studio customers can produce a period VAT CSV for their accountant.
- Messaging on pricing and homepage consistently sells spreadsheet replacement + quote → order → invoice.
