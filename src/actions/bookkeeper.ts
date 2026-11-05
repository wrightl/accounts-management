"use server";

import { requireActionPermission } from "@/lib/auth";
import { mutate, mutateWide } from "@/lib/mutate";
import { askBookkeeperFor, type AnswerResult } from "@/lib/bookkeeper/ask";
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
  return askBookkeeperFor(
    { companyId, localUserId: authz.user.localUserId ?? null, role: authz.user.role },
    question,
  );
}
