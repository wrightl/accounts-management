import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";
import { createTestDb, type TestDatabase } from "@/db/pglite";
import { setTestDb, type Database } from "@/db";
import {
  auditLog,
  bankAccounts,
  bankTransactions,
  companies,
  expenses,
  reconciliationMatches,
  users,
} from "@/db/schema";
import {
  compareLinkCandidates,
  linkExpenseToBankTx,
  listBankDebitCandidatesForExpense,
  listExpenseCandidatesForBankTx,
  unlinkExpenseMatch,
} from "@/lib/bank/expense-link";
import { createExpense } from "@/actions/expenses";
import { listExpenses } from "@/lib/expenses/queries";
import { seedCompany } from "@/lib/test/seed-company";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@clerk/nextjs/server", () => ({
  auth: vi.fn(async () => ({ userId: "user_clerk_1", sessionClaims: {} })),
  currentUser: vi.fn(async () => ({
    primaryEmailAddress: { emailAddress: "lee@dotanddashconsulting.com" },
    firstName: "Lee",
    lastName: "Wright",
    publicMetadata: {},
  })),
}));

let ctx: Awaited<ReturnType<typeof createTestDb>>;
let db: TestDatabase;
let companyId: string;
let accountId: string;

beforeEach(async () => {
  ctx = await createTestDb();
  db = ctx.db;
  setTestDb(db as unknown as Database);
  const company = await seedCompany(db);
  companyId = company.id;
  const [account] = await db
    .insert(bankAccounts)
    .values({ companyId, name: "Starling", provider: "starling" })
    .returning();
  accountId = account.id;
});

afterEach(async () => {
  setTestDb(null);
  await ctx.client.close();
});

let txSeq = 0;
async function debit(bookedAt: string, amountPence: number, counterparty = "Card payment") {
  const [tx] = await db
    .insert(bankTransactions)
    .values({
      bankAccountId: accountId,
      externalId: `tx-${++txSeq}`,
      bookedAt,
      amountPence,
      counterparty,
    })
    .returning();
  return tx;
}

async function expense(values: Partial<typeof expenses.$inferInsert> & { description: string }) {
  const [row] = await db
    .insert(expenses)
    .values({ companyId, spentAt: "2026-04-03", amountPence: 1500, status: "recorded", ...values })
    .returning();
  return row;
}

async function matchesFor(bankTransactionId: string) {
  return db
    .select()
    .from(reconciliationMatches)
    .where(eq(reconciliationMatches.bankTransactionId, bankTransactionId));
}

describe("compareLinkCandidates", () => {
  it("puts the closest amount first, then the closest date, unknowns last", () => {
    const rows = [
      { id: "foreign", amountDeltaPence: null, dateGapDays: 0 },
      { id: "far-date", amountDeltaPence: 0, dateGapDays: 30 },
      { id: "tip", amountDeltaPence: -200, dateGapDays: 0 },
      { id: "exact", amountDeltaPence: 0, dateGapDays: 1 },
    ];
    expect(rows.sort(compareLinkCandidates).map((r) => r.id)).toEqual([
      "exact",
      "far-date",
      "tip",
      "foreign",
    ]);
  });
});

