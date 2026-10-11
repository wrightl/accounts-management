import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestDb, type TestDatabase } from "@/db/pglite";
import { setTestDb, type Database } from "@/db";
import {
  bankAccounts,
  bankTransactions,
  clients,
  dividendDeclarations,
  expenses,
  invoices,
  orderPaymentMilestones,
  orders,
  payments,
  recurringInvoices,
  users,
} from "@/db/schema";
import { seedCompany } from "@/lib/test/seed-company";
import { getForecastInputs } from "@/lib/forecast/queries";
import { buildForecast } from "@/lib/forecast/engine";
import { addDays, addMonths } from "@/lib/ledger/corporation-tax";
import { todayIsoDate } from "@/lib/dates";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
  unstable_cache: <T,>(fn: T) => fn,
}));

const today = todayIsoDate();

let ctx: Awaited<ReturnType<typeof createTestDb>>;
let db: TestDatabase;
let companyId: string;
let acmeId: string;
let betaId: string;

beforeEach(async () => {
  ctx = await createTestDb();
  db = ctx.db;
  setTestDb(db as unknown as Database);
  const company = await seedCompany(db, { invoicePaymentTermsDays: 14 });
  companyId = company.id;
  const [user] = await db
    .insert(users)
    .values({ companyId, clerkUserId: "u_f", email: "f@example.com", name: "F", role: "admin" })
    .returning();
  const [acme, beta] = await db
    .insert(clients)
    .values([
      { companyId, name: "Acme" },
      { companyId, name: "Beta" },
    ])
    .returning();
  acmeId = acme!.id;
  betaId = beta!.id;

  const [account] = await db
    .insert(bankAccounts)
    .values({ companyId, name: "Current", provider: "starling" })
    .returning();
  await db.insert(bankTransactions).values({
    bankAccountId: account.id,
    externalId: "t1",
    bookedAt: addDays(today, -1),
    amountPence: -12_000,
    counterparty: "Supplier",
    raw: { Balance: "20000.00" },
  });

  const [, , paid] = await db
    .insert(invoices)
    .values([
      { companyId, number: "INV-1", clientId: acmeId, status: "sent", issueDate: today, dueDate: addDays(today, 10), netPence: 300_000, grossPence: 300_000 },
      { companyId, number: "INV-2", clientId: betaId, status: "sent", issueDate: addDays(today, -40), dueDate: addDays(today, -10), netPence: 100_000, grossPence: 100_000 },
      { companyId, number: "INV-3", clientId: betaId, status: "sent", issueDate: today, dueDate: addDays(today, 5), netPence: 50_000, grossPence: 50_000 },
    ])
    .returning();
  await db.insert(payments).values({ invoiceId: paid!.id, amountPence: 50_000 });

  await db.insert(recurringInvoices).values({
    companyId,
    clientId: acmeId,
    name: "Retainer",
    lineTemplate: [{ description: "Retainer", quantity: 1, unitPricePence: 200_000, vatRate: 0 }],
    enabled: true,
    nextRunOn: addDays(today, 3),
    maxOccurrences: 2,
    occurrenceCount: 0,
  });

  const [order] = await db
    .insert(orders)
    .values({ companyId, number: "O-1", clientId: betaId, status: "active", issueDate: today, grossPence: 400_000 })
    .returning();
  await db.insert(orderPaymentMilestones).values({
    orderId: order.id,
    label: "Phase 1",
    amountPence: 400_000,
    dueDate: addDays(today, 20),
    position: 0,
  });

  await db.insert(expenses).values([
    { companyId, description: "Software", spentAt: addDays(today, -7), amountPence: 120_000, status: "company_paid" },
    { companyId, description: "Train", spentAt: today, amountPence: 6_000, status: "reimbursable", paidByUserId: user.id },
  ]);
  await db
    .insert(dividendDeclarations)
    .values({ companyId, declaredAt: addDays(today, 7), totalPence: 500_000 });
});

afterEach(async () => {
  setTestDb(null);
  await ctx.client.close();
});

describe("forecast inputs", () => {
  it("gathers money in and out with the right dates", async () => {
    const inputs = await getForecastInputs(companyId);
    expect(inputs.cash).toMatchObject({ known: true, cashPence: 2_000_000 });

    const byLabel = Object.fromEntries(inputs.events.map((e) => [`${e.kind}:${e.label}:${e.date}`, e.amountPence]));
    expect(byLabel).toMatchObject({
      [`invoice:INV-1 · Acme:${addDays(today, 10)}`]: 300_000,
      [`invoice:INV-2 · Beta:${addDays(today, -10)}`]: 100_000,
      // Billed on its due date, paid 14 days later.
      [`milestone:O-1 · Phase 1:${addDays(today, 34)}`]: 400_000,
      [`recurring:Retainer:${addDays(today, 17)}`]: 200_000,
      [`reimbursements:Reimbursements owed:${today}`]: -6_000,
      [`dividend:Dividend declared:${addDays(today, 7)}`]: -500_000,
    });
    // Paid invoices are left out, and recurring stops at its last run.
    expect(inputs.events.some((e) => e.label.startsWith("INV-3"))).toBe(false);
    const retainer = inputs.events.filter((e) => e.kind === "recurring");
    expect(retainer.map((e) => e.date)).toEqual([
      addDays(today, 17),
      addDays(addMonths(addDays(today, 3), 1), 14),
    ].filter((d) => d <= inputs.until));
    expect(inputs.events.find((e) => e.label.startsWith("INV-2"))!.overdue).toBe(true);

    // £1,260 of spending over 12 weeks.
    expect(inputs.weeklySpendPence).toBe(10_500);
    expect(inputs.spendBasis).toBe("expenses");
    expect(inputs.clients.map((c) => c.name)).toEqual(["Acme", "Beta"]);
  });

  it("feeds the engine end to end", async () => {
    const inputs = await getForecastInputs(companyId);
    const forecast = buildForecast({
      openingCashPence: 2_000_000,
      firstWeekStart: inputs.firstWeekStart,
      events: inputs.events,
      weeklySpendPence: inputs.weeklySpendPence,
      lowCashPence: 0,
    });
    const total = inputs.events.reduce((t, e) => t + e.amountPence, 0);
    expect(forecast.weeks[12]!.closingPence).toBe(2_000_000 + total - 13 * 10_500);
  });
});
