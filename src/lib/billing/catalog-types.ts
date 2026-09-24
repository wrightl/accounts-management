import type { BillingInterval } from "@/db/schema";

export type CatalogPrice = {
  priceId: string;
  amountPence: number;
  currency: string;
  interval: BillingInterval;
};

export type CatalogPlan = {
  name: string;
  description: string | null;
  month: CatalogPrice;
  year: CatalogPrice;
};

export type StripeCatalog = {
  essentials: CatalogPlan;
  premium: CatalogPlan;
};
