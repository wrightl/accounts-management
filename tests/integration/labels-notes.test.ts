import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb, type TestDatabase } from "@/db/pglite";
import { setTestDb, type Database } from "@/db";
import { auditLog, bankAccounts, bankTransactions, companies, expenses, users } from "@/db/schema";
import {
  addBankLabelsAction,
  createLabelAction,
  deleteLabelAction,
  setRowLabelsAction,
  setRowNoteAction,
  updateLabelAction,
} from "@/actions/labels";
import { importBankRows, listBankTransactions } from "@/lib/bank/queries";
import { getBankTransactionSummary } from "@/lib/bank/summary";
import { listExpenses } from "@/lib/expenses/queries";
import { listLabels } from "@/lib/labels/queries";
import { seedCompany } from "@/lib/test/seed-company";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@clerk/nextjs/server", () => ({
  auth: vi.fn(async () => ({ userId: "user_clerk_1", sessionClaims: {} })),
  currentUser: vi.fn(async () => ({
    primaryEmailAddress: { emailAddress: "owner@example.com" },
    firstName: "Sam",
    lastName: "Owner",
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
  companyId = (await seedCompany(db)).id;
  const [account] = await db
    .insert(bankAccounts)
    .values({ companyId, name: "Starling", provider: "starling" })
    .returning();
  accountId = account.id;
  await db.insert(users).values({
    companyId,
    clerkUserId: "user_clerk_1",
    email: "owner@example.com",
    role: "admin",
  });
});

afterEach(async () => {
  setTestDb(null);
  await ctx.client.close();
});

let seq = 0;
async function bankTx(amountPence = -1000, bankAccountId = accountId) {
  const [tx] = await db
    .insert(bankTransactions)
    .values({
      bankAccountId,
      externalId: `tx-${++seq}`,
      bookedAt: "2026-04-03",
      amountPence,
      counterparty: "Shop",
    })
    .returning();
  return tx;
}

async function expense(values: Partial<typeof expenses.$inferInsert> = {}) {
  const [row] = await db
    .insert(expenses)
    .values({
      companyId,
      description: "Taxi",
      spentAt: "2026-04-03",
      amountPence: 1500,
      status: "recorded",
      ...values,
    })
    .returning();
  return row;
}

async function label(name: string, color = "blue") {
  const result = await createLabelAction(name, color);
  if (!result.ok || !result.id) throw new Error("label not created");
  return result.id;
}

describe("label catalogue", () => {
  it("creates, renames, recolours and lists labels with usage", async () => {
    const id = await label("Project X", "red");
    expect(await updateLabelAction(id, "Project Y", "teal")).toMatchObject({ ok: true });
    const tx = await bankTx();
    const exp = await expense();
    await setRowLabelsAction("bank", tx.id, [id]);
    await setRowLabelsAction("expense", exp.id, [id]);
    expect(await listLabels(companyId)).toEqual([
      { id, name: "Project Y", color: "teal", usageCount: 2 },
    ]);
  });

  it("refuses duplicate names regardless of case, and unknown colours", async () => {
    const first = await label("Project X");
    const second = await label("Other");
    expect(await createLabelAction("project x", "red")).toMatchObject({ ok: false });
    expect(await updateLabelAction(second, "PROJECT X", "red")).toMatchObject({ ok: false });
    expect(await updateLabelAction(first, "project x", "red")).toMatchObject({ ok: true });
    expect(await createLabelAction("New", "chartreuse")).toMatchObject({ ok: false });
  });

  it("deleting a label takes it off every row", async () => {
    const id = await label("Gone");
    const tx = await bankTx();
    await setRowLabelsAction("bank", tx.id, [id]);
    expect(await deleteLabelAction(id)).toMatchObject({ ok: true });
    const { rows } = await listBankTransactions(companyId);
    expect(rows[0].labels).toEqual([]);
  });
});

describe("row labels", () => {
  it("replaces the labels on both kinds of row", async () => {
    const a = await label("A", "red");
    const b = await label("B", "green");
    const tx = await bankTx();
    const exp = await expense();

    await setRowLabelsAction("bank", tx.id, [a, b]);
    await setRowLabelsAction("bank", tx.id, [b]);
    await setRowLabelsAction("expense", exp.id, [a]);

    const { rows } = await listBankTransactions(companyId);
    expect(rows[0].labels).toEqual([{ id: b, name: "B", color: "green" }]);
    const [listed] = await listExpenses(companyId);
    expect(listed.labels).toEqual([{ id: a, name: "A", color: "red" }]);
  });

  it("filters by any selected label, including the bank summary", async () => {
    const a = await label("A");
    const b = await label("B");
    const c = await label("C");
    const [txA, txB] = [await bankTx(-100), await bankTx(-200)];
    await bankTx(-400);
    await setRowLabelsAction("bank", txA.id, [a]);
    await setRowLabelsAction("bank", txB.id, [b]);

    const one = await listBankTransactions(companyId, { labels: [a] });
    expect(one.rows.map((r) => r.id)).toEqual([txA.id]);
    expect(one.total).toBe(1);
    const several = await listBankTransactions(companyId, { labels: [a, b] });
    expect(several.total).toBe(2);
    expect((await listBankTransactions(companyId, { labels: [c] })).total).toBe(0);

    const summary = await getBankTransactionSummary(companyId, { labels: [a, b] });
    expect(summary.outgoingPence).toBe(300);
    expect(summary.totalCount).toBe(2);

    const [expA] = [await expense({ description: "With A" }), await expense({ description: "No label" })];
    await setRowLabelsAction("expense", expA.id, [a]);
    const expenseRows = await listExpenses(companyId, { labels: [a, c] });
    expect(expenseRows.map((r) => r.id)).toEqual([expA.id]);
  });
});

describe("adding labels to several transactions", () => {
  it("adds to each row's labels without removing any", async () => {
    const a = await label("A", "red");
    const b = await label("B", "green");
    const first = await bankTx();
    const second = await bankTx();
    await setRowLabelsAction("bank", first.id, [a]);

    expect(await addBankLabelsAction([first.id, second.id], [a, b])).toMatchObject({ ok: true });

    const { rows } = await listBankTransactions(companyId);
    for (const row of rows) {
      expect(row.labels.map((l) => l.id).sort()).toEqual([a, b].sort());
    }
    const [audit] = await db.select().from(auditLog).where(eq(auditLog.action, "bank.add_labels"));
    expect(audit.meta).toMatchObject({ count: 2 });
  });

  it("changes nothing when one row or label isn't the company's", async () => {
    const other = await seedCompany(db, { name: "Other Co", slug: "other-co" });
    const [otherAccount] = await db
      .insert(bankAccounts)
      .values({ companyId: other.id, name: "Other", provider: "starling" })
      .returning();
    const mine = await bankTx();
    const theirs = await bankTx(-1000, otherAccount.id);
    const a = await label("A");

    expect(await addBankLabelsAction([mine.id, theirs.id], [a])).toMatchObject({ ok: false });
    expect(await addBankLabelsAction([mine.id], [crypto.randomUUID()])).toMatchObject({ ok: false });
    expect(await addBankLabelsAction(["not-a-uuid"], [a])).toMatchObject({ ok: false });
    expect(await addBankLabelsAction([mine.id], [])).toMatchObject({ ok: false });
    const { rows } = await listBankTransactions(companyId);
    expect(rows[0].labels).toEqual([]);
  });
});

describe("row notes", () => {
  it("keeps line breaks, and treats a blank save as removing the note", async () => {
    const tx = await bankTx();
    const exp = await expense();
    expect(await setRowNoteAction("bank", tx.id, "line one\nline two\n\nline four")).toMatchObject({ ok: true });
    await setRowNoteAction("expense", exp.id, "first\nsecond");

    expect((await listBankTransactions(companyId)).rows[0].notes).toBe("line one\nline two\n\nline four");
    expect((await listExpenses(companyId))[0].notes).toBe("first\nsecond");

    await setRowNoteAction("bank", tx.id, "   \n ");
    await setRowNoteAction("expense", exp.id, null);
    expect((await listBankTransactions(companyId)).rows[0].notes).toBeNull();
    expect((await listExpenses(companyId))[0].notes).toBeNull();
  });

  it("refuses an overlong note", async () => {
    const tx = await bankTx();
    expect(await setRowNoteAction("bank", tx.id, "x".repeat(5001))).toMatchObject({ ok: false });
  });

  it("audits the change without the note text", async () => {
    const tx = await bankTx();
    await setRowNoteAction("bank", tx.id, "private detail");
    const [entry] = await db.select().from(auditLog).where(eq(auditLog.action, "bank.update_note"));
    expect(entry.entityId).toBe(tx.id);
    expect(JSON.stringify(entry)).not.toContain("private detail");
  });
});

describe("annotations on locked rows", () => {
  it("still edits reimbursed expenses and rows in a locked period", async () => {
    await db
      .update(companies)
      .set({ booksLockedThrough: "2026-12-31" })
      .where(eq(companies.id, companyId));
    const id = await label("A");
    const tx = await bankTx();
    const exp = await expense({ status: "reimbursed" });

    expect(await setRowNoteAction("bank", tx.id, "note")).toMatchObject({ ok: true });
    expect(await setRowLabelsAction("bank", tx.id, [id])).toMatchObject({ ok: true });
    expect(await setRowNoteAction("expense", exp.id, "note")).toMatchObject({ ok: true });
    expect(await setRowLabelsAction("expense", exp.id, [id])).toMatchObject({ ok: true });
  });
});

describe("re-importing a bank CSV", () => {
  it("keeps labels and notes on the existing transaction", async () => {
    const row = {
      externalId: "csv-1",
      bookedAt: "2026-04-03",
      amountPence: -1000,
      counterparty: "Shop",
      reference: null,
      description: null,
      spendingCategory: null,
      tags: ["from-csv"],
      raw: {},
    };
    await importBankRows(companyId, accountId, [row]);
    const id = await label("Kept");
    const before = (await listBankTransactions(companyId)).rows[0];
    await setRowLabelsAction("bank", before.id, [id]);
    await setRowNoteAction("bank", before.id, "kept note");

    await importBankRows(companyId, accountId, [row]);

    const after = (await listBankTransactions(companyId)).rows[0];
    expect(after.id).toBe(before.id);
    expect(after.notes).toBe("kept note");
    expect(after.labels.map((l) => l.id)).toEqual([id]);
  });
});

describe("tenant isolation", () => {
  it("refuses another company's labels and rows", async () => {
    const other = await seedCompany(db, { name: "Other Co", slug: "other-co" });
    const [otherAccount] = await db
      .insert(bankAccounts)
      .values({ companyId: other.id, name: "Other", provider: "starling" })
      .returning();
    const otherTx = await bankTx(-1000, otherAccount.id);
    const otherExpense = await expense({ companyId: other.id });
    const mine = await label("Mine");

    expect(await setRowNoteAction("bank", otherTx.id, "x")).toMatchObject({ ok: false });
    expect(await setRowNoteAction("expense", otherExpense.id, "x")).toMatchObject({ ok: false });
    expect(await setRowLabelsAction("bank", otherTx.id, [mine])).toMatchObject({ ok: false });
    expect(await setRowLabelsAction("expense", otherExpense.id, [mine])).toMatchObject({ ok: false });

    await db.update(users).set({ companyId: other.id }).where(eq(users.clerkUserId, "user_clerk_1"));
    expect(await updateLabelAction(mine, "Stolen", "red")).toMatchObject({ ok: false });
    expect(await deleteLabelAction(mine)).toMatchObject({ ok: false });
    const theirTx = await bankTx(-1000, otherAccount.id);
    expect(await setRowLabelsAction("bank", theirTx.id, [mine])).toMatchObject({ ok: false });
  });

  it("rejects malformed ids without reaching the database", async () => {
    expect(await setRowNoteAction("bank", "not-a-uuid", "x")).toMatchObject({ ok: false });
    expect(await deleteLabelAction("not-a-uuid")).toMatchObject({ ok: false });
  });
});

describe("permissions", () => {
  it("refuses accountants", async () => {
    const id = await label("A");
    const tx = await bankTx();
    await db.update(users).set({ role: "accountant" }).where(eq(users.clerkUserId, "user_clerk_1"));

    expect(await createLabelAction("New", "red")).toMatchObject({ ok: false });
    expect(await deleteLabelAction(id)).toMatchObject({ ok: false });
    expect(await setRowNoteAction("bank", tx.id, "x")).toMatchObject({ ok: false });
    expect(await setRowLabelsAction("bank", tx.id, [id])).toMatchObject({ ok: false });
  });
});
