import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { aiGatewayConfigured } from "@/lib/ai/models";
import { writeAudit } from "@/lib/audit";
import { formatBankCategory } from "@/lib/bank/categories";
import { ReconciliationError, dismissMatch } from "@/lib/bank/queries";
import { countUncategorisedOutgoing, listCategorySuggestions } from "@/lib/bookkeeper/categories";
import { listAiReceiptMatches } from "@/lib/bookkeeper/receipts";
import {
  acceptCategorySuggestionsFor,
  acceptReceiptMatchFor,
  dismissCategorySuggestionsFor,
  findBookkeeperSuggestions,
} from "@/lib/bookkeeper/review";
import { requireMobileAuth } from "@/lib/mobile-auth";
import { mobileError, mobileFailure, mobileServerError } from "@/lib/mobile/respond";
import { formatGBP } from "@/lib/money";
import { ensureLocalUser } from "@/lib/users";

/** Suggestions waiting for review on the AI bookkeeper page. */
export async function GET() {
  try {
    const authz = await requireMobileAuth("accounts:read");
    if (!authz.ok) return authz.response;
    const { companyId } = authz.user;

    const [categories, receipts, uncategorised] = await Promise.all([
      listCategorySuggestions(companyId),
      listAiReceiptMatches(companyId),
      countUncategorisedOutgoing(companyId),
    ]);
    return NextResponse.json({
      success: true,
      data: {
        aiReady: aiGatewayConfigured(),
        uncategorised,
        categories: categories.map((c) => ({
          id: c.id,
          bookedAt: c.bookedAt,
          counterparty: c.counterparty,
          amountFormatted: formatGBP(-c.amountPence),
          categoryLabel: formatBankCategory(c.category),
          reason: c.reason,
          source: c.source,
        })),
        receipts: receipts.map((r) => ({
          matchId: r.matchId,
          note: r.note?.replace(/^AI:\s*/, "") ?? null,
          expenseDescription: r.expenseDescription,
          expenseAmountFormatted: formatGBP(r.expenseAmountPence),
          spentAt: r.spentAt,
          counterparty: r.counterparty,
          bankAmountFormatted: formatGBP(-r.bankAmountPence),
          bookedAt: r.bookedAt,
          amountsDiffer: -r.bankAmountPence !== r.expenseAmountPence,
        })),
      },
    });
  } catch (error) {
    return mobileServerError("Bookkeeper error", error);
  }
}

const actionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("find") }),
  z.object({ action: z.literal("accept_categories"), ids: z.array(z.string().uuid()).min(1) }),
  z.object({ action: z.literal("dismiss_categories"), ids: z.array(z.string().uuid()).min(1) }),
  z.object({
    action: z.literal("accept_receipt"),
    matchId: z.string().uuid(),
    useBankAmount: z.boolean().default(false),
  }),
  z.object({ action: z.literal("dismiss_receipt"), matchId: z.string().uuid() }),
]);

/** Accept or dismiss suggestions, or look for new ones. Same rules as the web page. */
export async function POST(request: NextRequest) {
  try {
    const authz = await requireMobileAuth("accounts:write", { checkSuspended: true });
    if (!authz.ok) return authz.response;
    const { user } = authz;

    const parsed = actionSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return mobileError("Invalid request", 400);
    const body = parsed.data;

    const ctx = { companyId: user.companyId, localUserId: await ensureLocalUser(user) };
    switch (body.action) {
      case "find": {
        const run = await findBookkeeperSuggestions(ctx);
        return NextResponse.json({ success: true, data: run });
      }
      case "accept_categories": {
        const result = await acceptCategorySuggestionsFor(ctx, body.ids);
        if (!result.ok) return mobileFailure(result);
        break;
      }
      case "dismiss_categories": {
        const result = await dismissCategorySuggestionsFor(ctx.companyId, body.ids);
        if (!result.ok) return mobileFailure(result);
        break;
      }
      case "accept_receipt": {
        const result = await acceptReceiptMatchFor(ctx.companyId, body.matchId, body.useBankAmount);
        if (!result.ok) return mobileFailure(result);
        await writeAudit({
          companyId: ctx.companyId,
          actorUserId: ctx.localUserId,
          action: "ai.accept_receipt_match",
          entityType: "reconciliation_match",
          entityId: body.matchId,
          meta: { useBankAmount: body.useBankAmount },
        });
        break;
      }
      case "dismiss_receipt": {
        try {
          await dismissMatch(ctx.companyId, body.matchId);
        } catch (e) {
          if (e instanceof ReconciliationError) return mobileError(e.message, 400);
          throw e;
        }
        await writeAudit({
          companyId: ctx.companyId,
          actorUserId: ctx.localUserId,
          action: "bank.dismiss_match",
          entityType: "reconciliation_match",
          entityId: body.matchId,
        });
        break;
      }
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    return mobileServerError("Bookkeeper action error", error);
  }
}
