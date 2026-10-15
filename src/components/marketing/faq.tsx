const FAQS = [
  {
    q: "Is this full accounting software?",
    a: "It replaces the spreadsheets and folders you use day to day: quotes, invoices, credit notes, expenses, bank CSV matching and reports. It also forecasts cash, shows project margins, keeps track of your filing deadlines and, for limited companies, tracks director's loans and what's safe to pay yourself. Your accountant still files returns and handles Companies House.",
  },
  {
    q: "Do you support VAT or Making Tax Digital?",
    a: "If you are VAT-registered you can set rates and export a period VAT CSV for your accountant. We do not submit to HMRC or claim Making Tax Digital filing.",
  },
  {
    q: "Is there a live bank feed?",
    a: "No. Export a CSV from your bank (Starling, Monzo, and others), import it, and match payments to invoices.",
  },
  {
    q: "Can my accountant use it?",
    a: "Yes. Invite them read-only. They can export an accountant pack with CSVs, invoice PDFs, receipts, and bank data.",
  },
  {
    q: "Limited company or sole trader?",
    a: "Both. Day-to-day books are the same, and both get their filing deadlines worked out with reminders — Self Assessment for sole traders; accounts, confirmation statement and corporation tax for limited companies. Limited companies also get shareholders, dividends with board minutes and vouchers, director's loans, a corporation tax estimate and a reserves check. See our UK Financial Guides for obligations by structure.",
  },
  {
    q: "How does Alfa use AI?",
    a: "The AI bookkeeper suggests categories for bank payments, pairs receipts with card payments, and answers questions about your figures. It can only read your books, and nothing changes until someone accepts a suggestion. Questions are limited to 40 a day per company.",
  },
  {
    q: "What currency do you support?",
    a: "GBP only. Foreign receipts can be logged for information, but the books stay in pounds.",
  },
  {
    q: "Is this built for neurodiverse users?",
    a: "We design for neurodiverse founders and small startups: plain language, quieter screens, and Profile controls for motion, text size, contrast, font, and success messages. Alfa works with VoiceOver, TalkBack, magnification, and dictation on your device. We have not been independently certified for accessibility.",
  },
] as const;

export function FaqSection() {
  return (
    <section className="bg-white px-6 py-16 md:py-20">
      <div className="mx-auto max-w-3xl">
        <h2 className="text-center font-display text-3xl font-normal tracking-tight md:text-4xl">
          Questions
        </h2>
        <div className="mt-10 space-y-3">
          {FAQS.map((item) => (
            <details
              key={item.q}
              className="group rounded-2xl border border-border bg-wash/50 px-5 py-4 open:bg-wash"
            >
              <summary className="cursor-pointer list-none font-medium text-foreground marker:content-none [&::-webkit-details-marker]:hidden">
                <span className="flex items-center justify-between gap-4">
                  {item.q}
                  <span className="text-muted transition group-open:rotate-45" aria-hidden>
                    +
                  </span>
                </span>
              </summary>
              <p className="mt-3 text-sm leading-relaxed text-muted">{item.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
