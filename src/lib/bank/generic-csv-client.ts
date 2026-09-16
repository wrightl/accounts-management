import type { GenericCsvMapping } from "@/lib/bank/types";

/** Client-safe type guard (mirrors server generic-csv). */
export function isGenericCsvMapping(
  value: unknown,
): value is GenericCsvMapping {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return typeof v.date === "string" && v.date.trim().length > 0;
}
