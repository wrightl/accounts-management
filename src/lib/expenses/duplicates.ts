export type DuplicateCandidate = {
  id: string;
  description: string;
  spentAt: string | null;
  amountPence: number;
  detectedCurrency: string | null;
  originalAmountMinor: number | null;
  createdAt: Date;
  /** Fingerprints of the expense's receipt files. */
  receiptHashes: string[];
};

export type PossibleDuplicate = {
  id: string;
  description: string;
  spentAt: string | null;
  amountPence: number;
  detectedCurrency: string | null;
  originalAmountMinor: number | null;
  /** The same receipt file, rather than only the same amount on the same day. */
  sameReceipt: boolean;
};

function sameSpend(a: DuplicateCandidate, b: DuplicateCandidate): boolean {
  if (!a.spentAt || a.spentAt !== b.spentAt) return false;
  if (a.amountPence > 0 && a.amountPence === b.amountPence) return true;
  return (
    a.detectedCurrency != null &&
    a.originalAmountMinor != null &&
    a.detectedCurrency.toUpperCase() === b.detectedCurrency?.toUpperCase() &&
    a.originalAmountMinor === b.originalAmountMinor
  );
}

/**
 * For each target, the other candidates that look like the same spend: the
 * same receipt file, or the same amount on the same day. Same-receipt matches
 * come first, then the oldest, which is most likely the original.
 */
export function matchDuplicates(
  targets: DuplicateCandidate[],
  candidates: DuplicateCandidate[],
): Map<string, PossibleDuplicate[]> {
  const found = new Map<string, PossibleDuplicate[]>();
  for (const target of targets) {
    const hashes = new Set(target.receiptHashes);
    const matches = candidates
      .filter((c) => c.id !== target.id)
      .map((c) => ({ c, sameReceipt: c.receiptHashes.some((h) => hashes.has(h)) }))
      .filter(({ c, sameReceipt }) => sameReceipt || sameSpend(target, c))
      .sort(
        (a, b) =>
          Number(b.sameReceipt) - Number(a.sameReceipt) ||
          a.c.createdAt.getTime() - b.c.createdAt.getTime(),
      )
      .map(({ c, sameReceipt }) => ({
        id: c.id,
        description: c.description,
        spentAt: c.spentAt,
        amountPence: c.amountPence,
        detectedCurrency: c.detectedCurrency,
        originalAmountMinor: c.originalAmountMinor,
        sameReceipt,
      }));
    if (matches.length) found.set(target.id, matches);
  }
  return found;
}
