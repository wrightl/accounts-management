import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { asc, eq } from "drizzle-orm";
import { createTestDb, type TestDatabase } from "@/db/pglite";
import { setTestDb, type Database } from "@/db";
import { expenses, recordCounters, reimbursementItems, reimbursements, users } from "@/db/schema";
import { listExpensePage } from "@/lib/expenses/queries";
import { listReimbursementPage } from "@/lib/reimbursements/queries";
import { seedCompany } from "@/lib/test/seed-company";

vi.mock("server-only", () => ({}));

let ctx: Awaited<ReturnType<typeof createTestDb>>;
let db: TestDatabase;
let companyId: string;
let payeeId: string;

beforeEach(async () => {
  ctx = await createTestDb();
  db = ctx.db;
  setTestDb(db as unknown as Database);
  companyId = (await seedCompany(db)).id;
  const [payee] = await db
    .insert(users)
    .values({ companyId, clerkUserId: "u_payee", email: "payee@x.test", name: "Pat Payee", role: "user" })
    .returning();
  payeeId = payee.id;
});

afterEach(async () => {
  setTestDb(null);
  await ctx.client.close();
});

async function addExpense(values: Partial<typeof expenses.$inferInsert> = {}, company = companyId) {
  const [row] = await db
    .insert(expenses)
    .values({ companyId: company, description: "Receipt", amountPence: 1_000, ...values })
    .returning();
  return row;
}

async function addRun(values: Partial<typeof reimbursements.$inferInsert> = {}, company = companyId) {
  const [row] = await db
    .insert(reimbursements)
    .values({ companyId: company, payeeUserId: payeeId, ...values })
    .returning();
  return row;
}

async function expenseNumbers(company = companyId) {
  const rows = await db
    .select({ n: expenses.refNumber })
    .from(expenses)
    .where(eq(expenses.companyId, company))
    .orderBy(asc(expenses.refNumber));
  return rows.map((r) => r.n);
}

const range = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => from + i);

describe("assigning reference numbers", () => {
  it("starts at 1 for each company and each kind, and counts up", async () => {
    const other = await seedCompany(db, { name: "Other Co", slug: "other-co" });

    expect((await addExpense()).refNumber).toBe(1);
    expect((await addExpense()).refNumber).toBe(2);
    expect((await addRun()).refNumber).toBe(1);
    expect((await addExpense({}, other.id)).refNumber).toBe(1);
    expect((await addExpense()).refNumber).toBe(3);
    expect((await addRun()).refNumber).toBe(2);
    expect((await addRun({}, other.id)).refNumber).toBe(1);
  });

  it("ignores a number supplied by the caller", async () => {
    expect((await addExpense({ refNumber: 500 })).refNumber).toBe(1);
    expect((await addRun({ refNumber: 500 })).refNumber).toBe(1);
  });

  it("gives every record its own number when many are created at once", async () => {
    const other = await seedCompany(db, { name: "Other Co", slug: "other-co" });
    await Promise.all([
      ...range(1, 20).map((i) => addExpense({ description: `Single ${i}` })),
      ...range(1, 5).map(() => addExpense({}, other.id)),
      ...range(1, 6).map(() => addRun()),
      // A batch in one transaction, as an email with several receipts makes.
      db.transaction(async (tx) => {
        for (const i of range(1, 10)) {
          await tx.insert(expenses).values({ companyId, description: `Batch ${i}` });
        }
      }),
      // One statement with many rows, as fixtures and seeds do.
      db.insert(expenses).values(range(1, 10).map((i) => ({ companyId, description: `Rows ${i}` }))),
    ]);

    expect(await expenseNumbers()).toEqual(range(1, 40));
    expect(await expenseNumbers(other.id)).toEqual(range(1, 5));
    const runs = await db.select({ n: reimbursements.refNumber }).from(reimbursements);
    expect(runs.map((r) => r.n).sort((a, b) => a - b)).toEqual(range(1, 6));
  });

  it("numbers the rows of one insert in the order they were given", async () => {
    const rows = await db
      .insert(expenses)
      .values(["First", "Second", "Third"].map((description) => ({ companyId, description })))
      .returning();
    expect(rows.map((r) => [r.description, r.refNumber])).toEqual([
      ["First", 1],
      ["Second", 2],
      ["Third", 3],
    ]);
  });

  it("does not use up or repeat a number when a creation fails", async () => {
    await addExpense();

    // A transaction that rolls back after inserting.
    await expect(
      db.transaction(async (tx) => {
        await tx.insert(expenses).values({ companyId, description: "Rolled back" });
        await tx.insert(expenses).values({ companyId, description: "Rolled back too" });
        throw new Error("import failed");
      }),
    ).rejects.toThrow("import failed");
    // An insert the database rejects.
    await expect(addExpense({ category: "Not a category" })).rejects.toThrow();
    await expect(addRun({ payeeUserId: crypto.randomUUID() })).rejects.toThrow();

    expect((await addExpense()).refNumber).toBe(2);
    expect((await addRun()).refNumber).toBe(1);
    expect(await expenseNumbers()).toEqual([1, 2]);
    const counters = await db.select().from(recordCounters).where(eq(recordCounters.companyId, companyId));
    expect(Object.fromEntries(counters.map((c) => [c.kind, c.lastNumber]))).toEqual({
      expense: 2,
      reimbursement: 1,
    });
  });

  it("leaves a gap when a record is deleted, and never reuses the number", async () => {
    const first = await addExpense();
    const second = await addExpense();
    const third = await addExpense();
    await db.delete(expenses).where(eq(expenses.id, second.id));
    await db.delete(expenses).where(eq(expenses.id, third.id));

    expect((await addExpense()).refNumber).toBe(4);
    expect(await expenseNumbers()).toEqual([first.refNumber, 4]);

    const run = await addRun();
    await db.delete(reimbursements).where(eq(reimbursements.id, run.id));
    expect((await addRun()).refNumber).toBe(2);

    // Even with every record gone, the series carries on.
    await db.delete(expenses).where(eq(expenses.companyId, companyId));
    expect((await addExpense()).refNumber).toBe(5);
  });
});

