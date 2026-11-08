import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestDb, type TestDatabase } from "@/db/pglite";
import { setTestDb, type Database } from "@/db";
import { companyBilling } from "@/db/schema";
import { getEntitlements } from "@/lib/billing/entitlements";
import { catalogAmountPence } from "@/lib/billing/catalog-format";
import { getPlatformBillingStats } from "@/lib/platform/billing-queries";
import { seedCompany } from "@/lib/test/seed-company";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/billing/catalog", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/billing/catalog")>()),
  getStripeCatalog: vi.fn(async () => null),
}));

const DAY = 86_400_000;

let ctx: Awaited<ReturnType<typeof createTestDb>>;
let db: TestDatabase;

beforeEach(async () => {
  ctx = await createTestDb();
  db = ctx.db;
  setTestDb(db as unknown as Database);
});

afterEach(async () => {
  setTestDb(null);
  await ctx.client.close();
});

async function addBilling(
  slug: string,
  values: Omit<typeof companyBilling.$inferInsert, "companyId">,
) {
  const company = await seedCompany(db, { name: slug, slug });
  await db.insert(companyBilling).values({ companyId: company.id, ...values });
  return company.id;
}

const ZERO = {
  trialing: 0,
  activeEssentials: 0,
  activePremium: 0,
  pastDue: 0,
  canceled: 0,
  complimentary: 0,
  readOnly: 0,
  trialsEnding7d: 0,
  mrrPence: 0,
};

describe("getPlatformBillingStats", () => {
  it("counts a complimentary company on a trial only as complimentary", async () => {
    await addBilling("comp-trial", {
      status: "trialing",
      trialEndsAt: new Date(Date.now() + 3 * DAY),
      access: "complimentary_unlimited",
    });

    expect(await getPlatformBillingStats()).toEqual({ ...ZERO, complimentary: 1 });
  });

  it("never counts a complimentary company as read-only, even after its trial", async () => {
    const companyId = await addBilling("comp-expired-trial", {
      status: "trialing",
      trialEndsAt: new Date(Date.now() - 3 * DAY),
      access: "complimentary_unlimited",
    });

    // The stats skip the entitlements check for complimentary companies,
    // which is only safe while entitlements agree they can't be read-only.
    expect((await getEntitlements(companyId)).readOnly).toBe(false);
    expect(await getPlatformBillingStats()).toEqual({ ...ZERO, complimentary: 1 });
  });

  it("counts a company whose grant has expired under its real status", async () => {
    await addBilling("comp-lapsed", {
      status: "trialing",
      trialEndsAt: new Date(Date.now() + 3 * DAY),
      access: "complimentary_unlimited",
      complimentaryExpiresAt: new Date(Date.now() - DAY),
    });
    await addBilling("comp-lapsed-ended", {
      status: "trialing",
      trialEndsAt: new Date(Date.now() - DAY),
      access: "complimentary_unlimited",
      complimentaryExpiresAt: new Date(Date.now() - DAY),
    });

    expect(await getPlatformBillingStats()).toEqual({
      ...ZERO,
      trialing: 2,
      trialsEnding7d: 1,
      readOnly: 1,
    });
  });

  it("leaves an active complimentary company out of plan counts and MRR", async () => {
    // New grants are refused on a paid subscription, but grants made before
    // that rule can sit on an active one.
    await addBilling("comp-active", {
      plan: "premium",
      status: "active",
      access: "complimentary_unlimited",
    });
    await addBilling("paying", { plan: "essentials", status: "active" });

    expect(await getPlatformBillingStats()).toEqual({
      ...ZERO,
      complimentary: 1,
      activeEssentials: 1,
      mrrPence: catalogAmountPence(null, "essentials", "month"),
    });
  });
});
