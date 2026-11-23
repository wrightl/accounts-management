import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";
import { createTestDb, type TestDatabase } from "@/db/pglite";
import { setTestDb, type Database } from "@/db";
import {
  bankAccounts,
  bankTransactionLabels,
  bankTransactions,
  clients,
  expenseLabels,
  expenseReceipts,
  expenses,
  invoices,
  labels,
  orderPaymentMilestones,
  orders,
  payments,
  quotePaymentMilestones,
  quotes,
  quoteVersions,
} from "@/db/schema";
import { seedCompany } from "@/lib/test/seed-company";
import { bankTransactionOfCompany, rowOfCompany } from "@/lib/tenant-scope";
import {
  replaceOrderPaymentMilestones,
  replaceQuotePaymentMilestones,
} from "@/lib/orders/copy-from-quote";
import { getQuoteVersionSnapshot } from "@/lib/quotes/queries";
import { labelsForExpenses } from "@/lib/labels/queries";
import { receiptsByExpense } from "@/lib/mobile/expenses";

vi.mock("server-only", () => ({}));

let ctx: Awaited<ReturnType<typeof createTestDb>>;
let db: TestDatabase;

beforeEach(async () => {
  ctx = await createTestDb();
  db = ctx.db;
  setTestDb(db as unknown as Database);
});

afterEach(async () => {
  setTestDb(null);
  await ctx.client.close();
});

/** A company with one paid invoice and one labelled bank transaction. */
async function companyWithData(name: string, slug: string) {
  const companyId = (await seedCompany(db, { name, slug })).id;
  const [client] = await db.insert(clients).values({ companyId, name: `${name} client` }).returning();
  const [invoice] = await db
    .insert(invoices)
    .values({ companyId, number: `${slug}-1`, clientId: client.id, status: "sent", grossPence: 1_000 })
    .returning();
  const [payment] = await db
    .insert(payments)
    .values({ invoiceId: invoice.id, amountPence: 1_000 })
    .returning();
  const [account] = await db
    .insert(bankAccounts)
    .values({ companyId, name: "Current", provider: "csv" })
    .returning();
  const [tx] = await db
    .insert(bankTransactions)
    .values({
      bankAccountId: account.id,
      externalId: `${slug}-tx`,
      bookedAt: "2026-05-01",
      amountPence: 1_000,
    })
    .returning();
  const [label] = await db.insert(labels).values({ companyId, name: "Tag", color: "blue" }).returning();
  await db.insert(bankTransactionLabels).values({ bankTransactionId: tx.id, labelId: label.id });

  const [quote] = await db
    .insert(quotes)
    .values({ companyId, number: `${slug}-Q1`, clientId: client.id })
    .returning();
  await db.insert(quoteVersions).values({
    quoteId: quote.id,
    version: 1,
    clientId: client.id,
    lines: [],
    source: "create",
  });
  await db.insert(quotePaymentMilestones).values({ quoteId: quote.id, label: "Deposit", amountPence: 100 });
  const [order] = await db
    .insert(orders)
    .values({ companyId, number: `${slug}-O1`, clientId: client.id })
    .returning();
  await db.insert(orderPaymentMilestones).values({ orderId: order.id, label: "Deposit", amountPence: 100 });
  const [expense] = await db
    .insert(expenses)
    .values({ companyId, description: `${name} expense` })
    .returning();
  await db.insert(expenseLabels).values({ expenseId: expense.id, labelId: label.id });
  await db
    .insert(expenseReceipts)
    .values({ expenseId: expense.id, blobPath: `${slug}/r.pdf`, filename: "r.pdf" });
  return { companyId, invoice, payment, tx, quote, order, expense };
}

