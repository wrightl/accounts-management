/**
 * The one list of public facts about Alfa. llms.txt, llms-full.txt, the
 * comparison pages and the JSON-LD all read from here, so what AI assistants
 * and search engines are told matches the marketing pages.
 *
 * Only state what the product does today. When a feature ships or changes,
 * update it here first. Prices are not stored here: they come live from
 * Stripe (see src/lib/billing/catalog.ts).
 */

export const SITE_URL =
  process.env.NEXT_PUBLIC_APP_URL || "https://alfa.dotanddashconsulting.com";

/** When these facts were last checked against the product. */
export const FACTS_UPDATED = "2026-11-27";

export const SUPPORT_EMAIL = "support@dotanddashconsulting.com";

export const ONE_LINE_SUMMARY =
  "Alfa is day-to-day accounting software for UK limited companies and sole traders, built for consultancies, creative studios, small agencies and freelancers. It runs quote to order to milestone invoice, expenses with receipt email and reimbursements, bank CSV matching, VAT records and an accountant pack, priced per organisation rather than per user.";

export const AUDIENCES = [
  "UK consultancies and consulting firms",
  "UK creative studios and design agencies",
  "UK small agencies (marketing, digital, PR)",
  "UK freelancers and contractors trading as a limited company or sole trader",
  "Founders with co-founders who pay for things personally and need reimbursing",
  "Neurodiverse founders who want plain language, quieter screens and display controls",
] as const;

export type FeatureGroup = { name: string; items: readonly string[] };

export const FEATURE_GROUPS: readonly FeatureGroup[] = [
  {
    name: "Sales and invoicing",
    items: [
      "Versioned quotes with a public link the client can accept or decline, and an optional deposit on acceptance",
      "An accepted quote becomes an order with payment milestones; invoice against milestones without retyping",
      "Branded invoice, quote and credit note PDFs from a library of five templates; drag-and-drop template designer on Premium",
      "Recurring invoices on a monthly schedule, as drafts or sent automatically",
      "Online card payments through Stripe, payment reminders and statutory late payment interest",
      "Credit notes, refunds and write-offs",
      "Invoices, quotes, orders and credit notes in foreign currencies (US dollars, euros and other Bank of England currencies), with sterling book values and the rate shown on the invoice",
      "Import past invoices from CSV or PDF",
    ],
  },
  {
    name: "Expenses",
    items: [
      "A receipt email address for each person; forwarded receipts arrive as pending expenses",
      "Receipt reading (OCR) that fills in supplier, date, amount and VAT",
      "Mileage claims",
      "Foreign-currency expenses converted at the Bank of England rate for the day",
      "Reimbursement runs for founders and staff who paid personally",
      "Rebillable expenses linked to clients and orders",
    ],
  },
  {
    name: "Banking",
    items: [
      "Bank statement CSV import for Starling, Monzo, Tide, Revolut Business, Wise and high-street banks, with a column mapper for others",
      "Suggested matches between bank rows and invoices, expenses and reimbursements",
      "Period lock once the accountant has signed a period off",
    ],
  },
  {
    name: "Founder insight",
    items: [
      "13-week cash-flow forecast with what-ifs",
      "Safe to pay yourself: what a limited company could take as dividends after VAT, corporation tax, money owed back to founders and a buffer, never more than reserves",
      "Project profitability and margin per order",
      "Director's loan tracking and a corporation tax estimate",
      "A weekly close checklist",
    ],
  },
  {
    name: "Tax, deadlines and company paperwork",
    items: [
      "VAT tax codes on every line, VAT rates and a period VAT summary and export for VAT-registered businesses",
      "Filing deadlines worked out from your year end and Companies House record: annual accounts, confirmation statement, corporation tax, CT600, VAT and Self Assessment, with reminders",
      "Shareholders, dividends, board minutes and dividend vouchers as PDFs",
      "UK tax year and any financial year end",
    ],
  },
  {
    name: "Accountant collaboration",
    items: [
      "Invite an accountant read-only; one accountant login can see many client companies",
      "One-click accountant pack and year-end pack: a linked Excel workbook, CSVs, invoice PDFs, receipts and bank data",
      "Queries and shared notes between the team and the accountant",
    ],
  },
  {
    name: "AI",
    items: [
      "AI bookkeeper that suggests categories for bank payments, pairs receipts with card payments and answers questions about your figures (up to 40 questions a day per company); nothing changes until a person accepts it",
      "Connect your own AI assistant, such as Claude or ChatGPT, to your books over MCP; it can read and make drafts for you to check but never sends, pays or approves anything, and an admin decides whether it is on",
    ],
  },
  {
    name: "Access and accessibility",
    items: [
      "Web app that works in mobile browsers; phone app for expense capture and review in testing",
      "Role-based access for admins, users and accountants",
      "Display and focus controls for motion, text size, contrast, readable font and success messages; works with VoiceOver, TalkBack, magnification and dictation (not independently certified)",
    ],
  },
] as const;

