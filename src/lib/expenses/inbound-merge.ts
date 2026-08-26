import type { ReceiptExtraction } from "@/lib/expenses/receipt-parse";
import {
  detectReceiptCurrency,
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

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export type InboundMailboxConfig = {
  domain: string;
  prefix: string;
};

export type ParsedInboundMailbox = {
  companySlug: string;
  userSlug: string;
  address: string;
};

/** Parse a From/To header into a bare email address. */
export function parseEmailAddressHeader(value: string): string {
  const trimmed = value.trim();
  const bracketed = trimmed.match(/<([^>]+)>/);
  return (bracketed?.[1] ?? trimmed).trim().toLowerCase();
}

export function isValidInboundSlug(value: string): boolean {
  return SLUG_RE.test(value);
}

/** Slugify a display name or email local-part into [a-z0-9]+(?:-[a-z0-9]+)*. */
export function slugifyInbound(raw: string, fallback = "user"): string {
  const base = raw
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-")
    .slice(0, 48);
  return base && isValidInboundSlug(base) ? base : fallback;
}

/**
 * Parse `{prefix}+{companySlug}.{userSlug}@{domain}` from a To header.
 * Returns null when the address is not an inbound expense mailbox.
 */
export function parseInboundMailbox(
  toHeader: string,
  config: InboundMailboxConfig,
): ParsedInboundMailbox | null {
  const address = parseEmailAddressHeader(toHeader);
  const at = address.lastIndexOf("@");
  if (at <= 0) return null;

  const local = address.slice(0, at);
  const domain = address.slice(at + 1);
  if (domain !== config.domain.toLowerCase()) return null;

  const prefix = config.prefix.toLowerCase();
  const plus = `${prefix}+`;
  if (!local.startsWith(plus)) return null;

  const tag = local.slice(plus.length);
  const dot = tag.indexOf(".");
  if (dot <= 0 || dot === tag.length - 1) return null;

  const companySlug = tag.slice(0, dot);
  const userSlug = tag.slice(dot + 1);
  if (!isValidInboundSlug(companySlug) || !isValidInboundSlug(userSlug)) {
    return null;
  }

  return { companySlug, userSlug, address };
}

/** Whether any recipient matches the configured plus-address pattern. */
export function matchesInboundMailboxPattern(
  recipients: string[],
  config: InboundMailboxConfig,
): boolean {
  return recipients.some((r) => parseInboundMailbox(r, config) !== null);
}

/** Build the display address for a company/user pair. */
export function formatExpenseInboundAddress(
  companySlug: string,
  userSlug: string,
  config: InboundMailboxConfig,
): string {
  return `${config.prefix}+${companySlug}.${userSlug}@${config.domain}`;
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
  const currencies = sorted
    .map((ext) => ext.currency?.trim().toUpperCase())
    .filter((c): c is string => Boolean(c));
  const currency =
    currencies.find((c) => c !== "GBP") ?? currencies[0] ?? undefined;

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
    currency,
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
  const currency = detectReceiptCurrency(combined);
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
    currency,
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
