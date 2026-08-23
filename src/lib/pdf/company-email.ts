import "server-only";
import { serverEnv } from "@/env";

/** Company contact email for PDFs; falls back to EMAIL_FROM when unset. */
export function resolvePdfCompanyEmail(email: string | null | undefined): string {
  const trimmed = email?.trim();
  if (trimmed) return trimmed;

  const from = serverEnv().EMAIL_FROM;
  const match = from.match(/<([^>]+)>/);
  return match?.[1] ?? from;
}
