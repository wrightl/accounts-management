import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb, type TestDatabase } from "@/db/pglite";
import { setTestDb, type Database } from "@/db";
import { clients, expenses, invoiceLineItems, invoices, orders, users } from "@/db/schema";
import { seedCompany } from "@/lib/test/seed-company";
import { createExpense, deleteExpense, updateExpense } from "@/actions/expenses";
import { createInvoice, updateInvoice, voidInvoice } from "@/actions/invoices";
import {
  getOrderProfitability,
  listClientProfitability,
  listProjectExpenses,
  listRebillableExpenses,
} from "@/lib/profitability/queries";
import { todayIsoDate } from "@/lib/dates";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
  unstable_cache: <T,>(fn: T) => fn,
}));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@clerk/nextjs/server", () => ({
  auth: vi.fn(async () => ({ userId: "user_clerk_pp", sessionClaims: {} })),
  currentUser: vi.fn(async () => ({
    primaryEmailAddress: { emailAddress: "pp@example.com" },
    firstName: "Pro",
    lastName: "Fit",
    publicMetadata: {},
  })),
}));

const today = todayIsoDate();

let ctx: Awaited<ReturnType<typeof createTestDb>>;
let db: TestDatabase;
let companyId: string;
let clientA: string;
let clientB: string;
let orderId: string;

beforeEach(async () => {
  ctx = await createTestDb();
  db = ctx.db;
  setTestDb(db as unknown as Database);
  const company = await seedCompany(db, { vatRegistered: true });
  companyId = company.id;
  await db.insert(users).values({
    companyId,
    clerkUserId: "user_clerk_pp",
    email: "pp@example.com",
    name: "Pro Fit",
    role: "admin",
  });
  const [a, b] = await db
    .insert(clients)
    .values([
      { companyId, name: "Acme" },
      { companyId, name: "Beta" },
    ])
    .returning();
  clientA = a.id;
  clientB = b.id;
  const [order] = await db
    .insert(orders)
    .values({
      companyId,
      number: "ORD-1",
      clientId: clientA,
      status: "active",
      issueDate: today,
      netPence: 100_000,
      vatPence: 20_000,
      grossPence: 120_000,
    })
    .returning();
  orderId = order.id;
});

afterEach(async () => {
  setTestDb(null);
  await ctx.client.close();
});

function expenseForm(fields: Record<string, string>) {
  const fd = new FormData();
  const all = { spentAt: today, status: "company_paid", vatRate: "0", ...fields };
  for (const [k, v] of Object.entries(all)) fd.set(k, v);
  return fd;
}

function invoiceForm(client: string, lines: Array<Record<string, unknown>>) {
  const fd = new FormData();
  fd.set("clientId", client);
  fd.set("issueDate", today);
  fd.set("linesJson", JSON.stringify(lines));
  return fd;
}

async function addExpense(fields: Record<string, string>) {
  const result = await createExpense(expenseForm(fields));
  if (!result.ok) throw new Error(result.error);
  return result.id!;
}

