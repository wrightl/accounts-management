import { z } from "zod";
import {
  FORM_FIELD_ERROR_SUMMARY,
  parseWithFieldErrors,
  type ParseFail,
  type ParseOk,
} from "@/lib/validation/field-errors";

function isCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

const reimbursementDateField = z
  .string()
  .trim()
  .refine((v) => v === "" || isCalendarDate(v), "Enter a valid date")
  .transform((v) => v || null);

export const createReimbursementSchema = z.object({
  payeeUserId: z.string().uuid("Select a payee"),
  expenseIds: z
    .array(z.string().uuid())
    .min(1, "Select at least one expense"),
  reference: z
    .string()
    .trim()
    .min(1, "Enter a bank payment reference"),
  reimbursementDate: reimbursementDateField,
});

export const updateReimbursementSchema = z.object({
  expenseIds: z
    .array(z.string().uuid())
    .min(1, "Select at least one expense"),
  reference: z
    .string()
    .trim()
    .min(1, "Enter a bank payment reference"),
  reimbursementDate: reimbursementDateField,
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
      reimbursementDate: formData.get("reimbursementDate") ?? "",
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
      reimbursementDate: formData.get("reimbursementDate") ?? "",
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
