import { estimateCorporationTax, type CorporationTaxEstimate } from "@/lib/ledger/corporation-tax";

export type ReservesYearInput = {
  /** Financial year start and end (full year, even for the current one). */
  start: string;
  end: string;
  /** Profit before tax for the year, or to date for the current year. */
  profitPence: number;
  dividendsPence: number;
  /** True for the year still in progress (profit is to date). */
  current: boolean;
};

export type ReservesYear = ReservesYearInput & {
  openingReservesPence: number;
  lossesUsedPence: number;
  taxablePence: number;
  tax: CorporationTaxEstimate;
  profitAfterTaxPence: number;
  closingReservesPence: number;
  lossesCarriedForwardPence: number;
};

/**
 * Retained earnings year by year: opening reserves, plus profit after an
 * estimated corporation tax charge, less dividends declared. Trading losses
 * are carried forward against later profits.
 *
 * This is a founder's estimate on accounting profit. It ignores capital
 * allowances, disallowable costs and the like, which the accountant adjusts.
 */
export function buildReservesSchedule(params: {
  openingReservesPence: number;
  years: ReservesYearInput[];
  associatedCompanies?: number;
}): ReservesYear[] {
  let reserves = params.openingReservesPence;
  let losses = 0;
  return params.years.map((year) => {
    const openingReservesPence = reserves;
    let lossesUsedPence = 0;
    let taxablePence = 0;
    if (year.profitPence < 0) {
      losses += -year.profitPence;
    } else {
      lossesUsedPence = Math.min(losses, year.profitPence);
      losses -= lossesUsedPence;
      taxablePence = year.profitPence - lossesUsedPence;
    }
    const tax = estimateCorporationTax({
      taxableProfitPence: taxablePence,
      periodStart: year.start,
      periodEnd: year.end,
      associatedCompanies: params.associatedCompanies,
    });
    const profitAfterTaxPence = year.profitPence - tax.taxPence;
    reserves = openingReservesPence + profitAfterTaxPence - year.dividendsPence;
    return {
      ...year,
      openingReservesPence,
      lossesUsedPence,
      taxablePence,
      tax,
      profitAfterTaxPence,
      closingReservesPence: reserves,
      lossesCarriedForwardPence: losses,
    };
  });
}
