import { Check } from "lucide-react";

const INCLUDED = [
  {
    title: "Quote → order → invoice",
    body: "Client says yes, the quote becomes an order. Raise invoices against milestones — no retyping into another spreadsheet.",
  },
  {
    title: "Get paid online",
    body: "Clients pay by card from the invoice link, quotes can take a deposit on acceptance, and reminders follow your schedule. When a business client pays late, raise an invoice for the statutory interest and compensation in one click.",
  },
  {
    title: "Cash forecast and safe to pay",
    body: "A 13-week cash forecast with what-ifs. Limited companies also see what's safe to pay as dividends, director's loans and a corporation tax estimate.",
  },
  {
    title: "Deadlines and Ltd paperwork",
    body: "Confirmation statement, annual accounts, corporation tax, VAT and Self Assessment dates worked out for you, with reminders. Declare a dividend and get board minutes and dividend vouchers as PDFs.",
  },
  {
    title: "Weekly close",
    body: "A short checklist each week: bank imported, receipts attached, overdue invoices chased, milestones ready to bill, reimbursements owed.",
  },
  {
    title: "Project profitability",
    body: "Tag costs to a client or order to see the margin, and recharge rebillable costs on the next invoice.",
  },
  {
    title: "AI bookkeeper",
    body: "Category and receipt-match suggestions, and plain-English answers about your figures. Nothing changes until you accept it.",
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
    body: "Invite your accountant read-only. One export gives them CSVs, invoice PDFs, receipts, and bank data for year-end — on every plan, with the VAT summary on Essentials and Premium.",
  },
  {
    title: "Display and focus",
    body: "Larger text, readable font, higher contrast, reduced motion, and success messages that stay until you dismiss them — all on your Profile.",
  },
  {
    title: "Plain-language help",
    body: "In-app guidance for busy founders, including how to make the app easier to use with your phone or computer accessibility settings.",
  },
] as const;

const ALSO_INCLUDED = [
  "Credit notes",
  "Mileage at HMRC rates",
  "Receipt reading",
  "Spending by category",
  "Companies House look-up",
  "CSV import of clients, invoices and expenses",
  "Email and in-app notifications",
  "Audit log",
  "A menu you can tailor",
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
        <div className="mx-auto mt-10 max-w-4xl text-center">
          <h3 className="font-display text-lg font-semibold text-navy">
            Also included
          </h3>
          <p className="mt-3 text-sm leading-relaxed text-muted">
            {ALSO_INCLUDED.join(" · ")}
          </p>
        </div>
      </div>
    </section>
  );
}
