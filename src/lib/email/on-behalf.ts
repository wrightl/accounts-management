/**
 * Build a personalised From / Reply-To for client-facing mail sent on behalf
 * of a company member. Domain always comes from EMAIL_FROM so it stays on the
 * verified Resend sending domain.
 */

export type OnBehalfSender = {
  from: string;
  replyTo?: string;
};

export type OnBehalfPerson = {
  name: string | null | undefined;
  email: string | null | undefined;
};

/** Extract the address domain from an EMAIL_FROM value. */
export function domainFromEmailFrom(emailFrom: string): string | null {
  const match = emailFrom.match(/<([^>]+)>/);
  const address = (match?.[1] ?? emailFrom).trim();
  const at = address.lastIndexOf("@");
  if (at < 0 || at === address.length - 1) return null;
  return address.slice(at + 1).toLowerCase();
}

/** First word of a display name, lowercased and safe as an email local-part. */
export function localPartFromName(name: string | null | undefined): string | null {
  const trimmed = name?.trim() ?? "";
  if (!trimmed) return null;
  const first = trimmed.split(/\s+/)[0] ?? "";
  const ascii = first
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  const safe = ascii.replace(/[^a-z0-9._-]/g, "");
  return safe.length > 0 ? safe : null;
}

/** First token of a display name for the visible From name (preserves case). */
export function firstNameFromDisplay(name: string | null | undefined): string | null {
  const trimmed = name?.trim() ?? "";
  if (!trimmed) return null;
  return trimmed.split(/\s+/)[0] ?? null;
}

function quoteDisplayName(name: string): string {
  if (/[",\\]/.test(name)) {
    return `"${name.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
  }
  return name;
}

/**
 * Personalised sender for client mail.
 * - From: `{First} at {Company} <{first}@domain>`
 * - Reply-To: the user's login email
 * - If the name cannot form a local-part, keep EMAIL_FROM and still set Reply-To
 */
export function buildOnBehalfSender(opts: {
  person: OnBehalfPerson;
  companyName: string;
  emailFrom: string;
}): OnBehalfSender {
  const replyTo = opts.person.email?.trim() || undefined;
  const local = localPartFromName(opts.person.name);
  const domain = domainFromEmailFrom(opts.emailFrom);
  const first = firstNameFromDisplay(opts.person.name);
  const company = opts.companyName.trim();

  if (!local || !domain || !first || !company) {
    return { from: opts.emailFrom, replyTo };
  }

  const display = quoteDisplayName(`${first} at ${company}`);
  return {
    from: `${display} <${local}@${domain}>`,
    replyTo,
  };
}
