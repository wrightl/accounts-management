import "server-only";
import { unstable_cache, updateTag } from "next/cache";
import type { BillingInterval } from "@/db/schema";
import { serverEnv } from "@/env";
import { getPlatformSettings } from "@/lib/platform-settings";
import { getStripe } from "@/lib/billing/stripe";
import type { StripeCatalog } from "@/lib/billing/catalog-types";
import {
  allStripePriceIdsSet,
  mapStripePriceToCatalogPlan,
  planFromPriceIdMap,
  type StripePriceIds,
} from "@/lib/billing/catalog-map";

export type {
  CatalogPlan,
  CatalogPrice,
  StripeCatalog,
} from "@/lib/billing/catalog-types";
export {
  formatCatalogPounds,
  catalogAmountPence,
} from "@/lib/billing/catalog-format";
export {
  allStripePriceIdsSet,
  mapStripePriceToCatalogPlan,
  planFromPriceIdMap,
  type StripePriceIds,
} from "@/lib/billing/catalog-map";

export const STRIPE_CATALOG_TAG = "stripe-catalog";

export async function getStripePriceIds(): Promise<StripePriceIds> {
  const s = await getPlatformSettings();
  return {
    essentialsMonthly: s.stripePriceEssentialsMonthly,
    essentialsYearly: s.stripePriceEssentialsYearly,
    premiumMonthly: s.stripePricePremiumMonthly,
    premiumYearly: s.stripePricePremiumYearly,
  };
}

/** True when secret key and all four DB price IDs are set. */
export async function isStripeConfigured(): Promise<boolean> {
  const env = serverEnv();
  if (!env.STRIPE_SECRET_KEY) return false;
  const ids = await getStripePriceIds();
  return allStripePriceIdsSet(ids);
}

export async function planFromPriceId(
  priceId: string | null | undefined,
): Promise<ReturnType<typeof planFromPriceIdMap>> {
  const ids = await getStripePriceIds();
  return planFromPriceIdMap(priceId, ids);
}

export async function stripePriceId(
  plan: "essentials" | "premium",
  interval: BillingInterval,
): Promise<string> {
  const ids = await getStripePriceIds();
  const map = {
    essentials: {
      month: ids.essentialsMonthly,
      year: ids.essentialsYearly,
    },
    premium: {
      month: ids.premiumMonthly,
      year: ids.premiumYearly,
    },
  } as const;
  const id = map[plan][interval];
  if (!id) {
    throw new Error(`Missing Stripe price for ${plan}/${interval}`);
  }
  return id;
}

async function fetchStripeCatalogUncached(
  essentialsMonthly: string,
  essentialsYearly: string,
  premiumMonthly: string,
  premiumYearly: string,
): Promise<StripeCatalog> {
  const stripe = getStripe();
  const [em, ey, pm, py] = await Promise.all([
    stripe.prices.retrieve(essentialsMonthly, { expand: ["product"] }),
    stripe.prices.retrieve(essentialsYearly, { expand: ["product"] }),
    stripe.prices.retrieve(premiumMonthly, { expand: ["product"] }),
    stripe.prices.retrieve(premiumYearly, { expand: ["product"] }),
  ]);
  return {
    essentials: mapStripePriceToCatalogPlan(em, ey),
    premium: mapStripePriceToCatalogPlan(pm, py),
  };
}

const fetchStripeCatalogCached = unstable_cache(
  fetchStripeCatalogUncached,
  ["stripe-catalog"],
  { revalidate: 3600, tags: [STRIPE_CATALOG_TAG] },
);

/**
 * Cached Stripe product/price catalog. Returns null when price IDs are
 * incomplete or Stripe cannot be reached and nothing is cached yet.
 */
export async function getStripeCatalog(): Promise<StripeCatalog | null> {
  const ids = await getStripePriceIds();
  if (!allStripePriceIdsSet(ids)) return null;
  if (!serverEnv().STRIPE_SECRET_KEY) return null;
  try {
    return await fetchStripeCatalogCached(
      ids.essentialsMonthly!,
      ids.essentialsYearly!,
      ids.premiumMonthly!,
      ids.premiumYearly!,
    );
  } catch {
    return null;
  }
}

export async function getStripeCatalogOrThrow(): Promise<StripeCatalog> {
  const catalog = await getStripeCatalog();
  if (!catalog) {
    throw new Error(
      "Stripe catalog unavailable. Check Platform → Settings price IDs and Stripe connectivity.",
    );
  }
  return catalog;
}

/** Invalidate catalog cache from a Server Action after price IDs change. */
export function invalidateStripeCatalogCache(): void {
  updateTag(STRIPE_CATALOG_TAG);
}
