import { FolderOpen, Mail, Table2 } from "lucide-react";

const PAINS = [
  {
    icon: Table2,
    title: "Spreadsheets everywhere",
    body: "Quotes in one sheet, invoices in another, and nobody sure which number is current.",
  },
  {
    icon: FolderOpen,
    title: "Shared folders of PDFs",
    body: "Receipts and bank CSVs scattered across Drive — hard for you, harder for your accountant.",
  },
  {
    icon: Mail,
    title: "Receipts in inboxes",
    body: "Founders email photos of receipts. They vanish until year-end panic.",
  },
] as const;

export function ProblemSection() {
  return (
    <section className="bg-wash px-6 py-16 text-foreground md:py-20">
      <div className="mx-auto max-w-6xl">
        <h2 className="text-center font-display text-3xl font-normal tracking-tight md:text-4xl">
          The usual mess
        </h2>
        <p className="mx-auto mt-4 max-w-2xl text-center text-muted">
          If your books live in three tools and an email thread, you already
          know the cost — missed invoices, lost receipts, and a stressful
          hand-off at year-end.
        </p>
        <div className="mt-12 grid gap-6 md:grid-cols-3">
          {PAINS.map(({ icon: Icon, title, body }) => (
            <div
              key={title}
              className="rounded-2xl border border-border bg-white p-6 shadow-sm"
            >
              <Icon className="h-6 w-6 text-navy" aria-hidden />
              <h3 className="mt-4 font-display text-lg font-semibold">{title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted">{body}</p>
            </div>
          ))}
        </div>
        <p className="mx-auto mt-10 max-w-2xl text-center text-base font-medium text-navy">
          Dot + Dash Accounts puts quotes, invoices, expenses, bank matching,
          and an accountant pack in one place.
        </p>
      </div>
    </section>
  );
}
