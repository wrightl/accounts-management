/**
 * Comparison pages at /compare/[slug]. Competitor details come from
 * docs/competitor-research.md, which used public vendor pages only. Keep each
 * claim checkable, dated and fair: assistants cite balanced comparisons and
 * discount one-sided ones, and an unfair claim about a named competitor is a
 * legal risk. Re-check against the vendor's site before changing a claim.
 */

/** When the competitor details below were checked against public vendor pages. */
export const COMPETITORS_CHECKED = "18 September 2026";

export type Support = "yes" | "partial" | "no" | "n/a";

export const CAPABILITIES = [
  { id: "quotes", label: "Versioned quotes the client accepts online" },
  { id: "milestones", label: "Orders with payment milestones" },
  { id: "invoices", label: "Branded invoices sent by email" },
  { id: "recurring", label: "Recurring invoices" },
  { id: "time", label: "Time tracking" },
  { id: "esign", label: "Contracts and e-signatures" },
  { id: "receipts", label: "Expenses with receipt reading (OCR)" },
  { id: "receiptEmail", label: "Receipt email address per person" },
  { id: "mileage", label: "Mileage claims" },
  { id: "reimbursements", label: "Reimbursement runs for founders" },
  { id: "bankFeed", label: "Live bank feed" },
  { id: "bankCsv", label: "Bank CSV import and matching" },
  { id: "dividends", label: "Dividends (limited companies)" },
  { id: "vatRecords", label: "VAT rates and VAT export" },
  { id: "mtdFiling", label: "Making Tax Digital VAT filing" },
  { id: "accountantInvite", label: "Accountant access" },
  { id: "accountantPack", label: "One-click accountant pack" },
] as const;

export type CapabilityId = (typeof CAPABILITIES)[number]["id"];

/** Alfa today. Updated since the research snapshot (recurring invoices shipped). */
export const ALFA_SUPPORT: Record<CapabilityId, Support> = {
  quotes: "yes",
  milestones: "yes",
  invoices: "yes",
  recurring: "yes",
  time: "no",
  esign: "no",
  receipts: "yes",
  receiptEmail: "yes",
  mileage: "yes",
  reimbursements: "yes",
  bankFeed: "no",
  bankCsv: "yes",
  dividends: "yes",
  vatRecords: "yes",
  mtdFiling: "no",
  accountantInvite: "yes",
  accountantPack: "yes",
};

export type Competitor = {
  slug: string;
  name: string;
  /** Short category, e.g. "UK accounting suite". */
  kind: string;
  /** One sentence on what it is, neutral in tone. */
  summary: string;
  /** Entry pricing as published at COMPETITORS_CHECKED, ex VAT. */
  pricing: string;
  pricingModel: string;
  chooseAlfaIf: readonly string[];
  chooseThemIf: readonly string[];
  support: Record<CapabilityId, Support>;
};

