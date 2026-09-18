import { z } from "zod";
import { poundsToPence } from "@/lib/money";
import {
  FORM_FIELD_ERROR_SUMMARY,
  parseWithFieldErrors,
  type ParseFail,
  type ParseOk,
} from "@/lib/validation/field-errors";

export const declareDividendFieldsSchema = z.object({
  declaredAt: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a valid date"),
  amountPounds: z.string().trim().min(1, "Enter an amount"),
  notes: z
    .string()
    .optional()
    .or(z.literal(""))
    .transform((v) => (v === "" || !v ? null : v)),
});

export type DeclareDividendFieldsParsed = z.infer<
  typeof declareDividendFieldsSchema
>;

export type DeclareDividendParsed = DeclareDividendFieldsParsed & {
  totalPence: number;
};

export function dividendRawFromFormData(
  formData: FormData,
): Record<string, unknown> {
  return {
    declaredAt: formData.get("declaredAt"),
    amountPounds: formData.get("amountPounds"),
    notes: formData.get("notes") ?? "",
  };
}

export function parseDeclareDividendInput(
  raw: unknown,
): ParseOk<DeclareDividendParsed> | ParseFail {
  const parsed = parseWithFieldErrors(declareDividendFieldsSchema, raw);
  if (!parsed.ok) return parsed;

  let totalPence: number;
  try {
    totalPence = poundsToPence(parsed.data.amountPounds);
  } catch (e) {
    return {
      ok: false,
      fieldErrors: {
        amountPounds: e instanceof Error ? e.message : "Invalid amount",
      },
      error: FORM_FIELD_ERROR_SUMMARY,
    };
  }
  if (totalPence <= 0) {
    return {
      ok: false,
      fieldErrors: { amountPounds: "Amount must be greater than zero" },
      error: FORM_FIELD_ERROR_SUMMARY,
    };
  }

  return {
    ok: true,
    data: { ...parsed.data, totalPence },
  };
}
