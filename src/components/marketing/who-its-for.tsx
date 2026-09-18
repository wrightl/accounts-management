import { Check, X } from "lucide-react";

const DIFFERENT = [
  "Quote → order → invoice with milestones — built for project work, not just one-off invoices",
  "Founder receipt email + reimbursement runs — the consultancy expense pain, solved",
  "Accountant as a first-class role — multi-company read-only and a one-click pack",
  "Honest scope: GBP, bank CSV matching, VAT export (not HMRC filing), no live bank feeds",
] as const;

export function DifferentiatorSection() {
  return (
    <section className="bg-navy px-6 py-16 text-white md:py-20">
      <div className="mx-auto max-w-6xl">
        <h2 className="text-center font-display text-3xl font-normal tracking-tight md:text-4xl">
          What makes it different
        </h2>
        <p className="mx-auto mt-4 max-w-2xl text-center text-white/70">
          Spreadsheet replacement for small UK service firms — not a claim to
          replace your accountant or full year-end filing software.
        </p>
        <ul className="mx-auto mt-10 max-w-3xl space-y-4">
          {DIFFERENT.map((item) => (
            <li
              key={item}
              className="flex gap-3 rounded-xl border border-white/10 bg-white/5 px-5 py-4 text-sm leading-relaxed"
            >
              <Check className="mt-0.5 h-5 w-5 shrink-0 text-brand" aria-hidden />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

const FOR = [
  "Founders of UK consultancies, studios, and small agencies",
  "Limited companies and sole traders who want day-to-day books in one place",
  "Teams that still hand year-end to an accountant",
] as const;

const NOT_FOR = [
  "Businesses that need live Open Banking feeds",
  "Teams filing VAT / MTD inside the app today",
  "Anyone looking for full year-end filing and tax submission software",
] as const;

export function WhoItsFor() {
  return (
    <section id="who" className="scroll-mt-20 bg-wash px-6 py-16 md:py-20">
      <div className="mx-auto max-w-6xl">
        <h2 className="text-center font-display text-3xl font-normal tracking-tight md:text-4xl">
          Who it&apos;s for
        </h2>
        <div className="mt-12 grid gap-8 md:grid-cols-2">
          <div className="rounded-2xl border border-border bg-white p-8">
            <h3 className="font-display text-xl font-semibold text-navy">A fit if you…</h3>
            <ul className="mt-6 space-y-3">
              {FOR.map((item) => (
                <li key={item} className="flex gap-3 text-sm text-foreground/90">
                  <Check className="mt-0.5 h-5 w-5 shrink-0 text-success" aria-hidden />
                  {item}
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-2xl border border-border bg-white p-8">
            <h3 className="font-display text-xl font-semibold text-navy">Not a fit if you…</h3>
            <ul className="mt-6 space-y-3">
              {NOT_FOR.map((item) => (
                <li key={item} className="flex gap-3 text-sm text-foreground/90">
                  <X className="mt-0.5 h-5 w-5 shrink-0 text-destructive" aria-hidden />
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}
