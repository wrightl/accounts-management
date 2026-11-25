import "server-only";
import { serverEnv } from "@/env";

/**
 * Company contact email for PDFs: the accounts email, else the company email,
 * else the EMAIL_FROM address.
 */
export function resolvePdfCompanyEmail(company: {
  accountsEmail?: string | null;
  email?: string | null;
}): string {
  const chosen = company.accountsEmail?.trim() || company.email?.trim();
  if (chosen) return chosen;

  const from = serverEnv().EMAIL_FROM;
  const match = from.match(/<([^>]+)>/);
  return match?.[1] ?? from;
}
