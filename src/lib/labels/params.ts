const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const MAX_FILTER_LABELS = 50;

export const MAX_NOTE_LENGTH = 5000;

export function isUuid(value: string): boolean {
  return UUID.test(value);
}

/**
 * Parse the comma-separated `labels` URL param. Anything that isn't a UUID is
 * dropped, since Postgres would reject it when comparing against a uuid column.
 */
export function parseLabelIds(raw: string | string[] | undefined): string[] {
  const value = Array.isArray(raw) ? raw.join(",") : (raw ?? "");
  const ids = value
    .split(",")
    .map((id) => id.trim().toLowerCase())
    .filter(isUuid);
  return [...new Set(ids)].slice(0, MAX_FILTER_LABELS);
}
