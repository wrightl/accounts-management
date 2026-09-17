"use server";

import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { companySettings } from "@/db/schema";
import { writeAudit } from "@/lib/audit";
import { mutate } from "@/lib/mutate";
import { financialYearEndMonth } from "@/lib/dates";
import { getOrCreateCompanySettings } from "@/lib/settings/queries";
import { storeCompanyLogo } from "@/lib/company-logo";
import { resolveBankFieldsFromForm } from "@/lib/bank/resolve-bank-fields";
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
});

export async function updateCompany(formData: FormData): Promise<ActionResult> {
  const bank = resolveBankFieldsFromForm({
    bankProvider: formData.get("bankProvider"),
    bankName: formData.get("bankName"),
    required: true,
  });
  if (!bank.ok) return { ok: false, error: bank.error };

  const parsed = settingsSchema.safeParse({
    name: formData.get("name"),
    legalName: formData.get("legalName"),
    companyNumber: formData.get("companyNumber") ?? "",
    utr: formData.get("utr") ?? "",
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
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  return mutate(
    "settings:manage",
    async ({ companyId }) => {
      const { financialYearStartMonth: fyStart, ...rest } = parsed.data;
      const current = await getOrCreateCompanySettings(companyId);
      const patch = {
        ...rest,
        bankProvider: bank.value.bankProvider,
        bankName: bank.value.bankName,
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

      return { ok: true, id: current.id };
    },
    {
      audit: { action: "settings.update", entityType: "company_settings" },
      paths: ["/settings", "/dashboard", "/spending", "/reports", "/transactions"],
    },
  );
}

export async function uploadLogo(formData: FormData): Promise<ActionResult> {
  const file = formData.get("logo");
  if (!(file instanceof File)) {
    return { ok: false, error: "Choose an image file" };
  }

  return mutate(
    "settings:manage",
    async ({ companyId, localUserId }) => {
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

      return { ok: true, id: companyId };
    },
    { paths: ["/settings", "/dashboard"] },
  );
}
