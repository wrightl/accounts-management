import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { and, count, eq, inArray } from "drizzle-orm";
import { createTestDb, type TestDatabase } from "@/db/pglite";
import { setTestDb, type Database } from "@/db";
import {
  bankAccounts,
  bankTransactions,
  clients,
  companies,
  expenseReceipts,
  expenses,
  invoices,
  payments,
  sendJobs,
} from "@/db/schema";
import { seedCompany } from "@/lib/test/seed-company";

vi.mock("server-only", () => ({}));
// Drawing hundreds of receipt PDFs is covered by the unit test; keep this one quick.
vi.mock("@/lib/demo/files", async (original) => ({
  ...(await original<typeof import("@/lib/demo/files")>()),
  renderReceiptPdf: vi.fn(async () => new Uint8Array([0x25, 0x50, 0x44, 0x46])),
}));
const emailMocks = vi.hoisted(() => ({ sendEmail: vi.fn(async () => ({ id: "sent" })) }));
vi.mock("@/lib/email", async (original) => ({
  ...(await original<typeof import("@/lib/email")>()),
  sendEmail: emailMocks.sendEmail,
}));

const { createDemoCompany } = await import("@/lib/demo/create");
const { resetDemoCompany, NotDemoCompanyError } = await import("@/lib/demo/reset");
const { wipeDemoCompanyData } = await import("@/lib/demo/wipe");
const { todayIsoDate } = await import("@/lib/dates");
const { addDays, addMonths } = await import("@/lib/demo/calendar");
const { getAgedReceivables, getProfitAndLoss, getVatSummary } = await import("@/lib/reports/queries");
const { getReservesPosition, getDirectorLoanAccounts } = await import("@/lib/ledger/queries");
const { getCashAtBank } = await import("@/lib/safe-to-pay/queries");
const { getBankReconciledThrough } = await import("@/lib/close/checklist");
const { enqueueOverdueReminders } = await import("@/lib/outbox");
const { sendClientEmail } = await import("@/lib/email/client-email");

const today = todayIsoDate();
let ctx: Awaited<ReturnType<typeof createTestDb>>;
let db: TestDatabase;
let demoId: string;
let otherId: string;

async function countFor(companyId: string) {
  const [inv] = await db.select({ n: count() }).from(invoices).where(eq(invoices.companyId, companyId));
  const [exp] = await db.select({ n: count() }).from(expenses).where(eq(expenses.companyId, companyId));
  const [pay] = await db
    .select({ n: count() })
    .from(payments)
    .innerJoin(invoices, eq(payments.invoiceId, invoices.id))
    .where(eq(invoices.companyId, companyId));
  const [bank] = await db
    .select({ n: count() })
    .from(bankTransactions)
    .innerJoin(bankAccounts, eq(bankTransactions.bankAccountId, bankAccounts.id))
    .where(eq(bankAccounts.companyId, companyId));
  const [rec] = await db
    .select({ n: count() })
    .from(expenseReceipts)
    .innerJoin(expenses, eq(expenseReceipts.expenseId, expenses.id))
    .where(eq(expenses.companyId, companyId));
  return { invoices: inv!.n, expenses: exp!.n, payments: pay!.n, bank: bank!.n, receipts: rec!.n };
}

