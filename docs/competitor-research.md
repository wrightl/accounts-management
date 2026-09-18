# Dot + Dash competitor research

**Research date:** 18 September 2026  
**Sources:** public vendor sites, pricing pages, help docs, and UK review round-ups only (no paid trials).  
**Canvas source:** converted from the interactive competitor-research canvas.

Prices below are **excluding VAT** unless noted. Promotional and bank-tied offers are flagged.

> **Update since research:** Recurring invoices now have a tenant UI (monthly templates, draft vs auto-send, end limits). The matrix below still reflects the research snapshot where Dot + Dash was “Partial” on recurring.

## Frame

Dot + Dash Accounts is day-to-day books for UK consultancies, studios, and small agencies: quotes → orders → milestone invoices, expenses, bank CSV matching, accountant pack — spreadsheet replacement, **not** a Xero-class suite.

The real competitive fight is:

1. **Status quo** (spreadsheets + accountant)
2. **FreeAgent** (closest ICP)
3. **Xero** (accountant default)
4. **Bonsai / Harvest** (project billing polish)

| Stat | Value |
| --- | --- |
| Deep-dive substitutes | 7 |
| Xero / FreeAgent envelope | £18–£39 / mo |
| Pricing hypothesis for Dot + Dash | £15–£29 / org / mo |
| Gaps that actually matter (at research date) | 3 |

## Landscape

Axes: **project quote-to-cash depth** (left → right) vs **UK books / compliance depth** (bottom → top).

| | Lower project depth | Higher project depth |
| --- | --- | --- |
| **Higher UK books** | Crunch, FreeAgent, Xero, Starling Accounting | *(sparse)* |
| **Lower UK books** | Spreadsheets | Harvest, Bonsai |

**Dot + Dash** sits in the sparse middle-right: strong project billing + enough books for a consultancy’s weekly rhythm, without pretending to file VAT/MTD.

Approximate plot positions (0–100):

| Product | Quote-to-cash | UK books |
| --- | --- | --- |
| Spreadsheets | 22 | 18 |
| Harvest | 72 | 22 |
| Bonsai | 88 | 28 |
| Starling Accounting | 28 | 58 |
| Crunch | 32 | 78 |
| FreeAgent | 48 | 82 |
| Xero | 55 | 90 |
| Dot + Dash | 78 | 52 |

## Competitor snapshots

### Xero — Accounting

UK default for Ltds — the comparison even when you say you are not this.

- **ICP:** growing SMEs + accountants. Quotes/invoices, bank feeds, Hubdoc capture, VAT/MTD, payroll by plan. Projects on Ultimate.
- **Entry:** Ignite £18/mo · Grow £39/mo (from 1 Sep 2026). Simple £7 for non-VAT light use.

### FreeAgent — Closest ICP

Tax-led books for freelancers and micro companies — “confidence in your numbers.”

- **ICP:** estimates, invoices, expenses, Smart Capture, projects, time, payroll, MTD VAT + ITSA, SA/CT filing. NatWest Group free tier is a hard price floor.
- **Entry:** Sole trader £19 · Ltd £33/mo (50% intro common). Free with NatWest / RBS / Ulster / Mettle.

### Starling Accounting (ex Ember) — Bank-tied

Closest “not Xero” messaging — now locked to Starling.

- In-app bookkeeping, invoicing, MTD ITSA, view-only accountant access. VAT via Plus. CT filing still external. Weak for multi-bank consultancies and project milestones.
- **Entry:** Essentials free · Plus £7/mo until Apr 2027, then £14 (VAT filing).

### Crunch — Bundled

Software + named accountants — tests “keep your accountant.”

- Free invoicing/expenses tier; paid packages add MTD filing and human support. Ltd packages from ~£94/mo. Buyer is buying compliance service, not founder ops software.
- **Entry:** Free software · ST Pro ~£27/mo · Ltd from ~£94/mo + VAT.

### Bonsai — Workflow

Proposals → contracts → invoices for freelancers and small agencies.

- Polished quote-to-cash, client portal, e-sign, retainers. Not UK books — syncs to Xero/QBO on higher tiers. Zoom-owned (Dec 2025); roadmap risk.
- **Entry:** Real entry Essentials $25/user/mo (~£19); Basic $15 has no invoicing. Annual Essentials ~$19/user.

### Harvest — Workflow

Studio staple: track time → raise invoice → sync to Xero.

