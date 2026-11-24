import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb, type TestDatabase } from "@/db/pglite";
import { setTestDb, type Database } from "@/db";
import {
  clients,
  creditNotes,
  fxRates,
  invoiceLineItems,
  invoices,
  orders,
  quoteVersions,
  quotes,
  users,
} from "@/db/schema";
import { resetFxFetchBackoff } from "@/lib/bank/fx";
import { latestStoredRates } from "@/lib/document-rate";
import { seedCompany } from "@/lib/test/seed-company";
import { createDraftQuoteRecord } from "@/lib/quotes/create";
import { getQuoteDetail, getQuoteVersionSnapshot } from "@/lib/quotes/queries";
import { createOrderFromQuote } from "@/lib/orders/copy-from-quote";
import { raiseDepositInvoice } from "@/lib/orders/deposit";
import { sumInvoicedForOrder } from "@/lib/orders/invoice-from-order";

vi.mock("server-only", () => ({}));

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
  // Rates come from the fx_rates rows tests seed, never the network.
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("no network in tests")));
  companyId = (await seedCompany(db)).id;
  const [client] = await db
    .insert(clients)
    .values({ companyId, name: "Initech Inc", defaultCurrency: "USD" })
    .returning();
  clientId = client.id;
  const [actor] = await db
    .insert(users)
    .values({ companyId, clerkUserId: "user_q", email: "o@test.dev", name: "O", role: "admin" })
    .returning();
  actorId = actor.id;
});

afterEach(async () => {
  vi.unstubAllGlobals();
  setTestDb(null);
  await ctx.client.close();
});

const line = (unitPricePounds: string) => ({
  description: "Workshop",
  quantity: 1,
  unitPricePounds,
  vatRate: 0,
  discountPercent: 0,
});

/** A $1,000 quote at a typed rate of 1.25, with a 30% deposit milestone. */
async function usdQuote() {
  const result = await createDraftQuoteRecord(
    { companyId, localUserId: actorId },
    {
      clientId,
      issueDate: "2026-05-01",
      validUntil: null,
      notes: null,
      currency: "USD",
      fxRate: 1.25,
      lines: [line("1000.00")],
      depositOnAccept: true,
    },
    [
      {
        label: "Deposit",
        amountPence: null,
        percentBasisPoints: 3000,
        dueDate: null,
        dueInDays: 7,
        position: 0,
      },
      {
        label: "Balance",
        amountPence: null,
        percentBasisPoints: 7000,
        dueDate: null,
        dueInDays: 30,
        position: 1,
      },
    ],
  );
  if (!result.ok) throw new Error(result.error);
  return result.id!;
}

describe("quotes in a foreign currency", () => {
  it("prices the quote and its first version in its currency", async () => {
    const id = await usdQuote();
    const [quote] = await db.select().from(quotes).where(eq(quotes.id, id));
    expect(quote).toMatchObject({
      currency: "USD",
      fxRate: 1.25,
      fxRateSource: "manual",
      grossMinor: 100000,
      grossPence: 80000,
    });
    const [version] = await db.select().from(quoteVersions).where(eq(quoteVersions.quoteId, id));
    expect(version).toMatchObject({ currency: "USD", fxRate: 1.25, grossMinor: 100000, grossPence: 80000 });
    // A rollback restores the version's currency and rate with its prices.
    expect(await getQuoteVersionSnapshot(companyId, id, 1)).toMatchObject({
      currency: "USD",
      fxRate: 1.25,
      fxRateSource: "manual",
      grossMinor: 100000,
    });
  });

  it("checks fixed milestones against the total in the quote's currency", async () => {
    const result = await createDraftQuoteRecord(
      { companyId, localUserId: actorId },
      {
        clientId,
        issueDate: "2026-05-01",
        validUntil: null,
        notes: null,
        currency: "USD",
        fxRate: 1.25,
        lines: [line("1000.00")],
        depositOnAccept: false,
      },
      // Fixed amounts add up to the $1,000 total, not the £800 in the books.
      [
        { label: "Start", amountPence: 30000, percentBasisPoints: null, dueDate: null, dueInDays: 7, position: 0 },
        { label: "End", amountPence: 70000, percentBasisPoints: null, dueDate: null, dueInDays: 30, position: 1 },
      ],
    );
    expect(result).toMatchObject({ ok: true });
  });
});

