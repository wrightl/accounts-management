import { timingSafeEqual } from "node:crypto";

/**
 * Fail-closed cron authorisation. A missing secret is a misconfiguration,
 * not an open endpoint. Uses timing-safe comparison for the bearer token.
 */
export function cronAuthError(
  authorizationHeader: string | null,
  secret: string | undefined,
): { status: number; error: string } | null {
  if (!secret) {
    return { status: 503, error: "Cron is not configured" };
  }
  if (!authorizationHeader?.startsWith("Bearer ")) {
    return { status: 401, error: "Unauthorized" };
  }
  const token = authorizationHeader.slice("Bearer ".length);
  const expected = Buffer.from(secret);
  const actual = Buffer.from(token);
  if (
    expected.length !== actual.length ||
    !timingSafeEqual(expected, actual)
  ) {
    return { status: 401, error: "Unauthorized" };
  }
  return null;
}
