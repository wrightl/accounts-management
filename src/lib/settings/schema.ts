import { z } from "zod";
import { resolveBankFieldsFromForm } from "@/lib/bank/resolve-bank-fields";
import {
  FORM_FIELD_ERROR_SUMMARY,
  parseWithFieldErrors,
  type ParseFail,
  type ParseOk,
} from "@/lib/validation/field-errors";
import { poundsToPence } from "@/lib/money";
import { parseUkVatNumber } from "@/lib/vat";
import type { BankProviderId } from "@/lib/bank/providers";

const optionalText = z
  .string()
  .trim()
  .optional()
  .or(z.literal(""))
  .transform((v) => (v === "" ? null : (v ?? null)));

const prefixSchema = z
  .string()
  .trim()
  .min(1, "Enter a prefix")
  .max(10, "Prefix must be 10 characters or fewer")
  .regex(/^[A-Za-z0-9]+$/, "Prefix must be alphanumeric");

export const companySettingsFieldsSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, "Enter a trading name")
      .max(200, "Trading name must be 200 characters or fewer"),
    legalName: z
      .string()
      .trim()
      .min(1, "Enter a legal name")
      .max(200, "Legal name must be 200 characters or fewer"),
    companyNumber: optionalText,
    utr: optionalText,
    vatRegistered: z
      .union([z.literal("on"), z.literal("true"), z.literal("1"), z.literal("")])
      .optional()
      .transform((v) => v === "on" || v === "true" || v === "1"),
    vatNumber: z.string().optional().or(z.literal("")),
    defaultVatRate: z.coerce
      .number({ error: "Enter a VAT rate between 0 and 100" })
      .int("Enter a whole-number VAT rate")
      .min(0, "VAT rate must be between 0 and 100")
      .max(100, "VAT rate must be between 0 and 100"),
    addressLines: optionalText,
    email: z
      .union([
        z.literal(""),
        z.string().trim().email("Enter a valid email address"),
      ])
      .transform((v) => (v === "" ? null : v)),
    bankAccountName: optionalText,
    sortCode: optionalText,
    accountNumber: optionalText,
    financialYearStartMonth: z.coerce
      .number()
      .int()
      .min(1)
      .max(12),
    invoiceNumberPrefix: prefixSchema,
    quoteNumberPrefix: prefixSchema,
    orderNumberPrefix: prefixSchema,
    invoicePaymentTermsDays: z.coerce
      .number({ error: "Enter payment terms in days" })
      .int()
      .min(1, "Payment terms must be between 1 and 365 days")
      .max(365, "Payment terms must be between 1 and 365 days"),
    defaultMileageRatePence: z.coerce
      .number({ error: "Enter a mileage rate" })
      .int()
      .min(1, "Mileage rate must be between 1 and 1000 pence")
      .max(1000, "Mileage rate must be between 1 and 1000 pence"),
    bankProvider: z.string().optional().or(z.literal("")),
    bankName: z.string().optional().or(z.literal("")),
    /** Optional GBP string for spreadsheet cutover cash; empty clears. */
    openingCashGbp: z.string().optional().or(z.literal("")),
    openingCashAsAt: z.string().optional().or(z.literal("")),
  })
  .superRefine((data, ctx) => {
    if (data.vatRegistered) {
      const vat = parseUkVatNumber(String(data.vatNumber ?? ""));
      if (!vat.ok) {
        ctx.addIssue({
          code: "custom",
          message: vat.message,
          path: ["vatNumber"],
        });
      }
    }
    const cashRaw = (data.openingCashGbp ?? "").trim();
    const asAtRaw = (data.openingCashAsAt ?? "").trim();
    if (cashRaw && !asAtRaw) {
      ctx.addIssue({
        code: "custom",
        message: "Enter the cutover date for opening cash",
        path: ["openingCashAsAt"],
      });
    }
    if (asAtRaw && !cashRaw) {
      ctx.addIssue({
        code: "custom",
        message: "Enter the opening cash amount",
        path: ["openingCashGbp"],
      });
    }
    if (asAtRaw && !/^\d{4}-\d{2}-\d{2}$/.test(asAtRaw)) {
      ctx.addIssue({
        code: "custom",
        message: "Enter a valid date",
        path: ["openingCashAsAt"],
      });
    }
    if (cashRaw) {
      try {
        poundsToPence(cashRaw);
      } catch {
        ctx.addIssue({
          code: "custom",
          message: "Enter a valid amount in pounds",
          path: ["openingCashGbp"],
        });
      }
    }
  })
  .transform((data) => {
    let vatNumber: string | null = null;
    if (data.vatRegistered) {
      const vat = parseUkVatNumber(String(data.vatNumber ?? ""));
      vatNumber = vat.ok ? vat.value : null;
    }
    const cashRaw = (data.openingCashGbp ?? "").trim();
    const asAtRaw = (data.openingCashAsAt ?? "").trim();
    const openingCashPence = cashRaw ? poundsToPence(cashRaw) : null;
    const openingCashAsAt = asAtRaw || null;
    const { openingCashGbp: _g, openingCashAsAt: _a, ...rest } = data;
    return { ...rest, vatNumber, openingCashPence, openingCashAsAt };
  });

