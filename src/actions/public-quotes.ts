"use server";

import { redirect } from "next/navigation";
import { after } from "next/server";
import { and, eq, isNull } from "drizzle-orm";
import { getDb } from "@/db";
import { companies, quotes } from "@/db/schema";
import { writeAudit } from "@/lib/audit";
import { createOrderFromQuote } from "@/lib/orders/copy-from-quote";
import { raiseDepositInvoice, type DepositInvoice } from "@/lib/orders/deposit";
import { enqueueSendJob, processSendJob } from "@/lib/outbox";
import { createInvoiceCheckout } from "@/lib/payments/checkout";
import type { PaymentMilestoneInput } from "@/lib/quotes/payment-schedule";
import { getQuoteDetail } from "@/lib/quotes/queries";
import { canTransitionQuote } from "@/lib/quotes/transitions";
import {
  QuoteStatusConflictError,
  writeQuoteStatus,
} from "@/lib/quotes/status-write";
import { todayIsoDate } from "@/lib/invoices/status";
import { formatGBP } from "@/lib/money";
import type { QuoteStatus } from "@/lib/quotes/status";
import type { ActionResult } from "@/actions/result";
import {
  parsePublicDeclineQuoteInput,
  publicDeclineQuoteRawFromFormData,
} from "@/lib/quotes/schema";

async function loadPublicQuote(rawToken: string) {
  const db = getDb();
  const [row] = await db
    .select({
      quoteId: quotes.id,
      companyId: quotes.companyId,
      status: quotes.status,
      validUntil: quotes.validUntil,
      viewedAt: quotes.viewedAt,
      suspendedAt: companies.suspendedAt,
      createdByUserId: quotes.createdByUserId,
    })
    .from(quotes)
    .innerJoin(companies, eq(quotes.companyId, companies.id))
    .where(eq(quotes.publicToken, rawToken))
    .limit(1);

  if (!row) return null;
  if (row.suspendedAt) return { suspended: true as const };
  return { suspended: false as const, ...row };
}

export async function markPublicQuoteViewed(
  rawToken: string,
): Promise<{ ok: true } | { ok: false }> {
  const loaded = await loadPublicQuote(rawToken);
  if (!loaded || loaded.suspended) return { ok: false };
  if (loaded.viewedAt) return { ok: true };

  const db = getDb();
  await db
    .update(quotes)
    .set({ viewedAt: new Date() })
    .where(
      and(
        eq(quotes.id, loaded.quoteId),
        eq(quotes.companyId, loaded.companyId),
        isNull(quotes.viewedAt),
      ),
    );
  return { ok: true };
}

/**
 * Accept the quote and create its order. With deposit-on-accept, also raise
 * the first payment milestone as a sent invoice and send the client straight
 * to paying it: Stripe Checkout when the company takes card payments,
 * otherwise the invoice page with its bank details.
 */
export async function acceptPublicQuote(
  rawToken: string,
): Promise<ActionResult> {
  const loaded = await loadPublicQuote(rawToken);
  if (!loaded) return { ok: false, error: "Quote not found" };
  if (loaded.suspended) {
    return { ok: false, error: "This quote is no longer available" };
  }

  const status = loaded.status as QuoteStatus;
  if (!canTransitionQuote(status, "accepted")) {
    if (status === "accepted") {
      return { ok: false, error: "This quote has already been accepted" };
    }
    return { ok: false, error: "This quote cannot be accepted" };
  }

  if (loaded.validUntil && loaded.validUntil < todayIsoDate()) {
    return { ok: false, error: "This quote has expired" };
  }

  const detail = await getQuoteDetail(loaded.companyId, loaded.quoteId);
  if (!detail) return { ok: false, error: "Quote not found" };

  const milestones: PaymentMilestoneInput[] = detail.milestones.map((m) => ({
    label: m.label,
    amountPence: m.amountPence,
    percentBasisPoints: m.percentBasisPoints,
    dueDate: m.dueDate,
    dueInDays: m.dueInDays,
    position: m.position,
  }));

  const takeDeposit = detail.quote.depositOnAccept && milestones.length > 0;

  const db = getDb();
  let accepted: { orderId: string; deposit: DepositInvoice | null };
  try {
    accepted = await db.transaction(async (tx) => {
      // Status first: a concurrent accept/decline makes this throw and the
      // transaction roll back before an order exists.
      const won = await writeQuoteStatus(tx, {
        companyId: loaded.companyId,
        quoteId: loaded.quoteId,
        from: status,
        set: {
          status: "accepted",
          acceptedAt: new Date(),
          viewedAt: loaded.viewedAt ?? new Date(),
        },
      });
      if (!won) throw new QuoteStatusConflictError();
      const newOrderId = await createOrderFromQuote(
        tx,
        loaded.companyId,
        { quote: detail.quote, lines: detail.lines },
        milestones,
        loaded.createdByUserId,
      );
      const raised = takeDeposit
        ? await raiseDepositInvoice(tx, {
            companyId: loaded.companyId,
            orderId: newOrderId,
            createdByUserId: loaded.createdByUserId,
          })
        : null;
      return { orderId: newOrderId, deposit: raised };
    });
    const { orderId, deposit } = accepted;

    await writeAudit({
      companyId: loaded.companyId,
      actorUserId: null,
      action: "quote.public_accept",
      entityType: "quote",
      entityId: loaded.quoteId,
      meta: { orderId, depositInvoiceId: deposit?.invoiceId ?? null },
    });

    const { notify } = await import("@/lib/notifications");
    await notify({
      companyId: loaded.companyId,
      type: "quote.accepted",
      title: `Quote ${detail.quote.number} accepted`,
      body: deposit
        ? `A client accepted this quote via the public link. The first payment, ${formatGBP(deposit.amountPence)}, has been invoiced.`
        : "A client accepted this quote via the public link.",
      href: `/quotes/${loaded.quoteId}`,
      entityType: "quote",
      entityId: loaded.quoteId,
    });

  } catch (e) {
    if (e instanceof QuoteStatusConflictError) {
      return { ok: false, error: "This quote has already been responded to" };
    }
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Could not accept quote",
    };
  }

  if (!accepted.deposit) return { ok: true, id: accepted.orderId };
  redirect(await depositPaymentUrl(loaded.companyId, detail, accepted.deposit));
}