describe("tenant scope helpers", () => {
  it("rowOfCompany keeps only rows whose parent belongs to the company", async () => {
    const a = await companyWithData("Alpha Ltd", "alpha");
    const b = await companyWithData("Beta Ltd", "beta");

    const rows = await db
      .select({ id: payments.id })
      .from(payments)
      .where(rowOfCompany(payments.invoiceId, invoices, a.companyId));
    expect(rows.map((r) => r.id)).toEqual([a.payment.id]);

    // Another company's id can't be reached, even when named directly.
    const crossed = await db
      .select({ id: payments.id })
      .from(payments)
      .where(
        and(
          eq(payments.id, b.payment.id),
          rowOfCompany(payments.invoiceId, invoices, a.companyId),
        ),
      );
    expect(crossed).toHaveLength(0);
  });

  it("works alongside a join to the same parent table", async () => {
    const a = await companyWithData("Alpha Ltd", "alpha");
    await companyWithData("Beta Ltd", "beta");
    const rows = await db
      .select({ number: invoices.number })
      .from(payments)
      .innerJoin(invoices, eq(invoices.id, payments.invoiceId))
      .where(rowOfCompany(payments.invoiceId, invoices, a.companyId));
    expect(rows).toEqual([{ number: "alpha-1" }]);
  });

  it("bankTransactionOfCompany goes through the bank account", async () => {
    const a = await companyWithData("Alpha Ltd", "alpha");
    const b = await companyWithData("Beta Ltd", "beta");
    const deleted = await db
      .delete(bankTransactionLabels)
      .where(
        and(
          eq(bankTransactionLabels.bankTransactionId, b.tx.id),
          bankTransactionOfCompany(bankTransactionLabels.bankTransactionId, a.companyId),
        ),
      )
      .returning();
    expect(deleted).toHaveLength(0);

    const own = await db
      .select()
      .from(bankTransactionLabels)
      .where(bankTransactionOfCompany(bankTransactionLabels.bankTransactionId, a.companyId));
    expect(own.map((r) => r.bankTransactionId)).toEqual([a.tx.id]);
  });
});

describe("functions given another company's ids", () => {
  it("replaceQuotePaymentMilestones refuses another company's quote", async () => {
    const a = await companyWithData("Alpha Ltd", "alpha");
    const b = await companyWithData("Beta Ltd", "beta");
    await expect(
      db.transaction((tx) =>
        replaceQuotePaymentMilestones(tx as never, a.companyId, b.quote.id, [
          { label: "Injected", amountPence: 1 },
        ]),
      ),
    ).rejects.toThrow("Quote not found");
    const rows = await db
      .select({ label: quotePaymentMilestones.label })
      .from(quotePaymentMilestones)
      .where(eq(quotePaymentMilestones.quoteId, b.quote.id));
    expect(rows).toEqual([{ label: "Deposit" }]);
  });

  it("replaceOrderPaymentMilestones refuses another company's order", async () => {
    const a = await companyWithData("Alpha Ltd", "alpha");
    const b = await companyWithData("Beta Ltd", "beta");
    await expect(
      db.transaction((tx) =>
        replaceOrderPaymentMilestones(tx as never, a.companyId, b.order.id, []),
      ),
    ).rejects.toThrow("Order not found");
    const rows = await db
      .select({ label: orderPaymentMilestones.label })
      .from(orderPaymentMilestones)
      .where(eq(orderPaymentMilestones.orderId, b.order.id));
    expect(rows).toEqual([{ label: "Deposit" }]);
  });

  it("replaceQuotePaymentMilestones still replaces the company's own", async () => {
    const a = await companyWithData("Alpha Ltd", "alpha");
    await db.transaction((tx) =>
      replaceQuotePaymentMilestones(tx as never, a.companyId, a.quote.id, [
        { label: "Balance", amountPence: 200 },
      ]),
    );
    const rows = await db
      .select({ label: quotePaymentMilestones.label })
      .from(quotePaymentMilestones)
      .where(eq(quotePaymentMilestones.quoteId, a.quote.id));
    expect(rows).toEqual([{ label: "Balance" }]);
  });

  it("getQuoteVersionSnapshot returns nothing for another company's quote", async () => {
    const a = await companyWithData("Alpha Ltd", "alpha");
    const b = await companyWithData("Beta Ltd", "beta");
    expect(await getQuoteVersionSnapshot(a.companyId, b.quote.id, 1)).toBeNull();
    expect(await getQuoteVersionSnapshot(a.companyId, a.quote.id, 1)).not.toBeNull();
  });

  it("labelsForExpenses returns only the company's expenses", async () => {
    const a = await companyWithData("Alpha Ltd", "alpha");
    const b = await companyWithData("Beta Ltd", "beta");
    const labelled = await labelsForExpenses(a.companyId, [a.expense.id, b.expense.id]);
    expect([...labelled.keys()]).toEqual([a.expense.id]);
  });

  it("receiptsByExpense returns only the company's expenses", async () => {
    const a = await companyWithData("Alpha Ltd", "alpha");
    const b = await companyWithData("Beta Ltd", "beta");
    const receipts = await receiptsByExpense(a.companyId, [a.expense.id, b.expense.id]);
    expect([...receipts.keys()]).toEqual([a.expense.id]);
  });
});
