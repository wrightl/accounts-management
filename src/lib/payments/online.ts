import "server-only";
import type Stripe from "stripe";
import { and, eq, sql, sum } from "drizzle-orm";
import { getDb } from "@/db";
import { companies, invoices, payments } from "@/db/schema";
import { writeAudit } from "@/lib/audit";
import { claimEvent, releaseEvent } from "@/lib/billing/webhook-events";
import { getStripe } from "@/lib/billing/stripe";
import { creditAdjustmentForInvoice } from "@/lib/credit-notes/adjustments";
import { STERLING, toSterlingPence } from "@/lib/currency";
import { documentRate } from "@/lib/document-rate";
import { isInvoiceSettled, settlementMinor } from "@/lib/invoices/balance";
import { syncFxDifference } from "@/lib/invoices/fx-difference";
import { storedStatus, todayIsoDate } from "@/lib/invoices/status";
import { formatDocumentAmount, formatMoney } from "@/lib/money";
import { INVOICE_PAYMENT_KIND } from "@/lib/payments/online-status";

/** Store whether the connected account can take card payments yet. */
async function setChargesEnabled(accountId: string, chargesEnabled: boolean): Promise<void> {
  const db = getDb();
  await db
    .update(companies)
    .set({ stripeConnectChargesEnabled: chargesEnabled, updatedAt: new Date() })
    .where(eq(companies.stripeConnectAccountId, accountId));
}

/** Copy the connected account's capability flags onto the company (v1 `account.updated`). */
export async function syncConnectAccount(account: Stripe.Account): Promise<void> {
  await setChargesEnabled(account.id, Boolean(account.charges_enabled));
}

/** Whether a v2 account's merchant configuration can take card payments. */
export function v2CardPaymentsActive(account: Stripe.V2.Core.Account): boolean {
  return account.configuration?.merchant?.capabilities?.card_payments?.status === "active";
}

/** Re-read the connected account from Stripe (after onboarding returns). */
export async function refreshConnectAccount(accountId: string): Promise<void> {
  const account = await getStripe().v2.core.accounts.retrieve(accountId, {
    include: ["configuration.merchant"],
  });
  await setChargesEnabled(accountId, v2CardPaymentsActive(account));
}

/**
 * The sterling Stripe settled a charge for, from the charge's balance
 * transaction on the connected account, or null when Stripe hasn't recorded it
 * yet or settles the account in another currency. Stripe's conversion fee is
 * already taken off, so it ends up in the invoice's exchange difference.
 */
export async function settledSterlingPence(
  paymentIntentId: string | null,
  stripeAccount: string,
): Promise<number | null> {
  if (!paymentIntentId) return null;
  try {
    const intent = await getStripe().paymentIntents.retrieve(
      paymentIntentId,
      { expand: ["latest_charge.balance_transaction"] },
      { stripeAccount },
    );
    const charge = intent.latest_charge;
    const balance = typeof charge === "object" ? charge?.balance_transaction : null;
    if (!balance || typeof balance !== "object") return null;
    return balance.currency.toUpperCase() === STERLING ? balance.amount : null;
  } catch (err) {
    console.warn(
      JSON.stringify({
        level: "warn",
        msg: "online_payment_balance_lookup_failed",
        paymentIntentId,
        error: err instanceof Error ? err.message : String(err),
      }),
    );
    return null;
  }
}

/**
 * Record a completed Checkout payment against its invoice. Idempotent on the
 * Checkout session, so webhook retries never double-count. Money Stripe has
 * already taken is recorded even if the invoice changed meanwhile; an
 * overpayment then shows as a refund due on the invoice.
 *
 * The charge settles the invoice in its own currency. For a foreign invoice
 * the sterling is what Stripe settled (`settledPence`), or, when Stripe hasn't
 * said yet, an estimate at the Bank of England rate for the day, flagged until
 * a bank line confirms it. A charge in a different currency from the invoice
 * isn't stored: it is logged, audited and notified for the company to record
 * by hand.
 */
