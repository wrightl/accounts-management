/**
 * Fail-closed cron authorisation. A missing secret is a misconfiguration,
 * not an open endpoint.
 */
export function cronAuthError(
  authorizationHeader: string | null,
  secret: string | undefined,
): { status: number; error: string } | null {
  if (!secret) {
    return { status: 503, error: "Cron is not configured" };
  }
  if (authorizationHeader !== `Bearer ${secret}`) {
    return { status: 401, error: "Unauthorized" };
  }
  return null;
}
