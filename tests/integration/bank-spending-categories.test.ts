import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestDb, type TestDatabase } from "@/db/pglite";
import { setTestDb, type Database } from "@/db";
import { bankAccounts, bankSpendingCategories, bankTransactions } from "@/db/schema";
import { importBankRows, updateTransactionCategory } from "@/lib/bank/queries";
import {
  deleteUnusedBankSpendingCategory,
  listBankSpendingCategoriesWithUsage,
  upsertBankSpendingCategory,
} from "@/lib/bank/spending-categories";

vi.mock("server-only", () => ({}));

let ctx: Awaited<ReturnType<typeof createTestDb>>;
let db: TestDatabase;
let accountId: string;

beforeEach(async () => {
  ctx = await createTestDb();
  db = ctx.db;
  setTestDb(db as unknown as Database);

  const [account] = await db
    .insert(bankAccounts)
    .values({ name: "Starling Business" })
    .returning();
  accountId = account.id;
});

afterEach(async () => {
  setTestDb(null);
  await ctx.client.close();
});

describe("bank spending categories", () => {
  it("upserts custom labels and reuses canonical spelling", async () => {
    const first = await upsertBankSpendingCategory("Client hospitality");
    const second = await upsertBankSpendingCategory("client hospitality");

    expect(first).toBe("Client hospitality");
    expect(second).toBe("Client hospitality");

    const rows = await db.select().from(bankSpendingCategories);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.name).toBe("Client hospitality");
  });

  it("does not catalog built-in Starling categories", async () => {
    const value = await upsertBankSpendingCategory("TRAVEL");
    expect(value).toBe("TRAVEL");

    const rows = await db.select().from(bankSpendingCategories);
    expect(rows).toHaveLength(0);
  });

  it("saves custom categories when updating a transaction", async () => {
    const [tx] = await db
      .insert(bankTransactions)
      .values({
        bankAccountId: accountId,
        externalId: "tx-custom",
        bookedAt: "2026-08-23",
        amountPence: -1_000,
      })
      .returning();

    await updateTransactionCategory(tx.id, "Conference travel");

    const [updated] = await db
      .select()
      .from(bankTransactions)
      .where(eq(bankTransactions.id, tx.id));
    expect(updated?.spendingCategory).toBe("Conference travel");

    const catalog = await listBankSpendingCategoriesWithUsage();
    expect(catalog).toHaveLength(1);
    expect(catalog[0]?.name).toBe("Conference travel");
    expect(catalog[0]?.usageCount).toBe(1);
  });

  it("catalogues unknown labels during CSV import", async () => {
    await importBankRows(accountId, [
      {
        externalId: "import-1",
        bookedAt: "2026-08-23",
        amountPence: -500,
        counterparty: "Vendor",
        reference: null,
        description: "Supplies",
        spendingCategory: "Office supplies",
        tags: [],
        raw: {},
      },
    ]);

    const catalog = await listBankSpendingCategoriesWithUsage();
    expect(catalog.map((c) => c.name)).toContain("Office supplies");
  });

  it("allows deleting unused categories but not in-use ones", async () => {
    const unusedId = (
      await db
        .insert(bankSpendingCategories)
        .values({ name: "Legacy label" })
        .returning({ id: bankSpendingCategories.id })
    )[0]?.id;

    const usedId = (
      await db
        .insert(bankSpendingCategories)
        .values({ name: "Active label" })
        .returning({ id: bankSpendingCategories.id })
    )[0]?.id;

    await db.insert(bankTransactions).values({
      bankAccountId: accountId,
      externalId: "tx-used",
      bookedAt: "2026-08-23",
      amountPence: -2_000,
      spendingCategory: "Active label",
    });

    expect(unusedId).toBeDefined();
    expect(usedId).toBeDefined();

    const blocked = await deleteUnusedBankSpendingCategory(usedId!);
    expect(blocked.ok).toBe(false);

    const removed = await deleteUnusedBankSpendingCategory(unusedId!);
    expect(removed.ok).toBe(true);

    const remaining = await db.select().from(bankSpendingCategories);
    expect(remaining).toHaveLength(1);
    expect(remaining[0]?.name).toBe("Active label");
  });
});
