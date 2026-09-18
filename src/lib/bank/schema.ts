import type { GenericCsvMapping } from "@/lib/bank/types";
import {
  FORM_FIELD_ERROR_SUMMARY,
  type ParseFail,
  type ParseOk,
} from "@/lib/validation/field-errors";

/** Validate generic CSV column mapping before import. */
export function parseGenericCsvMappingInput(
  mapping: GenericCsvMapping | null | undefined,
): ParseOk<GenericCsvMapping> | ParseFail {
  if (!mapping?.date?.trim()) {
    return {
      ok: false,
      fieldErrors: { date: "Map a Date column before importing" },
      error: FORM_FIELD_ERROR_SUMMARY,
    };
  }

  const hasAmount = Boolean(mapping.amount?.trim());
  const hasSplit = Boolean(
    mapping.moneyOut?.trim() || mapping.moneyIn?.trim(),
  );
  if (!hasAmount && !hasSplit) {
    return {
      ok: false,
      fieldErrors: {
        amount: "Map either an Amount column, or Money out / Money in",
        moneyOut: "Map either an Amount column, or Money out / Money in",
      },
      error: FORM_FIELD_ERROR_SUMMARY,
    };
  }

  return { ok: true, data: mapping };
}

export function parseBankCsvFile(
  file: File | null | undefined,
): ParseOk<{ file: File }> | ParseFail {
  if (!(file instanceof File) || file.size === 0) {
    return {
      ok: false,
      fieldErrors: { csv: "Choose a statement file" },
      error: FORM_FIELD_ERROR_SUMMARY,
    };
  }
  return { ok: true, data: { file } };
}
