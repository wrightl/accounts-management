import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";
import { createTestDb, type TestDatabase } from "@/db/pglite";
import { setTestDb, type Database } from "@/db";
import {
  auditLog,
  bankAccounts,
  bankTransactions,
  clients,
  companies,
  expenses,
  invoiceLineItems,
  invoices,
  users,
} from "@/db/schema";
import { seedCompany } from "@/lib/test/seed-company";
import { setBooksLock } from "@/actions/period-lock";
import { createInvoice, updateInvoiceStatus, voidInvoice } from "@/actions/invoices";
import { recordPayment } from "@/actions/payments";
import { createCreditNote } from "@/actions/credit-notes";
import { createExpense, deleteExpense, updateExpense } from "@/actions/expenses";
import { explainBankCreditAction } from "@/actions/bank";
import { approvePendingExpense } from "@/lib/expenses/review";
import { todayIsoDate } from "@/lib/dates";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@clerk/nextjs/server", () => ({
  auth: vi.fn(async () => ({ userId: "user_clerk_lock", sessionClaims: {} })),
  currentUser: vi.fn(async () => ({
    primaryEmailAddress: { emailAddress: "lock@example.com" },
    firstName: "Lock",
    lastName: "Tester",
    publicMetadata: {},
  })),
}));

const LOCK = "2025-12-31";
const LOCKED_DAY = "2025-12-15";
const OPEN_DAY = "2026-01-15";

let ctx: Awaited<ReturnType<typeof createTestDb>>;
let db: TestDatabase;
let companyId: string;
let clientId: string;
let userId: string;

beforeEach(async () => {
  ctx = await createTestDb();
  db = ctx.db;
  setTestDb(db as unknown as Database);
  const company = await seedCompany(db);
  companyId = company.id;
  const [user] = await db
    .insert(users)
    .values({
      companyId,
      clerkUserId: "user_clerk_lock",
      email: "lock@example.com",
      name: "Lock Tester",
      role: "admin",
    })
    .returning();
  userId = user.id;
  const [client] = await db
    .insert(clients)
    .values({ companyId, name: "Acme", email: "ap@acme.test" })
    .returning();
  clientId = client.id;
});

afterEach(async () => {
  setTestDb(null);
  await ctx.client.close();
});

async function lockBooks(date: string | null = LOCK) {
  const form = new FormData();
  form.set("lockedThrough", date ?? "");
  return setBooksLock(form);
}

async function setRole(role: "admin" | "user" | "accountant") {
  await db.update(users).set({ role }).where(eq(users.id, userId));
}

async function seedInvoice(issueDate: string, status: "draft" | "sent" = "sent") {
  const [inv] = await db
    .insert(invoices)
    .values({
      companyId,
      number: `DD-${issueDate}`,
      clientId,
      status,
      issueDate,
      dueDate: issueDate,
      netPence: 10000,
      vatPence: 0,
      grossPence: 10000,
    })
    .returning();
  await db.insert(invoiceLineItems).values({
    invoiceId: inv.id,
    description: "Work",
    quantity: 1,
    unitPricePence: 10000,
    position: 0,
  });
  return inv.id;
}

function invoiceForm(issueDate: string) {
  const form = new FormData();
  form.set("clientId", clientId);
  form.set("issueDate", issueDate);
  form.set(
    "linesJson",
    JSON.stringify([{ description: "Work", quantity: 1, unitPricePounds: "100" }]),
  );
  return form;
}

function expenseForm(spentAt: string) {
  const form = new FormData();
  form.set("description", "Train");
  form.set("category", "Travel");
  form.set("spentAt", spentAt);
  form.set("amountPounds", "10.00");
  form.set("status", "recorded");
  return form;
}

describe("setting the lock", () => {
  it("locks, moves and removes the lock with an audit entry each time", async () => {
    expect((await lockBooks()).ok).toBe(true);
    let [company] = await db.select().from(companies).where(eq(companies.id, companyId));
    expect(company.booksLockedThrough).toBe(LOCK);

    expect((await lockBooks("2026-01-31")).ok).toBe(true);
    expect((await lockBooks(null)).ok).toBe(true);
    [company] = await db.select().from(companies).where(eq(companies.id, companyId));
    expect(company.booksLockedThrough).toBeNull();

    const entries = await db
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.companyId, companyId), eq(auditLog.entityType, "company")));
    expect(entries.map((e) => [e.action, e.meta])).toEqual([
      ["books.lock", { from: null, to: LOCK }],
      ["books.lock", { from: LOCK, to: "2026-01-31" }],
      ["books.unlock", { from: "2026-01-31", to: null }],
    ]);
  });

  it("refuses today or a future date", async () => {
    const result = await lockBooks(todayIsoDate());
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.fieldErrors?.lockedThrough).toMatch(/before today/);
  });

  it("lets accountants lock but not co-founders", async () => {
    await setRole("accountant");
    expect((await lockBooks()).ok).toBe(true);

    await setRole("user");
    const asUser = await lockBooks(null);
    expect(asUser.ok).toBe(false);
    if (!asUser.ok) expect(asUser.error).toMatch(/permission/i);
  });
});

