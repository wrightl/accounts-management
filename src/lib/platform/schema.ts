import { z } from "zod";
import {
  DEFAULT_RECEIPT_OCR_MODEL,
  isGatewayModelId,
  RECEIPT_OCR_MODEL_MAX,
} from "@/lib/expenses/receipt-ocr-models";
import {
  parseWithFieldErrors,
  type ParseFail,
  type ParseOk,
} from "@/lib/validation/field-errors";

const optionalName = z
  .string()
  .trim()
  .max(200, "Name must be 200 characters or fewer")
  .optional()
  .or(z.literal(""))
  .transform((v) => (v === "" || v == null ? null : v));

const emailField = z
  .string()
  .trim()
  .min(1, "Enter an email address")
  .email("Enter a valid email address");

const optionalStripePriceId = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v == null || v === "" ? null : v))
  .pipe(
    z.union([
      z.null(),
      z
        .string()
        .regex(
          /^price_[A-Za-z0-9]+$/,
          "Enter a Stripe price ID (price_…)",
        ),
    ]),
  );

export const platformSettingsSchema = z
  .object({
    maintenanceBanner: z
      .string()
      .trim()
      .max(2000, "Banner must be 2000 characters or fewer")
      .optional()
      .or(z.literal(""))
      .transform((v) => (v === "" || v == null ? null : v)),
    defaultReceiptOcrProvider: z.enum(["local", "ai_gateway"], {
      error: "Invalid OCR provider",
    }),
    defaultReceiptOcrModel: z
      .string()
      .trim()
      .max(
        RECEIPT_OCR_MODEL_MAX,
        `Model ID must be ${RECEIPT_OCR_MODEL_MAX} characters or fewer`,
      )
      .optional()
      .or(z.literal(""))
      .transform((v) =>
        v === "" || v == null ? DEFAULT_RECEIPT_OCR_MODEL : v,
      ),
    stripePriceEssentialsMonthly: optionalStripePriceId,
    stripePriceEssentialsYearly: optionalStripePriceId,
    stripePricePremiumMonthly: optionalStripePriceId,
    stripePricePremiumYearly: optionalStripePriceId,
  })
  .superRefine((data, ctx) => {
    if (data.defaultReceiptOcrProvider !== "ai_gateway") return;
    if (!isGatewayModelId(data.defaultReceiptOcrModel)) {
      ctx.addIssue({
        code: "custom",
        message:
          "Enter a model as provider/model, e.g. google/gemini-2.5-flash",
        path: ["defaultReceiptOcrModel"],
      });
    }
  });

export type PlatformSettingsParsed = z.infer<typeof platformSettingsSchema>;

export function platformSettingsRawFromFormData(
  formData: FormData,
): Record<string, unknown> {
  return {
    maintenanceBanner: formData.get("maintenanceBanner") ?? "",
    defaultReceiptOcrProvider:
      formData.get("defaultReceiptOcrProvider") ?? "local",
    defaultReceiptOcrModel:
      formData.get("defaultReceiptOcrModel") ?? DEFAULT_RECEIPT_OCR_MODEL,
    stripePriceEssentialsMonthly:
      formData.get("stripePriceEssentialsMonthly") ?? "",
    stripePriceEssentialsYearly:
      formData.get("stripePriceEssentialsYearly") ?? "",
    stripePricePremiumMonthly: formData.get("stripePricePremiumMonthly") ?? "",
    stripePricePremiumYearly: formData.get("stripePricePremiumYearly") ?? "",
  };
}

export function parsePlatformSettingsInput(
  raw: unknown,
): ParseOk<PlatformSettingsParsed> | ParseFail {
  return parseWithFieldErrors(platformSettingsSchema, raw);
}

export const platformInviteAdminSchema = z.object({
  email: emailField,
  name: optionalName,
});

export type PlatformInviteAdminParsed = z.infer<
  typeof platformInviteAdminSchema
>;

export function platformInviteAdminRawFromFormData(
  formData: FormData,
): Record<string, unknown> {
  return {
    email: formData.get("email") ?? "",
    name: formData.get("name") ?? "",
  };
}

export function parsePlatformInviteAdminInput(
  raw: unknown,
): ParseOk<PlatformInviteAdminParsed> | ParseFail {
  return parseWithFieldErrors(platformInviteAdminSchema, raw);
}

export const companyInviteAdminSchema = z.object({
  companyId: z.string().uuid("Invalid company id"),
  email: emailField,
  name: optionalName,
});

