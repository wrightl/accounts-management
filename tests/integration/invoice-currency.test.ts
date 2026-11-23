import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";
import { createTestDb, type TestDatabase } from "@/db/pglite";
import { setTestDb, type Database } from "@/db";
import {
  bankAccounts,
  bankTransactions,
  clients,
  fxRates,
  invoiceLineItems,
  invoices,
  invoiceWriteOffs,
  payments,
  users,
} from "@/db/schema";
import { resetFxFetchBackoff } from "@/lib/bank/fx";
import { findBankTransactionsForInvoice } from "@/lib/bank/queries";
import { seedCompany } from "@/lib/test/seed-company";
import { createDraftInvoiceRecord, invoiceCurrencyFields } from "@/lib/invoices/create";
import { getInvoiceDetail } from "@/lib/invoices/queries";
import { linkPaymentToBankTransaction, listReceiptsForPayment } from "@/lib/payments/link-bank";
import { recordInvoicePayment } from "@/lib/payments/record";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

let ctx: Awaited<ReturnType<typeof createTestDb>>;
let db: TestDatabase;
let companyId: string;
let clientId: string;
let actorId: string;

beforeEach(async () => {
  ctx = await createTestDb();
  db = ctx.db;
  setTestDb(db as unknown as Database);
  resetFxFetchBackoff();
  // Rates come from the fx_rates rows each test seeds, never the network.
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("no network in tests")));
  companyId = (await seedCompany(db)).id;
  const [client] = await db
    .insert(clients)
    .values({ companyId, name: "Initech Inc", defaultCurrency: "USD" })
    .returning();
  clientId = client.id;
  const [actor] = await db
    .insert(users)
    .values({ companyId, clerkUserId: "user_fx", email: "o@test.dev", name: "O", role: "admin" })
    .returning();
  actorId = actor.id;
});

afterEach(async () => {
  vi.unstubAllGlobals();
  setTestDb(null);
  await ctx.client.close();
});

async function usdRate(observationDate: string, foreignPerGbp: number) {
  await db.insert(fxRates).values({ currency: "USD", observationDate, foreignPerGbp });
}

const line = (unitPricePounds: string) => ({
  description: "Consulting",
  quantity: 1,
  unitPricePounds,
  vatRate: 0,
  discountPercent: 0,
});

/** A sent $70 invoice booked at 1.25 USD per £1, so £56.00 in the books. */
async function sentUsdInvoice() {
  const [inv] = await db
    .insert(invoices)
    .values({
      companyId,
      number: "DD-2026-0950",
      clientId,
      status: "sent",
      issueDate: "2026-05-01",
      dueDate: "2026-05-31",
      currency: "USD",
      fxRate: 1.25,
      fxRateDate: "2026-05-01",
      fxRateSource: "boe",
      netMinor: 7_000,
      vatMinor: 0,
      grossMinor: 7_000,
      netPence: 5_600,
      vatPence: 0,
      grossPence: 5_600,
    })
    .returning();
  return inv;
}

async function bankAccount() {
  const [account] = await db
    .insert(bankAccounts)
    .values({ companyId, name: "Current", provider: "generic" })
    .returning();
  return account.id;
}

async function credit(accountId: string, amountPence: number, bookedAt = "2026-05-20") {
  const [tx] = await db
    .insert(bankTransactions)
    .values({
      bankAccountId: accountId,
      externalId: `tx-${amountPence}-${bookedAt}`,
      bookedAt,
      amountPence,
      counterparty: "Initech Inc",
      reference: "DD-2026-0950",
    })
    .returning();
  return tx;
}

async function fxDifference(invoiceId: string) {
  const rows = await db
    .select({ amountPence: invoiceWriteOffs.amountPence })
    .from(invoiceWriteOffs)
    .where(
      and(eq(invoiceWriteOffs.invoiceId, invoiceId), eq(invoiceWriteOffs.kind, "fx_difference")),
    );
  return rows[0]?.amountPence ?? null;
}

