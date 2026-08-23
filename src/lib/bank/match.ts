/**
 * Scored bank reconciliation matcher. Exact pence is required; date window
 * and reference text only affect ranking among exact-amount candidates.
 */

export interface BankTxLike {
  amountPence: number;
  bookedAt: string;
  reference: string | null;
  description: string | null;
}

export interface MatchCandidate {
  id: string;
  amountPence: number;
  date: string;
  invoiceNumber?: string | null;
  reference?: string | null;
}

export function dateDiffDays(a: string, b: string): number {
  const ms =
    new Date(`${a}T12:00:00Z`).getTime() - new Date(`${b}T12:00:00Z`).getTime();
  return Math.round(ms / (1000 * 60 * 60 * 24));
}

const DATE_WINDOW_DAYS = 3;

export function scoreMatch(tx: BankTxLike, candidate: MatchCandidate): number {
  if (Math.abs(tx.amountPence) !== candidate.amountPence) return 0;
  const days = Math.abs(dateDiffDays(candidate.date, tx.bookedAt));
  if (days > DATE_WINDOW_DAYS) return 0;

  let score = 100 - days * 10;
  const hay = `${tx.reference ?? ""} ${tx.description ?? ""}`.toLowerCase();
  const number = candidate.invoiceNumber?.trim().toLowerCase();
  if (number && hay.includes(number)) score += 50;
  const ref = candidate.reference?.trim().toLowerCase();
  if (ref && hay.includes(ref)) score += 20;
  return score;
}

export function pickBestMatch<T extends MatchCandidate>(
  tx: BankTxLike,
  candidates: T[],
): T | null {
  let best: T | null = null;
  let bestScore = 0;
  for (const candidate of candidates) {
    const score = scoreMatch(tx, candidate);
    if (score > bestScore) {
      best = candidate;
      bestScore = score;
    }
  }
  return best;
}
