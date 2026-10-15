import {
  CalendarCheck,
  CreditCard,
  Percent,
  PiggyBank,
  Sparkles,
  TrendingUp,
} from "lucide-react";

const INSIGHTS = [
  {
    icon: CreditCard,
    title: "Get paid sooner",
    body: "Connect Stripe and clients pay invoices by card from a link in the email. A quote can ask for a deposit when it's accepted. Reminders go out on your schedule, and you can claim statutory late payment interest in one click.",
  },
  {
    icon: CalendarCheck,
    title: "A 15-minute weekly close",
    body: "One checklist each Monday: match the bank, review receipts, chase what's overdue and bill milestones that are due. Lock a period once your accountant has signed it off.",
  },
  {
    icon: PiggyBank,
    title: "Safe to pay yourself",
    body: "For limited companies: one figure for what you could take as dividends today, after VAT, corporation tax, money owed back to founders and a buffer, and never more than your reserves. Declare a dividend and get the board minutes and vouchers as PDFs. Director's loans are tracked too.",
  },
  {
    icon: TrendingUp,
    title: "13-week cash forecast",
    body: "Cash at the end of each week from what clients owe, milestones, recurring invoices, VAT and tax. Try what-ifs, such as a client paying late or a new monthly cost.",
  },
  {
    icon: Sparkles,
    title: "AI bookkeeper",
    body: "Suggests categories for bank payments, learning from your corrections, and pairs receipts with card payments. Ask questions like “what did we spend on software last quarter?” Nothing changes until you accept it.",
  },
  {
    icon: Percent,
    title: "Margin on every project",
    body: "Tag costs to a client or order and see what each one really earns. Rebillable costs show up on the client's next invoice, so nothing you paid for goes unbilled.",
  },
] as const;

export function InsightFeatures() {
  return (
    <section className="bg-white px-6 py-16 md:py-24">
      <div className="mx-auto max-w-6xl">
        <div className="text-center">
          <h2 className="font-display text-3xl font-normal tracking-tight md:text-4xl">
            Know where you stand
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-muted">
            The questions founders actually ask, answered from your own books: what you can pay
            yourself, whether cash will last, and which work makes money.
          </p>
        </div>
        <ul className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {INSIGHTS.map(({ icon: Icon, title, body }) => (
            <li key={title} className="rounded-2xl border border-border bg-wash/40 p-6">
              <Icon className="h-6 w-6 text-navy" aria-hidden />
              <h3 className="mt-4 font-display text-lg font-semibold text-navy">{title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted">{body}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
