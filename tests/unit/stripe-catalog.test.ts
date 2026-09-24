import { describe, it, expect } from "vitest";
import {
  mapStripePriceToCatalogPlan,
  planFromPriceIdMap,
} from "@/lib/billing/catalog-map";
import type Stripe from "stripe";

describe("planFromPriceIdMap", () => {
  const ids = {
    essentialsMonthly: "price_em",
    essentialsYearly: "price_ey",
    premiumMonthly: "price_pm",
    premiumYearly: "price_py",
  };

  it("maps each configured price ID", () => {
    expect(planFromPriceIdMap("price_em", ids)).toEqual({
      plan: "essentials",
      interval: "month",
    });
    expect(planFromPriceIdMap("price_ey", ids)).toEqual({
      plan: "essentials",
      interval: "year",
    });
    expect(planFromPriceIdMap("price_pm", ids)).toEqual({
      plan: "premium",
      interval: "month",
    });
    expect(planFromPriceIdMap("price_py", ids)).toEqual({
      plan: "premium",
      interval: "year",
    });
  });

  it("returns null for unknown or empty IDs", () => {
    expect(planFromPriceIdMap("price_other", ids)).toBeNull();
    expect(planFromPriceIdMap(null, ids)).toBeNull();
    expect(planFromPriceIdMap(undefined, ids)).toBeNull();
  });
});

describe("mapStripePriceToCatalogPlan", () => {
  function price(
    id: string,
    amount: number,
    product: { name: string; description: string | null },
  ): Stripe.Price {
    return {
      id,
      object: "price",
      active: true,
      currency: "gbp",
      unit_amount: amount,
      product: {
        id: "prod_x",
        object: "product",
        active: true,
        name: product.name,
        description: product.description,
      },
    } as Stripe.Price;
  }

  it("maps expanded Stripe prices to catalog plan fields", () => {
    const plan = mapStripePriceToCatalogPlan(
      price("price_m", 1900, {
        name: "Essentials",
        description: "Core books",
      }),
      price("price_y", 19000, {
        name: "Essentials",
        description: "Core books",
      }),
    );
    expect(plan.name).toBe("Essentials");
    expect(plan.description).toBe("Core books");
    expect(plan.month).toEqual({
      priceId: "price_m",
      amountPence: 1900,
      currency: "gbp",
      interval: "month",
    });
    expect(plan.year.amountPence).toBe(19000);
  });
});