export async function recordOnlineInvoicePayment(params: {
  companyId: string;
  invoiceId: string;
  /** What Stripe charged, in `currency`'s minor units. */
  amountMinor: number;
  /** The currency Stripe charged in (the session's `currency`). */
  currency: string;
  /** Sterling Stripe settled the charge for, when known. */
  settledPence?: number | null;
  checkoutSessionId: string;
  paymentIntentId: string | null;
  paidAt: Date;
}): Promise<{ recorded: boolean; paymentId?: string; unsupportedCurrency?: boolean }> {
  const db = getDb();
  const paidOn = todayIsoDate(params.paidAt);
  // Fetched before the transaction so no network call holds the invoice lock.
  let estimateRate: number | null = null;
  if (params.currency !== STERLING && params.settledPence == null) {
    const rate = await documentRate(params.currency, paidOn);
    if (rate.ok) estimateRate = rate.rate.fxRate;
  }
  const result = await db.transaction(async (tx) => {
    await tx.execute(sql`select id from invoices where id = ${params.invoiceId} for update`);
    const [inv] = await tx
      .select()
      .from(invoices)
      .where(and(eq(invoices.id, params.invoiceId), eq(invoices.companyId, params.companyId)))
      .limit(1);
    if (!inv) throw new Error(`Invoice ${params.invoiceId} not found for online payment`);

    const [existing] = await tx
      .select({ id: payments.id })
      .from(payments)
      .innerJoin(invoices, eq(invoices.id, payments.invoiceId))
      .where(
        and(
          eq(payments.stripeCheckoutSessionId, params.checkoutSessionId),
          eq(invoices.companyId, params.companyId),
        ),
      )
      .limit(1);
    if (existing) return { recorded: false, paymentId: existing.id, inv };

    // Checked here, at the money boundary, not only when Checkout was created:
    // an invoice's currency can change, and events can be replayed. A missing
    // currency matches nothing.
    if (!params.currency || params.currency !== inv.currency) {
      return { recorded: false, unsupportedCurrency: true, inv };
    }
    const sterling = params.currency === STERLING;
    const amountPence = sterling
      ? params.amountMinor
      : (params.settledPence ??
        // No settlement yet: estimate at the day's rate, or the invoice's own.
        toSterlingPence(params.amountMinor, estimateRate ?? inv.fxRate));

    const [payment] = await tx
      .insert(payments)
      .values({
        invoiceId: inv.id,
        amountPence,
        amountMinor: params.amountMinor,
        amountPenceEstimated: !sterling && params.settledPence == null,
        method: "card",
        reference: params.paymentIntentId ?? params.checkoutSessionId,
        receivedAt: params.paidAt,
        stripeCheckoutSessionId: params.checkoutSessionId,
      })
      .returning({ id: payments.id });

    const [paidRow] = await tx
      .select({ total: sum(payments.amountMinor).mapWith(Number) })
      .from(payments)
      .innerJoin(invoices, eq(invoices.id, payments.invoiceId))
      .where(and(eq(payments.invoiceId, inv.id), eq(invoices.companyId, params.companyId)));
    const settled = isInvoiceSettled(
      settlementMinor(
        inv,
        paidRow?.total ?? 0,
        await creditAdjustmentForInvoice(tx, params.companyId, inv.id),
      ),
    );
    if (settled && storedStatus(inv.status) === "sent") {
      await tx
        .update(invoices)
        .set({ status: "paid", paidAt: params.paidAt })
        .where(and(eq(invoices.id, inv.id), eq(invoices.companyId, params.companyId)));
    }
    await syncFxDifference(tx, params.companyId, inv.id, paidOn);
    return { recorded: true, paymentId: payment.id, inv, amountPence };
  });

  if (result.unsupportedCurrency) {
    const charged = formatMoney(params.amountMinor, params.currency);
    console.error(
      JSON.stringify({
        level: "error",
        msg: "online_payment_currency_unsupported",
        companyId: params.companyId,
        invoiceId: params.invoiceId,
        invoiceCurrency: result.inv.currency,
        chargedCurrency: params.currency,
        checkoutSessionId: params.checkoutSessionId,
      }),
    );
    await writeAudit({
      companyId: params.companyId,
      actorUserId: null,
      action: "payment.online_unrecorded",
      entityType: "invoice",
      entityId: params.invoiceId,
      meta: {
        reason: "currency",
        invoiceCurrency: result.inv.currency,
        chargedCurrency: params.currency,
        amountMinor: params.amountMinor,
        checkoutSessionId: params.checkoutSessionId,
      },
    });
    try {
      const { notify } = await import("@/lib/notifications");
      await notify({
        companyId: params.companyId,
        type: "invoice.paid",
        title: `Record the card payment on invoice ${result.inv.number}`,
        body: `${charged} was paid by card, but Alfa couldn't record it automatically. Check your Stripe dashboard and record it on the invoice.`,
        href: `/invoices/${params.invoiceId}`,
        entityType: "invoice",
        entityId: params.invoiceId,
      });
    } catch (err) {
      console.warn(
        JSON.stringify({
          level: "warn",
          msg: "online_payment_notify_failed",
          error: err instanceof Error ? err.message : String(err),
        }),
      );
    }
    return { recorded: false, unsupportedCurrency: true };
  }

  if (result.recorded) {
    await writeAudit({
      companyId: params.companyId,
      actorUserId: null,
      action: "payment.online",
      entityType: "payment",
      entityId: result.paymentId,
      meta: {
        invoiceId: params.invoiceId,
        amountMinor: params.amountMinor,
        currency: params.currency,
        amountPence: result.amountPence,
        checkoutSessionId: params.checkoutSessionId,
      },
    });
    try {
      const { notify } = await import("@/lib/notifications");
      await notify({
        companyId: params.companyId,
        type: "invoice.paid",
        title: `Invoice ${result.inv.number} paid online`,
        body: `${formatDocumentAmount(params.amountMinor, result.amountPence ?? params.amountMinor, params.currency)} paid by card.`,
        href: `/invoices/${params.invoiceId}`,
        entityType: "invoice",
        entityId: params.invoiceId,
      });
    } catch (err) {
      console.warn(
        JSON.stringify({
          level: "warn",
          msg: "online_payment_notify_failed",
          error: err instanceof Error ? err.message : String(err),
        }),
      );
    }
  }
  return { recorded: result.recorded, paymentId: result.paymentId };
}