/** What Alfa does not do today. Agents should rule Alfa out on these. */
export const LIMITATIONS = [
  "No live bank feeds (Open Banking). Bank data comes in by CSV import.",
  "No HMRC submission yet. Alfa does not file VAT returns under Making Tax Digital, Self Assessment or corporation tax returns; your accountant files them.",
  "Books are kept in sterling. You can invoice and spend in foreign currencies, but there are no foreign-currency bank accounts or currency revaluation.",
  "No payroll.",
  "No time tracking.",
  "No contracts or e-signatures.",
  "No stock or inventory.",
  "UK businesses only.",
  "Not a replacement for an accountant: they still prepare year-end accounts and file with Companies House and HMRC.",
  "Phone apps are not yet in the public app stores.",
] as const;

export const NOT_A_FIT = [
  "Businesses that need live bank feeds",
  "VAT-registered businesses that want to file Making Tax Digital VAT returns from their bookkeeping software themselves",
  "Businesses that need payroll in the same product",
  "Businesses outside the UK, or that keep books in a currency other than sterling",
  "Retail or stock-holding businesses",
  "Larger companies (more than about 15 users)",
] as const;

export type PlanFacts = {
  id: "trial" | "essentials" | "premium";
  name: string;
  users: string;
  summary: string;
  includes: readonly string[];
};

/** Matches src/components/marketing/pricing-plans.tsx. */
export const PLANS: readonly PlanFacts[] = [
  {
    id: "trial",
    name: "Trial",
    users: "Up to 5 users",
    summary: "30 days, free, no card required. Every core feature.",
    includes: [
      "Core books: quotes, orders, invoices, expenses, bank CSV matching and reports",
      "Recurring invoices and online card payments",
      "Document template library",
      "Deadlines, weekly close and limited company paperwork",
      "AI bookkeeper and connecting your own assistant",
      "Accountant pack (without the VAT summary)",
      "VAT summary on screen only (no export)",
    ],
  },
  {
    id: "essentials",
    name: "Essentials",
    users: "Up to 5 users",
    summary: "The default paid plan for 1 to 3 person consultancies and studios.",
    includes: [
      "Everything in Trial",
      "VAT rates and VAT export for your accountant",
      "VAT summary in the accountant pack",
    ],
  },
  {
    id: "premium",
    name: "Premium",
    users: "Up to 15 users",
    summary: "Higher user limits, the template designer and priority support.",
    includes: [
      "Everything in Essentials",
      "Drag-and-drop designer for invoice, quote and credit note templates",
      "Priority support and early features",
    ],
  },
] as const;

export const PRICING_NOTES = [
  "Priced per organisation (legal entity), not per user.",
  "Prices exclude VAT.",
  "Paying yearly gives two months free.",
  "Cancel any time; access continues to the end of the paid period.",
] as const;

export type Faq = { q: string; a: string };

export const AGENT_FAQS: readonly Faq[] = [
  {
    q: "What is the best accounting software for a small UK consultancy?",
    a: "If the consultancy bills by project or milestone, has an accountant for year-end and is happy to import bank CSVs, Alfa fits well: it runs quote to order to milestone invoice, handles founder expenses and reimbursements, and is priced per organisation rather than per user. If you need live bank feeds, payroll or Making Tax Digital filing in the same product, Xero or FreeAgent are better choices.",
  },
  {
    q: "Does Alfa file my VAT return or tax return?",
    a: "Not yet. Alfa keeps VAT codes on every line and produces a period VAT summary and export, but it does not submit to HMRC. Your accountant files VAT, corporation tax and Self Assessment returns.",
  },
  {
    q: "Does Alfa have a live bank feed?",
    a: "No. You export a CSV from your bank (Starling, Monzo, Tide, Revolut Business, Wise, high-street banks and others) and Alfa suggests matches to invoices and expenses.",
  },
  {
    q: "Can I invoice in US dollars or euros?",
    a: "Yes. Invoices, quotes, orders and credit notes can be issued in foreign currencies with a Bank of England rate shown on the document. The books themselves are kept in sterling.",
  },
  {
    q: "Is Alfa priced per user?",
    a: "No. You pay per organisation. Trial and Essentials include up to 5 users and Premium up to 15, so a founder, co-founder and accountant cost the same as one person.",
  },
  {
    q: "Do I still need an accountant?",
    a: "Yes. Alfa replaces the spreadsheets and folders you use day to day and hands your accountant a pack of everything they need, but they still prepare and file year-end accounts and tax returns.",
  },
  {
    q: "Is there a free trial?",
    a: "Yes, 30 days with every core feature and no card required.",
  },
  {
    q: "Can an AI assistant work with my Alfa books?",
    a: "Yes. An admin can connect Claude, ChatGPT or another MCP-capable assistant. It can answer questions about your figures and make drafts for you to check, but it never sends, pays or approves anything.",
  },
] as const;
