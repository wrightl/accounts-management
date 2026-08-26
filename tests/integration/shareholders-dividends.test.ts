import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq, isNull } from "drizzle-orm";
import { createTestDb, type TestDatabase } from "@/db/pglite";
import { setTestDb, type Database } from "@/db";
import {
  companySettings,
  dividendDeclarations,
  dividendPayouts,
  shareholders,
} from "@/db/schema";
import { splitDividendPence } from "@/lib/dividends/split";
import { seedCompany } from "@/lib/test/seed-company";

let ctx: Awaited<ReturnType<typeof createTestDb>>;
let db: TestDatabase;
let companyId: string;

beforeEach(async () => {
  ctx = await createTestDb();
  db = ctx.db;
  setTestDb(db as unknown as Database);
  const company = await seedCompany(db);
  companyId = company.id;
});

afterEach(async () => {
  setTestDb(null);
  await ctx.client.close();
});

describe("shareholders + dividend declare integration", () => {
  it("creates balanced register and pro-rata payouts", async () => {
    const [settings] = await db
      .select()
      .from(companySettings)
      .where(eq(companySettings.id, companyId));
    expect(settings).toBeTruthy();

    const [a] = await db
      .insert(shareholders)
      .values({ companyId, name: "Lee", shareCount: 60 })
      .returning();
    const [b] = await db
      .insert(shareholders)
      .values({ companyId, name: "Partner", shareCount: 40 })
      .returning();

    await db
      .update(companySettings)
      .set({ totalShares: 100 })
      .where(eq(companySettings.id, companyId));

    const totalPence = 10_000;
    const splits = splitDividendPence(
      totalPence,
      [
        { id: a.id, name: a.name, shareCount: a.shareCount },
        { id: b.id, name: b.name, shareCount: b.shareCount },
      ],
      100,
    );

    const [decl] = await db
      .insert(dividendDeclarations)
      .values({
        companyId,
        declaredAt: "2026-04-01",
        totalPence,
        notes: "Q1",
      })
      .returning();

    await db.insert(dividendPayouts).values(
      splits.map((s) => ({
        declarationId: decl.id,
        shareholderId: s.id,
        shareholderName: s.name,
        amountPence: s.amountPence,
      })),
    );

    const payouts = await db
      .select()
      .from(dividendPayouts)
      .where(eq(dividendPayouts.declarationId, decl.id));

    expect(payouts).toHaveLength(2);
    expect(payouts.reduce((s, p) => s + p.amountPence, 0)).toBe(10_000);
    expect(payouts.find((p) => p.shareholderName === "Lee")?.amountPence).toBe(
      6000,
    );
    expect(
      payouts.find((p) => p.shareholderName === "Partner")?.amountPence,
    ).toBe(4000);
  });

  it("excludes archived shareholders from active sum", async () => {
    await db.insert(shareholders).values([
      { companyId, name: "Active", shareCount: 50 },
      {
        companyId,
        name: "Gone",
        shareCount: 50,
        archivedAt: new Date(),
      },
    ]);

    const active = await db
      .select()
      .from(shareholders)
      .where(isNull(shareholders.archivedAt));
    expect(active).toHaveLength(1);
    expect(active[0].shareCount).toBe(50);
  });
});
