const STEPS = [
  {
    n: "01",
    title: "Set up your company",
    body: "Trading name, logo, bank details, and invoice numbering. Invite your co-founder and accountant.",
  },
  {
    n: "02",
    title: "Run a weekly rhythm",
    body: "Send quotes and invoices, log expenses, import the bank CSV, and clear what needs attention.",
  },
  {
    n: "03",
    title: "Hand year-end over",
    body: "Export the accountant pack. They stay read-only; you keep day-to-day control.",
  },
] as const;

export function HowItWorks() {
  return (
    <section id="how" className="scroll-mt-20 bg-white px-6 py-16 md:py-20">
      <div className="mx-auto max-w-6xl">
        <h2 className="text-center font-display text-3xl font-normal tracking-tight md:text-4xl">
          How it works
        </h2>
        <p className="mx-auto mt-4 max-w-2xl text-center text-muted">
          Fifteen minutes a week beats a month of catch-up before the accountant
          calls.
        </p>
        <ol className="mt-12 grid gap-8 md:grid-cols-3">
          {STEPS.map((step) => (
            <li key={step.n} className="relative rounded-2xl border border-border p-6">
              <span className="font-display text-3xl text-brand">{step.n}</span>
              <h3 className="mt-3 font-display text-xl font-semibold">{step.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted">{step.body}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