- Strong time/budgets/invoicing; weak as a ledger. 2026 Flex usage fees (projects/clients/invoices) make total cost unpredictable — opening for a fixed-price alternative.
- **Entry:** Free (1 seat, 2 projects) · Teams from $9/seat/mo annual + usage.

### Status quo — Spreadsheets + accountant

Excel/Sheets + Drive + bank CSV + year-end dump. Software cost ~£0; real cost is founder evenings and accountant clean-up. **This is what Dot + Dash replaces.** Messaging that only attacks Xero misses the buyer who never opened Xero.

## Feature matrix

Yes = native / solid · Partial = limited, add-on, or via accountant workflow · No = not a product strength · N/A = category mismatch.

| Capability | Dot + Dash | Xero | FreeAgent | Starling | Crunch | Bonsai | Harvest | Sheets |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Versioned quotes → accept | Yes | Partial | Partial | No | Partial | Yes | No | Partial |
| Orders / milestones | Yes | Partial | Partial | No | No | Partial | Partial | Partial |
| Branded invoices + email | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Partial |
| Recurring invoices | Partial* | Yes | Yes | No | Partial | Yes | Partial | Partial |
| Time tracking | No | Partial | Yes | No | No | Yes | Yes | Partial |
| Contracts / e-sign | No | No | No | No | No | Yes | No | No |
| Expenses + receipt OCR | Yes | Yes | Yes | Partial | Yes | Partial | Partial | No |
| Inbound receipt email | Yes | Partial | Partial | No | No | No | No | No |
| Mileage (HMRC-style) | Yes | Yes | Yes | No | Partial | No | No | Partial |
| Reimbursement batches | Yes | Partial | Partial | No | No | No | No | Partial |
| Bank: live feed | No | Yes | Yes | Yes | Yes | Partial | No | No |
| Bank: CSV match | Yes* | Yes | Yes | N/A | Partial | No | No | Partial |
| Dividends (Ltd) | Yes | Yes | Yes | Partial | Yes | No | No | Partial |
| VAT rates + export | Yes | Yes | Yes | Partial | Yes | No | No | Partial |
| VAT / MTD filing | No | Yes | Yes | Partial | Yes | No | No | No |
| Accountant invite | Yes | Yes | Yes | Partial | N/A | No | No | Partial |
| One-click accountant pack | Yes | Partial | Partial | No | N/A | No | No | No |

\*At research date: cron existed, no UI. **UI has since shipped** (see [gaps plan](./plans/gaps-subscriptions-pricing.md)). Multi-bank CSV (Starling, Monzo, Tide, Revolut Business, Wise, high-street + mapper), VAT rates/export, and public quote accept have also shipped.

## Pricing strip

| Product | Honest entry (ex VAT) | Typical consultancy fit | Notes |
| --- | --- | --- | --- |
| Xero | £18 Ignite / £39 Grow | £39 Grow for unlimited invoices | Price rise 1 Sep 2026; accountant default |
| FreeAgent | £19 ST / £33 Ltd | £33 Ltd (or £0 via NatWest Group) | Priced by entity type, not features |
| Starling Acct | £0 / £7 Plus | Only if already on Starling | Bank lock-in; Plus → £14 from Apr 2027 |
| Crunch | £0 software / ~£94 Ltd service | Service buyers, not DIY founders | Bundled accountant is the product |
| Bonsai | ~£19/user (Essentials) | Still need Xero/FA for UK books | Per-seat; Basic lacks invoices |
| Harvest | $9/seat + usage | Time shops syncing to Xero | 2026 Flex fees hurt predictability |
| Spreadsheets | £0 + accountant fees | Default until pain peaks | Hidden cost: catch-up before year-end |
| Dot + Dash | No public price | Hypothesis £15–£29 / org / mo | Under FA Ltd & Xero Grow; per-org not per-seat |

### Pricing hypothesis (not a published price)

Software-only day-to-day books for a 1–5 person UK consultancy should land at **£15–£29/month per organisation** (ex VAT), billed annually preferred. Below FreeAgent Ltd (£33) and Xero Grow (£39); above bank-tied free tiers. Avoid per-seat until there is a clear multi-user value story — Bonsai/Harvest punish small teams on seats.

## Messaging

### Their lines

