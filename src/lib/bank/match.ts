/**
 * Scored bank reconciliation matcher. Exact pence is required; date window
 * and reference/counterparty text affect ranking among exact-amount candidates.
 */

import { clientDisplayName, type ClientNameFields } from "@/lib/clients/display";
import { fuzzyBestSimilarity, fuzzyIncludes } from "@/lib/bank/fuzzy";

export interface BankTxLike {
  amountPence: number;
  bookedAt: string;
  reference: string | null;
  description: string | null;
  counterparty?: string | null;
}

export interface MatchCandidate {
  id: string;
  amountPence: number;
  date: string;
  invoiceNumber?: string | null;
  reference?: string | null;
  clientName?: string | null;
  companyName?: string | null;
}

export interface InvoiceMatchTarget extends ClientNameFields {
  id: string;
  number: string;
  balancePence: number;
  dueDate?: string | null;
  issueDate?: string | null;
}

export type MatchScoreBreakdown = {
  dateScore: number;
  invoiceRefScore: number;
  paymentRefScore: number;
  counterpartyScore: number;
  total: number;
};

export const MIN_SUGGEST_SCORE = 70;

export function dateDiffDays(a: string, b: string): number {
  const ms =
    new Date(`${a}T12:00:00Z`).getTime() - new Date(`${b}T12:00:00Z`).getTime();
  return Math.round(ms / (1000 * 60 * 60 * 24));
}

/** Hard cutoff — beyond this, dateScore is zero and the match is rejected. */
export const DATE_WINDOW_DAYS = 90;

/** Decaying date component (0–100). Closer dates score higher. */
function dateScoreForGap(days: number): number {
  if (days > DATE_WINDOW_DAYS) return 0;
  return Math.max(0, 100 - days * 2);
}

function referenceHaystack(tx: BankTxLike): string {
  return `${tx.reference ?? ""} ${tx.description ?? ""}`;
}

function counterpartyScore(tx: BankTxLike, candidate: MatchCandidate): number {
  const counterparty = tx.counterparty;
  if (!counterparty) return 0;
  return fuzzyBestSimilarity(counterparty, [
    candidate.companyName,
    candidate.clientName,
    candidate.companyName && candidate.clientName
      ? clientDisplayName({
          name: candidate.clientName,
          companyName: candidate.companyName,
        })
      : null,
  ]);
}

export function scoreMatchWithBreakdown(
  tx: BankTxLike,
  candidate: MatchCandidate,
): MatchScoreBreakdown {
  const empty: MatchScoreBreakdown = {
    dateScore: 0,
    invoiceRefScore: 0,
    paymentRefScore: 0,
    counterpartyScore: 0,
    total: 0,
  };

  if (Math.abs(tx.amountPence) !== candidate.amountPence) return empty;
  const days = Math.abs(dateDiffDays(candidate.date, tx.bookedAt));
  const dateScore = dateScoreForGap(days);
  if (dateScore === 0) return empty;
  const hay = referenceHaystack(tx);

  const invoiceRefScore = candidate.invoiceNumber
    ? fuzzyIncludes(hay, candidate.invoiceNumber)
    : 0;
  const paymentRefScore = candidate.reference
    ? fuzzyIncludes(hay, candidate.reference)
    : 0;
  const cpScore = counterpartyScore(tx, candidate);

  const total =
    dateScore +
    Math.round((invoiceRefScore / 100) * 50) +
    Math.round((paymentRefScore / 100) * 20) +
    Math.round((cpScore / 100) * 40);

  return {
    dateScore,
    invoiceRefScore,
    paymentRefScore,
    counterpartyScore: cpScore,
    total,
  };
}

export function scoreMatch(tx: BankTxLike, candidate: MatchCandidate): number {
  return scoreMatchWithBreakdown(tx, candidate).total;
}

export function pickBestMatch<T extends MatchCandidate>(
  tx: BankTxLike,
  candidates: T[],
): { candidate: T; breakdown: MatchScoreBreakdown } | null {
  let best: T | null = null;
  let bestBreakdown: MatchScoreBreakdown | null = null;
  for (const candidate of candidates) {
    const breakdown = scoreMatchWithBreakdown(tx, candidate);
    if (breakdown.total > (bestBreakdown?.total ?? 0)) {
      best = candidate;
      bestBreakdown = breakdown;
    }
  }
  if (!best || !bestBreakdown || bestBreakdown.total < MIN_SUGGEST_SCORE) {
    return null;
  }
  return { candidate: best, breakdown: bestBreakdown };
}

/** Score a bank transaction against an unpaid invoice (invoice page lookup). */
export function scoreBankTxForInvoice(
  tx: BankTxLike,
  invoice: InvoiceMatchTarget,
  referenceDate: string,
): MatchScoreBreakdown {
  if (tx.amountPence <= 0 || tx.amountPence > invoice.balancePence) {
    return {
      dateScore: 0,
      invoiceRefScore: 0,
      paymentRefScore: 0,
      counterpartyScore: 0,
      total: 0,
    };
  }

  const days = Math.abs(dateDiffDays(referenceDate, tx.bookedAt));
  const dateScore = dateScoreForGap(days);
  if (dateScore === 0) {
    return {
      dateScore: 0,
      invoiceRefScore: 0,
      paymentRefScore: 0,
      counterpartyScore: 0,
      total: 0,
    };
  }
  const hay = referenceHaystack(tx);
  const invoiceRefScore = fuzzyIncludes(hay, invoice.number);
  const cpScore = fuzzyBestSimilarity(tx.counterparty, [
    invoice.companyName,
    invoice.name,
    clientDisplayName(invoice),
  ]);

  let total =
    dateScore +
    Math.round((invoiceRefScore / 100) * 50) +
    Math.round((cpScore / 100) * 40);

  // Prefer exact balance match
  if (tx.amountPence === invoice.balancePence) {
    total += 15;
  }

  return {
    dateScore,
    invoiceRefScore,
    paymentRefScore: 0,
    counterpartyScore: cpScore,
    total,
  };
}

export function pickBestBankTxForInvoice(
  txs: BankTxLike[],
  invoice: InvoiceMatchTarget,
  referenceDate: string,
): { tx: BankTxLike; breakdown: MatchScoreBreakdown } | null {
  let best: BankTxLike | null = null;
  let bestBreakdown: MatchScoreBreakdown | null = null;
  for (const tx of txs) {
    const breakdown = scoreBankTxForInvoice(tx, invoice, referenceDate);
    if (breakdown.total > (bestBreakdown?.total ?? 0)) {
      best = tx;
      bestBreakdown = breakdown;
    }
  }
  if (!best || !bestBreakdown || bestBreakdown.total < MIN_SUGGEST_SCORE) {
    return null;
  }
  return { tx: best, breakdown: bestBreakdown };
}