describe("listExpenseCandidatesForBankTx", () => {
  it("ranks open business-paid expenses and leaves out ones that can't be linked", async () => {
    const tx = await debit("2026-04-03", -1700);
    const tip = await expense({ description: "Lunch with client", amountPence: 1500 });
    const exact = await expense({ description: "Taxi", amountPence: 1700, spentAt: "2026-04-10" });
    await expense({ description: "Pending email receipt", amountPence: 1700, status: "pending" });
    await expense({ description: "Paid personally", amountPence: 1700, status: "reimbursable" });
    await expense({ description: "Mileage", amountPence: 1700, mileageMiles: 38, mileageRatePence: 45 });
    await expense({ description: "Last year", amountPence: 1700, spentAt: "2025-06-01" });
    const linked = await expense({ description: "Already linked", amountPence: 1700 });
    const other = await debit("2026-04-03", -1700);
    await db.insert(reconciliationMatches).values({
      bankTransactionId: other.id,
      matchType: "expense",
      expenseId: linked.id,
      confirmed: true,
    });

    const candidates = await listExpenseCandidatesForBankTx(companyId, tx.id);
    expect(candidates.map((c) => c.expenseId)).toEqual([exact.id, tip.id]);
    expect(candidates[1]).toMatchObject({ amountDeltaPence: -200, dateGapDays: 0 });
  });

  it("searches outside the date window", async () => {
    const tx = await debit("2026-04-03", -1700);
    const old = await expense({ description: "Adobe annual", amountPence: 1700, spentAt: "2025-06-01" });

    const candidates = await listExpenseCandidatesForBankTx(companyId, tx.id, "adobe");
    expect(candidates.map((c) => c.expenseId)).toEqual([old.id]);
  });

  it("returns nothing for a credit or another company's transaction", async () => {
    const credit = await debit("2026-04-03", 1700);
    await expense({ description: "Taxi", amountPence: 1700 });
    expect(await listExpenseCandidatesForBankTx(companyId, credit.id)).toEqual([]);

    const otherCompany = await seedCompany(db, { name: "Other Ltd" });
    const tx = await debit("2026-04-03", -1700);
    expect(await listExpenseCandidatesForBankTx(otherCompany.id, tx.id)).toEqual([]);
  });
});

describe("listBankDebitCandidatesForExpense", () => {
  it("offers unreconciled and merely-suggested debits, not reconciled or locked ones", async () => {
    const e = await expense({ description: "Train", amountPence: 4200, spentAt: "2026-04-03" });
    const open = await debit("2026-04-04", -4250);
    const suggested = await debit("2026-04-03", -4200);
    await db.insert(reconciliationMatches).values({
      bankTransactionId: suggested.id,
      matchType: "expense",
      expenseId: e.id,
      confirmed: false,
    });
    const reconciled = await debit("2026-04-03", -4200);
    await db.insert(reconciliationMatches).values({
      bankTransactionId: reconciled.id,
      matchType: "transfer",
      confirmed: true,
    });
    const locked = await debit("2026-03-01", -4200);
    await db.update(companies).set({ booksLockedThrough: "2026-03-31" }).where(eq(companies.id, companyId));
    await debit("2026-04-03", 4200); // credit

    const candidates = await listBankDebitCandidatesForExpense(companyId, e.id);
    const ids = candidates.map((c) => c.bankTransactionId);
    expect(ids).toEqual([suggested.id, open.id]);
    expect(ids).not.toContain(locked.id);
    expect(candidates[1].amountDeltaPence).toBe(-50);
  });

  it("returns nothing for an expense that can't be linked", async () => {
    const e = await expense({ description: "Paid personally", status: "reimbursable" });
    await debit("2026-04-03", -1500);
    expect(await listBankDebitCandidatesForExpense(companyId, e.id)).toEqual([]);
  });
});

