import "server-only";
import type Stripe from "stripe";
import { and, eq, sql, sum } from "drizzle-orm";
import { getDb } from "@/db";
import { companies, invoices, payments } from "@/db/schema";
import { writeAudit } from "@/lib/audit";
import { claimEvent, releaseEvent } from "@/lib/billing/webhook-events";
import { getStripe } from "@/lib/billing/stripe";
import { creditAdjustmentForInvoice } from "@/lib/credit-notes/adjustments";
import { isForeignDocumentCurrency, STERLING } from "@/lib/currency";
import { isInvoiceSettled, settlementMinor } from "@/lib/invoices/balance";
import { syncFxDifference } from "@/lib/invoices/fx-difference";
import { storedStatus, todayIsoDate } from "@/lib/invoices/status";
import { formatGBP, formatMoney } from "@/lib/money";
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
 * Record a completed Checkout payment against its invoice. Idempotent on the
 * Checkout session, so webhook retries never double-count. Money Stripe has
 * already taken is recorded even if the invoice changed meanwhile; an
 * overpayment then shows as a refund due on the invoice.
 *
 * Only sterling charges on sterling invoices are recorded here. Anything else
 * would need the amount in two currencies, so it is left for the company to
 * record by hand: logged, audited and notified, never stored wrongly.
 */
export async function recordOnlineInvoicePayment(params: {
  companyId: string;
  invoiceId: string;
  amountPence: number;
  /** The currency Stripe charged in (the session's `currency`). */
  currency: string;
  checkoutSessionId: string;
  paymentIntentId: string | null;
  paidAt: Date;
}): Promise<{ recorded: boolean; paymentId?: string; unsupportedCurrency?: boolean }> {
  const db = getDb();
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
    // an invoice's currency can change, and events can be replayed.
    // The charge must be in pounds, not merely "not foreign": a missing currency isn't sterling.
    if (isForeignDocumentCurrency(inv.currency) || params.currency !== STERLING) {
      return { recorded: false, unsupportedCurrency: true, inv };
    }

    const [payment] = await tx
      .insert(payments)
      .values({
        invoiceId: inv.id,
        amountPence: params.amountPence,
        // A sterling charge on a sterling invoice (checked above), so these match.
        amountMinor: params.amountPence,
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
    await syncFxDifference(tx, params.companyId, inv.id, todayIsoDate(params.paidAt));
    return { recorded: true, paymentId: payment.id, inv };
  });

  if (result.unsupportedCurrency) {
    const charged = formatMoney(params.amountPence, params.currency);
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
        amountMinor: params.amountPence,
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
        amountPence: params.amountPence,
        checkoutSessionId: params.checkoutSessionId,
      },
    });
    try {
      const { notify } = await import("@/lib/notifications");
      await notify({
        companyId: params.companyId,
        type: "invoice.paid",
        title: `Invoice ${result.inv.number} paid online`,
        body: `${formatGBP(params.amountPence)} paid by card.`,
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

  await recordOnlineInvoicePayment({
    companyId,
    invoiceId,
    amountPence: session.amount_total,
    currency: (session.currency ?? "").toUpperCase(),
    checkoutSessionId: session.id,
    paymentIntentId:
      typeof session.payment_intent === "string"
        ? session.payment_intent
        : (session.payment_intent?.id ?? null),
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
