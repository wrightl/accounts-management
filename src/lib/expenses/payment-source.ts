/**
 * How an expense was paid: by the person claiming it (so the company owes
 * them) or straight from a company account or card. Emailed claims carry
 * clues; these helpers turn them into a suggestion the reviewer confirms
 * when approving. Nothing here changes an expense's status by itself.
 */

export const PAYMENT_SOURCES = ["personal", "company"] as const;
export type PaymentSource = (typeof PAYMENT_SOURCES)[number];

/** Where a stated payment source came from: the claim email or a reply to our question. */
export const PAYMENT_SOURCE_VIA = ["email", "reply"] as const;
export type PaymentSourceVia = (typeof PAYMENT_SOURCE_VIA)[number];

export type PaymentSourceEvidence =
  | { kind: "stated"; source: PaymentSource; via: PaymentSourceVia }
  | { kind: "bank_match"; source: "company"; bookedAt: string; confirmed: boolean }
  | { kind: "card"; source: PaymentSource; last4: string };

export type PaymentSourceSuggestion = {
  /** Null when there is no evidence, or the evidence disagrees. */
  suggestion: PaymentSource | null;
  evidence: PaymentSourceEvidence[];
  conflict: boolean;
};

export function isPaymentSource(value: unknown): value is PaymentSource {
  return value === "personal" || value === "company";
}

export function isPaymentSourceVia(value: unknown): value is PaymentSourceVia {
  return value === "email" || value === "reply";
}

/** The approval status a payment source stands for. */
export function approveStatusForPaymentSource(
  source: PaymentSource,
): "reimbursable" | "company_paid" {
  return source === "personal" ? "reimbursable" : "company_paid";
}

