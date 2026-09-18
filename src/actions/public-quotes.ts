"use server";

import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { companies, quotes } from "@/db/schema";
import { writeAudit } from "@/lib/audit";
import { createOrderFromQuote } from "@/lib/orders/copy-from-quote";
import type { PaymentMilestoneInput } from "@/lib/quotes/payment-schedule";
import { getQuoteDetail } from "@/lib/quotes/queries";
import { canTransitionQuote } from "@/lib/quotes/transitions";
import { todayIsoDate } from "@/lib/invoices/status";
import type { QuoteStatus } from "@/lib/quotes/status";
import type { ActionResult } from "@/actions/result";

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

const declineSchema = z.object({
  narrative: z.string().trim().max(2000).optional().or(z.literal("")),
});

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

  const db = getDb();
  try {
    const orderId = await db.transaction(async (tx) => {
      const id = await createOrderFromQuote(
        tx,
        loaded.companyId,
        { quote: detail.quote, lines: detail.lines },
        milestones,
        loaded.createdByUserId,
      );
      await tx
        .update(quotes)
        .set({
          status: "accepted",
          acceptedAt: new Date(),
          viewedAt: loaded.viewedAt ?? new Date(),
        })
        .where(
          and(
            eq(quotes.id, loaded.quoteId),
            eq(quotes.companyId, loaded.companyId),
          ),
        );
      return id;
    });

    await writeAudit({
      companyId: loaded.companyId,
      actorUserId: null,
      action: "quote.public_accept",
      entityType: "quote",
      entityId: loaded.quoteId,
      meta: { orderId },
    });

    return { ok: true, id: orderId };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Could not accept quote",
    };
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

  const parsed = declineSchema.safeParse({
    narrative: formData.get("narrative") ?? "",
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const narrative =
    parsed.data.narrative?.trim() || "Declined by client via public link";

  const db = getDb();
  await db
    .update(quotes)
    .set({
      status: "declined",
      declinedReasonCategory: "Client declined",
      declinedReasonNarrative: narrative,
      declinedAt: new Date(),
      viewedAt: loaded.viewedAt ?? new Date(),
    })
    .where(
      and(eq(quotes.id, loaded.quoteId), eq(quotes.companyId, loaded.companyId)),
    );

  await writeAudit({
    companyId: loaded.companyId,
    actorUserId: null,
    action: "quote.public_decline",
    entityType: "quote",
    entityId: loaded.quoteId,
  });

  return { ok: true, id: loaded.quoteId };
}
