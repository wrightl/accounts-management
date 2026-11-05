/**
 * The id the phone sends with a create so a retry (after going offline or a
 * dropped connection) returns the first record instead of saving a second.
 */
export function parseClientRequestId(value: unknown): string | null {
  return typeof value === "string" && /^[A-Za-z0-9-]{8,64}$/.test(value) ? value : null;
}
