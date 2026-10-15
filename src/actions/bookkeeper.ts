"use server";

import { writeAudit } from "@/lib/audit";
import { requireActionPermission } from "@/lib/auth";
import { mutate, mutateWide } from "@/lib/mutate";
import { aiGatewayConfigured } from "@/lib/ai/models";
import {
  DAILY_QUESTION_LIMIT,
  QUESTION_MAX_LENGTH,
  answerQuestion,
  questionsAskedToday,
  type AnswerResult,
} from "@/lib/bookkeeper/ask";
import {
  acceptCategorySuggestionsFor,
  acceptReceiptMatchFor,
  dismissCategorySuggestionsFor,
  findBookkeeperSuggestions,
} from "@/lib/bookkeeper/review";
import type { ActionResult } from "@/actions/result";

const PATHS = ["/bookkeeper", "/transactions", "/spending"];

export async function runBookkeeperSuggestions(): Promise<
  ActionResult & {
    categories?: { fromHistory: number; fromAi: number };
    receipts?: number;
    aiUnavailable?: boolean;
  }
> {
  return mutateWide("accounts:write", findBookkeeperSuggestions, { paths: PATHS });
}

/** Accept category suggestions: each becomes the row's category (and teaches future ones). */
export async function acceptCategorySuggestions(ids: string[]): Promise<ActionResult> {
  return mutate("accounts:write", (ctx) => acceptCategorySuggestionsFor(ctx, ids), {
    paths: PATHS,
  });
}

/** Dismiss suggestions; those rows won't be suggested again. */
export async function dismissCategorySuggestions(ids: string[]): Promise<ActionResult> {
  return mutate(
    "accounts:write",
    ({ companyId }) => dismissCategorySuggestionsFor(companyId, ids),
    { paths: PATHS },
  );
}

/**
 * Accept an AI receipt match. With `useBankAmount`, the expense takes the
 * amount the bank actually charged (VAT is recalculated at its rate).
 */
export async function acceptReceiptMatch(
  matchId: string,
  useBankAmount: boolean,
): Promise<ActionResult> {
  return mutate(
    "accounts:write",
    ({ companyId }) => acceptReceiptMatchFor(companyId, matchId, useBankAmount),
    {
      audit: {
        action: "ai.accept_receipt_match",
        entityType: "reconciliation_match",
        meta: { useBankAmount },
      },
      paths: [...PATHS, "/expenses"],
    },
  );
}

/** Answer a question about the books. Read-only; limited per company per day. */
export async function askBookkeeper(question: string): Promise<AnswerResult> {
  const authz = await requireActionPermission("reports:read");
  if (!authz.ok) return authz;
  const companyId = authz.user.companyId;
  if (!companyId) return { ok: false, error: "Complete onboarding first." };
  const trimmed = question.trim();
  if (trimmed.length < 3) return { ok: false, error: "Type a question first." };
  if (trimmed.length > QUESTION_MAX_LENGTH) {
    return { ok: false, error: `Keep questions under ${QUESTION_MAX_LENGTH} characters.` };
  }
  if (!aiGatewayConfigured()) {
    return { ok: false, error: "AI isn't set up on this deployment yet." };
  }
  if ((await questionsAskedToday(companyId)) >= DAILY_QUESTION_LIMIT) {
    return {
      ok: false,
      error: `Your company has asked ${DAILY_QUESTION_LIMIT} questions today. Try again tomorrow.`,
    };
  }

  let result: AnswerResult;
  // Only `ai.ask` counts towards the daily limit, so a failed call to the model
  // doesn't use up one of the company's questions.
  let action = "ai.ask";
  try {
    result = await answerQuestion(companyId, trimmed);
  } catch (e) {
    console.error("[bookkeeper] answer failed", e);
    action = "ai.ask_failed";
    result = { ok: false, error: "Couldn't answer that just now. Try again in a moment." };
  }
  await writeAudit({
    companyId,
    actorUserId: authz.user.localUserId ?? null,
    action,
    meta: { question: trimmed, ok: result.ok, sources: result.ok ? result.sources : [] },
  });
  return result;
}
