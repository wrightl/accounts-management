import Image from "next/image";
import { cn } from "@/lib/utils";

export type FeatureSplitProps = {
  eyebrow: string;
  title: string;
  body: string;
  imageSrc: string;
  imageAlt: string;
  /** When true, image sits on the left on large screens. */
  reverse?: boolean;
};

export function FeatureSplit({
  eyebrow,
  title,
  body,
  imageSrc,
  imageAlt,
  reverse = false,
}: FeatureSplitProps) {
  return (
    <div
      className={cn(
        "grid items-center gap-10 lg:grid-cols-2 lg:gap-16",
        reverse && "lg:[&>*:first-child]:order-2",
      )}
    >
      <div>
        <p className="text-sm tracking-widest text-navy/50 uppercase">{eyebrow}</p>
        <h3 className="mt-2 font-display text-2xl font-normal tracking-tight md:text-3xl">
          {title}
        </h3>
        <p className="mt-4 text-base leading-relaxed text-muted">{body}</p>
      </div>
      <div className="overflow-hidden rounded-2xl border border-border bg-wash shadow-sm">
        <Image
          src={imageSrc}
          alt={imageAlt}
          width={1440}
          height={900}
          className="h-auto w-full"
        />
      </div>
    </div>
  );
}

const FEATURES: FeatureSplitProps[] = [
  {
    eyebrow: "Sales",
    title: "Quote becomes an order — no retyping",
    body: "When a client says yes, the quote turns into an order with the same line items and numbers. Raise invoices against milestones without starting from a blank sheet.",
    imageSrc: "/marketing/quote.png",
    imageAlt: "Quote detail showing line items ready to convert to an order",
  },
  {
    eyebrow: "Invoicing",
    title: "Branded invoice PDFs, books stay in sync",
    body: "Turn the order into a branded invoice. Record payments and watch receivables and the dashboard update — without a separate spreadsheet for “what’s outstanding”.",
    imageSrc: "/marketing/invoice.png",
    imageAlt: "Sent invoice with payment status and line items",
    reverse: true,
  },
  {
    eyebrow: "Expenses",
    title: "Email a receipt, batch reimbursements",
    body: "Founders send receipts to a dedicated address. They land as pending expenses for review. Mark what the company owes, batch a reimbursement run, and settle it cleanly.",
    imageSrc: "/marketing/expense.png",
    imageAlt: "Expense detail with receipt attachment pending review",
  },
  {
    eyebrow: "Banking",
    title: "Import a bank CSV and match payments",
    body: "Export a CSV from your bank, import it, and match incoming payments to invoices. Suggested matches mean less manual reconciliation — no live Open Banking required.",
    imageSrc: "/marketing/transactions.png",
    imageAlt: "Bank transactions list with suggested invoice matches",
    reverse: true,
  },
  {
    eyebrow: "Year-end",
    title: "One-click accountant pack",
    body: "Hand your accountant CSVs, invoice PDFs, receipts, and bank data in one export. Invite them read-only so they can check figures without editing your books.",
    imageSrc: "/marketing/reports.png",
    imageAlt: "Reports page with accountant pack export",
  },
];

export function FeatureSplits() {
  return (
    <section className="bg-wash px-6 py-16 md:py-24">
      <div className="mx-auto max-w-6xl space-y-20 md:space-y-28">
        <div className="text-center">
          <h2 className="font-display text-3xl font-normal tracking-tight md:text-4xl">
            What you get
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-muted">
            Built around how service firms actually get paid and spend — not a
            generic ledger dumped into a browser.
          </p>
        </div>
        {FEATURES.map((feature) => (
          <FeatureSplit key={feature.title} {...feature} />
        ))}
      </div>
    </section>
  );
}