describe("creating a foreign-currency invoice", () => {
  it("prices it in its currency and books sterling at the Bank of England rate", async () => {
    await usdRate("2026-05-01", 1.25);
    const result = await createDraftInvoiceRecord(
      { companyId, localUserId: actorId },
      {
        clientId,
        issueDate: "2026-05-01",
        dueDate: "",
        notes: null,
        currency: "USD",
        fxRate: null,
        lines: [line("70.00")],
      },
    );
    expect(result.ok).toBe(true);
    const [inv] = await db.select().from(invoices).where(eq(invoices.companyId, companyId));
    expect(inv).toMatchObject({
      currency: "USD",
      fxRate: 1.25,
      fxRateDate: "2026-05-01",
      fxRateSource: "boe",
      grossMinor: 7_000,
      grossPence: 5_600,
    });
    // Line prices are in the invoice's currency.
    const [stored] = await db
      .select({ unitPricePence: invoiceLineItems.unitPricePence })
      .from(invoiceLineItems)
      .where(eq(invoiceLineItems.invoiceId, inv.id));
    expect(stored.unitPricePence).toBe(7_000);
  });

  it("uses a rate typed by hand instead", async () => {
    const fields = await invoiceCurrencyFields(
      { currency: "USD", fxRate: 1.4 },
      "2026-05-01",
      [{ description: "x", quantity: 1, unitPricePence: 7_000, vatRate: 20, discountPercent: 0, position: 0, expenseId: null }],
    );
    expect(fields).toMatchObject({
      ok: true,
      fields: {
        fxRate: 1.4,
        fxRateSource: "manual",
        fxRateDate: "2026-05-01",
        netMinor: 7_000,
        vatMinor: 1_400,
        grossMinor: 8_400,
        // Net and VAT converted separately, gross their sum.
        netPence: 5_000,
        vatPence: 1_000,
        grossPence: 6_000,
      },
    });
  });

  it("says so when the Bank of England rate can't be had", async () => {
    const fields = await invoiceCurrencyFields({ currency: "USD", fxRate: null }, "2026-05-01", []);
    expect(fields.ok).toBe(false);
    if (!fields.ok) expect(fields.fieldErrors?.fxRate).toMatch(/Enter the rate yourself/);
  });

  it("won't put a recharged expense on a foreign invoice", async () => {
    const fields = await invoiceCurrencyFields({ currency: "USD", fxRate: 1.25 }, "2026-05-01", [
      { description: "x", quantity: 1, unitPricePence: 100, vatRate: 0, discountPercent: 0, position: 0, expenseId: "e1" },
    ]);
    expect(fields).toMatchObject({ ok: false, error: "Recharged expenses can only go on a GBP invoice" });
  });

  it("leaves sterling invoices as they were", async () => {
    const fields = await invoiceCurrencyFields({ currency: "GBP", fxRate: 9 }, "2026-05-01", [
      { description: "x", quantity: 1, unitPricePence: 7_000, vatRate: 0, discountPercent: 0, position: 0, expenseId: null },
    ]);
    expect(fields).toMatchObject({
      ok: true,
      fields: { currency: "GBP", fxRate: 1, fxRateSource: null, grossMinor: 7_000, grossPence: 7_000 },
    });
  });
});

