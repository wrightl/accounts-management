/**
 * Whether reports should mention VAT. A company that isn't registered sees it
 * only when documents in the period still record some, such as from before it
 * deregistered.
 */
export function shouldShowVat(params: {
  vatRegistered: boolean;
  hasVatOnDocuments: boolean;
}): boolean {
  return params.vatRegistered || params.hasVatOnDocuments;
}

/**
 * True when any document in the period records VAT. Uses the separate totals,
 * since sales VAT net of credit notes can be zero while both carry VAT.
 */
export function hasVatOnDocuments(params: {
  salesVatPence: number;
  creditNoteVatPence: number;
  purchaseVatPence: number;
}): boolean {
  return (
    params.salesVatPence !== 0 ||
    params.creditNoteVatPence !== 0 ||
    params.purchaseVatPence !== 0
  );
}

/** How the P&L is worked out. Leaves VAT out for a company that has none to report. */
export function profitAndLossBasisNote(showVat: boolean): string {
  return showVat
    ? "Accrual basis: invoiced income is net (ex-VAT) by issue date, less credit notes by their issue date. Other income is cash on the bank date (no VAT). Expenses are net of VAT by spend date, plus invoice balances written off as bank charges or bad debt by write-off date. VAT on sales and purchases is in the VAT card."
    : "Accrual basis: invoiced income by issue date, less credit notes by their issue date. Other income is cash on the bank date. Expenses by spend date, plus invoice balances written off as bank charges or bad debt by write-off date.";
}
