/**
 * Rules for the short inbound expense address (`{alias}@{EXPENSE_INBOUND_DOMAIN}`).
 * No imports, so the rename form can check an alias before sending it.
 */

export const INBOUND_ALIAS_MIN = 3;
export const INBOUND_ALIAS_MAX = 30;

const ALIAS_RE = /^[a-z0-9]+(?:[.-][a-z0-9]+)*$/;

/** Mailbox names that belong to the domain, not to a person. */
export const RESERVED_INBOUND_ALIASES: ReadonlySet<string> = new Set([
  "abuse",
  "admin",
  "administrator",
  "billing",
  "expenses",
  "help",
  "hello",
  "hostmaster",
  "inbound",
  "info",
  "mailer-daemon",
  "no-reply",
  "noreply",
  "postmaster",
  "receipts",
  "root",
  "security",
  "support",
  "webmaster",
]);

export function normalizeInboundAlias(raw: string): string {
  return raw.trim().toLowerCase();
}

/** Why `alias` (already normalised) can't be used, or null when it can. */
export function inboundAliasError(alias: string): string | null {
  if (alias.length < INBOUND_ALIAS_MIN) {
    return `Use at least ${INBOUND_ALIAS_MIN} characters.`;
  }
  if (alias.length > INBOUND_ALIAS_MAX) {
    return `Use at most ${INBOUND_ALIAS_MAX} characters.`;
  }
  if (!ALIAS_RE.test(alias)) {
    return "Use letters and numbers, with single dots or hyphens between them.";
  }
  if (RESERVED_INBOUND_ALIASES.has(alias)) {
    return "That address is reserved. Pick another.";
  }
  return null;
}

export function isValidInboundAlias(alias: string): boolean {
  return inboundAliasError(alias) === null;
}
