import { isBuiltinIncomeCategory } from "@/lib/bank/income-categories";

export const CREDIT_EXPLAIN_TYPES = [
  "other_income",
  "transfer",
  "tax_or_loan",
] as const;

export type CreditExplainType = (typeof CREDIT_EXPLAIN_TYPES)[number];

export type CreditExplainInput = {
  matchType: CreditExplainType;
  incomeCategory?: string | null;
  note?: string | null;
};

export type CreditExplainParsed = {
  matchType: CreditExplainType;
  incomeCategory: string | null;
  note: string | null;
};

export function isCreditExplainType(value: string): value is CreditExplainType {
  return (CREDIT_EXPLAIN_TYPES as readonly string[]).includes(value);
}

/**
 * Validate explain-credit fields before DB writes.
 * `resolvedCategory` must already be a built-in or company catalog name
 * (or null when not other_income).
 */
export function parseCreditExplainInput(
  input: CreditExplainInput,
  resolvedCategory: string | null,
): { ok: true; value: CreditExplainParsed } | { ok: false; error: string } {
  if (!isCreditExplainType(input.matchType)) {
    return { ok: false, error: "Choose how to explain this credit" };
  }

  const note = input.note?.trim() ? input.note.trim().slice(0, 500) : null;

  if (input.matchType === "other_income") {
    if (!resolvedCategory) {
      return { ok: false, error: "Choose an income category" };
    }
    if (isBuiltinIncomeCategory(resolvedCategory) && resolvedCategory === "Other" && !note) {
      return { ok: false, error: "Add a note when the category is Other" };
    }
    return {
      ok: true,
      value: {
        matchType: "other_income",
        incomeCategory: resolvedCategory,
        note,
      },
    };
  }

  return {
    ok: true,
    value: {
      matchType: input.matchType,
      incomeCategory: null,
      note,
    },
  };
}

export function creditExplainLabel(match: {
  matchType: string;
  incomeCategory?: string | null;
  note?: string | null;
}): string {
  if (match.matchType === "other_income") {
    const cat = match.incomeCategory?.trim() || "Other income";
    const base = `Other income · ${cat}`;
    return match.note?.trim() ? `${base} — ${match.note.trim()}` : base;
  }
  if (match.matchType === "transfer") {
    return match.note?.trim() ? `Transfer — ${match.note.trim()}` : "Transfer";
  }
  if (match.matchType === "tax_or_loan") {
    return match.note?.trim()
      ? `Tax or loan — ${match.note.trim()}`
      : "Tax or loan";
  }
  return match.matchType;
}
