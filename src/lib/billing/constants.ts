/** Past-due grace before read-only (days). */
export const PAST_DUE_GRACE_DAYS = 7;

/** Default app-owned trial length. */
export const TRIAL_DAYS = 30;

export const BILLING_PLANS = ["trial", "essentials", "premium"] as const;
export type PlanSlug = (typeof BILLING_PLANS)[number];

/**
 * Fallback marketing / MRR amounts in pence (ex VAT) when Stripe catalog
 * is unavailable. Prefer `getStripeCatalog()` / `catalogAmountPence()`.
 * @deprecated Prefer live Stripe catalog amounts.
 */
export const PLAN_PRICES_PENCE = {
  essentials: { month: 1900, year: 19000 },
  premium: { month: 2900, year: 29000 },
} as const;

export const DEFAULT_TIER_LIMITS: Record<
  PlanSlug,
  {
    name: string;
    maxUsers: number;
    vatExport: boolean;
    liveBankFeed: boolean;
    prioritySupport: boolean;
    invoiceTemplates: boolean;
    invoiceDesigner: boolean;
  }
> = {
  trial: {
    name: "Trial",
    maxUsers: 5,
    vatExport: false,
    liveBankFeed: false,
    prioritySupport: false,
    invoiceTemplates: true,
    invoiceDesigner: false,
  },
  essentials: {
    name: "Essentials",
    maxUsers: 5,
    vatExport: true,
    liveBankFeed: false,
    prioritySupport: false,
    invoiceTemplates: true,
    invoiceDesigner: false,
  },
  premium: {
    name: "Premium",
    maxUsers: 15,
    vatExport: true,
    liveBankFeed: false,
    prioritySupport: true,
    invoiceTemplates: true,
    invoiceDesigner: true,
  },
};
