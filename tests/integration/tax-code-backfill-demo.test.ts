import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { and, eq, isNull } from "drizzle-orm";
import { createTestDb, type TestDatabase } from "@/db/pglite";
import { setTestDb, type Database } from "@/db";
import { companies, expenses } from "@/db/schema";

vi.mock("server-only", () => ({}));
// Drawing hundreds of receipt PDFs is covered by the unit test; keep this one quick.
vi.mock("@/lib/demo/files", async (original) => ({
  ...(await original<typeof import("@/lib/demo/files")>()),
  renderReceiptPdf: vi.fn(async () => new Uint8Array([0x25, 0x50, 0x44, 0x46])),
}));
vi.mock("@/lib/email", async (original) => ({
  ...(await original<typeof import("@/lib/email")>()),
  sendEmail: vi.fn(async () => ({ id: "sent" })),
}));

const { createDemoCompany } = await import("@/lib/demo/create");
const { applyTaxCodeBackfill } = await import("@/lib/tax-code-backfill");
const { getAgedReceivables, getProfitAndLoss, getVatSummary } = await import("@/lib/reports/queries");
const { getReservesPosition } = await import("@/lib/ledger/queries");

let ctx: Awaited<ReturnType<typeof createTestDb>>;
let db: TestDatabase;
let demoId: string;

/** The demo company's books span three years; cover them and some margin. */
const FROM = "2020-01-01";
const TO = "2035-12-31";

async function figures() {
  return {
    vat: await getVatSummary(demoId, FROM, TO),
    profitAndLoss: await getProfitAndLoss(demoId, FROM, TO),
    agedReceivables: await getAgedReceivables(demoId),
    reserves: await getReservesPosition(demoId),
  };
}

beforeAll(async () => {
  ctx = await createTestDb();
  db = ctx.db;
  setTestDb(db as unknown as Database);
  const created = await createDemoCompany({
    adminEmail: "demo.founder@example.com",
    accountantEmail: "demo.accountant@example.com",
  });
  demoId = created.companyId;
}, 180_000);

afterAll(async () => {
  setTestDb(null);
  await ctx.client.close();
});

describe("tax code backfill on the demo company", () => {
  it("codes three years of books without changing a single report figure", async () => {
    const [company] = await db.select().from(companies).where(eq(companies.id, demoId));
    expect(company!.vatRegistered).toBe(true);

    const before = await figures();
    expect(before.vat.vatOnSalesPence).toBeGreaterThan(0);

    const plans = await applyTaxCodeBackfill(db as unknown as Database, { companyId: demoId });
    expect(plans[0]!.groups.reduce((n, g) => n + g.rows, 0)).toBeGreaterThan(0);

    expect(await figures()).toEqual(before);
    const uncoded = await db
      .select({ id: expenses.id })
      .from(expenses)
      .where(and(eq(expenses.companyId, demoId), isNull(expenses.taxCode)));
    expect(uncoded).toEqual([]);
  }, 120_000);
});