describe("tagging and rebilling expenses", () => {
  it("recharges a rebillable cost once and counts it in the order's margin", async () => {
    const train = await addExpense({
      description: "Train to site",
      amountPounds: "120.00",
      vatRate: "20",
      billable: "true",
      orderId,
    });
    await addExpense({ description: "Freelance designer", amountPounds: "300.00", orderId });

    // The order's client is copied onto the expense.
    const [row] = await db.select().from(expenses).where(eq(expenses.id, train));
    expect(row).toMatchObject({ clientId: clientA, orderId, billable: true });

    // VAT-registered: recharge the net cost.
    const [rebill] = await listRebillableExpenses(companyId, { clientId: clientA });
    expect(rebill).toMatchObject({ id: train, pricePence: 10_000, orderNumber: "ORD-1" });

    const rebillLine = {
      description: "Train to site",
      quantity: 1,
      unitPricePounds: "100.00",
      vatRate: 20,
      expenseId: train,
    };
    // Another client's invoice can't recharge it.
    expect((await createInvoice(invoiceForm(clientB, [rebillLine]))).ok).toBe(false);

    const created = await createInvoice(
      invoiceForm(clientA, [
        { description: "Design work", quantity: 1, unitPricePounds: "1000.00", vatRate: 20 },
        rebillLine,
      ]),
    );
    expect(created.ok).toBe(true);
    const invoiceId = created.ok ? created.id! : "";
    const [line] = await db
      .select()
      .from(invoiceLineItems)
      .where(eq(invoiceLineItems.expenseId, train));
    expect(line?.invoiceId).toBe(invoiceId);

    // Once on an invoice it's no longer offered, and can't go on a second one.
    expect(await listRebillableExpenses(companyId)).toHaveLength(0);
    expect((await createInvoice(invoiceForm(clientA, [rebillLine]))).ok).toBe(false);
    // Editing the draft keeps it.
    expect(
      (await updateInvoice(invoiceId, invoiceForm(clientA, [rebillLine]))).ok,
    ).toBe(true);
    expect(
      (
        await updateInvoice(
          invoiceId,
          invoiceForm(clientA, [
            { description: "Design work", quantity: 1, unitPricePounds: "1000.00", vatRate: 20 },
            rebillLine,
          ]),
        )
      ).ok,
    ).toBe(true);

    // Drafts don't count as revenue yet.
    expect((await getOrderProfitability(companyId, orderId))!.current.revenuePence).toBe(0);
    await db.update(invoices).set({ status: "sent" }).where(eq(invoices.id, invoiceId));

    const order = await getOrderProfitability(companyId, orderId);
    expect(order).toMatchObject({
      quotedPence: 100_000,
      invoicedPence: 0,
      rebilledElsewherePence: 10_000,
      unbilledRebillablePence: 0,
      stillToInvoicePence: 100_000,
      current: { revenuePence: 10_000, costPence: 40_000, marginPence: -30_000 },
      projected: { revenuePence: 110_000, marginPence: 70_000, marginPercent: 64 },
    });

    const [acme] = await listClientProfitability(companyId, { from: null, to: null }, clientA);
    expect(acme).toMatchObject({
      revenuePence: 110_000,
      costPence: 40_000,
      marginPence: 70_000,
      marginPercent: 64,
    });

    const costs = await listProjectExpenses(companyId, { orderId });
    expect(costs.find((c) => c.id === train)?.rebilledOn?.invoiceId).toBe(invoiceId);

    // A recharged expense can't quietly change or disappear.
    const untick = await updateExpense(
      train,
      expenseForm({ description: "Train to site", amountPounds: "120.00", vatRate: "20", orderId }),
    );
    expect(untick.ok).toBe(false);
    expect((await deleteExpense(train)).ok).toBe(false);

    // Voiding the invoice makes it rebillable again.
    expect((await voidInvoice(invoiceId)).ok).toBe(true);
    expect((await listRebillableExpenses(companyId)).map((e) => e.id)).toEqual([train]);
  });

  it("needs a client to rebill and rejects another company's order", async () => {
    const noClient = await createExpense(
      expenseForm({ description: "Taxi", amountPounds: "20.00", billable: "true" }),
    );
    expect(noClient.ok).toBe(false);
    expect(!noClient.ok && noClient.fieldErrors?.clientId).toBeTruthy();

    const other = await seedCompany(db, { name: "Other Co", slug: "other-co" });
    const [otherClient] = await db
      .insert(clients)
      .values({ companyId: other.id, name: "Theirs" })
      .returning();
    const [otherOrder] = await db
      .insert(orders)
      .values({ companyId: other.id, number: "ORD-9", clientId: otherClient.id })
      .returning();
    const foreign = await createExpense(
      expenseForm({ description: "Taxi", amountPounds: "20.00", orderId: otherOrder.id }),
    );
    expect(foreign.ok).toBe(false);
    expect(!foreign.ok && foreign.fieldErrors?.orderId).toBeTruthy();
    const foreignClient = await createExpense(
      expenseForm({ description: "Taxi", amountPounds: "20.00", clientId: otherClient.id }),
    );
    expect(foreignClient.ok).toBe(false);
  });

  it("tags a cost to a client without rebilling it", async () => {
    await addExpense({ description: "Stock photos", amountPounds: "50.00", clientId: clientB });
    const [beta] = await listClientProfitability(companyId, { from: null, to: null }, clientB);
    expect(beta).toMatchObject({ revenuePence: 0, costPence: 5_000, marginPercent: null });
    expect(await listRebillableExpenses(companyId)).toHaveLength(0);
  });
});