describe("linkExpenseToBankTx", () => {
  it("confirms the link, marks the expense company paid and clears pending suggestions", async () => {
    const tx = await debit("2026-04-03", -1700);
    const e = await expense({ description: "Lunch with client", amountPence: 1500 });
    const elsewhere = await debit("2026-04-03", -1500);
    const decoy = await expense({ description: "Decoy", amountPence: 1700 });
    await db.insert(reconciliationMatches).values([
      { bankTransactionId: tx.id, matchType: "expense", expenseId: decoy.id, confirmed: false },
      { bankTransactionId: elsewhere.id, matchType: "expense", expenseId: e.id, confirmed: false },
    ]);

    await linkExpenseToBankTx(companyId, { expenseId: e.id, bankTransactionId: tx.id });

    const onTx = await matchesFor(tx.id);
    expect(onTx).toHaveLength(1);
    expect(onTx[0]).toMatchObject({ expenseId: e.id, matchType: "expense", confirmed: true });
    expect(onTx[0].note).toContain("Linked by hand");
    expect(await matchesFor(elsewhere.id)).toHaveLength(0);

    const [updated] = await db.select().from(expenses).where(eq(expenses.id, e.id));
    expect(updated.status).toBe("company_paid");
  });

  it("leaves no note when the amounts agree", async () => {
    const tx = await debit("2026-01-03", -1500);
    const e = await expense({ description: "Hosting", spentAt: "2026-04-03" });
    await linkExpenseToBankTx(companyId, { expenseId: e.id, bankTransactionId: tx.id });
    const [match] = await matchesFor(tx.id);
    expect(match.note).toBeNull();
  });

  it("refuses a reconciled transaction, a linked expense, a credit, a locked row and a pending expense", async () => {
    const e = await expense({ description: "Hosting" });

    const reconciled = await debit("2026-04-03", -1500);
    await db.insert(reconciliationMatches).values({
      bankTransactionId: reconciled.id,
      matchType: "transfer",
      confirmed: true,
    });
    await expect(
      linkExpenseToBankTx(companyId, { expenseId: e.id, bankTransactionId: reconciled.id }),
    ).rejects.toThrow("already reconciled");

    const first = await debit("2026-04-03", -1500);
    await linkExpenseToBankTx(companyId, { expenseId: e.id, bankTransactionId: first.id });
    const second = await debit("2026-04-04", -1500);
    await expect(
      linkExpenseToBankTx(companyId, { expenseId: e.id, bankTransactionId: second.id }),
    ).rejects.toThrow("already linked");

    const fresh = await expense({ description: "Software" });
    const credit = await debit("2026-04-03", 1500);
    await expect(
      linkExpenseToBankTx(companyId, { expenseId: fresh.id, bankTransactionId: credit.id }),
    ).rejects.toThrow("Only outgoing payments");

    const lockedTx = await debit("2026-03-01", -1500);
    await db.update(companies).set({ booksLockedThrough: "2026-03-31" }).where(eq(companies.id, companyId));
    await expect(
      linkExpenseToBankTx(companyId, { expenseId: fresh.id, bankTransactionId: lockedTx.id }),
    ).rejects.toThrow("locked");

    const pending = await expense({ description: "Emailed receipt", status: "pending" });
    await expect(
      linkExpenseToBankTx(companyId, { expenseId: pending.id, bankTransactionId: second.id }),
    ).rejects.toThrow("Approve this expense");
  });

  it("refuses another company's transaction", async () => {
    const otherCompany = await seedCompany(db, { name: "Other Ltd" });
    const tx = await debit("2026-04-03", -1500);
    const [theirs] = await db
      .insert(expenses)
      .values({ companyId: otherCompany.id, description: "Theirs", spentAt: "2026-04-03", amountPence: 1500 })
      .returning();
    await expect(
      linkExpenseToBankTx(otherCompany.id, { expenseId: theirs.id, bankTransactionId: tx.id }),
    ).rejects.toThrow("Bank transaction not found");
  });
});

describe("listExpenses bankLinked", () => {
  it("flags only expenses with a confirmed bank match", async () => {
    const linked = await expense({ description: "Linked" });
    const suggested = await expense({ description: "Suggested" });
    await expense({ description: "Unlinked" });
    await linkExpenseToBankTx(companyId, {
      expenseId: linked.id,
      bankTransactionId: (await debit("2026-04-03", -1500)).id,
    });
    await db.insert(reconciliationMatches).values({
      bankTransactionId: (await debit("2026-04-03", -1500)).id,
      matchType: "expense",
      expenseId: suggested.id,
      confirmed: false,
    });

    const flags = Object.fromEntries(
      (await listExpenses(companyId)).map((e) => [e.description, e.bankLinked]),
    );
    expect(flags).toEqual({ Linked: true, Suggested: false, Unlinked: false });
  });
});