describe("with the books locked", () => {
  beforeEach(async () => {
    expect((await lockBooks()).ok).toBe(true);
  });

  it("refuses invoices dated in the locked period but allows later ones", async () => {
    const locked = await createInvoice(invoiceForm(LOCKED_DAY));
    expect(locked.ok).toBe(false);
    if (!locked.ok) expect(locked.error).toMatch(/locked up to 31\/12\/2025/);

    // The lock date itself is locked.
    expect((await createInvoice(invoiceForm(LOCK))).ok).toBe(false);
    expect((await createInvoice(invoiceForm(OPEN_DAY))).ok).toBe(true);
  });

  it("refuses voiding or sending a locked-period invoice", async () => {
    const sentId = await seedInvoice(LOCKED_DAY);
    expect((await voidInvoice(sentId)).ok).toBe(false);
    expect((await updateInvoiceStatus(sentId, "void")).ok).toBe(false);

    const draftId = await seedInvoice("2025-11-01", "draft");
    expect((await updateInvoiceStatus(draftId, "sent")).ok).toBe(false);
  });

  it("refuses payments and credit notes dated in the locked period", async () => {
    const invoiceId = await seedInvoice(LOCKED_DAY);

    const payment = new FormData();
    payment.set("amountPounds", "50");
    payment.set("receivedAt", "2025-12-20");
    expect((await recordPayment(invoiceId, payment)).ok).toBe(false);

    const credit = new FormData();
    credit.set("issueDate", "2025-12-20");
    credit.set("reason", "Discount");
    credit.set(
      "linesJson",
      JSON.stringify([{ description: "Discount", quantity: 1, unitPricePounds: "10" }]),
    );
    expect((await createCreditNote(invoiceId, credit)).ok).toBe(false);

    // A payment or credit in the open period against an old invoice is fine.
    payment.set("receivedAt", OPEN_DAY);
    expect((await recordPayment(invoiceId, payment)).ok).toBe(true);
    credit.set("issueDate", OPEN_DAY);
    expect((await createCreditNote(invoiceId, credit)).ok).toBe(true);
  });

  it("refuses moving an expense into or out of the locked period", async () => {
    expect((await createExpense(expenseForm(LOCKED_DAY))).ok).toBe(false);

    const created = await createExpense(expenseForm(OPEN_DAY));
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect((await updateExpense(created.id!, expenseForm(LOCKED_DAY))).ok).toBe(false);

    const [old] = await db
      .insert(expenses)
      .values({
        companyId,
        description: "Old laptop",
        spentAt: LOCKED_DAY,
        amountPence: 90000,
        status: "recorded",
      })
      .returning();
    expect((await updateExpense(old.id, expenseForm(OPEN_DAY))).ok).toBe(false);
    expect((await deleteExpense(old.id)).ok).toBe(false);
  });

  it("refuses approving a pending expense dated in the locked period", async () => {
    const [pending] = await db
      .insert(expenses)
      .values({
        companyId,
        description: "Forwarded receipt",
        spentAt: LOCKED_DAY,
        amountPence: 1200,
        status: "pending",
      })
      .returning();
    const result = await approvePendingExpense({ companyId, localUserId: userId }, pending.id, {
      status: "recorded",
    });
    expect(result.ok).toBe(false);

    // Pending submissions aren't in the books, so they can still be cleared up.
    expect((await deleteExpense(pending.id)).ok).toBe(true);
  });

  it("refuses explaining a bank credit booked in the locked period", async () => {
    const [account] = await db
      .insert(bankAccounts)
      .values({ companyId, name: "Starling Business", provider: "starling" })
      .returning();
    const [credit] = await db
      .insert(bankTransactions)
      .values({
        bankAccountId: account.id,
        externalId: "tx-locked-credit",
        bookedAt: LOCKED_DAY,
        amountPence: 5000,
        counterparty: "Savings account",
      })
      .returning();
    const result = await explainBankCreditAction({
      transactionId: credit.id,
      matchType: "transfer",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/locked/);
  });
});
