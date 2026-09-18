import { z } from "zod";
import {
  FORM_FIELD_ERROR_SUMMARY,
  parseWithFieldErrors,
  type ParseFail,
  type ParseOk,
} from "@/lib/validation/field-errors";

export const createReimbursementSchema = z.object({
  payeeUserId: z.string().uuid("Select a payee"),
  expenseIds: z
    .array(z.string().uuid())
    .min(1, "Select at least one expense"),
  reference: z
    .string()
    .trim()
    .min(1, "Enter a bank payment reference"),
});

export const updateReimbursementSchema = z.object({
  expenseIds: z
    .array(z.string().uuid())
    .min(1, "Select at least one expense"),
  reference: z
    .string()
    .trim()
    .min(1, "Enter a bank payment reference"),
});

export type CreateReimbursementParsed = z.infer<typeof createReimbursementSchema>;
export type UpdateReimbursementParsed = z.infer<typeof updateReimbursementSchema>;

function parseExpenseIdsJson(
  raw: unknown,
): { ok: true; expenseIds: string[] } | ParseFail {
  try {
    const expenseIds = JSON.parse(String(raw ?? "[]")) as unknown;
    if (!Array.isArray(expenseIds)) {
      return {
        ok: false,
        fieldErrors: { expenseIds: "Invalid expense selection" },
        error: FORM_FIELD_ERROR_SUMMARY,
      };
    }
    return { ok: true, expenseIds: expenseIds as string[] };
  } catch {
    return {
      ok: false,
      fieldErrors: { expenseIds: "Invalid expense selection" },
      error: FORM_FIELD_ERROR_SUMMARY,
    };
  }
}

export function reimbursementCreateRawFromFormData(
  formData: FormData,
): ParseOk<Record<string, unknown>> | ParseFail {
  const ids = parseExpenseIdsJson(formData.get("expenseIdsJson"));
  if (!ids.ok) return ids;
  return {
    ok: true,
    data: {
      payeeUserId: formData.get("payeeUserId"),
      expenseIds: ids.expenseIds,
      reference: formData.get("reference") ?? "",
    },
  };
}

export function reimbursementUpdateRawFromFormData(
  formData: FormData,
): ParseOk<Record<string, unknown>> | ParseFail {
  const ids = parseExpenseIdsJson(formData.get("expenseIdsJson"));
  if (!ids.ok) return ids;
  return {
    ok: true,
    data: {
      expenseIds: ids.expenseIds,
      reference: formData.get("reference") ?? "",
    },
  };
}

export function parseCreateReimbursementInput(
  raw: unknown,
): ParseOk<CreateReimbursementParsed> | ParseFail {
  return parseWithFieldErrors(createReimbursementSchema, raw);
}

export function parseUpdateReimbursementInput(
  raw: unknown,
): ParseOk<UpdateReimbursementParsed> | ParseFail {
  return parseWithFieldErrors(updateReimbursementSchema, raw);
}

export const markPaidSchema = z.object({
  bankTransactionId: z
    .string()
    .uuid("Choose a bank transaction")
    .optional()
    .or(z.literal(""))
    .transform((v) => (v === "" || !v ? null : v)),
});

export type MarkPaidParsed = z.infer<typeof markPaidSchema>;

export function parseMarkPaidInput(
  raw: unknown,
): ParseOk<MarkPaidParsed> | ParseFail {
  return parseWithFieldErrors(markPaidSchema, raw);
}
