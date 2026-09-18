import { z } from "zod";
import { resolveBankFieldsFromForm } from "@/lib/bank/resolve-bank-fields";
import {
  FORM_FIELD_ERROR_SUMMARY,
  parseWithFieldErrors,
  type ParseFail,
  type ParseOk,
} from "@/lib/validation/field-errors";
import type { BankProviderId } from "@/lib/bank/providers";

const optionalText = z
  .string()
  .trim()
  .optional()
  .or(z.literal(""))
  .transform((v) => (v === "" ? null : (v ?? null)));

const shared = {
  userName: z
    .string()
    .trim()
    .min(1, "Enter your name")
    .max(200, "Name must be 200 characters or fewer"),
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
  addressLines: optionalText,
  email: z
    .union([
      z.literal(""),
      z.string().trim().email("Enter a valid email address"),
    ])
    .transform((v) => (v === "" ? null : v)),
  financialYearEndMonth: z.coerce.number().int().min(1).max(12),
};

export const onboardingSchema = z.discriminatedUnion("entityType", [
  z.object({
    entityType: z.literal("limited_company"),
    ...shared,
    companyNumber: z
      .string()
      .trim()
      .min(1, "Enter a company number")
      .max(20, "Company number must be 20 characters or fewer"),
  }),
  z.object({
    entityType: z.literal("sole_trader"),
    ...shared,
    utr: optionalText,
  }),
]);

export type OnboardingParsed = z.infer<typeof onboardingSchema> & {
  bankProvider: BankProviderId | null;
  bankName: string | null;
};

export function onboardingRawFromFormData(formData: FormData): Record<string, unknown> {
  const entityType = formData.get("entityType");
  if (entityType === "sole_trader") {
    return {
      entityType: "sole_trader",
      userName: formData.get("userName"),
      name: formData.get("name"),
      legalName: formData.get("legalName"),
      utr: formData.get("utr") ?? "",
      addressLines: formData.get("addressLines") ?? "",
      email: formData.get("email") ?? "",
      financialYearEndMonth: formData.get("financialYearEndMonth") ?? "3",
      bankProvider: formData.get("bankProvider") ?? "",
      bankName: formData.get("bankName") ?? "",
    };
  }
  return {
    entityType: "limited_company",
    userName: formData.get("userName"),
    name: formData.get("name"),
    legalName: formData.get("legalName"),
    companyNumber: formData.get("companyNumber"),
    addressLines: formData.get("addressLines") ?? "",
    email: formData.get("email") ?? "",
    financialYearEndMonth: formData.get("financialYearEndMonth") ?? "3",
    bankProvider: formData.get("bankProvider") ?? "",
    bankName: formData.get("bankName") ?? "",
  };
}

export function parseOnboardingInput(
  raw: unknown,
): ParseOk<OnboardingParsed> | ParseFail {
  const parsed = parseWithFieldErrors(onboardingSchema, raw);
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
    required: false,
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