export const COMPETITORS: readonly Competitor[] = [
  {
    slug: "xero",
    name: "Xero",
    kind: "UK accounting suite",
    summary:
      "Xero is the accounting platform many UK accountants default to, with bank feeds, Making Tax Digital filing, payroll on some plans and a large app marketplace.",
    pricing: "Ignite £18 a month, Grow £39 a month (from 1 September 2026); Simple £7 a month for light, non-VAT use.",
    pricingModel: "Per organisation, tiered by plan limits.",
    chooseAlfaIf: [
      "You bill by project or milestone and want quote, order and milestone invoice in one flow",
      "Co-founders pay for things personally and you want receipt email and reimbursement runs",
      "Your accountant files your returns and you mainly want tidy weekly books and a pack to hand over",
      "You want founder answers such as safe to pay yourself, a 13-week cash forecast and project margins without add-ons",
    ],
    chooseThemIf: [
      "You need live bank feeds",
      "You want to file Making Tax Digital VAT returns from your bookkeeping software",
      "You need payroll or a large range of connected apps",
      "Your accountant insists on Xero for their practice workflow",
    ],
    support: {
      quotes: "partial",
      milestones: "partial",
      invoices: "yes",
      recurring: "yes",
      time: "partial",
      esign: "no",
      receipts: "yes",
      receiptEmail: "partial",
      mileage: "yes",
      reimbursements: "partial",
      bankFeed: "yes",
      bankCsv: "yes",
      dividends: "yes",
      vatRecords: "yes",
      mtdFiling: "yes",
      accountantInvite: "yes",
      accountantPack: "partial",
    },
  },
  {
    slug: "freeagent",
    name: "FreeAgent",
    kind: "UK accounting for freelancers and micro companies",
    summary:
      "FreeAgent is tax-led bookkeeping for UK freelancers and small limited companies, with bank feeds, time tracking, payroll and Making Tax Digital, Self Assessment and corporation tax filing.",
    pricing: "Sole trader £19 a month, limited company £33 a month (introductory discounts are common). Free with a NatWest, RBS, Ulster or Mettle business account.",
    pricingModel: "Per business, priced by business type.",
    chooseAlfaIf: [
      "You run a consultancy, studio or agency and quote, take deposits and invoice against milestones",
      "You want reimbursement runs and a receipt email address for each founder",
      "Your accountant files your returns and you want a one-click accountant pack",
      "You are a limited company and want per-organisation pricing with several users included",
    ],
    chooseThemIf: [
      "You want your software to file VAT, Self Assessment or corporation tax returns for you",
      "You need live bank feeds, time tracking or payroll",
      "You bank with NatWest Group and can use FreeAgent at no cost",
    ],
    support: {
      quotes: "partial",
      milestones: "partial",
      invoices: "yes",
      recurring: "yes",
      time: "yes",
      esign: "no",
      receipts: "yes",
      receiptEmail: "partial",
      mileage: "yes",
      reimbursements: "partial",
      bankFeed: "yes",
      bankCsv: "yes",
      dividends: "yes",
      vatRecords: "yes",
      mtdFiling: "yes",
      accountantInvite: "yes",
      accountantPack: "partial",
    },
  },
  {
    slug: "starling-accounting",
    name: "Starling Accounting",
    kind: "Bank-linked bookkeeping",
    summary:
      "Starling Accounting (formerly Ember) is bookkeeping inside a Starling business account, with invoicing, Making Tax Digital for Income Tax and VAT filing on its Plus plan.",
    pricing: "Essentials free; Plus £7 a month until April 2027, then £14 a month (adds VAT filing).",
    pricingModel: "Tied to a Starling business account.",
    chooseAlfaIf: [
      "You bank with more than one provider, or not with Starling",
      "You need quotes, orders and milestone invoicing for client projects",
      "You need dividends, board minutes and reimbursement runs for co-founders",
    ],
    chooseThemIf: [
      "You bank only with Starling and want the cheapest option",
      "You want VAT filing built in and simple books are enough",
    ],
    support: {
      quotes: "no",
      milestones: "no",
      invoices: "yes",
      recurring: "no",
      time: "no",
      esign: "no",
      receipts: "partial",
      receiptEmail: "no",
      mileage: "no",
      reimbursements: "no",
      bankFeed: "yes",
      bankCsv: "n/a",
      dividends: "partial",
      vatRecords: "partial",
      mtdFiling: "partial",
      accountantInvite: "partial",
      accountantPack: "no",
    },
  },
  {
    slug: "crunch",
    name: "Crunch",
    kind: "Software with an accountancy service",
    summary:
      "Crunch combines free invoicing and expenses software with paid packages that include named accountants and tax filing.",
    pricing: "Free software tier; sole trader Pro about £27 a month; limited company packages from about £94 a month.",
    pricingModel: "Software free; you pay for the accountancy service.",
    chooseAlfaIf: [
      "You already have an accountant you want to keep",
      "You want software for running the business week to week rather than an accountancy service",
      "You need quotes, milestones and reimbursement runs",
    ],
    chooseThemIf: [
      "You want an accountant bundled with your software in one monthly fee",
      "You want someone else to file your returns as part of the package",
    ],
    support: {
      quotes: "partial",
      milestones: "no",
      invoices: "yes",
      recurring: "partial",
      time: "no",
      esign: "no",
      receipts: "yes",
      receiptEmail: "no",
      mileage: "partial",
      reimbursements: "no",
      bankFeed: "yes",
      bankCsv: "partial",
      dividends: "yes",
      vatRecords: "yes",
      mtdFiling: "yes",
      accountantInvite: "n/a",
      accountantPack: "n/a",
    },
  },
  {
    slug: "bonsai",
    name: "Bonsai",
    kind: "Client workflow for freelancers and agencies",
    summary:
      "Bonsai covers proposals, contracts with e-signatures, client portals and invoicing for freelancers and small agencies, and syncs to Xero or QuickBooks for the books on higher tiers.",
    pricing: "Essentials about $25 per user a month (about £19); the $15 Basic plan has no invoicing.",
    pricingModel: "Per user.",
    chooseAlfaIf: [
      "You want UK books, VAT, dividends and an accountant pack in the same product as your quotes",
      "You want to pay per organisation rather than per user",
      "You do not want to run a second ledger in Xero or QuickBooks",
    ],
    chooseThemIf: [
      "You need contracts, e-signatures or time tracking",
      "You work outside the UK or bill mostly in other currencies",
    ],
    support: {
      quotes: "yes",
      milestones: "partial",
      invoices: "yes",
      recurring: "yes",
      time: "yes",
      esign: "yes",
      receipts: "partial",
      receiptEmail: "no",
      mileage: "no",
      reimbursements: "no",
      bankFeed: "partial",
      bankCsv: "no",
      dividends: "no",
      vatRecords: "no",
      mtdFiling: "no",
      accountantInvite: "no",
      accountantPack: "no",
    },
  },
  {
    slug: "harvest",
    name: "Harvest",
    kind: "Time tracking and invoicing",
    summary:
      "Harvest is time tracking, project budgets and invoicing for studios and agencies, usually synced to Xero or QuickBooks for the accounts.",
    pricing: "Free for 1 seat and 2 projects; Teams from $9 per seat a month on annual billing, plus 2026 usage fees.",
    pricingModel: "Per seat plus usage.",
    chooseAlfaIf: [
      "You price by quote and milestone rather than by the hour",
      "You want the books, VAT and accountant pack in the same product",
      "You want a fixed price per organisation without usage fees",
    ],
    chooseThemIf: [
      "You bill by the hour and time tracking is the heart of your workflow",
      "You already run your accounts in Xero or QuickBooks and only need time and invoicing",
    ],
    support: {
      quotes: "no",
      milestones: "partial",
      invoices: "yes",
      recurring: "partial",
      time: "yes",
      esign: "no",
      receipts: "partial",
      receiptEmail: "no",
      mileage: "no",
      reimbursements: "no",
      bankFeed: "no",
      bankCsv: "no",
      dividends: "no",
      vatRecords: "no",
      mtdFiling: "no",
      accountantInvite: "no",
      accountantPack: "no",
    },
  },
  {
    slug: "spreadsheets",
    name: "Spreadsheets",
    kind: "Excel or Google Sheets with an accountant",
    summary:
      "Many small UK firms run their books in spreadsheets and shared folders, then pay their accountant to tidy everything up at year end.",
    pricing: "No software cost; the cost is founder time and accountant clean-up fees.",
    pricingModel: "Free software, paid in time.",
    chooseAlfaIf: [
      "Year end means a catch-up of receipts, bank statements and invoices",
      "You want to know what clients owe and what is safe to pay yourself without building it yourself",
      "Your accountant charges extra to clean up your records",
    ],
    chooseThemIf: [
      "You raise a handful of invoices a year and have no expenses to track",
    ],
    support: {
      quotes: "partial",
      milestones: "partial",
      invoices: "partial",
      recurring: "partial",
      time: "partial",
      esign: "no",
      receipts: "no",
      receiptEmail: "no",
      mileage: "partial",
      reimbursements: "partial",
      bankFeed: "no",
      bankCsv: "partial",
      dividends: "partial",
      vatRecords: "partial",
      mtdFiling: "no",
      accountantInvite: "partial",
      accountantPack: "no",
    },
  },
] as const;

export function competitorBySlug(slug: string): Competitor | undefined {
  return COMPETITORS.find((c) => c.slug === slug);
}

export const SUPPORT_LABEL: Record<Support, string> = {
  yes: "Yes",
  partial: "Partly",
  no: "No",
  "n/a": "Not applicable",
};
