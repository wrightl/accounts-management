import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { createTestDb, type TestDatabase } from "@/db/pglite";
import { expenses } from "@/db/schema";
import { needsAmountCheck } from "@/lib/expenses/currency";
import { seedCompany } from "@/lib/test/seed-company";

const migration = readFileSync(
  join(process.cwd(), "drizzle/0063_expense_original_amount.sql"),
  "utf8",
);

let ctx: Awaited<ReturnType<typeof createTestDb>>;
let db: TestDatabase;
let companyId: string;

beforeEach(async () => {
  ctx = await createTestDb();
  db = ctx.db;
  companyId = (await seedCompany(db)).id;
});

afterEach(async () => {
  await ctx.client.close();
});

/** Insert a row the way the app stored it before this migration. */
async function legacyExpense(values: Partial<typeof expenses.$inferInsert>) {
  const [row] = await db
    .insert(expenses)
    .values({ companyId, description: "Receipt", amountPence: 1200, ...values })
    .returning();
  return row;
}

async function reload(id: string) {
  const [row] = await db.select().from(expenses).where(eq(expenses.id, id));
  return row;
}

describe("migration 0063", () => {
  it("never changes a money column, even on a pending row a reviewer already edited", async () => {
    // Emailed as US$12.00; the reviewer changed the amount to £9.80, as the
    // old banner asked, and left the currency on USD.
    const edited = await legacyExpense({
      status: "pending",
      detectedCurrency: "USD",
      amountPence: 980,
      vatPence: 0,
    });
    const untouched = await legacyExpense({ status: "pending", detectedCurrency: "EUR" });
    const approved = await legacyExpense({
      status: "recorded",
      detectedCurrency: "USD",
      vatRate: 20,
      vatPence: 200,
    });
    const sterling = await legacyExpense({ status: "pending" });

    await ctx.client.exec(migration.replaceAll("--> statement-breakpoint", ""));

    expect(await reload(edited.id)).toMatchObject({ amountPence: 980, originalAmountMinor: 980 });
    expect(await reload(untouched.id)).toMatchObject({
      amountPence: 1200,
      originalAmountMinor: 1200,
    });
    expect(await reload(approved.id)).toMatchObject({
      amountPence: 1200,
      vatPence: 200,
      originalAmountMinor: null,
    });
    expect(await reload(sterling.id)).toMatchObject({ amountPence: 1200, originalAmountMinor: null });

    // Both pending foreign rows now need a person to confirm their amounts.
    expect(needsAmountCheck(await reload(edited.id))).toBe(true);
    expect(needsAmountCheck(await reload(untouched.id))).toBe(true);
  });
});
