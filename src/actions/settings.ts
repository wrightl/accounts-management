"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { companySettings } from "@/db/schema";
import { requireActionPermission } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";
import { ensureLocalUser } from "@/lib/users";
import { financialYearEndMonth } from "@/lib/dates";
import { DEFAULT_RECEIPT_OCR_MODEL, isGatewayModelId } from "@/lib/expenses/receipt-ocr-models";
import { getOrCreateCompanySettings } from "@/lib/settings/queries";
import { storeCompanyLogo } from "@/lib/company-logo";
import type { ActionResult } from "@/actions/result";

const settingsSchema = z.object({
  name: z.string().trim().min(1).max(200),
  legalName: z.string().trim().min(1).max(200),
  companyNumber: z
    .string()
    .trim()
    .optional()
    .or(z.literal(""))
    .transform((v) => (v === "" ? null : v ?? null)),
  utr: z
    .string()
    .trim()
    .optional()
    .or(z.literal(""))
    .transform((v) => (v === "" ? null : v ?? null)),
  addressLines: z
    .string()
    .trim()
    .optional()
    .or(z.literal(""))
    .transform((v) => (v === "" ? null : v ?? null)),
  email: z
    .union([z.literal(""), z.string().trim().email("Enter a valid email address")])
    .transform((v) => (v === "" ? null : v)),
  bankName: z.string().trim().min(1).max(100),
  bankAccountName: z
    .string()
    .trim()
    .optional()
    .or(z.literal(""))
    .transform((v) => (v === "" ? null : v ?? null)),
  sortCode: z
    .string()
    .trim()
    .optional()
    .or(z.literal(""))
    .transform((v) => (v === "" ? null : v ?? null)),
  accountNumber: z
    .string()
    .trim()
    .optional()
    .or(z.literal(""))
    .transform((v) => (v === "" ? null : v ?? null)),
  financialYearStartMonth: z.coerce.number().int().min(1).max(12),
  invoiceNumberPrefix: z
    .string()
    .trim()
    .min(1)
    .max(10)
    .regex(/^[A-Za-z0-9]+$/, "Prefix must be alphanumeric"),
  quoteNumberPrefix: z
    .string()
    .trim()
    .min(1)
    .max(10)
    .regex(/^[A-Za-z0-9]+$/, "Prefix must be alphanumeric"),
  orderNumberPrefix: z
    .string()
    .trim()
    .min(1)
    .max(10)
    .regex(/^[A-Za-z0-9]+$/, "Prefix must be alphanumeric"),
  invoicePaymentTermsDays: z.coerce.number().int().min(1).max(365),
  defaultMileageRatePence: z.coerce.number().int().min(1).max(1000),
  receiptOcrProvider: z.enum(["local", "ai_gateway"]),
  receiptOcrModel: z
    .string()
    .trim()
    .min(1, "Choose an AI Gateway model")
    .max(120)
    .refine(
      isGatewayModelId,
      "Enter a model as provider/model, e.g. google/gemini-2.5-flash",
    ),
});

export async function updateCompany(formData: FormData): Promise<ActionResult> {
  const authz = await requireActionPermission("settings:manage");
  if (!authz.ok) return authz;
  if (!authz.user.companyId) {
    return { ok: false, error: "Complete onboarding before using the dashboard." };
  }
  const companyId = authz.user.companyId;

  const session = authz.user;
  const localUserId = await ensureLocalUser(session);

  const parsed = settingsSchema.safeParse({
    name: formData.get("name"),
    legalName: formData.get("legalName"),
    companyNumber: formData.get("companyNumber") ?? "",
    utr: formData.get("utr") ?? "",
    addressLines: formData.get("addressLines") ?? "",
    email: formData.get("email") ?? "",
    bankName: formData.get("bankName") ?? "Starling",
    bankAccountName: formData.get("bankAccountName") ?? "",
    sortCode: formData.get("sortCode") ?? "",
    accountNumber: formData.get("accountNumber") ?? "",
    financialYearStartMonth: formData.get("financialYearStartMonth") ?? "4",
    invoiceNumberPrefix: formData.get("invoiceNumberPrefix") ?? "DD",
    quoteNumberPrefix: formData.get("quoteNumberPrefix") ?? "Q",
    orderNumberPrefix: formData.get("orderNumberPrefix") ?? "O",
    invoicePaymentTermsDays: formData.get("invoicePaymentTermsDays") ?? "14",
    defaultMileageRatePence: formData.get("defaultMileageRatePence") ?? "45",
    receiptOcrProvider: formData.get("receiptOcrProvider") ?? "local",
    receiptOcrModel: formData.get("receiptOcrModel") ?? DEFAULT_RECEIPT_OCR_MODEL,
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const { financialYearStartMonth: fyStart, ...rest } = parsed.data;
  const current = await getOrCreateCompanySettings(companyId);
  const patch = {
    ...rest,
    companyNumber:
      current.entityType === "limited_company" ? rest.companyNumber : null,
    utr: current.entityType === "sole_trader" ? rest.utr : null,
  };
  const db = getDb();
  await db
    .update(companySettings)
    .set({
      ...patch,
      financialYearEndMonth: financialYearEndMonth(fyStart),
      updatedAt: new Date(),
    })
    .where(eq(companySettings.id, current.id));

  const logo = formData.get("logo");
  if (logo instanceof File && logo.size > 0) {
    const uploaded = await storeCompanyLogo(companyId, logo);
    if (!uploaded.ok) return uploaded;
  }

  await writeAudit({
    companyId,
    actorUserId: localUserId,
    action: "settings.update",
    entityType: "company_settings",
    entityId: current.id,
  });

  revalidatePath("/dashboard/settings");
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/spending");
  revalidatePath("/dashboard/reports");
  return { ok: true, id: current.id };
}

export async function uploadLogo(formData: FormData): Promise<ActionResult> {
  const authz = await requireActionPermission("settings:manage");
  if (!authz.ok) return authz;
  if (!authz.user.companyId) {
    return { ok: false, error: "Complete onboarding before using the dashboard." };
  }
  const companyId = authz.user.companyId;

  const session = authz.user;
  const localUserId = await ensureLocalUser(session);

  const file = formData.get("logo");
  if (!(file instanceof File)) {
    return { ok: false, error: "Choose an image file" };
  }

  const uploaded = await storeCompanyLogo(companyId, file);
  if (!uploaded.ok) return uploaded;

  await writeAudit({
    companyId,
    actorUserId: localUserId,
    action: "settings.logo",
    entityType: "company_settings",
    entityId: companyId,
    meta: { path: uploaded.path },
  });

  revalidatePath("/dashboard/settings");
  revalidatePath("/dashboard");
  return { ok: true, id: companyId };
}
