import { todayIsoDate } from "@/lib/dates";
import type { ReceiptExtraction } from "@/lib/expenses/receipt-parse";
import {
  detectReceiptCurrency,
  inferReceiptCategory,
  parseReceiptAmount,
  parseReceiptDate,
  parseReceiptMerchant,
} from "@/lib/expenses/receipt-parse";
import { parseCardLast4 } from "@/lib/expenses/payment-source";
import { INBOUND_ALIAS_MAX, isValidInboundAlias } from "@/lib/expenses/inbound-alias";

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

const INBOUND_TOKEN_LENGTH = 10;
const INBOUND_TOKEN_ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";

/**
 * Random suffix that makes a user's inbound mailbox unguessable (~51 bits).
 * The mailbox accepts mail from any sender (suppliers email receipts
 * directly), so the address itself is the credential.
 */
export function inboundSlugToken(): string {
  const bytes = new Uint8Array(INBOUND_TOKEN_LENGTH);
  globalThis.crypto.getRandomValues(bytes);
  let out = "";
  for (const b of bytes) {
    // 252 = 36 * 7: reject the tail to avoid modulo bias.
    if (b >= 252) return inboundSlugToken();
    out += INBOUND_TOKEN_ALPHABET[b % 36];
  }
  return out;
}

/** `{readable-seed}-{token}`, kept within the 48-char slug budget. */
export function tokenizedInboundSlug(seed: string): string {
  const readable = slugifyInbound(seed, "user").slice(0, 36).replace(/-+$/, "");
  return `${readable || "user"}-${inboundSlugToken()}`;
}

/** Trim to the alias length budget without leaving a trailing separator. */
function fitAlias(value: string, room = INBOUND_ALIAS_MAX): string {
  return value.slice(0, room).replace(/[.-]+$/, "");
}

/**
 * Short addresses to offer a new member, best first: `lee`, `lee.wright`,
 * `lee-acme`, `lee-acme-2`, … The caller takes the first one that is free.
 */
export function defaultInboundAliasCandidates(
  name: string | null | undefined,
  email: string,
  companySlug: string,
  numbered = 8,
): string[] {
  const seed = name?.trim() ? name : (email.split("@")[0] ?? "");
  const parts = slugifyInbound(seed, "").split("-").filter(Boolean);
  const first = parts[0] ?? "member";
  const last = parts.length > 1 ? parts[parts.length - 1] : null;
  const withCompany = fitAlias(`${first}-${companySlug}`);

  const out: string[] = [];
  const add = (alias: string) => {
    if (isValidInboundAlias(alias) && !out.includes(alias)) out.push(alias);
  };
  add(fitAlias(first));
  if (last) add(fitAlias(`${first}.${last}`));
  add(withCompany);
  for (let n = 2; n < numbered + 2; n++) {
    const suffix = `-${n}`;
    add(`${fitAlias(withCompany, INBOUND_ALIAS_MAX - suffix.length)}${suffix}`);
  }
  return out;
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

/**
 * Parse a short `{alias}@{domain}` address from a To header. Returns null for
 * other domains, legacy plus-addresses, and local parts that can't be aliases.
 */
export function parseInboundAlias(
  toHeader: string,
  config: InboundMailboxConfig,
): { alias: string; address: string } | null {
  const address = parseEmailAddressHeader(toHeader);
  const at = address.lastIndexOf("@");
  if (at <= 0) return null;
  if (address.slice(at + 1) !== config.domain.toLowerCase()) return null;
  const alias = address.slice(0, at);
  return isValidInboundAlias(alias) ? { alias, address } : null;
}

/** Recipients that look like an inbound expense mailbox, short or legacy, in order. */
export function inboundMailboxCandidates(
  recipients: string[],
  config: InboundMailboxConfig,
): string[] {
  const out: string[] = [];
  for (const recipient of recipients) {
    const parsed =
      parseInboundAlias(recipient, config) ?? parseInboundMailbox(recipient, config);
    if (parsed && !out.includes(parsed.address)) out.push(parsed.address);
  }
  return out;
}

/** Whether any recipient looks like an inbound expense mailbox, short or legacy. */
export function matchesInboundMailboxPattern(
  recipients: string[],
  config: InboundMailboxConfig,
): boolean {
  return inboundMailboxCandidates(recipients, config).length > 0;
}

/** Build the legacy display address for a company/user pair. */
export function formatExpenseInboundAddress(
  companySlug: string,
  userSlug: string,
  config: InboundMailboxConfig,
): string {
  return `${config.prefix}+${companySlug}.${userSlug}@${config.domain}`;
}

/** One check's verdict, as Resend's receiving server computed it. */
export type InboundAuthResult = "pass" | "fail" | "gray" | "processing_failed" | "unknown";

/**
 * The `authentication` field on a received email (Retrieve Received Email API).
 * Resend computes it on arrival, so unlike headers the sender can't forge it.
 * Null for mail received before Resend added the field.
 */
export type InboundAuthentication = {
  spf?: InboundAuthResult | null;
  dkim?: InboundAuthResult | null;
  dmarc?: InboundAuthResult | null;
} | null;

/**
 * Whether the receiving server vouches for the From domain: DMARC passed, or
 * DKIM passed for a domain with no DMARC policy. DKIM "pass" means the signing
 * domain matches From ("gray" covers a mismatch). SPF alone doesn't count: it
 * checks the envelope sender, which needn't match From.
 */
export function senderAuthenticated(authentication: InboundAuthentication | undefined): boolean {
  if (!authentication) return false;
  if (authentication.dmarc === "pass") return true;
  return authentication.dmarc === "gray" && authentication.dkim === "pass";
}

/**
 * The sender to flag on an emailed claim, or null when it came from the
 * mailbox owner. Anyone can type any From address, so the owner's address
 * only counts when {@link senderAuthenticated} vouches for it.
 */
export function externalSenderOf(
  fromEmail: string,
  ownerEmail: string,
  authenticated: boolean,
): string | null {
  const from = parseEmailAddressHeader(fromEmail);
  if (from === ownerEmail.trim().toLowerCase() && authenticated) return null;
  return from;
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
  const cardLast4 = pick("cardLast4");
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
    cardLast4,
    confidence,
  };
}

