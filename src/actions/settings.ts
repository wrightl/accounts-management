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
import { getOrCreateCompanySettings } from "@/lib/settings/queries";
import { getStorage } from "@/lib/storage";
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
  addressLines: z
    .string()
    .trim()
    .optional()
    .or(z.literal(""))
    .transform((v) => (v === "" ? null : v ?? null)),
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
});

export async function updateCompany(formData: FormData): Promise<ActionResult> {
  const authz = await requireActionPermission("settings:manage");
  if (!authz.ok) return authz;
  const session = authz.user;
  const localUserId = await ensureLocalUser(session);

  const parsed = settingsSchema.safeParse({
    name: formData.get("name"),
    legalName: formData.get("legalName"),
    companyNumber: formData.get("companyNumber") ?? "",
    addressLines: formData.get("addressLines") ?? "",
    bankName: formData.get("bankName") ?? "Starling",
    bankAccountName: formData.get("bankAccountName") ?? "",
    sortCode: formData.get("sortCode") ?? "",
    accountNumber: formData.get("accountNumber") ?? "",
    financialYearStartMonth: formData.get("financialYearStartMonth") ?? "4",
    invoiceNumberPrefix: formData.get("invoiceNumberPrefix") ?? "DD",
    quoteNumberPrefix: formData.get("quoteNumberPrefix") ?? "Q",
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const { financialYearStartMonth: fyStart, ...rest } = parsed.data;
  const current = await getOrCreateCompanySettings();
  const db = getDb();
  await db
    .update(companySettings)
    .set({
      ...rest,
      financialYearEndMonth: financialYearEndMonth(fyStart),
      updatedAt: new Date(),
    })
    .where(eq(companySettings.id, current.id));

  await writeAudit({
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
  const session = authz.user;
  const localUserId = await ensureLocalUser(session);

  const file = formData.get("logo");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "Choose an image file" };
  }
  if (file.size > 2 * 1024 * 1024) {
    return { ok: false, error: "Logo must be under 2 MB" };
  }
  const contentType = file.type || "application/octet-stream";
  if (!contentType.startsWith("image/")) {
    return { ok: false, error: "Logo must be an image" };
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  const storage = getStorage();
  const stored = await storage.put(
    `company/logo-${Date.now()}`,
    bytes,
    contentType,
  );

  const current = await getOrCreateCompanySettings();
  const db = getDb();
  await db
    .update(companySettings)
    .set({ logoUrl: stored.path, updatedAt: new Date() })
    .where(eq(companySettings.id, current.id));

  await writeAudit({
    actorUserId: localUserId,
    action: "settings.logo",
    entityType: "company_settings",
    entityId: current.id,
    meta: { path: stored.path },
  });

  revalidatePath("/dashboard/settings");
  return { ok: true, id: current.id };
}