/**
 * Email the client a copy of the deposit invoice (after the response, so the
 * client isn't kept waiting), then work out where they pay it.
 */
async function depositPaymentUrl(
  companyId: string,
  detail: { client: { email: string | null } },
  deposit: DepositInvoice,
): Promise<string> {
  if (detail.client.email) {
    const jobId = await enqueueSendJob("invoice_send", companyId, deposit.invoiceId);
    after(async () => {
      await processSendJob(jobId);
    });
  }

  const invoicePage = `/i/${encodeURIComponent(deposit.publicToken)}?accepted=1`;
  try {
    const checkout = await createInvoiceCheckout(deposit.publicToken);
    // Without card payments (or if Stripe is down) the invoice page shows
    // the bank details instead.
    return checkout.ok ? checkout.url : invoicePage;
  } catch (e) {
    console.error("Deposit checkout failed", e);
    return invoicePage;
  }
}

export async function declinePublicQuote(
  rawToken: string,
  formData: FormData,
): Promise<ActionResult> {
  const loaded = await loadPublicQuote(rawToken);
  if (!loaded) return { ok: false, error: "Quote not found" };
  if (loaded.suspended) {
    return { ok: false, error: "This quote is no longer available" };
  }

  const status = loaded.status as QuoteStatus;
  if (!canTransitionQuote(status, "declined")) {
    if (status === "declined") {
      return { ok: false, error: "This quote has already been declined" };
    }
    return { ok: false, error: "This quote cannot be declined" };
  }

  const parsed = parsePublicDeclineQuoteInput(
    publicDeclineQuoteRawFromFormData(formData),
  );
  if (!parsed.ok) {
    return {
      ok: false,
      error: parsed.error,
      fieldErrors: parsed.fieldErrors,
    };
  }

  const narrative =
    parsed.data.narrative?.trim() || "Declined by client via public link";

  const won = await writeQuoteStatus(getDb(), {
    companyId: loaded.companyId,
    quoteId: loaded.quoteId,
    from: status,
    set: {
      status: "declined",
      declinedReasonCategory: "Client declined",
      declinedReasonNarrative: narrative,
      declinedAt: new Date(),
      viewedAt: loaded.viewedAt ?? new Date(),
    },
  });
  if (!won) {
    return { ok: false, error: "This quote has already been responded to" };
  }

  await writeAudit({
    companyId: loaded.companyId,
    actorUserId: null,
    action: "quote.public_decline",
    entityType: "quote",
    entityId: loaded.quoteId,
  });

  const { notify } = await import("@/lib/notifications");
  await notify({
    companyId: loaded.companyId,
    type: "quote.declined",
    title: "Quote declined",
    body: "A client declined a quote via the public link.",
    href: `/quotes/${loaded.quoteId}`,
    entityType: "quote",
    entityId: loaded.quoteId,
  });

  return { ok: true, id: loaded.quoteId };
}
