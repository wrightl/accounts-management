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
  return status === "draft" || status === "sent";
}

export function canRollbackQuote(status: string): boolean {
  return status === "draft" || status === "sent";
}

export type QuoteStatus = "draft" | "sent" | "accepted" | "declined";

export const QUOTE_STATUSES: QuoteStatus[] = [
  "draft",
  "sent",
  "accepted",
  "declined",
];

export function quoteStatusLabel(status: QuoteStatus): string {
  const labels: Record<QuoteStatus, string> = {
    draft: "Draft",
    sent: "Sent",
    accepted: "Accepted",
    declined: "Declined",
  };
  return labels[status];
}

export function isQuoteStatus(value: string): value is QuoteStatus {
  return (QUOTE_STATUSES as string[]).includes(value);
}
