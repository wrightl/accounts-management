import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type Stripe from "stripe";
import { eq } from "drizzle-orm";
import { createTestDb, type TestDatabase } from "@/db/pglite";
import { setTestDb, type Database } from "@/db";
import { and } from "drizzle-orm";
import { auditLog, clients, companies, invoices, invoiceWriteOffs, payments } from "@/db/schema";
import { resetFxFetchBackoff } from "@/lib/bank/fx";
import { seedCompany } from "@/lib/test/seed-company";
import { getPublicInvoiceByToken } from "@/lib/invoices/public-queries";
import { getInvoiceDetail } from "@/lib/invoices/queries";
import { syncFxDifference } from "@/lib/invoices/fx-difference";
import { processConnectEvent } from "@/lib/payments/online";
import {
  markPublicInvoiceViewed,
  startInvoiceCheckout,
} from "@/actions/public-invoices";

const createSession = vi.fn();
const retrieveIntent = vi.fn();

vi.mock("server-only", () => ({}));
vi.mock("@/lib/invoices/fx-difference", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/invoices/fx-difference")>();
  // Pass-through spy: every payment path must keep exchange differences in step.
  return { ...actual, syncFxDifference: vi.fn(actual.syncFxDifference) };
});
vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
  unstable_cache: <T,>(fn: T) => fn,
}));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw Object.assign(new Error("NEXT_REDIRECT"), { url });
  }),
}));
vi.mock("@/lib/billing/stripe", () => ({
  getStripe: () => ({
    checkout: { sessions: { create: createSession } },
    paymentIntents: { retrieve: retrieveIntent },
  }),
  appBaseUrl: () => "http://localhost:3001",
}));

let ctx: Awaited<ReturnType<typeof createTestDb>>;
let db: TestDatabase;
let companyId: string;
let invoiceId: string;
let token: string;

const ACCOUNT = "acct_test_123";

beforeEach(async () => {
  ctx = await createTestDb();
  db = ctx.db;
  setTestDb(db as unknown as Database);
  const company = await seedCompany(db, {
    stripeConnectAccountId: ACCOUNT,
    stripeConnectChargesEnabled: true,
    sortCode: "04-00-04",
    accountNumber: "12345678",
  });
  companyId = company.id;
  const [client] = await db
    .insert(clients)
    .values({ companyId, name: "Acme", email: "ap@acme.test" })
    .returning();
  const [inv] = await db
    .insert(invoices)
    .values({
      companyId,
      number: "DD-2026-0001",
      clientId: client.id,
      status: "sent",
      issueDate: "2026-03-01",
      dueDate: "2026-03-15",
      netPence: 100000,
      vatPence: 20000,
      grossPence: 120000,
    })
    .returning();
  invoiceId = inv.id;
  token = inv.publicToken;
  createSession.mockReset();
  retrieveIntent.mockReset();
  resetFxFetchBackoff();
  // Rates come from the invoice when the Bank of England can't be reached.
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("no network in tests")));
  createSession.mockResolvedValue({ id: "cs_test_1", url: "https://checkout.stripe.com/c/cs_test_1" });
});

afterEach(async () => {
  vi.unstubAllGlobals();
  setTestDb(null);
  await ctx.client.close();
});

function checkoutEvent(overrides: {
  id?: string;
  sessionId?: string;
  account?: string;
  amount?: number;
  invoiceId?: string;
  currency?: string;
} = {}): Stripe.Event {
  return {
    id: overrides.id ?? "evt_1",
    type: "checkout.session.completed",
    account: overrides.account ?? ACCOUNT,
    created: Math.floor(new Date("2026-03-20T10:00:00Z").getTime() / 1000),
    data: {
      object: {
        id: overrides.sessionId ?? "cs_test_1",
        object: "checkout.session",
        mode: "payment",
        payment_status: "paid",
        amount_total: overrides.amount ?? 120000,
        currency: overrides.currency ?? "gbp",
        payment_intent: "pi_test_1",
        created: Math.floor(new Date("2026-03-20T09:55:00Z").getTime() / 1000),
        metadata: {
          kind: "invoice_payment",
          companyId,
          invoiceId: overrides.invoiceId ?? invoiceId,
        },
      },
    },
  } as unknown as Stripe.Event;
}

async function paymentRows() {
  return db.select().from(payments).where(eq(payments.invoiceId, invoiceId));
}