describe("recording a payment on a foreign invoice", () => {
  const ctxFor = () => ({ companyId, localUserId: actorId });

  it("records the dollars received and the pounds that reached the bank", async () => {
    const inv = await sentUsdInvoice();
    const result = await recordInvoicePayment(ctxFor(), inv.id, {
      amountPounds: "70.00",
      sterlingPounds: "54.20",
      receivedAt: "2026-05-20",
    });
    expect(result.ok).toBe(true);
    const [p] = await db.select().from(payments).where(eq(payments.invoiceId, inv.id));
    expect(p).toMatchObject({ amountMinor: 7_000, amountPence: 5_420, amountPenceEstimated: false });
    const detail = await getInvoiceDetail(companyId, inv.id);
    expect(detail?.invoice.status).toBe("paid");
    // Booked at £56.00, received £54.20: a £1.80 exchange loss.
    expect(await fxDifference(inv.id)).toBe(180);
  });

  it("estimates the pounds at the day's rate when they aren't given", async () => {
    await usdRate("2026-05-20", 1.3);
    const inv = await sentUsdInvoice();
    const result = await recordInvoicePayment(ctxFor(), inv.id, {
      amountPounds: "70.00",
      receivedAt: "2026-05-20",
    });
    expect(result.ok).toBe(true);
    const [p] = await db.select().from(payments).where(eq(payments.invoiceId, inv.id));
    expect(p).toMatchObject({ amountMinor: 7_000, amountPence: 5_385, amountPenceEstimated: true });
    const detail = await getInvoiceDetail(companyId, inv.id);
    expect(detail?.payments[0].amountFormatted).toBe("US$70.00 (£53.85) est.");
  });

  it("takes the pounds from a linked bank line", async () => {
    const inv = await sentUsdInvoice();
    const tx = await credit(await bankAccount(), 5_500);
    const result = await recordInvoicePayment(ctxFor(), inv.id, {
      amountPounds: "70.00",
      sterlingPounds: "1.00",
      bankTransactionId: tx.id,
    });
    expect(result.ok).toBe(true);
    const [p] = await db.select().from(payments).where(eq(payments.invoiceId, inv.id));
    expect(p).toMatchObject({ amountMinor: 7_000, amountPence: 5_500, amountPenceEstimated: false });
    expect(await fxDifference(inv.id)).toBe(100);
  });

  it("won't take more than is owed in the invoice's currency", async () => {
    const inv = await sentUsdInvoice();
    const result = await recordInvoicePayment(ctxFor(), inv.id, {
      amountPounds: "80.00",
      sterlingPounds: "60.00",
    });
    expect(result.ok).toBe(false);
  });
});

describe("bank lines for a foreign invoice", () => {
  it("suggests receipts within 10% of the balance at today's rate", async () => {
    // Today's rate, whatever today is: the cached row is the latest on or before it.
    await usdRate("2026-01-01", 1.25);
    const inv = await sentUsdInvoice();
    const account = await bankAccount();
    const near = await credit(account, 5_500);
    await credit(account, 4_000);
    const matches = await findBankTransactionsForInvoice(companyId, inv.id);
    expect(matches.map((m) => m.bankTransactionId)).toEqual([near.id]);
  });

  it("links an estimated payment to the bank line that confirms it", async () => {
    await usdRate("2026-05-20", 1.25);
    const inv = await sentUsdInvoice();
    await recordInvoicePayment({ companyId, localUserId: actorId }, inv.id, {
      amountPounds: "70.00",
      receivedAt: "2026-05-20",
    });
    const [p] = await db.select().from(payments).where(eq(payments.invoiceId, inv.id));
    expect(p.amountPenceEstimated).toBe(true);
    const account = await bankAccount();
    const tx = await credit(account, 5_450);
    await credit(account, 7_000);

    // Only the line near the £56.00 expected.
    const receipts = await listReceiptsForPayment(companyId, p.id);
    expect(receipts.map((r) => r.bankTransactionId)).toEqual([tx.id]);

    const result = await linkPaymentToBankTransaction(
      { companyId, localUserId: actorId },
      p.id,
      tx.id,
    );
    expect(result.ok).toBe(true);
    const [linked] = await db.select().from(payments).where(eq(payments.id, p.id));
    // The client's dollars stand; the pounds become what arrived.
    expect(linked).toMatchObject({ amountMinor: 7_000, amountPence: 5_450, amountPenceEstimated: false });
    expect(await fxDifference(inv.id)).toBe(150);
  });

  it("won't link a bank line far from the payment's pounds", async () => {
    const inv = await sentUsdInvoice();
    await recordInvoicePayment({ companyId, localUserId: actorId }, inv.id, {
      amountPounds: "70.00",
      sterlingPounds: "56.00",
    });
    const [p] = await db.select().from(payments).where(eq(payments.invoiceId, inv.id));
    const tx = await credit(await bankAccount(), 7_000);
    const result = await linkPaymentToBankTransaction(
      { companyId, localUserId: actorId },
      p.id,
      tx.id,
    );
    expect(result.ok).toBe(false);
  });
});
