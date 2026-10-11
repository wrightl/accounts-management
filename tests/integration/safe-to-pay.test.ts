import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestDb, type TestDatabase } from "@/db/pglite";
import { setTestDb, type Database } from "@/db";
import {
  bankAccounts,
  bankTransactions,
  clients,
  expenses,
  invoices,
  orderPaymentMilestones,
  orders,
  recurringInvoices,
  shareholders,
  users,
} from "@/db/schema";
import { seedCompany } from "@/lib/test/seed-company";
import { getCashAtBank, getSafeToPay } from "@/lib/safe-to-pay/queries";
import { getBankTransactionSummary } from "@/lib/bank/summary";
import { saveSafeToPaySettings } from "@/actions/safe-to-pay";
import { addDays } from "@/lib/ledger/corporation-tax";
import { todayIsoDate } from "@/lib/dates";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
  unstable_cache: <T,>(fn: T) => fn,
}));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@clerk/nextjs/server", () => ({
  auth: vi.fn(async () => ({ userId: "user_clerk_safe", sessionClaims: {} })),
  currentUser: vi.fn(async () => ({
    primaryEmailAddress: { emailAddress: "safe@example.com" },
    firstName: "Safe",
    lastName: "Pay",
    publicMetadata: {},
  })),
}));

const today = todayIsoDate();

let ctx: Awaited<ReturnType<typeof createTestDb>>;
let db: TestDatabase;
let companyId: string;
let clientId: string;
let userId: string;

beforeEach(async () => {
  ctx = await createTestDb();
  db = ctx.db;
  setTestDb(db as unknown as Database);
  const company = await seedCompany(db, { vatRegistered: true });
  companyId = company.id;
  const [user] = await db
    .insert(users)
    .values({
      companyId,
      clerkUserId: "user_clerk_safe",
      email: "safe@example.com",
      name: "Safe Pay",
      role: "admin",
    })
    .returning();
  userId = user.id;
  const [client] = await db
    .insert(clients)
    .values({ companyId, name: "Acme" })
    .returning();
  clientId = client.id;
});

afterEach(async () => {
  setTestDb(null);
  await ctx.client.close();
});

async function seedBank(company: string, balance: string | null, amountPence = 1000) {
  const [account] = await db
    .insert(bankAccounts)
    .values({ companyId: company, name: "Current", provider: "starling" })
    .returning();
  await db.insert(bankTransactions).values({
    bankAccountId: account.id,
    externalId: `tx-${company}-${balance}`,
    bookedAt: addDays(today, -1),
    amountPence,
    counterparty: "Someone",
    raw: balance ? { Date: today, Amount: "10.00", Balance: balance } : { Date: today },
  });
}

describe("cash at bank", () => {
  it("adds up each account's latest statement balance", async () => {
    await seedBank(companyId, "30000.00");
    await seedBank(companyId, "20000.00");
    expect(await getCashAtBank(companyId)).toMatchObject({
      known: true,
      cashPence: 5_000_000,
      source: "statement",
    });
  });

  it("falls back to opening cash plus transactions since", async () => {
    const other = await seedCompany(db, { name: "Other", openingCashPence: 100_000, openingCashAsAt: addDays(today, -10) });
    await seedBank(other.id, null, 25_000);
    expect(await getCashAtBank(other.id)).toMatchObject({ cashPence: 125_000, source: "opening" });
    expect(await getCashAtBank(companyId)).toEqual({ known: false });
  });

  it("never shows another company's statement balance", async () => {
    const other = await seedCompany(db, { name: "Other" });
    await seedBank(companyId, "100.00");
    await seedBank(other.id, "999999.00");
    const summary = await getBankTransactionSummary(companyId, {});
    expect(summary.statementBalancePence).toBe(10_000);
  });
});

describe("safe to pay yourself", () => {
  beforeEach(async () => {
    await seedBank(companyId, "50000.00");
    // £10,000 + £2,000 VAT, due in two weeks.
    await db.insert(invoices).values({
      companyId,
      number: "INV-1",
      clientId,
      status: "sent",
      issueDate: today,
      dueDate: addDays(today, 14),
      netPence: 1_000_000,
      vatPence: 200_000,
      grossPence: 1_200_000,
    });
    await db.insert(expenses).values({
      companyId,
      description: "Train",
      spentAt: today,
      amountPence: 30_000,
      status: "reimbursable",
      paidByUserId: userId,
    });
    const [order] = await db
      .insert(orders)
      .values({ companyId, number: "O-1", clientId, status: "active", issueDate: today, grossPence: 100_000 })
      .returning();
    await db.insert(orderPaymentMilestones).values({
      orderId: order.id,
      label: "Phase 2",
      amountPence: 100_000,
      dueDate: addDays(today, 20),
      position: 0,
    });
    await db.insert(recurringInvoices).values({
      companyId,
      clientId,
      name: "Retainer",
      lineTemplate: [{ description: "Retainer", quantity: 1, unitPricePence: 50_000, vatRate: 20 }],
      enabled: true,
      nextRunOn: addDays(today, 10),
    });
    await db.insert(shareholders).values([
      { companyId, name: "Ada", shareCount: 60 },
      { companyId, name: "Bo", shareCount: 40 },
    ]);
  });

  it("is limited by reserves when there's plenty of cash", async () => {
    const data = await getSafeToPay(companyId);
    // Profit £9,700, tax £1,843: reserves £7,857.
    expect(data.result).toMatchObject({
      cashPence: 5_000_000,
      vatOwedPence: 200_000,
      corporationTaxPence: 184_300,
      billsDuePence: 30_000,
      bufferPence: 10_000,
      reservesPence: 785_700,
      safeNowPence: 785_700,
      limitedBy: "reserves",
      expectedInPence: 1_200_000 + 100_000 + 60_000,
    });
    expect(data.split.map((s) => s.amountPence)).toEqual([471_420, 314_280]);
  });

  it("uses the buffer setting, and is limited by cash when cash is short", async () => {
    const form = new FormData();
    form.set("vatQuarterEndMonth", "3");
    form.set("bufferMonths", "6");
    expect((await saveSafeToPaySettings(form)).ok).toBe(true);

    await db.delete(bankTransactions);
    await seedBank(companyId, "5000.00");
    const data = await getSafeToPay(companyId);
    // £5,000 − £2,000 VAT − £1,843 tax − £300 owed − £600 buffer = £257
    expect(data.result.bufferPence).toBe(60_000);
    expect(data.result.safeNowPence).toBe(25_700);
    expect(data.result.limitedBy).toBe("cash");
  });

  it("rejects an unknown VAT stagger", async () => {
    const form = new FormData();
    form.set("vatQuarterEndMonth", "5");
    form.set("bufferMonths", "1");
    expect((await saveSafeToPaySettings(form)).ok).toBe(false);
  });
});