describe("public invoice page data", () => {
  it("gives every invoice a unique unguessable token", async () => {
    expect(token).toMatch(/^[0-9a-f]{64}$/);
    const data = await getPublicInvoiceByToken(token);
    expect(data && !data.suspended && data.detail.invoice.number).toBe("DD-2026-0001");
    expect(data && !data.suspended && data.company.onlinePayments).toBe("enabled");
  });

  it("never exposes drafts or unknown tokens", async () => {
    await db.update(invoices).set({ status: "draft" }).where(eq(invoices.id, invoiceId));
    expect(await getPublicInvoiceByToken(token)).toBeNull();
    expect(await getPublicInvoiceByToken("not-a-token")).toBeNull();
  });

  it("records the first view only", async () => {
    await markPublicInvoiceViewed(token);
    const [first] = await db.select().from(invoices).where(eq(invoices.id, invoiceId));
    expect(first.viewedAt).not.toBeNull();
    await markPublicInvoiceViewed(token);
    const [second] = await db.select().from(invoices).where(eq(invoices.id, invoiceId));
    expect(second.viewedAt?.getTime()).toBe(first.viewedAt?.getTime());
  });
});

describe("startInvoiceCheckout", () => {
  it("creates Checkout on the connected account for the amount still due", async () => {
    await db.insert(payments).values({ invoiceId, amountPence: 20000 });

    await expect(startInvoiceCheckout(token)).rejects.toMatchObject({
      url: "https://checkout.stripe.com/c/cs_test_1",
    });

    expect(createSession).toHaveBeenCalledTimes(1);
    const [params, options] = createSession.mock.calls[0]!;
    expect(options).toEqual({ stripeAccount: ACCOUNT });
    expect(params.mode).toBe("payment");
    expect(params.payment_method_types).toEqual(["card"]);
    expect(params.line_items[0].price_data.unit_amount).toBe(100000);
    expect(params.line_items[0].price_data.currency).toBe("gbp");
    expect(params.metadata).toMatchObject({ kind: "invoice_payment", companyId, invoiceId });
    expect(params.customer_email).toBe("ap@acme.test");
    expect(params.success_url).toContain(`/i/${token}?payment=success`);
    // No platform fee.
    expect(params.payment_intent_data.application_fee_amount).toBeUndefined();
  });

  it("charges a foreign invoice in its own currency", async () => {
    await usdInvoice();
    await expect(startInvoiceCheckout(token)).rejects.toMatchObject({
      url: "https://checkout.stripe.com/c/cs_test_1",
    });
    const [params] = createSession.mock.calls[0]!;
    expect(params.line_items[0].price_data).toMatchObject({ currency: "usd", unit_amount: 150000 });
  });

  it("refuses when the company hasn't finished Stripe setup", async () => {
    await db
      .update(companies)
      .set({ stripeConnectChargesEnabled: false })
      .where(eq(companies.id, companyId));
    const result = await startInvoiceCheckout(token);
    expect(result.ok).toBe(false);
    expect(createSession).not.toHaveBeenCalled();
  });

  it("refuses when nothing is left to pay", async () => {
    await db.insert(payments).values({ invoiceId, amountPence: 120000 });
    await db.update(invoices).set({ status: "paid" }).where(eq(invoices.id, invoiceId));
    const result = await startInvoiceCheckout(token);
    expect(result.ok).toBe(false);
    expect(createSession).not.toHaveBeenCalled();
  });
});

/** Make the test invoice a $1,500 invoice booked at 1.25, so £1,200 in the books. */
async function usdInvoice() {
  await db
    .update(invoices)
    .set({
      currency: "USD",
      fxRate: 1.25,
      fxRateSource: "boe",
      netMinor: 125000,
      vatMinor: 25000,
      grossMinor: 150000,
    })
    .where(eq(invoices.id, invoiceId));
}

async function fxDifference() {
  const [row] = await db
    .select({ amountPence: invoiceWriteOffs.amountPence })
    .from(invoiceWriteOffs)
    .where(
      and(eq(invoiceWriteOffs.invoiceId, invoiceId), eq(invoiceWriteOffs.kind, "fx_difference")),
    );
  return row?.amountPence ?? null;
}