const PERSONAL_TAG = /(?:^|[^\w#])#(?:personal|personally|reimburse|reimbursable|mine)\b/i;
const COMPANY_TAG = /(?:^|[^\w#])#(?:company|business|companycard|corporate)\b/i;

const PERSONAL_PHRASES: RegExp[] = [
  /\b(?:paid|pay) (?:for (?:it|this|these|them) )?(?:personally|myself|out of (?:my own )?pocket)\b/gi,
  /\bpersonally paid\b/gi,
  /\b(?:my|own) (?:own )?(?:personal |debit |credit )?(?:card|money|cash)\b/gi,
  /\bmy (?:own|personal) (?:bank )?account\b/gi,
  /\bpersonal (?:debit |credit )?(?:card|account|money|funds)\b/gi,
  /\bout of (?:my own )?pocket\b/gi,
  /\b(?:please )?reimburse me\b/gi,
  /\b(?:i'?m|i am) owed\b/gi,
  /\bpay me back\b/gi,
];

const COMPANY_PHRASES: RegExp[] = [
  /\b(?:company|business|corporate) (?:debit |credit )?(?:card|account|amex)\b/gi,
  /\bpaid (?:for )?by (?:the )?(?:company|business)\b/gi,
  /\b(?:company|business)[- ]paid\b/gi,
  /\bon the (?:company|business)\b/gi,
  /\bfrom the (?:company|business) (?:account|bank)\b/gi,
];

const NEGATION = /\b(?:not|never|no|without|didn'?t|did not|wasn'?t|was not|isn'?t|haven'?t)\b(?:\s+\w+){0,2}\s*$/i;

function flip(source: PaymentSource): PaymentSource {
  return source === "personal" ? "company" : "personal";
}

/**
 * Only what the sender wrote: drops quoted text ("> …"), anything after an
 * "On … wrote:" line, and forwarded or original-message blocks, so a receipt
 * forwarded from a shop (or our own question, quoted in a reply) is not read
 * as the sender's own words.
 */
export function ownEmailText(body: string): string {
  const lines = body.replace(/\r\n?/g, "\n").split("\n");
  const kept: string[] = [];
  for (const [i, line] of lines.entries()) {
    const trimmed = line.trim();
    // Mail apps wrap a long "On <date>, <name> <address> wrote:" over two lines.
    const attribution =
      /^on\s/i.test(trimmed) &&
      (/wrote:$/i.test(trimmed) || /wrote:$/i.test(lines[i + 1]?.trim() ?? ""));
    if (
      attribution ||
      /^-{2,}\s*(?:forwarded message|original message)\s*-{2,}$/i.test(trimmed) ||
      /^begin forwarded message:?$/i.test(trimmed) ||
      (/^from:\s.+$/i.test(trimmed) && kept.some((l) => l.trim()))
    ) {
      break;
    }
    if (trimmed.startsWith(">")) continue;
    kept.push(line);
  }
  return kept.join("\n").trim();
}

/**
 * What the sender says about how they paid, from the subject and their own
 * words in the body. Tags (#personal, #company) beat phrases; a phrase after
 * "not" or "didn't" counts for the other side. Undefined when nothing is said
 * or the text points both ways.
 */
export function detectStatedPaymentSource(
  subject: string,
  body: string,
): PaymentSource | undefined {
  const text = [subject, ownEmailText(body)].filter(Boolean).join("\n");
  if (!text.trim()) return undefined;

  const personalTag = PERSONAL_TAG.test(text);
  const companyTag = COMPANY_TAG.test(text);
  if (personalTag !== companyTag) return personalTag ? "personal" : "company";
  if (personalTag && companyTag) return undefined;

  const found = new Set<PaymentSource>();
  const scan = (patterns: RegExp[], source: PaymentSource) => {
    for (const pattern of patterns) {
      for (const match of text.matchAll(pattern)) {
        const before = text.slice(Math.max(0, match.index - 40), match.index);
        found.add(NEGATION.test(before) ? flip(source) : source);
      }
    }
  };
  scan(PERSONAL_PHRASES, "personal");
  scan(COMPANY_PHRASES, "company");
  return found.size === 1 ? [...found][0] : undefined;
}

const CARD_LAST4_PATTERNS: RegExp[] = [
  // ************1234, XXXX XXXX XXXX 1234, ●●●● 1234, xxxx-1234
  /(?<![A-Za-z])(?:[*xX•●]{2,}[\s-]?){1,4}(\d{4})(?![\d/.-])/g,
  // "ending 1234", "ending in 1234"
  /\bending(?: in)?:?\s*(\d{4})(?![\d/.-])/gi,
  // "Card no. ...1234"
  /\b(?:card|visa|mastercard|amex|maestro|debit|credit)\b[^\n\d]{0,30}?\.{2,}\s?(\d{4})(?![\d/.-])/gi,
  // "Visa 1234" on a card line
  /\b(?:visa|mastercard|maestro|amex|american express)(?: debit| credit)?\s*[:\s]\s*(\d{4})(?![\d/.-])/gi,
];

/**
 * The last four digits of the card on a receipt, when it shows a masked card
 * number. Undefined when none is found, or the receipt shows more than one card.
 */
export function parseCardLast4(text: string): string | undefined {
  const found = new Set<string>();
  for (const pattern of CARD_LAST4_PATTERNS) {
    for (const match of text.matchAll(pattern)) {
      if (match[1]) found.add(match[1]);
    }
  }
  return found.size === 1 ? [...found][0] : undefined;
}

/** Keep four-digit card endings only, without duplicates. */
export function normalizeCardLast4s(values: readonly string[]): string[] {
  const out: string[] = [];
  for (const raw of values) {
    const digits = raw.replace(/\D/g, "");
    if (digits.length !== 4) continue;
    if (!out.includes(digits)) out.push(digits);
  }
  return out;
}

/** Parse a comma or space separated list of card endings typed in settings. */
export function parseCardLast4sInput(
  input: string,
): { ok: true; value: string[] } | { ok: false; error: string } {
  const parts = input
    .split(/[\s,;]+/)
    .map((p) => p.trim())
    .filter(Boolean);
  const bad = parts.find((p) => !/^\d{4}$/.test(p));
  if (bad) {
    return { ok: false, error: `Enter the last 4 digits of each card, e.g. 1234 (not "${bad}")` };
  }
  return { ok: true, value: normalizeCardLast4s(parts) };
}

/**
 * Card evidence: a company card means the company paid. Another card counts
 * as personal only once the company has listed its cards, otherwise we cannot
 * tell the two apart.
 */
export function cardEvidence(
  last4: string | null | undefined,
  companyCards: readonly string[],
): PaymentSourceEvidence | null {
  if (!last4 || companyCards.length === 0) return null;
  return {
    kind: "card",
    source: companyCards.includes(last4) ? "company" : "personal",
    last4,
  };
}

/**
 * Combine the evidence for one expense. What the sender says comes first, then
 * a matching company bank payment, then the card on the receipt. When the
 * pieces disagree there is no suggestion and the reviewer decides.
 */
export function resolvePaymentSource(
  evidence: readonly (PaymentSourceEvidence | null | undefined)[],
): PaymentSourceSuggestion {
  const rank = { stated: 0, bank_match: 1, card: 2 } as const;
  const present = evidence
    .filter((e): e is PaymentSourceEvidence => Boolean(e))
    .sort((a, b) => rank[a.kind] - rank[b.kind]);
  const sources = new Set(present.map((e) => e.source));
  const conflict = sources.size > 1;
  return {
    suggestion: conflict || present.length === 0 ? null : present[0].source,
    evidence: present,
    conflict,
  };
}

/** One line for the reviewer on a piece of evidence. */
export function describePaymentSourceEvidence(e: PaymentSourceEvidence): string {
  switch (e.kind) {
    case "stated":
      return e.source === "personal"
        ? `The sender says they paid personally${e.via === "reply" ? " (in reply to our question)" : ""}`
        : `The sender says it was paid with a company card or account${e.via === "reply" ? " (in reply to our question)" : ""}`;
    case "bank_match":
      return `Matches a company bank payment on ${e.bookedAt}${e.confirmed ? "" : " (suggested match)"}`;
    case "card":
      return e.source === "company"
        ? `Receipt shows company card ending ${e.last4}`
        : `Receipt shows card ending ${e.last4}, which is not a company card`;
  }
}

/** Short label for lists, e.g. "Paid personally?"; null when there are no clues. */
export function paymentSourceListLabel(
  s: PaymentSourceSuggestion | null | undefined,
): string | null {
  if (!s || s.evidence.length === 0) return null;
  if (s.conflict || !s.suggestion) return "Unclear how paid";
  return s.suggestion === "personal" ? "Paid personally?" : "Company paid?";
}

/**
 * A reference we put in the subject of our question, so a reply can be tied
 * back to the claim it answers: "[Claim ABCD1234]".
 */
export function paymentQuestionRef(jobId: string): string {
  return jobId.replace(/-/g, "").slice(0, 8).toUpperCase();
}

export function parsePaymentQuestionRef(subject: string): string | undefined {
  const match = subject.match(/\[claim ([0-9a-f]{8})\]/i);
  return match ? match[1].toUpperCase() : undefined;
}

/** The suggestion in plain terms, for API payloads and the review UI. */
export function paymentSourceSummary(s: PaymentSourceSuggestion): {
  suggestion: PaymentSource | null;
  suggestedStatus: "reimbursable" | "company_paid" | null;
  conflict: boolean;
  notes: string[];
} {
  return {
    suggestion: s.suggestion,
    suggestedStatus: s.suggestion ? approveStatusForPaymentSource(s.suggestion) : null,
    conflict: s.conflict,
    notes: s.evidence.map(describePaymentSourceEvidence),
  };
}