beforeAll(async () => {
  ctx = await createTestDb();
  db = ctx.db;
  setTestDb(db as unknown as Database);

  const other = await seedCompany(db, { name: "Real Customer Ltd" });
  otherId = other.id;
  const [client] = await db.insert(clients).values({ companyId: otherId, name: "Their client", email: "their.client@example.com" }).returning();
  await db.insert(invoices).values({
    companyId: otherId, number: "INV-2026-0001", clientId: client!.id, status: "sent",
    issueDate: addDays(today, -60), dueDate: addDays(today, -30), netPence: 10_000, grossPence: 12_000, vatPence: 2_000,
  });

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

describe("demo company", () => {
  it("is flagged as a demo and fully set up", async () => {
    const [company] = await db.select().from(companies).where(eq(companies.id, demoId));
    expect(company!.isDemo).toBe(true);
    expect(company!.vatRegistered).toBe(true);
    expect(company!.logoUrl).toBeTruthy();
    const counts = await countFor(demoId);
    expect(counts.invoices).toBeGreaterThan(250);
    expect(counts.expenses).toBeGreaterThan(600);
    expect(counts.bank).toBeGreaterThan(1000);
    expect(counts.receipts).toBeGreaterThan(500);
  });

  it("reports a profit for every year, growing from the first full year", async () => {
    const start = addMonths(today, -36).slice(0, 4);
    const years = [0, 1, 2].map((i) => {
      const from = `${Number(start) + i - (Number(addMonths(today, -36).slice(5, 7)) < 4 ? 1 : 0)}-04-01`;
      return { from, to: addDays(addMonths(from, 12), -1) };
    });
    const profits = await Promise.all(years.map((y) => getProfitAndLoss(demoId, y.from, y.to)));
    for (const p of profits) expect(p.profitPence).toBeGreaterThan(0);
    expect(profits[2]!.incomePence).toBeGreaterThan(profits[0]!.incomePence);
  });

  it("has VAT in every quarter and debts in every age bucket", async () => {
    for (let i = 1; i <= 8; i++) {
      const from = addMonths(`${today.slice(0, 7)}-01`, -3 * i);
      const vat = await getVatSummary(demoId, from, addDays(addMonths(from, 3), -1));
      expect(vat.vatOnSalesPence).toBeGreaterThan(0);
    }
    const aged = await getAgedReceivables(demoId);
    expect(aged.raw.d30).toBeGreaterThan(0);
    expect(aged.raw.d60).toBeGreaterThan(0);
    expect(aged.raw.d90).toBeGreaterThan(0);
  });

  it("knows its cash, reserves and directors' loans", async () => {
    const cash = await getCashAtBank(demoId);
    expect(cash.known).toBe(true);
    if (cash.known) expect(cash.cashPence).toBeGreaterThan(5_000_000);
    const reserves = await getReservesPosition(demoId, today);
    expect(reserves.hasOpeningBalances).toBe(true);
    expect(reserves.availablePence).toBeGreaterThan(0);
    const loans = await getDirectorLoanAccounts(demoId, today);
    expect(loans.directors.map((d) => d.name).sort()).toEqual(["Priya Shah", "Sam Carter"]);
    for (const d of loans.directors) expect(d.warnings).toEqual([]);
  });

  it("is reconciled up to the last few weeks", async () => {
    const { reconciledThrough, unreconciled } = await getBankReconciledThrough(demoId);
    expect(unreconciled).toBeGreaterThan(0);
    expect(reconciledThrough! >= addDays(today, -23)).toBe(true);
  });

  it("never emails a demo company's clients", async () => {
    emailMocks.sendEmail.mockClear();
    const demo = await sendClientEmail(demoId, { to: "x@example.com", subject: "Invoice", html: "<p>Hi</p>" });
    expect(demo.suppressed).toBe(true);
    expect(emailMocks.sendEmail).not.toHaveBeenCalled();
    await sendClientEmail(otherId, { to: "x@example.com", subject: "Invoice", html: "<p>Hi</p>" });
    expect(emailMocks.sendEmail).toHaveBeenCalledTimes(1);

    await enqueueOverdueReminders();
    const queued = await db
      .select({ companyId: sendJobs.companyId })
      .from(sendJobs)
      .where(and(eq(sendJobs.status, "pending"), inArray(sendJobs.companyId, [demoId, otherId])));
    expect(queued.map((q) => q.companyId)).toEqual([otherId]);
  });

  it("resets to the same books without touching other companies", async () => {
    const before = await countFor(demoId);
    const otherBefore = await countFor(otherId);
    // Anything added during a demo goes on reset.
    const [extra] = await db.insert(clients).values({ companyId: demoId, name: "Added in a demo" }).returning();
    await resetDemoCompany({ companyId: demoId });
    expect(await countFor(demoId)).toEqual(before);
    expect(await countFor(otherId)).toEqual(otherBefore);
    expect(await db.select().from(clients).where(eq(clients.id, extra!.id))).toEqual([]);
  }, 120_000);

  it("refuses to reset or wipe a company that isn't a demo", async () => {
    await expect(resetDemoCompany({ companyId: otherId })).rejects.toBeInstanceOf(NotDemoCompanyError);
    await expect(db.transaction((tx) => wipeDemoCompanyData(tx, otherId))).rejects.toBeInstanceOf(NotDemoCompanyError);
    expect((await countFor(otherId)).invoices).toBe(1);
  });
});