describe("orders and their invoices", () => {
  async function acceptedOrder(quoteId: string) {
    const detail = (await getQuoteDetail(companyId, quoteId))!;
    return db.transaction((tx) =>
      createOrderFromQuote(
        tx as never,
        companyId,
        { quote: detail.quote, lines: detail.lines },
        detail.milestones.map((m) => ({
          label: m.label,
          amountPence: m.amountPence,
          percentBasisPoints: m.percentBasisPoints,
          dueDate: m.dueDate,
          dueInDays: m.dueInDays,
          position: m.position,
        })),
        actorId,
      ),
    );
  }

  it("carries the quote's currency and rate onto the order", async () => {
    const orderId = await acceptedOrder(await usdQuote());
    const [order] = await db.select().from(orders).where(eq(orders.id, orderId));
    expect(order).toMatchObject({ currency: "USD", fxRate: 1.25, grossMinor: 100000, grossPence: 80000 });
  });

  it("raises the deposit in the order's currency at the rate given for today", async () => {
    const orderId = await acceptedOrder(await usdQuote());
    const deposit = await db.transaction((tx) =>
      raiseDepositInvoice(tx as never, {
        companyId,
        orderId,
        createdByUserId: actorId,
        rate: { currency: "USD", fxRate: 1.5, fxRateDate: "2026-05-10", fxRateSource: "boe" },
      }),
    );
    // 30% of $1,000.
    expect(deposit).toMatchObject({ amountMinor: 30000, currency: "USD" });
    const [inv] = await db.select().from(invoices).where(eq(invoices.id, deposit!.invoiceId));
    expect(inv).toMatchObject({
      currency: "USD",
      fxRate: 1.5,
      fxRateDate: "2026-05-10",
      grossMinor: 30000,
      grossPence: 20000,
    });
    const lines = await db
      .select()
      .from(invoiceLineItems)
      .where(eq(invoiceLineItems.invoiceId, inv.id));
    expect(lines.reduce((t, l) => t + l.unitPricePence * l.quantity, 0)).toBe(30000);
  });

  it("won't raise a deposit at a rate for another currency", async () => {
    const orderId = await acceptedOrder(await usdQuote());
    await expect(
      db.transaction((tx) =>
        raiseDepositInvoice(tx as never, {
          companyId,
          orderId,
          createdByUserId: actorId,
          rate: { currency: "GBP", fxRate: 1, fxRateDate: null, fxRateSource: null },
        }),
      ),
    ).rejects.toThrow(/not the order's USD/);
  });

  it("counts what's invoiced on an order in its currency, for its company only", async () => {
    const orderId = await acceptedOrder(await usdQuote());
    const [inv] = await db
      .insert(invoices)
      .values({
        companyId,
        number: "DD-2026-0500",
        clientId,
        status: "sent",
        orderId,
        currency: "USD",
        fxRate: 1.5,
        netMinor: 30000,
        grossMinor: 30000,
        netPence: 20000,
        grossPence: 20000,
      })
      .returning();
    await db.insert(creditNotes).values({
      companyId,
      invoiceId: inv.id,
      clientId,
      number: "CN-1",
      issueDate: "2026-05-11",
      reason: "Adjusted",
      netMinor: 5000,
      grossMinor: 5000,
      netPence: 3333,
      grossPence: 3333,
    });
    expect(await sumInvoicedForOrder(db as never, companyId, orderId)).toBe(25000);
    const other = (await seedCompany(db, { name: "Other Ltd", slug: "other" })).id;
    expect(await sumInvoicedForOrder(db as never, other, orderId)).toBe(0);
  });
});

describe("latestStoredRates", () => {
  it("gives the latest stored rate per currency, and 1 for sterling", async () => {
    await db.insert(fxRates).values([
      { currency: "USD", observationDate: "2026-05-01", foreignPerGbp: 1.2 },
      { currency: "USD", observationDate: "2026-05-02", foreignPerGbp: 1.3 },
    ]);
    const rates = await latestStoredRates(["usd", "GBP", "EUR"]);
    expect(Object.fromEntries(rates)).toEqual({ GBP: 1, USD: 1.3 });
  });
});
