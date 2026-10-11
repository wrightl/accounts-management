import { financialYearEndDate, financialYearStartDate } from "@/lib/dates";
import { addDays } from "@/lib/ledger/corporation-tax";

export type ProfitabilityPeriodKey = "fy" | "last" | "all";

export type ProfitabilityPeriod = {
  key: ProfitabilityPeriodKey;
  label: string;
  from: string | null;
  to: string | null;
};

/** This financial year (the default), last financial year, or all time. */
export function profitabilityPeriod(
  key: string | undefined,
  fyEndMonth: number,
  today: string,
): ProfitabilityPeriod {
  const start = financialYearStartDate(fyEndMonth, today);
  if (key === "all") return { key: "all", label: "All time", from: null, to: null };
  if (key === "last") {
    const lastEnd = addDays(start, -1);
    return {
      key: "last",
      label: "Last financial year",
      from: financialYearStartDate(fyEndMonth, lastEnd),
      to: lastEnd,
    };
  }
  return {
    key: "fy",
    label: "This financial year",
    from: start,
    to: financialYearEndDate(fyEndMonth, today),
  };
}
