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
  users,
} from "@/db/schema";
import {
  confirmMatch,
  dismissMatch,
  findBankTransactionsForInvoice,
  listLinkableReceiptsForInvoice,
  suggestMatches,
} from "@/lib/bank/queries";
import { seedCompany } from "@/lib/test/seed-company";
import { getInvoiceDetail } from "@/lib/invoices/queries";
import { recordInvoicePayment } from "@/lib/payments/record";

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
    .values({ companyId, name: "Starling Business", provider: "starling" })
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

    await confirmMatch(companyId, suggestions[0].matchId);

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
    await dismissMatch(companyId, suggestions[0].matchId);

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

  describe("bank payment that differs from the invoice", () => {
    async function setBankAmount(txId: string, amountPence: number) {
      await db
        .update(bankTransactions)
        .set({ amountPence })
        .where(eq(bankTransactions.id, txId));
    }

    async function payFromBank(invoiceId: string, txId: string, amountPounds: string) {
      const [actor] = await db
        .insert(users)
        .values({ companyId, clerkUserId: `user_${txId}`, email: "owner@test.dev", name: "Owner", role: "admin" })
        .returning();
      return recordInvoicePayment({ companyId, localUserId: actor.id }, invoiceId, {
        amountPounds,
        method: "bank_transfer",
        bankTransactionId: txId,
      });
    }

    it("links a slight overpayment and shows the extra as a refund due", async () => {
      const { invoice, tx } = await seedInvoicePaymentScenario();
      await setBankAmount(tx.id, 25_100);

      const matches = await findBankTransactionsForInvoice(companyId, invoice.id);
      expect(matches.map((m) => m.bankTransactionId)).toContain(tx.id);

      const result = await payFromBank(invoice.id, tx.id, "251.00");
      expect(result.ok).toBe(true);

      const detail = await getInvoiceDetail(companyId, invoice.id);
      expect(detail?.invoice.status).toBe("paid");
      expect(detail?.refundDueMinor).toBe(100);
    });

    it("links an underpayment and leaves the rest owed", async () => {
      const { invoice, tx } = await seedInvoicePaymentScenario();
      await setBankAmount(tx.id, 24_850);

      const result = await payFromBank(invoice.id, tx.id, "248.50");
      expect(result.ok).toBe(true);

      const detail = await getInvoiceDetail(companyId, invoice.id);
      expect(detail?.invoice.status).not.toBe("paid");
      expect(detail?.balanceMinor).toBe(150);
    });

    it("refuses a bank payment far above the balance", async () => {
      const { invoice, tx } = await seedInvoicePaymentScenario();
      await setBankAmount(tx.id, 30_000);

      const matches = await findBankTransactionsForInvoice(companyId, invoice.id);
      expect(matches.map((m) => m.bankTransactionId)).not.toContain(tx.id);

      const result = await payFromBank(invoice.id, tx.id, "300.00");
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toMatch(/remaining balance/i);
    });
  
    it("suggests a slightly overpaid invoice from the bank side, with a note", async () => {
      const { invoice, tx } = await seedInvoicePaymentScenario();
      await setBankAmount(tx.id, 25_100);

      const suggestions = await suggestMatches(companyId);
      expect(suggestions).toHaveLength(1);
      expect(suggestions[0].note).toMatch(/£1\.00 more than the £250\.00 still owed/);

      await confirmMatch(companyId, suggestions[0].matchId);
      const detail = await getInvoiceDetail(companyId, invoice.id);
      expect(detail?.invoice.status).toBe("paid");
      expect(detail?.refundDueMinor).toBe(100);
    });

    it("doesn't suggest an overpaid invoice on the date alone", async () => {
      const { tx } = await seedInvoicePaymentScenario();
      await db
        .update(bankTransactions)
        .set({ amountPence: 25_100, counterparty: "Someone Else", reference: "thanks" })
        .where(eq(bankTransactions.id, tx.id));

      expect(await suggestMatches(companyId)).toHaveLength(0);
    });

    it("lists unlinked receipts that didn't score well enough to suggest", async () => {
      const { invoice, tx } = await seedInvoicePaymentScenario();
      await db
        .update(bankTransactions)
        .set({ bookedAt: "2026-09-01", counterparty: "Someone Else", reference: "thanks" })
        .where(eq(bankTransactions.id, tx.id));

      expect(await findBankTransactionsForInvoice(companyId, invoice.id)).toHaveLength(0);
      const others = await listLinkableReceiptsForInvoice(companyId, invoice.id, new Set());
      expect(others.map((o) => o.bankTransactionId)).toEqual([tx.id]);
      expect(
        await listLinkableReceiptsForInvoice(companyId, invoice.id, new Set([tx.id])),
      ).toHaveLength(0);
    });
  });
});
