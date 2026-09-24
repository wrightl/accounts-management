import type Stripe from "stripe";
import type { BillingInterval, BillingPlan } from "@/db/schema";
import type { CatalogPlan, CatalogPrice } from "@/lib/billing/catalog-types";

export type StripePriceIds = {
  essentialsMonthly: string | null;
  essentialsYearly: string | null;
  premiumMonthly: string | null;
  premiumYearly: string | null;
};

export function allStripePriceIdsSet(ids: StripePriceIds): boolean {
  return Boolean(
    ids.essentialsMonthly &&
      ids.essentialsYearly &&
      ids.premiumMonthly &&
      ids.premiumYearly,
  );
}

/** Pure mapper for tests and webhook sync. */
export function planFromPriceIdMap(
  priceId: string | null | undefined,
  ids: StripePriceIds,
): { plan: BillingPlan; interval: BillingInterval } | null {
  if (!priceId) return null;
  const pairs: Array<{
    id: string | null;
    plan: BillingPlan;
    interval: BillingInterval;
  }> = [
    { id: ids.essentialsMonthly, plan: "essentials", interval: "month" },
    { id: ids.essentialsYearly, plan: "essentials", interval: "year" },
    { id: ids.premiumMonthly, plan: "premium", interval: "month" },
    { id: ids.premiumYearly, plan: "premium", interval: "year" },
  ];
  const hit = pairs.find((p) => p.id && p.id === priceId);
  return hit ? { plan: hit.plan, interval: hit.interval } : null;
}

function productFields(price: Stripe.Price): {
  name: string;
  description: string | null;
} {
  const product = price.product;
  if (
    product &&
    typeof product === "object" &&
    !("deleted" in product && product.deleted)
  ) {
    return {
      name: product.name || "Plan",
      description: product.description ?? null,
    };
  }
  return { name: "Plan", description: null };
}

function mapCatalogPrice(
  price: Stripe.Price,
  interval: BillingInterval,
): CatalogPrice {
  if (typeof price.unit_amount !== "number") {
    throw new Error(`Stripe price ${price.id} has no unit_amount`);
  }
  return {
    priceId: price.id,
    amountPence: price.unit_amount,
    currency: price.currency,
    interval,
  };
}

export function mapStripePriceToCatalogPlan(
  monthPrice: Stripe.Price,
  yearPrice: Stripe.Price,
): CatalogPlan {
  const { name, description } = productFields(monthPrice);
  return {
    name,
    description,
    month: mapCatalogPrice(monthPrice, "month"),
    year: mapCatalogPrice(yearPrice, "year"),
  };
}
