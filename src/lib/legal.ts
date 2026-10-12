/** Shared facts for the privacy notice and terms. Update the date when either page changes. */
export const LEGAL_ENTITY = "Dot and Dash Consulting Ltd";
export const LEGAL_COMPANY_NUMBER = "15552561";
export const LEGAL_JURISDICTION = "England and Wales";
export const LEGAL_REGISTERED_OFFICE =
  "Apartment 8, Whiteley Wood House, 50 Woofindin Avenue, Sheffield, England, S11 7FG";
export const LEGAL_CONTACT_EMAIL = "support@dotanddashconsulting.com";
export const LEGAL_LAST_UPDATED = "12 October 2026";

export type SubProcessor = {
  name: string;
  purpose: string;
  location: string;
};

/** Third parties that process personal data for Alfa. Keep in step with the stack. */
export const SUB_PROCESSORS: SubProcessor[] = [
  {
    name: "Vercel Inc.",
    purpose: "Hosting, private file storage (receipts, logos, PDFs), cookie-free analytics, and the AI Gateway that routes AI requests",
    location: "USA / global edge network",
  },
  {
    name: "Neon (Databricks, Inc.)",
    purpose: "Postgres database that holds your books",
    location: "UK (London)",
  },
  {
    name: "Clerk, Inc.",
    purpose: "Sign-in, Google sign-in, and session management",
    location: "USA",
  },
  {
    name: "Anthropic, PBC",
    purpose: "AI model (Claude) behind the AI bookkeeper and AI receipt reading, reached through Vercel AI Gateway",
    location: "USA",
  },
  {
    name: "Resend (Plus Five Five, Inc.)",
    purpose: "Sending quotes, invoices, reminders and notifications by email, and receiving forwarded receipt emails",
    location: "USA",
  },
  {
    name: "Stripe Payments Europe, Ltd. and Stripe, Inc.",
    purpose: "Subscription billing, and card payments on invoices if you connect your own Stripe account",
    location: "Ireland / USA",
  },
  {
    name: "Google (Firebase Cloud Messaging)",
    purpose: "Push notifications to the mobile app, if you turn them on",
    location: "USA",
  },
];
