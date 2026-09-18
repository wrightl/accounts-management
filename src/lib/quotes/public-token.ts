import { randomBytes } from "node:crypto";

/** Generate an unguessable public quote token (URL-safe). */
export function generatePublicQuoteToken(): string {
  return randomBytes(32).toString("base64url");
}

export function publicQuoteUrl(rawToken: string): string {
  const base =
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ||
    "http://localhost:3000";
  return `${base}/q/${rawToken}`;
}