export type CompanySettingsParsed = Omit<
  z.infer<typeof companySettingsFieldsSchema>,
  "bankProvider" | "bankName" | "vatNumber" | "openingCashGbp" | "openingCashAsAt"
> & {
  vatNumber: string | null;
  bankProvider: BankProviderId | null;
  bankName: string | null;
  openingCashPence: number | null;
  openingCashAsAt: string | null;
};

export function companySettingsRawFromFormData(formData: FormData): Record<string, unknown> {
  return {
    name: formData.get("name"),
    legalName: formData.get("legalName"),
    companyNumber: formData.get("companyNumber") ?? "",
    utr: formData.get("utr") ?? "",
    vatRegistered: formData.get("vatRegistered") ?? "",
    vatNumber: formData.get("vatNumber") ?? "",
    defaultVatRate: formData.get("defaultVatRate") ?? "20",
    addressLines: formData.get("addressLines") ?? "",
    email: formData.get("email") ?? "",
    bankAccountName: formData.get("bankAccountName") ?? "",
    sortCode: formData.get("sortCode") ?? "",
    accountNumber: formData.get("accountNumber") ?? "",
    financialYearStartMonth: formData.get("financialYearStartMonth") ?? "4",
    invoiceNumberPrefix: formData.get("invoiceNumberPrefix") ?? "DD",
    quoteNumberPrefix: formData.get("quoteNumberPrefix") ?? "Q",
    orderNumberPrefix: formData.get("orderNumberPrefix") ?? "O",
    invoicePaymentTermsDays: formData.get("invoicePaymentTermsDays") ?? "14",
    defaultMileageRatePence: formData.get("defaultMileageRatePence") ?? "45",
    bankProvider: formData.get("bankProvider") ?? "",
    bankName: formData.get("bankName") ?? "",
    openingCashGbp: formData.get("openingCashGbp") ?? "",
    openingCashAsAt: formData.get("openingCashAsAt") ?? "",
  };
}

export function parseCompanySettingsInput(
  raw: unknown,
  opts: { bankRequired: boolean } = { bankRequired: true },
):
  | ParseOk<CompanySettingsParsed>
  | ParseFail {
  const parsed = parseWithFieldErrors(companySettingsFieldsSchema, raw);
  if (!parsed.ok) return parsed;

  const bank = resolveBankFieldsFromForm({
    bankProvider:
      typeof raw === "object" && raw && "bankProvider" in raw
        ? (raw as { bankProvider: unknown }).bankProvider
        : "",
    bankName:
      typeof raw === "object" && raw && "bankName" in raw
        ? (raw as { bankName: unknown }).bankName
        : "",
    required: opts.bankRequired,
  });

  if (!bank.ok) {
    const field =
      bank.error.toLowerCase().includes("bank name") ? "bankName" : "bankProvider";
    return {
      ok: false,
      fieldErrors: { [field]: bank.error },
      error: FORM_FIELD_ERROR_SUMMARY,
    };
  }

  return {
    ok: true,
    data: {
      ...parsed.data,
      bankProvider: bank.value.bankProvider,
      bankName: bank.value.bankName,
    },
  };
}

export const deleteOwnCompanySchema = z.object({
  confirmationName: z
    .string()
    .trim()
    .min(1, "Type the company name to confirm deletion"),
});

export type DeleteOwnCompanyParsed = z.infer<typeof deleteOwnCompanySchema>;

export function parseDeleteOwnCompanyInput(
  raw: unknown,
): ParseOk<DeleteOwnCompanyParsed> | ParseFail {
  return parseWithFieldErrors(deleteOwnCompanySchema, raw);
}