describe("Connect webhook, foreign currency", () => {
  it("records the dollars charged and the pounds Stripe settled", async () => {
    await usdInvoice();
    retrieveIntent.mockResolvedValue({
      latest_charge: { balance_transaction: { currency: "gbp", amount: 118000 } },
    });

    await processConnectEvent(checkoutEvent({ id: "evt_usd", currency: "usd", amount: 150000 }));

    expect(retrieveIntent).toHaveBeenCalledWith(
      "pi_test_1",
      { expand: ["latest_charge.balance_transaction"] },
      { stripeAccount: ACCOUNT },
    );
    const [row] = await paymentRows();
    expect(row).toMatchObject({ amountMinor: 150000, amountPence: 118000, amountPenceEstimated: false });
    const detail = await getInvoiceDetail(companyId, invoiceId);
    expect(detail?.invoice.status).toBe("paid");
    // Booked at £1,200, settled £1,180: Stripe's conversion is a £20 loss.
    expect(await fxDifference()).toBe(2000);
  });

  it("estimates the pounds, flagged, when Stripe hasn't settled the charge yet", async () => {
    await usdInvoice();
    retrieveIntent.mockResolvedValue({ latest_charge: { balance_transaction: null } });

    await processConnectEvent(checkoutEvent({ id: "evt_usd_2", currency: "usd", amount: 150000 }));

    const [row] = await paymentRows();
    // No Bank of England rate to hand, so the invoice's own.
    expect(row).toMatchObject({ amountMinor: 150000, amountPence: 120000, amountPenceEstimated: true });
  });
});

describe("Connect webhook", () => {
  it("records the card payment and marks the invoice paid", async () => {
    await processConnectEvent(checkoutEvent());

    const rows = await paymentRows();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      amountPence: 120000,
      method: "card",
      reference: "pi_test_1",
      stripeCheckoutSessionId: "cs_test_1",
    });
    expect(rows[0]!.receivedAt.toISOString()).toBe("2026-03-20T10:00:00.000Z");

    const detail = await getInvoiceDetail(companyId, invoiceId);
    expect(detail?.invoice.status).toBe("paid");
    expect(detail?.balanceMinor).toBe(0);
    expect(syncFxDifference).toHaveBeenCalledWith(
      expect.anything(),
      companyId,
      invoiceId,
      "2026-03-20",
    );
  });

  it("doesn't record a charge on a foreign-currency invoice, and says so", async () => {
    // The invoice became a dollar invoice after Checkout started (or the event is replayed).
    await db
      .update(invoices)
      .set({ currency: "USD", fxRate: 1.25, netMinor: 150000, grossMinor: 150000 })
      .where(eq(invoices.id, invoiceId));

    await processConnectEvent(checkoutEvent({ id: "evt_usd_invoice" }));

    expect(await paymentRows()).toHaveLength(0);
    const detail = await getInvoiceDetail(companyId, invoiceId);
    expect(detail?.invoice.status).not.toBe("paid");
    const [audit] = await db
      .select()
      .from(auditLog)
      .where(eq(auditLog.action, "payment.online_unrecorded"));
    expect(audit).toMatchObject({ companyId, entityId: invoiceId });
    expect(audit.meta).toMatchObject({ invoiceCurrency: "USD", chargedCurrency: "GBP" });
  });

  it("doesn't record a charge in another currency on a sterling invoice", async () => {
    await processConnectEvent(checkoutEvent({ id: "evt_usd_charge", currency: "usd" }));
    expect(await paymentRows()).toHaveLength(0);
    expect(syncFxDifference).not.toHaveBeenCalledWith(
      expect.anything(),
      companyId,
      invoiceId,
      expect.anything(),
    );
  });

  it("never records the same Checkout session twice", async () => {
    await processConnectEvent(checkoutEvent({ id: "evt_1" }));
    await processConnectEvent(checkoutEvent({ id: "evt_1" }));
    // A different event for the same session (e.g. async success) is also ignored.
    await processConnectEvent(checkoutEvent({ id: "evt_2" }));
    expect(await paymentRows()).toHaveLength(1);
  });

  it("ignores payments from an account the company didn't connect", async () => {
    await processConnectEvent(checkoutEvent({ account: "acct_someone_else" }));
    expect(await paymentRows()).toHaveLength(0);
  });

  it("keeps a part-paid invoice open", async () => {
    await processConnectEvent(checkoutEvent({ amount: 50000 }));
    const detail = await getInvoiceDetail(companyId, invoiceId);
    expect(detail?.invoice.status).toBe("overdue");
    expect(detail?.balanceMinor).toBe(70000);
  });

  it("syncs charges_enabled from account.updated", async () => {
    await processConnectEvent({
      id: "evt_acct",
      type: "account.updated",
      account: ACCOUNT,
      created: 0,
      data: { object: { id: ACCOUNT, object: "account", charges_enabled: false } },
    } as unknown as Stripe.Event);
    const [company] = await db.select().from(companies).where(eq(companies.id, companyId));
    expect(company.stripeConnectChargesEnabled).toBe(false);
  });
});
