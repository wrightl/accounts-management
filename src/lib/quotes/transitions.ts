import type { QuoteStatus } from "@/lib/quotes/status";

const TRANSITIONS: Record<QuoteStatus, QuoteStatus[]> = {
  draft: ["sent", "accepted", "declined"],
  sent: ["accepted", "declined"],
  accepted: [],
  declined: ["draft"],
};

export function allowedQuoteTransitions(status: QuoteStatus): QuoteStatus[] {
  return TRANSITIONS[status] ?? [];
}

export function canTransitionQuote(from: QuoteStatus, to: QuoteStatus): boolean {
  return allowedQuoteTransitions(from).includes(to);
}

export function isQuoteLocked(status: QuoteStatus): boolean {
  return status === "accepted" || status === "declined";
}
