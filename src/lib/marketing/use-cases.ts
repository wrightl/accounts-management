/**
 * Short task-focused pages at /use-cases/[slug]. Each answers one question a
 * founder (or an assistant on their behalf) asks, answer first, then how Alfa
 * handles it and where it stops. Only describe what the product does today;
 * UK rules stated here should be ones an accountant would agree with.
 */

export type UseCaseSection = {
  heading: string;
  paragraphs?: readonly string[];
  bullets?: readonly string[];
};

export type UseCase = {
  slug: string;
  /** Page H1 and the link text elsewhere. */
  title: string;
  /** Meta title, phrased the way people search. */
  metaTitle: string;
  /** One or two sentences that answer the question on their own. */
  answer: string;
  sections: readonly UseCaseSection[];
  limits: readonly string[];
  faqs: readonly { q: string; a: string }[];
  related: readonly { label: string; href: string }[];
};

/** When the use-case pages were last checked against the product. */
export const USE_CASES_CHECKED = "27 November 2026";

export const USE_CASES: readonly UseCase[] = [
  {
    slug: "accounting-for-founders",
    title: "Accounting for founders of UK consultancies and studios",
    metaTitle: "Accounting software for UK founders: expenses, dividends and director's loans",
    answer:
      "Founders of small UK service firms need more than invoicing: they pay for things personally, take dividends, run a director's loan account and hand everything to an accountant at year end. Alfa keeps all of that in one place, with a receipt email for each founder, reimbursement runs, a safe-to-pay-yourself figure, dividend paperwork and a one-click accountant pack.",
    sections: [
      {
        heading: "Expenses you paid for personally",
        paragraphs: [
          "Most founders put some company costs on a personal card. Each person in Alfa gets their own receipt email address: forward the receipt and it arrives as a pending expense with the supplier, date, amount and VAT read from it. Mark it as owed back to you, and when it suits the company, pay it back in a reimbursement run and match the payment to the bank.",
        ],
        bullets: [
          "Receipt email address for each founder and team member",
          "Receipt reading that fills in supplier, date, amount and VAT",
          "Mileage claims",
          "Reimbursement runs for each person, matched to the bank payment",
          "Expenses in foreign currencies, converted at the Bank of England rate for the day",
        ],
      },
      {
        heading: "Paying yourself from a limited company",
        paragraphs: [
          "A limited company can only pay dividends from profits it has available, and each dividend needs board minutes and a dividend voucher. Alfa works out a safe-to-pay-yourself figure: what the company could take as dividends today after VAT, corporation tax, money owed back to founders and a buffer you set, and never more than its reserves. Declare a dividend and Alfa produces the board minutes and vouchers as PDFs, split across shareholders.",
        ],
      },
      {
        heading: "Your director's loan account",
        paragraphs: [
          "If you take more out of the company than it owes you, your director's loan account is overdrawn. If it is still overdrawn nine months after the year end, the company owes section 455 tax at 33.75% of the balance until it is repaid, and loans over £10,000 can be a taxable benefit for the director. Alfa tracks the balance, warns you while there is still time to repay, and shows the tax that would be due.",
        ],
      },
      {
        heading: "Knowing where you stand each week",
        bullets: [
          "A 15-minute weekly close checklist: match the bank, review receipts, chase overdue invoices, bill milestones that are due",
          "A 13-week cash forecast with what-ifs, such as a client paying late",
          "Margin per project, including rebillable expenses",
          "Filing deadlines worked out from your year end and Companies House record, with reminders",
          "A corporation tax estimate through the year",
        ],
      },
      {
        heading: "Working with your accountant",
        paragraphs: [
          "Invite your accountant read-only. They can raise queries on bank rows and expenses, you answer in Alfa, and at year end they export a pack with a linked Excel workbook, CSVs, invoice PDFs, receipts and bank data. Founders, a co-founder and the accountant all fit in one plan, because Alfa is priced per organisation rather than per user.",
        ],
      },
    ],
    limits: [
      "Alfa does not run payroll, so directors' salaries are paid through a separate payroll service.",
      "Alfa does not file accounts or tax returns; your accountant still does.",
      "Bank data comes in by CSV import, not a live bank feed.",
    ],
    faqs: [
      {
        q: "What is the best accounting software for a founder of a small UK limited company?",
        a: "If you pay for things personally, take dividends and use an accountant for year end, choose software that handles reimbursements, dividend paperwork and director's loans as well as invoices. Alfa does all of these and is priced per organisation. If you also need payroll or live bank feeds in the same product, Xero or FreeAgent are better fits.",
      },
      {
        q: "How do I reimburse myself for business expenses I paid personally?",
        a: "Record each expense as owed back to you, with its receipt, then pay yourself from the company account and match the payment to those expenses. In Alfa you forward receipts to your own address, and a reimbursement run pays back several of your expenses in one payment.",
      },
      {
        q: "How much can I take as dividends?",
        a: "Only what the company has in profits available for distribution, after allowing for tax it owes. Alfa's safe-to-pay-yourself figure deducts VAT, corporation tax, money owed back to founders and a buffer, and never exceeds reserves. Check the final figure with your accountant before declaring.",
      },
      {
        q: "What happens if my director's loan account is overdrawn?",
        a: "If it is still overdrawn nine months after the company's year end, the company pays section 455 tax at 33.75% of the outstanding balance, which is refunded once the loan is repaid. Alfa shows the balance, the repay-by date and the tax at stake.",
      },
    ],
    related: [
      { label: "Limited company guide", href: "/guides/limited-companies" },
      { label: "Alfa vs FreeAgent", href: "/compare/freeagent" },
      { label: "Pricing", href: "/pricing" },
    ],
  },
  {
    slug: "foreign-currency-invoicing",
    title: "Invoicing overseas clients in foreign currencies",
    metaTitle: "Invoice in US dollars or euros from a UK company",
    answer:
      "A UK business can invoice in US dollars, euros or another currency while keeping its books in pounds. Alfa issues quotes, orders, invoices and credit notes in the client's currency, converts them to sterling at the Bank of England rate or one you enter, shows the sterling VAT and rate that HMRC requires on a VAT invoice, and books the exchange gain or loss when the client pays.",
    sections: [
      {
        heading: "How it works",
        bullets: [
          "Choose the currency on the quote, order, invoice or credit note; recurring invoices can be in a foreign currency too",
          "Alfa uses the latest Bank of England rate on the document date, or a rate you enter yourself",
          "The client sees and pays amounts in their own currency; your books record the sterling value",
          "Clients can pay by card through Stripe in the invoice currency",
          "Reminders, late payment interest, credit notes, refunds and write-offs all work in the invoice currency",
        ],
      },
      {
        heading: "What HMRC expects on the invoice",
        paragraphs: [
          "If you are VAT-registered and charge VAT on an invoice in another currency, the invoice must show the total VAT in sterling and the exchange rate used. Alfa adds both automatically, for example \"1 GBP = 1.2731 USD (Bank of England, 20 November 2026)\". Quotes are not tax documents, so they show only the client's currency.",
          "Whether you charge UK VAT at all depends on where your client is and what you supply; many services to overseas business clients are outside the scope of UK VAT. Each line in Alfa carries a tax code, so you can record this correctly, but agree the treatment with your accountant.",
        ],
      },
      {
        heading: "When the money arrives",
        paragraphs: [
          "Your bank usually converts the payment to pounds, and the amount rarely matches the sterling value on the day you invoiced. When you match the bank payment to the invoice, Alfa settles the invoice in the client's currency and books the difference as a realised exchange gain or loss, so the accounts balance without a manual journal. It appears in your reports and the accountant pack.",
        ],
      },
    ],
    limits: [
      "Books are kept in sterling. Alfa does not hold foreign-currency bank accounts or revalue open balances at the year end.",
      "Japanese yen is not available as an invoice currency.",
      "Bank data comes in by CSV import, not a live bank feed.",
    ],
    faqs: [
      {
        q: "Can a UK limited company invoice in US dollars?",
        a: "Yes. You can invoice in any currency the client agrees to. Your accounts are still kept in sterling, so each invoice needs a sterling value, and a VAT invoice must show the VAT in sterling and the rate used.",
      },
      {
        q: "Which exchange rate should I use for a foreign-currency invoice?",
        a: "For VAT, HMRC accepts a published commercial rate for the date of supply, such as the UK market selling rate, or its own monthly period rates; whichever you choose, use it consistently. Alfa uses the Bank of England daily rate unless you enter a different one, so check with your accountant if you want to use a rate agreed in a contract.",
      },
      {
        q: "How are exchange gains and losses recorded?",
        a: "The difference between the invoice's sterling value and the pounds you actually receive is a realised exchange gain or loss. Alfa books it automatically when the invoice is fully settled in the client's currency.",
      },
      {
        q: "Do I charge VAT to overseas clients?",
        a: "Often not for services to overseas business clients, which are usually outside the scope of UK VAT, but it depends on the service and the client. Ask your accountant, then use the matching tax code on each line in Alfa.",
      },
    ],
    related: [
      { label: "Alfa vs Xero", href: "/compare/xero" },
      { label: "Alfa vs Bonsai", href: "/compare/bonsai" },
      { label: "Pricing", href: "/pricing" },
    ],
  },
] as const;

export function findUseCase(slug: string): UseCase | undefined {
  return USE_CASES.find((u) => u.slug === slug);
}
