import { formatBankCategory } from "@/lib/bank/categories";

/**
 * A stable key for a payee across statement lines, e.g. "ADOBE *CREATIVE 4412"
 * and "Adobe Creative Cloud" both become "adobe creative".
 */
export function payeeKey(counterparty: string | null | undefined): string | null {
  const words = (counterparty ?? "")
    .toLowerCase()
    .replace(/[^a-z\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 2);
  return words.length ? words.slice(0, 2).join(" ") : null;
}

export type LearnedCategory = { category: string; count: number; total: number };

/**
 * What each payee has been categorised as before. Every category someone
 * sets or corrects becomes part of this history.
 */
export function learnCategories(
  rows: Array<{ counterparty: string | null; spendingCategory: string | null }>,
): Map<string, LearnedCategory> {
  const counts = new Map<string, Map<string, number>>();
  for (const row of rows) {
    const key = payeeKey(row.counterparty);
    if (!key || !row.spendingCategory) continue;
    const byCategory = counts.get(key) ?? new Map<string, number>();
    byCategory.set(row.spendingCategory, (byCategory.get(row.spendingCategory) ?? 0) + 1);
    counts.set(key, byCategory);
  }
  const learned = new Map<string, LearnedCategory>();
  for (const [key, byCategory] of counts) {
    const total = [...byCategory.values()].reduce((t, n) => t + n, 0);
    const [category, count] = [...byCategory.entries()].sort((a, b) => b[1] - a[1])[0]!;
    learned.set(key, { category, count, total });
  }
  return learned;
}

/** A suggestion from history, when the payee is consistently categorised. */
export function suggestFromHistory(
  counterparty: string | null,
  learned: Map<string, LearnedCategory>,
): { category: string; reason: string } | null {
  const key = payeeKey(counterparty);
  const hit = key ? learned.get(key) : undefined;
  if (!hit || hit.count / hit.total < 0.75) return null;
  const payments = hit.count === 1 ? "an earlier payment" : `${hit.count} earlier payments`;
  return {
    category: hit.category,
    reason: `You put ${payments} to ${counterparty?.trim() || "this payee"} in ${formatBankCategory(hit.category)}.`,
  };
}
