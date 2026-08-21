/**
 * Invoice number formatting and allocation.
 * Format: `{prefix}-{YYYY}-{NNNN}` e.g. DD-2026-0001.
 * Sequence resets when the issue-date calendar year changes.
 */

export function formatInvoiceNumber(
  prefix: string,
  year: number,
  seq: number,
): string {
  const padded = String(seq).padStart(4, "0");
  return `${prefix}-${year}-${padded}`;
}

export function parseIssueYear(issueDate: string | Date | null | undefined): number {
  if (!issueDate) return new Date().getFullYear();
  if (typeof issueDate === "string") {
    const y = Number(issueDate.slice(0, 4));
    if (Number.isFinite(y) && y >= 2000) return y;
  }
  if (issueDate instanceof Date && !Number.isNaN(issueDate.getTime())) {
    return issueDate.getFullYear();
  }
  return new Date().getFullYear();
}

export interface NumberingState {
  invoiceNumberPrefix: string;
  invoiceNextSeq: number;
  invoiceSeqYear: number | null;
}

/**
 * Given current settings and the issue-date year, return the number to assign
 * and the next settings values after allocation.
 */
export function nextInvoiceNumber(
  state: NumberingState,
  year: number,
): { number: string; nextSeq: number; seqYear: number } {
  const prefix = state.invoiceNumberPrefix || "DD";
  const sameYear = state.invoiceSeqYear === year;
  const seq = sameYear ? state.invoiceNextSeq : 1;
  return {
    number: formatInvoiceNumber(prefix, year, seq),
    nextSeq: seq + 1,
    seqYear: year,
  };
}
