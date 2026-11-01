/**
 * Invoice / quote number formatting and parsing.
 * Format: `{prefix}-{YYYY}-{NNNN}` e.g. DD-2026-0001, Q-2026-0001.
 * Each issue-date calendar year has its own series; see allocate.ts.
 */

import { todayIsoDate } from "@/lib/dates";

export function formatInvoiceNumber(
  prefix: string,
  year: number,
  seq: number,
): string {
  const padded = String(seq).padStart(4, "0");
  return `${prefix}-${year}-${padded}`;
}

export function parseIssueYear(issueDate: string | Date | null | undefined): number {
  if (!issueDate) return Number(todayIsoDate().slice(0, 4));
  if (typeof issueDate === "string") {
    const y = Number(issueDate.slice(0, 4));
    if (Number.isFinite(y) && y >= 2000) return y;
  }
  if (issueDate instanceof Date && !Number.isNaN(issueDate.getTime())) {
    return Number(todayIsoDate(issueDate).slice(0, 4));
  }
  return Number(todayIsoDate().slice(0, 4));
}

/**
 * Highest sequence per year among numbers in `{prefix}-{YYYY}-{N}` format.
 * Numbers in any other format are ignored.
 */
export function highestSeqByYear(
  prefix: string,
  numbers: string[],
): Map<number, number> {
  const re = new RegExp(`^${escapeRegExp(prefix)}-(\\d{4})-(\\d{1,9})$`, "i");
  const highest = new Map<number, number>();
  for (const num of numbers) {
    const m = re.exec(num.trim());
    if (!m) continue;
    const year = Number(m[1]);
    const seq = Number(m[2]);
    if (seq > (highest.get(year) ?? 0)) highest.set(year, seq);
  }
  return highest;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
