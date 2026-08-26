import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb, type TestDatabase } from "@/db/pglite";
import { setTestDb, type Database } from "@/db";
import {
  bankAccounts,
  bankTransactions,
  clients,
  invoices,
  payments,
  reconciliationMatches,
} from "@/db/schema";
import {
  confirmMatch,
  dismissMatch,
  findBankTransactionsForInvoice,
  suggestMatches,
} from "@/lib/bank/queries";
import { seedCompany } from "@/lib/test/seed-company";

vi.mock("server-only", () => ({}));

let ctx: Awaited<ReturnType<typeof createTestDb>>;
let db: TestDatabase;
let companyId: string;

beforeEach(async () => {
  ctx = await createTestDb();
  db = ctx.db;
  setTestDb(db as unknown as Database);
  const company = await seedCompany(db);
  companyId = company.id;
});

afterEach(async () => {
  setTestDb(null);
  await ctx.client.close();
});

async function seedInvoicePaymentScenario() {
  const [account] = await db
    .insert(bankAccounts)
    .values({ companyId, name: "Starling Business" })
    .returning();

  const [client] = await db
    .insert(clients)
    .values({ companyId, name: "Jane Smith", companyName: "Acme Ltd" })
    .returning();

  const [invoice] = await db
    .insert(invoices)
    .values({
      companyId,
      number: "DD-2026-0001",
      clientId: client.id,
      status: "sent",
      issueDate: "2026-04-01",
      dueDate: "2026-04-15",
      grossPence: 25_000,
      netPence: 25_000,
    })
    .returning();

  const [tx] = await db
    .insert(bankTransactions)
    .values({
      bankAccountId: account.id,
      externalId: "tx-incoming-1",
      bookedAt: "2026-04-02",
      amountPence: 25_000,
      counterparty: "Acme Ltd",
      reference: "DD20260001 payment",
    })
    .returning();

  return { account, client, invoice, tx };
}

describe("bank reconciliation integration", () => {
  it("suggests an unpaid invoice from fuzzy reference and counterparty match", async () => {
    await seedInvoicePaymentScenario();

    const suggestions = await suggestMatches(companyId);
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0].matchType).toBe("invoice_payment");
    expect(suggestions[0].target.kind).toBe("invoice_payment");
    if (suggestions[0].target.kind === "invoice_payment") {
      expect(suggestions[0].target.invoiceNumber).toBe("DD-2026-0001");
      expect(suggestions[0].target.clientName).toBe("Acme Ltd");
    }

    const [match] = await db
      .select()
      .from(reconciliationMatches)
      .where(eq(reconciliationMatches.id, suggestions[0].matchId));
    expect(match.invoiceId).toBeTruthy();
    expect(match.paymentId).toBeNull();
    expect(match.confirmed).toBe(false);
  });

  it("confirming an invoice suggestion creates a payment and marks the invoice paid", async () => {
    const { invoice, tx } = await seedInvoicePaymentScenario();
    const suggestions = await suggestMatches(companyId);
    expect(suggestions).toHaveLength(1);

    await confirmMatch(suggestions[0].matchId);

    const paymentRows = await db
      .select()
      .from(payments)
      .where(eq(payments.invoiceId, invoice.id));
    expect(paymentRows).toHaveLength(1);
    expect(paymentRows[0].amountPence).toBe(25_000);
    expect(paymentRows[0].reference).toBe(tx.reference);

    const [updatedInvoice] = await db
      .select()
      .from(invoices)
      .where(eq(invoices.id, invoice.id));
    expect(updatedInvoice.status).toBe("paid");

    const [match] = await db
      .select()
      .from(reconciliationMatches)
      .where(eq(reconciliationMatches.id, suggestions[0].matchId));
    expect(match.confirmed).toBe(true);
    expect(match.paymentId).toBe(paymentRows[0].id);
  });

  it("dismisses a suggestion so the transaction can be suggested again", async () => {
    await seedInvoicePaymentScenario();
    const suggestions = await suggestMatches(companyId);
    await dismissMatch(suggestions[0].matchId);

    const again = await suggestMatches(companyId);
    expect(again).toHaveLength(1);
  });

  it("finds bank transactions for an invoice from the invoice side", async () => {
    const { invoice } = await seedInvoicePaymentScenario();

    const matches = await findBankTransactionsForInvoice(companyId, invoice.id);
    expect(matches.length).toBeGreaterThanOrEqual(1);
    expect(matches[0].amountPence).toBe(25_000);
    expect(matches[0].counterparty).toBe("Acme Ltd");
    expect(matches[0].score).toBeGreaterThanOrEqual(70);
  });
});