describe("keeping reference numbers", () => {
  it("keeps the number through edits, a new date or category, a status change and reimbursement", async () => {
    await addExpense();
    const expense = await addExpense({ status: "reimbursable", paidByUserId: payeeId, spentAt: "2026-01-10" });
    const run = await addRun({ reference: "10,11,12" });

    await db
      .update(expenses)
      .set({ description: "Edited", category: "Travel", spentAt: "2025-03-01", amountPence: 2_000 })
      .where(eq(expenses.id, expense.id));
    await db.insert(reimbursementItems).values({ reimbursementId: run.id, expenseId: expense.id });
    await db.update(expenses).set({ status: "reimbursed" }).where(eq(expenses.id, expense.id));
    await db
      .update(reimbursements)
      .set({ status: "paid", paidAt: new Date(), reference: "Paid by transfer", totalPence: 2_000 })
      .where(eq(reimbursements.id, run.id));
    // Saving a whole row back, number included, is fine as long as it is the same number.
    await db.update(expenses).set({ refNumber: expense.refNumber, notes: "Same" }).where(eq(expenses.id, expense.id));

    const [after] = await db.select().from(expenses).where(eq(expenses.id, expense.id));
    expect(after).toMatchObject({ refNumber: 2, description: "Edited", status: "reimbursed", notes: "Same" });
    const [runAfter] = await db.select().from(reimbursements).where(eq(reimbursements.id, run.id));
    expect(runAfter).toMatchObject({ refNumber: 1, status: "paid", reference: "Paid by transfer" });
  });

  it("refuses to change a number", async () => {
    const expense = await addExpense();
    const run = await addRun();

    await expect(
      db.update(expenses).set({ refNumber: 99 }).where(eq(expenses.id, expense.id)),
    ).rejects.toThrow();
    await expect(
      db.update(reimbursements).set({ refNumber: 99 }).where(eq(reimbursements.id, run.id)),
    ).rejects.toThrow();

    expect(await expenseNumbers()).toEqual([1]);
  });

  it("has the database refuse a duplicate or missing number even without the trigger", async () => {
    await addExpense();
    // The test database is reused between tests, so the trigger must go back on.
    await ctx.client.exec(`alter table expenses disable trigger expenses_assign_ref_number`);
    try {
      await expect(addExpense({ refNumber: 1 })).rejects.toThrow(/uniq_expenses_company_ref_number|Failed query/);
      await expect(addExpense()).rejects.toThrow();
      // The same number in another company is fine.
      const other = await seedCompany(db, { name: "Other Co", slug: "other-co" });
      expect((await addExpense({ refNumber: 1 }, other.id)).refNumber).toBe(1);
    } finally {
      await ctx.client.exec(`alter table expenses enable trigger expenses_assign_ref_number`);
    }
    expect((await addExpense()).refNumber).toBe(2);
  });
});

describe("searching by reference", () => {
  const paging = { page: 1, pageSize: 25 } as const;

  it("finds an expense by its reference or bare number", async () => {
    for (const description of ["Taxi", "Lunch", "Hotel", "Train"]) await addExpense({ description });

    for (const q of ["EXP-0003", "exp-3", "EXP0003", "3", "0003"]) {
      const found = await listExpensePage(companyId, { q, ...paging });
      expect(found.rows.map((r) => r.description), q).toEqual(["Hotel"]);
    }
    expect((await listExpensePage(companyId, { q: "EXP-0009", ...paging })).total).toBe(0);
    // Text search still works, and a number still matches a description containing it.
    expect((await listExpensePage(companyId, { q: "tax", ...paging })).rows.map((r) => r.refNumber)).toEqual([1]);
    await addExpense({ description: "Room 3 hire" });
    const mixed = await listExpensePage(companyId, { q: "3", ...paging });
    expect(mixed.rows.map((r) => r.description).sort()).toEqual(["Hotel", "Room 3 hire"]);
  });

  it("only finds references in the same company", async () => {
    const other = await seedCompany(db, { name: "Other Co", slug: "other-co" });
    await addExpense({ description: "Ours" });
    await addExpense({ description: "Theirs" }, other.id);

    const found = await listExpensePage(companyId, { q: "EXP-0001", ...paging });
    expect(found.rows.map((r) => r.description)).toEqual(["Ours"]);
  });

  it("finds a reimbursement run by its reference, bare number, typed reference or payee", async () => {
    const sort = { sort: "created", dir: "desc" } as const;
    await addRun({ reference: "March batch" });
    await addRun({ reference: "10,11,12,15,17,31" });
    const search = async (q: string) =>
      (await listReimbursementPage(companyId, { q, ...sort, ...paging })).rows.map((r) => r.refNumber);

    expect(await search("REIMB-0002")).toEqual([2]);
    expect(await search("reimb2")).toEqual([2]);
    expect(await search("march")).toEqual([1]);
    expect(await search("15,17")).toEqual([2]);
    expect((await search("pat payee")).sort()).toEqual([1, 2]);
    // "1" is run 1's number and also appears in run 2's typed reference.
    expect((await search("1")).sort()).toEqual([1, 2]);
    expect(await search("REIMB-0007")).toEqual([]);
  });
});
