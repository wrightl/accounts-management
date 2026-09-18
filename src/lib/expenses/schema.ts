import { z } from "zod";
import { EXPENSE_CATEGORIES } from "@/lib/expenses/categories";
import {
  DEFAULT_MILEAGE_RATE_PENCE,
  mileageAmountPence,
} from "@/lib/expenses/mileage";
import { poundsToPence } from "@/lib/money";
import {
  FORM_FIELD_ERROR_SUMMARY,
  parseWithFieldErrors,
  type ParseFail,
  type ParseOk,
} from "@/lib/validation/field-errors";

export const expenseFieldsSchema = z.object({
  description: z
    .string()
    .trim()
    .min(1, "Enter a description")
    .max(500, "Description must be 500 characters or fewer"),
  category: z
    .enum(EXPENSE_CATEGORIES)
    .optional()
    .or(z.literal(""))
    .transform((v) => (v === "" || !v ? "" : v)),
  spentAt: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a valid date")
    .optional()
    .or(z.literal("")),
  amountPounds: z.string().trim().optional().or(z.literal("")).default(""),
  status: z
    .string()
    .refine(
      (v): v is "recorded" | "reimbursable" | "company_paid" =>
        v === "recorded" || v === "reimbursable" || v === "company_paid",
      { message: "Select a status" },
    ),
  billable: z
    .string()
    .optional()
    .transform((v) => v === "on" || v === "true"),
  billableClientId: z
    .string()
    .uuid("Select a client")
    .optional()
    .or(z.literal(""))
    .transform((v) => (v === "" || !v ? null : v)),
  paidByUserId: z
    .string()
    .uuid("Select who paid")
    .optional()
    .or(z.literal(""))
    .transform((v) => (v === "" || !v ? null : v)),
  useMileage: z
    .string()
    .optional()
    .transform((v) => v === "on" || v === "true"),
  mileageMiles: z
    .string()
    .optional()
    .or(z.literal(""))
    .transform((v) => (v === "" || !v ? null : Number(v))),
  mileageRatePence: z
    .string()
    .optional()
    .or(z.literal(""))
    .transform((v) => (v === "" || !v ? null : Number(v))),
  vatRate: z.coerce
    .number({ error: "Enter a VAT rate between 0 and 100" })
    .int("Enter a whole-number VAT rate")
    .min(0, "VAT rate must be between 0 and 100")
    .max(100, "VAT rate must be between 0 and 100")
    .optional(),
});

export type ExpenseFieldsParsed = z.infer<typeof expenseFieldsSchema>;

export type ExpenseParsed = ExpenseFieldsParsed & {
  amountPence: number;
  resolvedMileageMiles: number | null;
  resolvedMileageRatePence: number | null;
};

export function expenseRawFromFormData(formData: FormData): Record<string, unknown> {
  return {
    description: formData.get("description"),
    category: formData.get("category") ?? "",
    spentAt: formData.get("spentAt") ?? "",
    amountPounds: formData.get("amountPounds") ?? "",
    status: formData.get("status") ?? "",
    billable: formData.get("billable") ?? "",
    billableClientId: formData.get("billableClientId") ?? "",
    paidByUserId: formData.get("paidByUserId") ?? "",
    useMileage: formData.get("useMileage") ?? "",
    mileageMiles: formData.get("mileageMiles") ?? "",
    mileageRatePence: formData.get("mileageRatePence") ?? "",
    vatRate: formData.get("vatRate") ?? "0",
  };
}

function resolveExpenseAmount(
  data: ExpenseFieldsParsed,
  opts: { allowZero?: boolean },
):
  | {
      ok: true;
      amountPence: number;
      mileageMiles: number | null;
      mileageRatePence: number | null;
    }
  | { ok: false; fieldErrors: Record<string, string> } {
  if (data.useMileage) {
    if (
      data.mileageMiles == null ||
      !Number.isFinite(data.mileageMiles) ||
      data.mileageMiles <= 0
    ) {
      return {
        ok: false,
        fieldErrors: { mileageMiles: "Enter a positive number of miles" },
      };
    }
    const rate = data.mileageRatePence ?? DEFAULT_MILEAGE_RATE_PENCE;
    if (!Number.isFinite(rate) || rate <= 0) {
      return {
        ok: false,
        fieldErrors: { mileageRatePence: "Enter a positive mileage rate" },
      };
    }
    try {
      return {
        ok: true,
        amountPence: mileageAmountPence(data.mileageMiles, rate),
        mileageMiles: Math.round(data.mileageMiles),
        mileageRatePence: Math.round(rate),
      };
    } catch (e) {
      return {
        ok: false,
        fieldErrors: {
          mileageMiles: e instanceof Error ? e.message : "Invalid mileage",
        },
      };
    }
  }

  try {
    const amountPence = poundsToPence(data.amountPounds);
    if (amountPence <= 0 && !opts.allowZero) {
      return {
        ok: false,
        fieldErrors: { amountPounds: "Amount must be positive" },
      };
    }
    return {
      ok: true,
      amountPence,
      mileageMiles: null,
      mileageRatePence: null,
    };
  } catch (e) {
    return {
      ok: false,
      fieldErrors: {
        amountPounds: e instanceof Error ? e.message : "Invalid amount",
      },
    };
  }
}

/** Shared paid-by / company-paid normalisation used by actions and client UX. */
export function normalizeExpensePaymentFields(data: {
  status: "recorded" | "reimbursable" | "company_paid";
  paidByUserId: string | null;
}):
  | { ok: true; status: typeof data.status; paidByUserId: string | null }
  | { ok: false; fieldErrors: Record<string, string>; error: string } {
  if (data.status === "company_paid") {
    return { ok: true, status: data.status, paidByUserId: null };
  }
  if (data.status === "reimbursable" && !data.paidByUserId) {
    return {
      ok: false,
      fieldErrors: {
        paidByUserId: "Select who paid for reimbursable expenses",
      },
      error: FORM_FIELD_ERROR_SUMMARY,
    };
  }
  return { ok: true, status: data.status, paidByUserId: data.paidByUserId };
}

export function parseExpenseInput(
  raw: unknown,
  opts: { allowZeroAmount?: boolean } = {},
): ParseOk<ExpenseParsed> | ParseFail {
  const parsed = parseWithFieldErrors(expenseFieldsSchema, raw);
  if (!parsed.ok) return parsed;

  const amountResult = resolveExpenseAmount(parsed.data, {
    allowZero: opts.allowZeroAmount,
  });
  if (!amountResult.ok) {
    return {
      ok: false,
      fieldErrors: amountResult.fieldErrors,
      error: FORM_FIELD_ERROR_SUMMARY,
    };
  }

  return {
    ok: true,
    data: {
      ...parsed.data,
      amountPence: amountResult.amountPence,
      resolvedMileageMiles: amountResult.mileageMiles,
      resolvedMileageRatePence: amountResult.mileageRatePence,
    },
  };
}

export function parseExpenseImportCsvFile(
  formData: FormData,
): ParseOk<{ file: File }> | ParseFail {
  const file = formData.get("csv");
  if (!(file instanceof File) || file.size === 0) {
    return {
      ok: false,
      fieldErrors: { csv: "Choose a CSV file" },
      error: FORM_FIELD_ERROR_SUMMARY,
    };
  }
  if (file.size > 2 * 1024 * 1024) {
    return {
      ok: false,
      fieldErrors: { csv: "CSV must be under 2 MB" },
      error: FORM_FIELD_ERROR_SUMMARY,
    };
  }
  return { ok: true, data: { file } };
}
