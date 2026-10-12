/** Everything the board minutes and dividend vouchers print. */
export type DividendPaperwork = {
  company: {
    legalName: string;
    companyNumber: string | null;
    registeredOffice: string | null;
    directors: string[];
  };
  declaration: {
    id: string;
    declaredAt: string;
    totalPence: number;
    notes: string | null;
    availableReservesPence: number | null;
    overReservesConfirmed: boolean;
    /** Shares in issue at declaration; null when older payouts lack holdings. */
    totalShares: number | null;
  };
  payouts: Array<{
    id: string;
    shareholderName: string;
    shareCount: number | null;
    amountPence: number;
  }>;
};

const perShareFormat = new Intl.NumberFormat("en-GB", {
  style: "currency",
  currency: "GBP",
  minimumFractionDigits: 2,
  maximumFractionDigits: 4,
});

/** The dividend per share, e.g. "£12.50" or "£0.3333". Null without holdings. */
export function dividendPerShareLabel(totalPence: number, totalShares: number | null): string | null {
  if (!totalShares || totalShares <= 0) return null;
  return perShareFormat.format(totalPence / totalShares / 100);
}

/** Shares in issue across the payouts, or null if any payout lacks a holding. */
export function totalSharesFromPayouts(payouts: Array<{ shareCount: number | null }>): number | null {
  if (!payouts.length || payouts.some((p) => p.shareCount == null)) return null;
  return payouts.reduce((t, p) => t + (p.shareCount ?? 0), 0);
}

/** File name for the combined minutes and vouchers PDF. */
export function dividendPaperworkFilename(declaredAt: string): string {
  return `dividend-${declaredAt}-minutes-and-vouchers.pdf`;
}