/**
 * Spend date for an emailed expense. A date on an attached receipt beats one
 * found in the email text (often a forward header's "Date:" line); the day the
 * email arrived (London calendar) is the last resort.
 */
export function resolveInboundSpentAt(
  body: ReceiptExtraction,
  attachments: ReceiptExtraction[],
  receivedAt: string | Date | null | undefined,
): string | undefined {
  const fromAttachments = attachments.length
    ? mergeReceiptExtractions(...attachments).spentAt
    : undefined;
  if (fromAttachments) return fromAttachments;
  if (body.spentAt) return body.spentAt;
  if (!receivedAt) return undefined;
  const received = new Date(receivedAt);
  return Number.isNaN(received.getTime()) ? undefined : todayIsoDate(received);
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
  // Forwarded receipt emails often show the card used, so the whole body counts.
  const cardLast4 = parseCardLast4(combined);
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
    cardLast4,
    confidence,
  };
}

/**
 * Attachments to treat as receipts. Inline parts are usually signature logos,
 * so they only count when the email has no real attachments (e.g. a photo
 * pasted into the body).
 */
export function pickReceiptAttachments<
  T extends { content_disposition?: string | null },
>(attachments: T[]): T[] {
  const attached = attachments.filter((a) => a.content_disposition !== "inline");
  return attached.length ? attached : attachments;
}

export type InboundExpenseDraft = {
  extraction: ReceiptExtraction;
  description: string;
  spentAt: string | undefined;
};

/**
 * One expense per receipt, or a single expense when the email has none.
 * The body is merged in only when there is at most one receipt: with several,
 * an amount or date in the email text cannot be pinned to any one of them.
 * A null receipt is an attachment whose OCR failed; it still gets an expense.
 */
export function planInboundExpenses(
  body: ReceiptExtraction,
  receipts: (ReceiptExtraction | null)[],
  subject: string,
  receivedAt: string | Date | null | undefined,
): InboundExpenseDraft[] {
  if (receipts.length <= 1) {
    const read = receipts.filter((r): r is ReceiptExtraction => r !== null);
    const extraction = mergeReceiptExtractions(body, ...read);
    return [
      {
        extraction,
        description: buildInboundExpenseDescription(extraction, subject),
        spentAt: resolveInboundSpentAt(body, read, receivedAt),
      },
    ];
  }

  const noBody: ReceiptExtraction = { confidence: "none" };
  return receipts.map((receipt) => {
    const extraction = mergeReceiptExtractions(receipt ?? noBody);
    return {
      extraction,
      description: buildInboundExpenseDescription(extraction, subject),
      spentAt: resolveInboundSpentAt(noBody, receipt ? [receipt] : [], receivedAt),
    };
  });
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