export type CompanyInviteAdminParsed = z.infer<typeof companyInviteAdminSchema>;

export function companyInviteAdminRawFromFormData(
  formData: FormData,
): Record<string, unknown> {
  return {
    companyId: formData.get("companyId") ?? "",
    email: formData.get("email") ?? "",
    name: formData.get("name") ?? "",
  };
}

export function parseCompanyInviteAdminInput(
  raw: unknown,
): ParseOk<CompanyInviteAdminParsed> | ParseFail {
  return parseWithFieldErrors(companyInviteAdminSchema, raw);
}

export const companySupportNoteSchema = z.object({
  companyId: z.string().uuid("Invalid company id"),
  body: z
    .string()
    .trim()
    .min(1, "Enter a support note")
    .max(4000, "Note is too long"),
});

export type CompanySupportNoteParsed = z.infer<typeof companySupportNoteSchema>;

export function parseCompanySupportNoteInput(
  raw: unknown,
): ParseOk<CompanySupportNoteParsed> | ParseFail {
  return parseWithFieldErrors(companySupportNoteSchema, raw);
}

export const suspendCompanySchema = z.object({
  companyId: z.string().uuid("Invalid company id"),
  reason: z
    .string()
    .trim()
    .max(2000, "Reason must be 2000 characters or fewer")
    .optional()
    .or(z.literal(""))
    .transform((v) => (v === "" || v == null ? null : v)),
});

export type SuspendCompanyParsed = z.infer<typeof suspendCompanySchema>;

export function parseSuspendCompanyInput(
  raw: unknown,
): ParseOk<SuspendCompanyParsed> | ParseFail {
  return parseWithFieldErrors(suspendCompanySchema, raw);
}

export const grantComplimentarySchema = z.object({
  companyId: z.string().uuid("Invalid company id"),
  note: z
    .string()
    .trim()
    .max(2000, "Note must be 2000 characters or fewer")
    .optional()
    .or(z.literal(""))
    .transform((v) => (v === "" || v == null ? null : v)),
  expiresAt: z
    .string()
    .trim()
    .optional()
    .or(z.literal(""))
    .transform((v) => (v === "" || v == null ? null : v))
    .refine(
      (v) => v == null || !Number.isNaN(Date.parse(v)),
      "Enter a valid expiry date",
    ),
});

export type GrantComplimentaryParsed = z.infer<typeof grantComplimentarySchema>;

export function parseGrantComplimentaryInput(
  raw: unknown,
): ParseOk<GrantComplimentaryParsed> | ParseFail {
  return parseWithFieldErrors(grantComplimentarySchema, raw);
}

export const extendTrialSchema = z.object({
  companyId: z.string().uuid("Invalid company id"),
  days: z.coerce.number().int().min(1).max(90),
});

export type ExtendTrialParsed = z.infer<typeof extendTrialSchema>;

export function parseExtendTrialInput(
  raw: unknown,
): ParseOk<ExtendTrialParsed> | ParseFail {
  return parseWithFieldErrors(extendTrialSchema, raw);
}

export const updateTierSchema = z.object({
  slug: z.enum(["trial", "essentials", "premium"]),
  maxUsers: z.coerce.number().int().min(0).max(1000),
  vatExport: z
    .union([z.literal("on"), z.literal("true"), z.literal("1"), z.literal("")])
    .optional()
    .transform((v) => v === "on" || v === "true" || v === "1"),
  liveBankFeed: z
    .union([z.literal("on"), z.literal("true"), z.literal("1"), z.literal("")])
    .optional()
    .transform((v) => v === "on" || v === "true" || v === "1"),
  prioritySupport: z
    .union([z.literal("on"), z.literal("true"), z.literal("1"), z.literal("")])
    .optional()
    .transform((v) => v === "on" || v === "true" || v === "1"),
});

export type UpdateTierParsed = z.infer<typeof updateTierSchema>;

export function parseUpdateTierInput(
  raw: unknown,
): ParseOk<UpdateTierParsed> | ParseFail {
  return parseWithFieldErrors(updateTierSchema, raw);
}

export const deleteCompanySchema = z.object({
  companyId: z.string().uuid("Invalid company id"),
  confirmationName: z
    .string()
    .trim()
    .min(1, "Type the company name to confirm deletion"),
});

export type DeleteCompanyParsed = z.infer<typeof deleteCompanySchema>;

export function parseDeleteCompanyInput(
  raw: unknown,
): ParseOk<DeleteCompanyParsed> | ParseFail {
  return parseWithFieldErrors(deleteCompanySchema, raw);
}
