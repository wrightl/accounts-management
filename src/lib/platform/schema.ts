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
