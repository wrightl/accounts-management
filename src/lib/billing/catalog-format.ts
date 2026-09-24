import { PLAN_PRICES_PENCE } from "@/lib/billing/constants";
import { formatGBP } from "@/lib/money";
import type { BillingInterval } from "@/db/schema";
import type { StripeCatalog } from "@/lib/billing/catalog-types";

/** Whole-pound display for marketing (e.g. 1900 → "£19"). */
export function formatCatalogPounds(pence: number): string {
  const pounds = pence / 100;
  if (Number.isInteger(pounds)) {
    return `£${pounds}`;
  }
  return formatGBP(pence);
}

export function catalogAmountPence(
  catalog: StripeCatalog | null,
  plan: "essentials" | "premium",
  interval: BillingInterval,
): number {
  if (catalog) {
    return catalog[plan][interval === "month" ? "month" : "year"].amountPence;
  }
  return PLAN_PRICES_PENCE[plan][interval];
}
