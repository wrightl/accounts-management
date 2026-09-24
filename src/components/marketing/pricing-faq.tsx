"use client";

import { track } from "@vercel/analytics";
import { PRICING_FAQ_EVENT } from "@/lib/marketing-analytics";

export function PricingFaq({
  annualAnswer,
}: {
  annualAnswer: string;
}) {
  const faqs = [
    {
      id: "replace_accountant",
      q: "Does this replace my accountant?",
      a: "No. We replace the spreadsheets and folders you use week to week. Your accountant still files returns and handles Companies House. Invite them read-only and hand them an accountant pack when they need the numbers.",
    },
    {
      id: "vat_mtd",
      q: "Is VAT / Making Tax Digital included?",
      a: "You can set VAT rates and export a period VAT CSV for your accountant on paid plans. We do not submit to HMRC or claim Making Tax Digital filing.",
    },
    {
      id: "live_bank_feed",
      q: "Is there a live bank feed?",
      a: "Not yet. Export a CSV from your bank, import it, and match payments to invoices. A live feed is planned for Premium later — it is not included today.",
    },
    {
      id: "currency",
      q: "What currency do you support?",
      a: "GBP only. Foreign receipts can be logged for information, but the books stay in pounds.",
    },
    {
      id: "per_seat",
      q: "Is pricing per seat?",
      a: "No. You pay per organisation. Essentials covers up to 5 users (founders plus accountant); Premium goes up to 15. Fair-use seats, not a seat tax.",
    },
    {
      id: "annual_discount",
      q: "How does the annual discount work?",
      a: annualAnswer,
    },
    {
      id: "cancel",
      q: "Can I cancel anytime?",
      a: "Yes. Cancel before renewal and you keep access through the paid period. We do not wipe your books if a trial ends without payment — you will be asked to choose a plan to keep writing.",
    },
    {
      id: "after_trial",
      q: "What happens after the 30-day trial?",
      a: "Choose Essentials or Premium before the trial ends. Card billing follows when you convert. Until then, start free — no card required to try the product.",
    },
    {
      id: "neurodiverse",
      q: "Is this built for neurodiverse users?",
      a: "Yes as a design goal: plain language, quieter screens, and Profile controls for motion, text size, contrast, font, and success messages — on every plan. Alfa works with VoiceOver, TalkBack, magnification, and dictation. We have not been independently certified for accessibility.",
    },
  ] as const;

  return (
    <section id="faq" className="scroll-mt-24 bg-white px-6 py-16 md:py-20">
      <div className="mx-auto max-w-3xl">
        <h2 className="text-center font-display text-3xl font-normal tracking-tight md:text-4xl">
          Pricing questions
        </h2>
        <div className="mt-10 space-y-3">
          {faqs.map((item) => (
            <details
              key={item.id}
              className="group rounded-2xl border border-border bg-wash/50 px-5 py-4 open:bg-wash"
              onToggle={(event) => {
                if (event.currentTarget.open) {
                  track(PRICING_FAQ_EVENT, { question: item.id });
                }
              }}
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
