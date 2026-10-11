import { S455_RATE, addMonths } from "@/lib/ledger/corporation-tax";

/** Overdrawn loans above this are a benefit in kind for the director. */
export const BENEFIT_IN_KIND_THRESHOLD_PENCE = 1_000_000;

export type DirectorLoanWarning =
  | {
      /** Overdrawn at the last year end and not yet repaid. */
      kind: "s455_due";
      yearEnd: string;
      repayBy: string;
      outstandingPence: number;
      taxPence: number;
    }
  | {
      /** Overdrawn now; s455 applies if still overdrawn after this year end. */
      kind: "overdrawn";
      yearEnd: string;
      repayBy: string;
      overdrawnPence: number;
      taxPence: number;
    }
  | { kind: "benefit_in_kind"; overdrawnPence: number };

/** Date by which an overdrawn balance must be repaid to avoid s455. */
export function s455RepayBy(yearEnd: string): string {
  return addMonths(yearEnd, 9);
}

/**
 * Warnings for one director's loan account. Balances are positive when the
 * company owes the director, negative when the director owes the company.
 */
export function directorLoanWarnings(params: {
  balancePence: number;
  /** Balance at the last completed year end, when there is one. */
  lastYearEnd: string | null;
  balanceAtLastYearEndPence: number;
  currentYearEnd: string;
  today: string;
}): DirectorLoanWarning[] {
  const warnings: DirectorLoanWarning[] = [];
  const overdrawnNow = Math.max(0, -params.balancePence);

  if (params.lastYearEnd && params.balanceAtLastYearEndPence < 0) {
    const repayBy = s455RepayBy(params.lastYearEnd);
    // Repayments since the year end reduce what is still caught.
    const outstanding = Math.min(-params.balanceAtLastYearEndPence, overdrawnNow);
    if (params.today <= repayBy && outstanding > 0) {
      warnings.push({
        kind: "s455_due",
        yearEnd: params.lastYearEnd,
        repayBy,
        outstandingPence: outstanding,
        taxPence: Math.round(outstanding * S455_RATE),
      });
    }
  }

  if (overdrawnNow > 0) {
    warnings.push({
      kind: "overdrawn",
      yearEnd: params.currentYearEnd,
      repayBy: s455RepayBy(params.currentYearEnd),
      overdrawnPence: overdrawnNow,
      taxPence: Math.round(overdrawnNow * S455_RATE),
    });
  }
  if (overdrawnNow > BENEFIT_IN_KIND_THRESHOLD_PENCE) {
    warnings.push({ kind: "benefit_in_kind", overdrawnPence: overdrawnNow });
  }
  return warnings;
}
