import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type Stripe from "stripe";
import { createTestDb, type TestDatabase } from "@/db/pglite";
import { setTestDb, type Database } from "@/db";
import { stripeWebhookEvents } from "@/db/schema";
import { processStripeEvent } from "@/lib/billing/webhooks";

vi.mock("server-only", () => ({}));

const retrieveSubscription = vi.fn();
const applySubscriptionToCompany = vi.fn();

vi.mock("@/lib/billing/stripe", () => ({
  getStripe: () => ({ subscriptions: { retrieve: retrieveSubscription } }),
}));

vi.mock("@/lib/billing/sync", () => ({
  applySubscriptionToCompany: (...args: unknown[]) =>
    applySubscriptionToCompany(...args),
  findCompanyIdByStripeCustomer: vi.fn(async () => null),
  findCompanyIdBySubscription: vi.fn(async () => null),
  markSubscriptionCanceled: vi.fn(),
}));

let ctx: Awaited<ReturnType<typeof createTestDb>>;
let db: TestDatabase;

beforeEach(async () => {
  ctx = await createTestDb();
  db = ctx.db;
  setTestDb(db as unknown as Database);
  retrieveSubscription.mockReset();
  applySubscriptionToCompany.mockReset();
  retrieveSubscription.mockResolvedValue({
    id: "sub_123",
    metadata: { companyId: "company-1" },
  });
});

afterEach(async () => {
  setTestDb(null);
  await ctx.client.close();
});

function invoicePaidEvent(id = "evt_paid"): Stripe.Event {
  return {
    id,
    type: "invoice.paid",
    data: {
      object: {
        object: "invoice",
        parent: {
          type: "subscription_details",
          quote_details: null,
          subscription_details: { subscription: "sub_123", metadata: null },
        },
      },
    },
  } as unknown as Stripe.Event;
}

describe("processStripeEvent", () => {
  it("resolves invoice.paid subscriptions from invoice.parent", async () => {
    await processStripeEvent(invoicePaidEvent());

    expect(retrieveSubscription).toHaveBeenCalledWith("sub_123");
    expect(applySubscriptionToCompany).toHaveBeenCalledWith(
      "company-1",
      expect.objectContaining({ id: "sub_123" }),
    );
  });

  it("processes a duplicate delivery only once", async () => {
    await processStripeEvent(invoicePaidEvent());
    await processStripeEvent(invoicePaidEvent());

    expect(applySubscriptionToCompany).toHaveBeenCalledTimes(1);
  });

  it("releases the claim on failure so Stripe's retry is processed", async () => {
    applySubscriptionToCompany.mockRejectedValueOnce(new Error("db blip"));

    await expect(processStripeEvent(invoicePaidEvent())).rejects.toThrow(
      "db blip",
    );
    expect(await db.select().from(stripeWebhookEvents)).toHaveLength(0);

    await processStripeEvent(invoicePaidEvent());
    expect(applySubscriptionToCompany).toHaveBeenCalledTimes(2);
    expect(await db.select().from(stripeWebhookEvents)).toHaveLength(1);
  });
});
