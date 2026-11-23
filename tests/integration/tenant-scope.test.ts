import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";
import { createTestDb, type TestDatabase } from "@/db/pglite";
import { setTestDb, type Database } from "@/db";
import {
  bankAccounts,
  bankTransactionLabels,
  bankTransactions,
  clients,
  invoices,
  labels,
  payments,
} from "@/db/schema";
import { seedCompany } from "@/lib/test/seed-company";
import { bankTransactionOfCompany, rowOfCompany } from "@/lib/tenant-scope";

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
  return { companyId, invoice, payment, tx };
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
