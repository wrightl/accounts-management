import { Check } from "lucide-react";

const INCLUDED = [
  {
    title: "Quote → order → invoice",
    body: "Client says yes, the quote becomes an order. Raise invoices against milestones — no retyping into another spreadsheet.",
  },
  {
    title: "Expenses and receipts",
    body: "Email a receipt, review pending expenses, and batch reimbursement runs. The weekly spend trail stays in one place.",
  },
  {
    title: "Bank CSV matching",
    body: "Export from Starling, Monzo, Tide, Revolut Business, Wise, or high-street banks. Import and match payments — no live Open Banking required.",
  },
  {
    title: "Accountant pack",
    body: "Invite your accountant read-only. One export gives them CSVs, invoice PDFs, receipts, and bank data for year-end.",
  },
] as const;

export function PricingIncluded() {
  return (
    <section className="bg-white px-6 py-16 md:py-20">
      <div className="mx-auto max-w-6xl">
        <div className="text-center">
          <h2 className="font-display text-3xl font-normal tracking-tight md:text-4xl">
            What&apos;s included
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-muted">
            Built to replace the spreadsheets and shared folders you already
            use — not to pretend you do not need an accountant.
          </p>
        </div>
        <ul className="mx-auto mt-12 grid max-w-4xl gap-6 sm:grid-cols-2">
          {INCLUDED.map((item) => (
            <li
              key={item.title}
              className="rounded-2xl border border-border bg-wash/40 p-6"
            >
              <div className="flex gap-3">
                <Check
                  className="mt-0.5 h-5 w-5 shrink-0 text-success"
                  aria-hidden
                />
                <div>
                  <h3 className="font-display text-lg font-semibold text-navy">
                    {item.title}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted">
                    {item.body}
                  </p>
                </div>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
