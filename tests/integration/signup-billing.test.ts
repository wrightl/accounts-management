import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb, type TestDatabase } from "@/db/pglite";
import { setTestDb, type Database } from "@/db";
import { companyBilling } from "@/db/schema";
import {
  ensureCompanyBilling,
  startCompanyPaidSignup,
  startCompanyTrial,
  switchUnpaidCompanyToTrial,
} from "@/lib/billing/company-billing";
import { seedCompany } from "@/lib/test/seed-company";

vi.mock("server-only", () => ({}));

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

describe("company billing signup helpers", () => {
  it("startCompanyTrial writes a trialing row", async () => {
    const company = await seedCompany(db);
    await startCompanyTrial(company.id);

    const [row] = await db
      .select()
      .from(companyBilling)
      .where(eq(companyBilling.companyId, company.id));

    expect(row.plan).toBe("trial");
    expect(row.status).toBe("trialing");
    expect(row.trialEndsAt).toBeTruthy();
  });

  it("startCompanyPaidSignup writes unpaid without a trial end", async () => {
    const company = await seedCompany(db);
    await startCompanyPaidSignup(company.id, "essentials", "month");

    const [row] = await db
      .select()
      .from(companyBilling)
      .where(eq(companyBilling.companyId, company.id));

    expect(row.plan).toBe("essentials");
    expect(row.status).toBe("unpaid");
    expect(row.billingInterval).toBe("month");
    expect(row.trialEndsAt).toBeNull();
  });

  it("ensureCompanyBilling does not overwrite an unpaid row", async () => {
    const company = await seedCompany(db);
    await startCompanyPaidSignup(company.id, "premium", "year");
    await ensureCompanyBilling(company.id);

    const [row] = await db
      .select()
      .from(companyBilling)
      .where(eq(companyBilling.companyId, company.id));

    expect(row.plan).toBe("premium");
    expect(row.status).toBe("unpaid");
    expect(row.billingInterval).toBe("year");
  });

  it("switchUnpaidCompanyToTrial converts unpaid to trial", async () => {
    const company = await seedCompany(db);
    await startCompanyPaidSignup(company.id, "essentials", "month");
    const result = await switchUnpaidCompanyToTrial(company.id);
    expect(result).toEqual({ ok: true });

    const [row] = await db
      .select()
      .from(companyBilling)
      .where(eq(companyBilling.companyId, company.id));

    expect(row.plan).toBe("trial");
    expect(row.status).toBe("trialing");
    expect(row.billingInterval).toBeNull();
    expect(row.trialEndsAt).toBeTruthy();
  });
});
