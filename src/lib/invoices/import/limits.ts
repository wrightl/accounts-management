/**
 * PDFs a company can have read each month, as a cost guard. Placeholders until
 * the real cost per PDF has been measured; null means no limit.
 */
export function pdfImportMonthlyLimit(entitlements: {
  plan: string;
  complimentary: boolean;
}): number | null {
  if (entitlements.complimentary) return null;
  return entitlements.plan === "trial" ? 25 : 500;
}
