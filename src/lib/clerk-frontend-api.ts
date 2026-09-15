/**
 * Decode the Clerk Frontend API hostname from a publishable key.
 *
 * Keys are `pk_test_<base64>` / `pk_live_<base64>`. The payload is the FAPI
 * host plus a trailing `$` (e.g. `clerk.example.com$`).
 */
export function clerkFrontendApiHost(
  key = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
): string | null {
  if (!key) return null;
  const match = key.match(/^pk_(?:test|live)_(.+)$/);
  if (!match) return null;
  try {
    const decoded = Buffer.from(match[1], "base64")
      .toString("utf8")
      .replace(/\$+$/, "");
    if (decoded.includes(".")) return decoded;
  } catch {
    /* ignore malformed keys */
  }
  return null;
}