describe("unlinkExpenseMatch", () => {
  it("removes the link by match or by expense, so both can be linked again", async () => {
    const tx = await debit("2026-04-03", -1500);
    const e = await expense({ description: "Hosting" });
    const { matchId } = await linkExpenseToBankTx(companyId, { expenseId: e.id, bankTransactionId: tx.id });

    const unlinked = await unlinkExpenseMatch(companyId, { matchId });
    expect(unlinked).toEqual({ matchId, bankTransactionId: tx.id, expenseId: e.id });
    expect(await matchesFor(tx.id)).toHaveLength(0);
    const [kept] = await db.select().from(expenses).where(eq(expenses.id, e.id));
    expect(kept.status).toBe("company_paid");

    expect((await listExpenseCandidatesForBankTx(companyId, tx.id)).map((c) => c.expenseId)).toEqual([e.id]);
    await linkExpenseToBankTx(companyId, { expenseId: e.id, bankTransactionId: tx.id });
    await unlinkExpenseMatch(companyId, { expenseId: e.id });
    expect(await matchesFor(tx.id)).toHaveLength(0);
  });

  it("only undoes confirmed expense matches", async () => {
    const tx = await debit("2026-04-03", -1500);
    const e = await expense({ description: "Hosting" });
    const [suggestion] = await db
      .insert(reconciliationMatches)
      .values({ bankTransactionId: tx.id, matchType: "expense", expenseId: e.id, confirmed: false })
      .returning();
    await expect(unlinkExpenseMatch(companyId, { matchId: suggestion.id })).rejects.toThrow(
      "Linked expense not found",
    );

    const transfer = await debit("2026-04-03", -900);
    const [explained] = await db
      .insert(reconciliationMatches)
      .values({ bankTransactionId: transfer.id, matchType: "transfer", confirmed: true })
      .returning();
    await expect(unlinkExpenseMatch(companyId, { matchId: explained.id })).rejects.toThrow(
      "Linked expense not found",
    );
    expect(await matchesFor(transfer.id)).toHaveLength(1);
  });

  it("refuses a locked row and another company's match", async () => {
    const tx = await debit("2026-03-01", -1500);
    const e = await expense({ description: "Hosting", spentAt: "2026-03-01" });
    const { matchId } = await linkExpenseToBankTx(companyId, { expenseId: e.id, bankTransactionId: tx.id });

    const otherCompany = await seedCompany(db, { name: "Other Ltd" });
    await expect(unlinkExpenseMatch(otherCompany.id, { matchId })).rejects.toThrow(
      "Linked expense not found",
    );

    await db.update(companies).set({ booksLockedThrough: "2026-03-31" }).where(eq(companies.id, companyId));
    await expect(unlinkExpenseMatch(companyId, { matchId })).rejects.toThrow("locked");
    expect(await matchesFor(tx.id)).toHaveLength(1);
  });
});

describe("createExpense from a bank transaction", () => {
  beforeEach(async () => {
    await db.insert(users).values({
      companyId,
      clerkUserId: "user_clerk_1",
      email: "lee@dotanddashconsulting.com",
      name: "Lee",
      role: "admin",
    });
  });

  function form(bankTransactionId: string, status = "company_paid") {
    const f = new FormData();
    f.set("description", "Figma");
    f.set("spentAt", "2026-04-03");
    f.set("amountPounds", "12.00");
    f.set("status", status);
    f.set("vatRate", "0");
    f.set("bankTransactionId", bankTransactionId);
    return f;
  }

  it("creates the expense and links the payment", async () => {
    const tx = await debit("2026-04-03", -1200, "Figma");
    const result = await createExpense(form(tx.id));
    expect(result).toMatchObject({ ok: true });
    expect(result.ok && "bankLinkError" in result).toBe(false);

    const [match] = await matchesFor(tx.id);
    expect(match).toMatchObject({ confirmed: true, matchType: "expense" });
    const [created] = await db.select().from(expenses).where(eq(expenses.id, match.expenseId!));
    expect(created).toMatchObject({ description: "Figma", status: "company_paid" });

    const [audit] = await db
      .select()
      .from(auditLog)
      .where(eq(auditLog.action, "bank.link_expense"));
    expect(audit).toMatchObject({
      companyId,
      entityType: "reconciliation_match",
      entityId: match.id,
      meta: { expenseId: created.id, bankTransactionId: tx.id },
    });
  });

  it("refuses a reimbursable status", async () => {
    const tx = await debit("2026-04-03", -1200);
    const result = await createExpense(form(tx.id, "reimbursable"));
    expect(result.ok).toBe(false);
    expect(await db.select().from(expenses)).toHaveLength(0);
  });

  it("refuses an already reconciled payment without creating an expense", async () => {
    const tx = await debit("2026-04-03", -1200);
    await db.insert(reconciliationMatches).values({
      bankTransactionId: tx.id,
      matchType: "transfer",
      confirmed: true,
    });
    const result = await createExpense(form(tx.id));
    expect(result).toMatchObject({ ok: false, error: "This transaction is already reconciled" });
    expect(
      await db.select().from(expenses).where(and(eq(expenses.companyId, companyId))),
    ).toHaveLength(0);
  });
});
