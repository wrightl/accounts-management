import "server-only";
import type Stripe from "stripe";
import { and, eq, sql, sum } from "drizzle-orm";
import { getDb } from "@/db";
import { companies, invoices, payments } from "@/db/schema";
import { writeAudit } from "@/lib/audit";
import { claimEvent, releaseEvent } from "@/lib/billing/webhook-events";
import { getStripe } from "@/lib/billing/stripe";
import { creditAdjustmentForInvoice } from "@/lib/credit-notes/adjustments";
import { isInvoiceSettled } from "@/lib/invoices/balance";
import { storedStatus } from "@/lib/invoices/status";
import { formatGBP } from "@/lib/money";
import { INVOICE_PAYMENT_KIND } from "@/lib/payments/online-status";

/** Copy the connected account's capability flags onto the company. */
export async function syncConnectAccount(account: Stripe.Account): Promise<void> {
  const db = getDb();
  await db
    .update(companies)
    .set({ stripeConnectChargesEnabled: Boolean(account.charges_enabled), updatedAt: new Date() })
    .where(eq(companies.stripeConnectAccountId, account.id));
}

/** Re-read the connected account from Stripe (after onboarding returns). */
export async function refreshConnectAccount(accountId: string): Promise<void> {
  const account = await getStripe().accounts.retrieve(accountId);
  await syncConnectAccount(account);
}

/**
 * Record a completed Checkout payment against its invoice. Idempotent on the
 * Checkout session, so webhook retries never double-count. Money Stripe has
 * already taken is always recorded, even if the invoice changed meanwhile;
 * an overpayment then shows as a refund due on the invoice.
 */
export async function recordOnlineInvoicePayment(params: {
  companyId: string;
  invoiceId: string;
  amountPence: number;
  checkoutSessionId: string;
  paymentIntentId: string | null;
  paidAt: Date;
}): Promise<{ recorded: boolean; paymentId?: string }> {
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
      .where(eq(payments.stripeCheckoutSessionId, params.checkoutSessionId))
      .limit(1);
    if (existing) return { recorded: false, paymentId: existing.id, inv };

    const [payment] = await tx
      .insert(payments)
      .values({
        invoiceId: inv.id,
        amountPence: params.amountPence,
        method: "card",
        reference: params.paymentIntentId ?? params.checkoutSessionId,
        receivedAt: params.paidAt,
        stripeCheckoutSessionId: params.checkoutSessionId,
      })
      .returning({ id: payments.id });

    const [paidRow] = await tx
      .select({ total: sum(payments.amountPence).mapWith(Number) })
      .from(payments)
      .where(eq(payments.invoiceId, inv.id));
    const settled = isInvoiceSettled({
      grossPence: inv.grossPence,
      paidPence: paidRow?.total ?? 0,
      ...(await creditAdjustmentForInvoice(tx, inv.id)),
    });
    if (settled && storedStatus(inv.status) === "sent") {
      await tx
        .update(invoices)
        .set({ status: "paid", paidAt: params.paidAt })
        .where(eq(invoices.id, inv.id));
    }
    return { recorded: true, paymentId: payment.id, inv };
  });

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
