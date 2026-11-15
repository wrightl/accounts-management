/**
 * The references people see for expenses (EXP-0001) and reimbursement runs
 * (REIMB-0001). The number is stored on the record and assigned by the
 * database when it is created; these only format and parse it.
 */

type RefPrefix = "EXP" | "REIMB";

function formatRef(prefix: RefPrefix, refNumber: number): string {
  return `${prefix}-${String(refNumber).padStart(4, "0")}`;
}

export const formatExpenseRef = (refNumber: number) => formatRef("EXP", refNumber);

export const formatReimbursementRef = (refNumber: number) => formatRef("REIMB", refNumber);

/**
 * The reference number a search means, or null when it isn't one. Accepts the
 * full reference in any case, with or without the hyphen or leading zeros, and
 * a bare number: "EXP-0197", "exp197", "0197" and "197" all give 197.
 */
export function parseRefSearch(query: string, prefix: RefPrefix): number | null {
  const match = new RegExp(`^(?:${prefix}\\s*-?\\s*)?0*([1-9][0-9]{0,8})$`, "i").exec(query.trim());
  return match ? Number(match[1]) : null;
}
