import type { ReceiptExtraction } from "@/lib/expenses/receipt-parse";
import {
  inferReceiptCategory,
  parseReceiptAmount,
  parseReceiptDate,
  parseReceiptMerchant,
} from "@/lib/expenses/receipt-parse";

const CONFIDENCE_RANK: Record<ReceiptExtraction["confidence"], number> = {
  high: 3,
  partial: 2,
  none: 1,
};

/** Parse a From header into a bare email address. */
export function parseEmailAddressHeader(value: string): string {
  const trimmed = value.trim();
  const bracketed = trimmed.match(/<([^>]+)>/);
  return (bracketed?.[1] ?? trimmed).trim().toLowerCase();
}

/** Parse comma-delimited inbound expense addresses from env config. */
export function parseExpenseInboundAddresses(raw: string): string[] {
  return raw
    .split(",")
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean);
}

/** Whether any recipient matches one of the configured inbound addresses. */
export function matchesInboundAddress(
  recipients: string[],
  expected: string | string[],
): boolean {
  const targets = (Array.isArray(expected) ? expected : parseExpenseInboundAddresses(expected))
    .map((addr) => addr.trim().toLowerCase())
    .filter(Boolean);
  if (targets.length === 0) return false;
  return recipients.some((addr) => targets.includes(parseEmailAddressHeader(addr)));
}

/** Merge OCR/body extractions — higher confidence wins per field. */
export function mergeReceiptExtractions(
  ...extractions: ReceiptExtraction[]
): ReceiptExtraction {
  const sorted = [...extractions].sort(
    (a, b) => CONFIDENCE_RANK[b.confidence] - CONFIDENCE_RANK[a.confidence],
  );

  const pick = <K extends keyof ReceiptExtraction>(key: K): ReceiptExtraction[K] | undefined => {
    for (const ext of sorted) {
      const value = ext[key];
      if (value !== undefined && value !== null && value !== "") {
        return value;
      }
    }
    return undefined;
  };

  const description = pick("description");
  const amountPounds = pick("amountPounds");
  const spentAt = pick("spentAt");
  const category = pick("category");
  const merchant = pick("merchant");

  const fields = [description, amountPounds, spentAt, category].filter(Boolean);
  let confidence: ReceiptExtraction["confidence"] = "none";
  if (fields.length >= 3) confidence = "high";
  else if (fields.length >= 1) confidence = "partial";

  return {
    description,
    amountPounds,
    spentAt,
    category,
    merchant,
    confidence,
  };
}

/** Heuristic extraction from email subject + plain body. */
export function parseEmailBodyText(subject: string, body: string): ReceiptExtraction {
  const combined = [subject, body].filter(Boolean).join("\n");
  if (!combined.trim()) {
    return { confidence: "none" };
  }

  const merchant = parseReceiptMerchant(combined);
  const amountPounds = parseReceiptAmount(combined);
  const spentAt = parseReceiptDate(combined);
  const category = inferReceiptCategory(combined);
  const description = merchant ?? (subject.trim() || undefined);

  const fields = [description, amountPounds, spentAt, category].filter(Boolean);
  let confidence: ReceiptExtraction["confidence"] = "none";
  if (fields.length >= 3) confidence = "high";
  else if (fields.length >= 1) confidence = "partial";

  return {
    description,
    amountPounds,
    spentAt,
    category,
    merchant,
    confidence,
  };
}

/** Build expense description from merged extraction and email subject. */
export function buildInboundExpenseDescription(
  merged: ReceiptExtraction,
  subject: string,
): string {
  const fromExtraction = merged.description?.trim();
  if (fromExtraction) return fromExtraction.slice(0, 500);
  const fromSubject = subject.trim();
  if (fromSubject) return fromSubject.slice(0, 500);
  return "Expense from email";
}