- **Xero:** “Plans built for you to grow” / accountant ecosystem gravity.
- **FreeAgent:** “Confidence in your numbers” / MTD done, tax timeline.
- **Starling:** “Spend, track, relax” / “life’s too short for any more logins.”
- **Crunch:** Software + real accountants; peace of mind.
- **Bonsai:** Proposals, contracts, get paid — client workflow first.
- **Harvest:** Time → invoice → accounting sync.

### Dot + Dash lines to keep / sharpen

- “Your books, in one place.” — still the right category claim vs Drive chaos.
- “Fifteen minutes a week beats a month of catch-up” — attacks spreadsheets, not Xero.
- Steal the honesty frame from Starling/Ember (“not another login / not pretending”) without bank lock-in.
- Name the workflow: **quote → order → milestone invoice** — nobody else owns that sentence for UK consultancies.
- Keep “not a replacement for your accountant” — Crunch owns the opposite; wedge is founder ops + accountant pack.

## GTM notes

### SEO reality

“Xero vs FreeAgent” and “best accounting software sole traders UK” are owned by accountants’ blogs and the big two. Head-on category SEO is expensive. Better wedge: consultancy / studio / agency **project billing + books** language (milestones, reimbursements, accountant pack).

### Channels

Xero/FreeAgent win via accountant recommendation. Crunch sells the accountant. Starling/Tide/Coconut sell via the bank. Bonsai/Harvest sell via freelance/agency communities. Dot + Dash should lead with **founders**, with accountants as invitees — not as the primary acquisition channel yet.

### Watch list (one-line)

- QuickBooks UK — familiar US brand, mid prices.
- Coconut — sole-trader MTD app (~£17–£22).
- Countingup / Tide — bank + light books.
- FreshBooks — invoicing-led freelancers.
- Sage — established firms / payroll skew.

## Where Dot + Dash wins vs where they win

### Genuinely different

- Quote versioning → accept → order with payment milestones.
- Per-founder inbound receipt email + OCR.
- Reimbursement runs for co-founders.
- Multi-company read-only accountant + one-click pack (CSVs, PDFs, receipts).
- Honest scope: GBP, multi-bank CSV matching, VAT rates + accountant export when registered — no pretend MTD filing.

### Market still picks them when…

- VAT-registered and need MTD filing in-product (Xero / FA / Starling Plus).
- Accountant insists on Xero (ecosystem + practice workflow).
- Want live Open Banking feeds, not monthly CSV.
- Need payroll / multi-currency / mobile-first.
- NatWest/Starling free tier makes “good enough” books £0.

## What to do with this

1. **Ignore feature parity with Xero** — Do not chase payroll, 1,000 apps, or multi-currency. Stay the weekly ops layer; let the accountant file returns.
2. **Own the sentence: quote → order → milestone invoice** — Put it on the homepage. Bonsai owns proposals/contracts; you own UK books + milestones without needing a second ledger.
3. **Three gaps that matter for this ICP (in order)** — (a) Recurring invoice UI — *shipped*. (b) Multi-bank CSV beyond Starling — *shipped* (live Open Banking still later). (c) VAT summary → export/bridging path before full MTD filing — *shipped* (rates + period CSV/PDF; no HMRC submit).
4. **Price under FreeAgent Ltd** — Hypothesis £15–£29/org/mo. Market as “books for the week, not tax filing.”
5. **Attack spreadsheets in copy, not Xero** — Primary buyer has a messy Drive folder. Answer “my accountant uses Xero” with invite + pack.
6. **Steal polish cues from Bonsai, not features** — Proposal/PDF presentation, public accept UX — *shipped* (tokenised `/q/{token}` accept/decline + viewed). Skip contracts/e-sign unless demand is proven.
7. **Treat bank-tied free as a filter, not a rival** — Win Starling CSV users who want milestones + reimbursements without changing banks.
8. **GTM wedge: founders of UK service firms** — Content around consultancy cash collection, founder expenses, year-end pack hygiene.

## Sources & caveats

Vendor pages: xero.com/uk/pricing-plans, freeagent.com/pricing, ember.co / Starling Accounting, crunch.co.uk, hellobonsai.com/pricing, getharvest.com/pricing. Secondary: bookkeepertools.uk, accountant comparison blogs, Trustpilot/G2 mentions in those round-ups.

Prices and promos change (Xero Sep 2026 rise; FreeAgent 50% intro; Starling Plus until Apr 2027). Matrix “Partial” cells are judgment calls from public docs — not a logged-in teardown. Ember is plotted as Starling Accounting post-acquisition.
