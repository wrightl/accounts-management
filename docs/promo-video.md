# Alfa by Dot+Dash — promo video

2–3 minute 16:9 product tour for YouTube/Vimeo. **Audience:** UK consultancies, studios, and small agencies. **Status:** coming soon / waitlist — not generally available.

## Deliverables

| File | Purpose |
| --- | --- |
| `promo/output/accounts-promo-master.mp4` | Upload master (H.264 + AAC, 1920×1080) |
| `promo/output/accounts-promo-captions.srt` | Sidecar captions (also burned into master) |
| `promo/output/thumbnail.png` | YouTube/Vimeo thumbnail (1280×720) |
| `promo/routes.json` | Demo entity IDs/routes (written by seed) |

## Commands

```bash
# 1. Seed fictional demo data (local DB only)
npm run promo:seed

# 2. Record UI (dev server on :3001, Clerk keys in .env.local)
npm run promo:record

# 3. Assemble master + thumbnail
npm run promo:assemble

# All three
npm run promo:all
```

**Prerequisites:** `DATABASE_URL`, Clerk keys, `ffmpeg` on PATH, dev server at `http://localhost:3001`.

---

## Forbidden claims (do not say or show)

- Sign up, free trial, pricing, or “available today”
- Replaces Xero, FreeAgent, QuickBooks, or “full accounting”
- VAT, MTD, HMRC, Open Banking, live bank feeds, multi-currency
- Recurring invoices UI
- Quote **send** as a finished product (create / convert / PDF only)
- Real Dot + Dash clients, real money, real bank rows, real founder names
- “AI accounting platform,” “automated bookkeeping”

**Bank beat wording:** “Export a CSV from your bank and match it to an invoice.”

---

## Voice-over script (~165s)

Captions mirror this text. Record your own VO over the picture-lock, or ship captions-only.

| Time | Super (optional) | VO |
| --- | --- | --- |
| 0:00–0:05 | Alfa by Dot+Dash | If you run a UK consultancy or studio, your books probably live in spreadsheets, a Drive folder, and emails to your accountant. |
| 0:05–0:12 | First look · Not on sale yet | We built Alfa to get our own books out of that mess. This is a first look — it is not on sale yet. |
| 0:12–0:18 | | Quotes, invoices, receipts, bank matching, and an accountant pack — in one place. |
| 0:18–0:28 | Morning overview | Start the day on one dashboard: what you are owed, what is overdue, and what needs attention. |
| 0:28–0:40 | | No more jumping between five tabs to see if cash is healthy. |
| 0:40–0:52 | Quote → order | When a client says yes, the quote becomes an order — same line items, same numbers, no retyping. |
| 0:52–1:08 | Branded invoice PDF | Turn the order into a branded invoice PDF. Send it from your usual workflow; the books stay in sync. |
| 1:08–1:20 | | Payment recorded — receivables and the dashboard update. |
| 1:20–1:32 | Receipt by email | Founders email receipts to a dedicated address. They land as pending expenses for review. |
| 1:32–1:45 | Reimbursement run | Mark what the company owes back, batch it into a reimbursement run, and settle it cleanly. |
| 1:45–1:55 | | Receipts stay attached — not lost in someone’s inbox. |
| 1:55–2:08 | Bank CSV match | Export a CSV from your bank, import it, and match incoming payments to invoices. |
| 2:08–2:18 | | Suggested matches mean less manual reconciliation. |
| 2:18–2:25 | Accountant pack | Reports and a one-click accountant pack: CSVs, invoice PDFs, receipts, and bank — for year-end. |
| 2:25–2:35 | Roles & audit | Invite your accountant read-only. Every sensitive change is in the audit log. |
| 2:35–2:45 | Join the waitlist | If that sounds like your studio, join the waitlist — link in the description. Built for consultancies like ours. Coming soon. |

**Waitlist URL (end card + description):** `mailto:lee@dotanddashconsulting.com?subject=Alfa%20waitlist`

---

## Shot list

| Beat | Duration | Route / action | Frame notes |
| --- | --- | --- | --- |
| Hook | 18s | `/` → hard cut to `/dashboard` | Landing hero line visible; no sign-in form linger |
| Dashboard | 22s | `/dashboard` | Slow scroll: KPIs → charts → Needs attention |
| Money in | 40s | `/quotes/[hero]` → order → invoice → PDF | Hero quote **Harbor Digital**; open invoice PDF in new tab briefly |
| Money out | 35s | `/inbound-email` → expense → reimbursement | Show processed inbound job + pending reimbursement |
| Trust | 30s | `/transactions` → match UI → `/reports` | Hover Download accountant pack; do not download live pack on camera |
| Close | 10s | End card (assembled) | Logo, waitlist line, mailto URL |

Hide Clerk user chip where possible (crop or scroll). Demo data only — run `npm run promo:seed` first.

---

## YouTube listing

**Title:** Alfa by Dot+Dash — books for UK consultancies (first look)

**Description:**

```
Alfa by Dot+Dash is a first look at the books app we built for our UK consultancy — quotes, orders, invoices, expenses, reimbursements, bank CSV matching, and an accountant export pack. Not on sale yet.

For UK consultancies, studios, and small agencies still running on spreadsheets and shared folders.

Join the waitlist: mailto:lee@dotanddashconsulting.com?subject=Alfa%20waitlist

Chapters:
0:00 Intro
0:18 Dashboard
0:40 Quote to invoice
1:20 Expenses & reimbursements
1:55 Bank & reports
2:25 Waitlist

Demo data only. Not financial advice. Not a replacement for Xero or FreeAgent.
```

**Tags:** consultancy accounting, small agency invoicing, UK freelancer books, quote to invoice, expense receipts, accountant export, spreadsheet replacement

**Thumbnail text:** Your books, in one place.

---

## Vimeo listing

Same title and description. Enable downloads off unless you want agencies to pull the master. Add caption file as upload if not burned in.

---

## Production notes

- **Resolution:** 1920×1080, 30fps, H.264 `yuv420p`, AAC 192kbps
- **Music:** none (no unlicensed tracks)
- **Captions:** `promo:assemble` burns captions when ffmpeg is built with libass; otherwise embeds soft `mov_text` tracks and copies `accounts-promo-captions.srt` — upload both to YouTube for selectable captions
- **Auth for recording:** `@clerk/testing` signs in bootstrap admin via `CLERK_SECRET_KEY`
- **Re-record:** delete `promo/raw/*.webm` and re-run `npm run promo:record`
