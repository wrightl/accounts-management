import { getStripeCatalog, formatCatalogPounds } from "@/lib/billing/catalog";
import type { PriceLabels } from "@/lib/marketing/llms";

/** Live Stripe prices formatted for marketing text, or null if unavailable. */
export async function marketingPriceLabels(): Promise<PriceLabels> {
  const catalog = await getStripeCatalog();
  if (!catalog) return null;
  return {
    essentialsMonth: formatCatalogPounds(catalog.essentials.month.amountPence),
    essentialsYear: formatCatalogPounds(catalog.essentials.year.amountPence),
    premiumMonth: formatCatalogPounds(catalog.premium.month.amountPence),
    premiumYear: formatCatalogPounds(catalog.premium.year.amountPence),
  };
}
