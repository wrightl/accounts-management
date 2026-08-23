export type QuoteVersionLine = {
  description: string;
  quantity: number;
  unitPricePence: number;
  vatRate: number;
  position: number;
};

export type QuoteVersionSource = "create" | "edit" | "rollback";

export function formatQuoteVersion(version: number): string {
  return `v${version}`;
}

/** Display label for PDFs, emails, and UI, e.g. Q-2026-0001 (v2). */
export function formatQuoteReference(number: string, version: number): string {
  return `${number} (${formatQuoteVersion(version)})`;
}

export function quotePdfFilename(number: string, version: number): string {
  return `${number}-${formatQuoteVersion(version)}.pdf`;
}

export function canEditQuote(status: string): boolean {
  return status !== "converted" && status !== "declined";
}

export function canRollbackQuote(status: string): boolean {
  return status !== "converted" && status !== "declined";
}