async function handleCheckoutSession(
  session: Stripe.Checkout.Session,
  connectedAccountId: string | undefined,
  paidAt: Date,
): Promise<void> {
  if (session.mode !== "payment") return;
  if (session.metadata?.kind !== INVOICE_PAYMENT_KIND) return;
  if (session.payment_status !== "paid") return;

  const companyId = session.metadata.companyId;
  const invoiceId = session.metadata.invoiceId;
  if (!companyId || !invoiceId || session.amount_total == null) return;

  // Only trust metadata from the account this company actually connected.
  const db = getDb();
  const [company] = await db
    .select({ accountId: companies.stripeConnectAccountId })
    .from(companies)
    .where(eq(companies.id, companyId))
    .limit(1);
  if (!company?.accountId || company.accountId !== connectedAccountId) {
    console.warn(
      JSON.stringify({
        level: "warn",
        msg: "online_payment_account_mismatch",
        companyId,
        invoiceId,
        connectedAccountId,
      }),
    );
    return;
  }

  const currency = (session.currency ?? "").toUpperCase();
  const paymentIntentId =
    typeof session.payment_intent === "string"
      ? session.payment_intent
      : (session.payment_intent?.id ?? null);
  await recordOnlineInvoicePayment({
    companyId,
    invoiceId,
    amountMinor: session.amount_total,
    currency,
    settledPence:
      currency && currency !== STERLING
        ? await settledSterlingPence(paymentIntentId, company.accountId)
        : null,
    checkoutSessionId: session.id,
    paymentIntentId,
    paidAt,
  });
}

/** Apply one Connect event (exported for tests; signature already checked). */
export async function processConnectEvent(event: Stripe.Event): Promise<void> {
  const claimed = await claimEvent(event);
  if (!claimed) return;
  try {
    switch (event.type) {
      case "checkout.session.completed":
      case "checkout.session.async_payment_succeeded":
        await handleCheckoutSession(
          event.data.object as Stripe.Checkout.Session,
          event.account,
          new Date(event.created * 1000),
        );
        break;
      case "account.updated":
        await syncConnectAccount(event.data.object as Stripe.Account);
        break;
      default:
        break;
    }
  } catch (err) {
    await releaseEvent(event.id);
    throw err;
  }
}

export async function handleStripeConnectWebhook(
  rawBody: string,
  signature: string | null,
): Promise<{ ok: true } | { ok: false; error: string; status: number }> {
  const secret = process.env.STRIPE_CONNECT_WEBHOOK_SECRET;
  if (!secret) {
    return { ok: false, error: "Connect webhook secret not configured", status: 500 };
  }
  if (!signature) {
    return { ok: false, error: "Missing stripe-signature", status: 400 };
  }
  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(rawBody, signature, secret);
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Invalid signature",
      status: 400,
    };
  }
  await processConnectEvent(event);
  return { ok: true };
}
