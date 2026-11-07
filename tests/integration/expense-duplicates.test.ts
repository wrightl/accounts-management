import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestDb, type TestDatabase } from "@/db/pglite";
import { setTestDb, type Database } from "@/db";
import { expenseReceipts, expenses } from "@/db/schema";
import { findPossibleDuplicates } from "@/lib/expenses/queries";
import { seedCompany } from "@/lib/test/seed-company";

vi.mock("server-only", () => ({}));

let ctx: Awaited<ReturnType<typeof createTestDb>>;
let db: TestDatabase;
let companyId: string;

beforeEach(async () => {
  ctx = await createTestDb();
  db = ctx.db;
  setTestDb(db as unknown as Database);
  companyId = (await seedCompany(db)).id;
});

afterEach(async () => {
  setTestDb(null);
  await ctx.client.close();
});

async function addExpense(
  values: Partial<typeof expenses.$inferInsert> & { sha?: string },
): Promise<string> {
  const { sha, ...rest } = values;
  const [row] = await db
    .insert(expenses)
    .values({ companyId, description: "Train", amountPence: 4_500, spentAt: "2026-11-02", ...rest })
    .returning({ id: expenses.id });
  if (sha) {
    await db.insert(expenseReceipts).values({
      expenseId: row.id,
      blobPath: `receipts/${row.id}/r.pdf`,
      filename: "r.pdf",
      contentSha256: sha,
    });
  }
  return row.id;
}

const emailed = { source: "email", status: "pending" } as const;

describe("findPossibleDuplicates", () => {
  it("flags an emailed expense with the same receipt file", async () => {
    const original = await addExpense({ spentAt: "2026-10-01", amountPence: 100, sha: "abc" });
    const copy = await addExpense({ ...emailed, sha: "abc" });

    const found = await findPossibleDuplicates(companyId, [copy]);
    expect(found.get(copy)).toEqual([
      expect.objectContaining({ id: original, sameReceipt: true }),
    ]);
  });

  it("flags the same amount on the same day", async () => {
    const original = await addExpense({ description: "Train to Leeds" });
    const copy = await addExpense({ ...emailed });

    const found = await findPossibleDuplicates(companyId, [copy]);
    expect(found.get(copy)).toEqual([
      expect.objectContaining({ id: original, sameReceipt: false }),
    ]);
  });

  it("ignores a different amount or day", async () => {
    await addExpense({ amountPence: 4_600 });
    await addExpense({ spentAt: "2026-11-03" });
    const emailedOne = await addExpense({ ...emailed });

    expect((await findPossibleDuplicates(companyId, [emailedOne])).size).toBe(0);
  });

  it("only checks emailed expenses still pending", async () => {
    await addExpense({});
    const manual = await addExpense({ status: "pending" });
    const approved = await addExpense({ source: "email", status: "recorded" });

    expect((await findPossibleDuplicates(companyId, [manual, approved])).size).toBe(0);
  });

  it("never matches another company's expenses", async () => {
    const other = await seedCompany(db, { name: "Other Co", slug: "other-co" });
    await addExpense({ companyId: other.id, sha: "abc" });
    const emailedOne = await addExpense({ ...emailed, sha: "abc" });

    expect((await findPossibleDuplicates(companyId, [emailedOne])).size).toBe(0);
  });
});
