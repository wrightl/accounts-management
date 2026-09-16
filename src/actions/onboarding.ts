"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { getDb } from "@/db";
import { companies } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";
import { storeCompanyLogo } from "@/lib/company-logo";
import { uniquifyCompanySlug } from "@/lib/expenses/inbound-mailbox";
import { isPlatformAdmin } from "@/lib/platform";
import { ensureLocalUser, assignUserCompany, findLocalUser } from "@/lib/users";
import { resolveBankFieldsFromForm } from "@/lib/bank/resolve-bank-fields";
import type { ActionResult } from "@/actions/result";

const onboardingSchema = z.discriminatedUnion("entityType", [
  z.object({
    entityType: z.literal("limited_company"),
    userName: z.string().trim().min(1, "Your name is required").max(200),
    name: z.string().trim().min(1).max(200),
    legalName: z.string().trim().min(1).max(200),
    companyNumber: z.string().trim().min(1).max(20),
    addressLines: z
      .string()
      .trim()
      .optional()
      .or(z.literal(""))
      .transform((v) => (v === "" ? null : (v ?? null))),
    email: z
      .union([z.literal(""), z.string().trim().email()])
      .transform((v) => (v === "" ? null : v)),
    financialYearEndMonth: z.coerce.number().int().min(1).max(12),
  }),
  z.object({
    entityType: z.literal("sole_trader"),
    userName: z.string().trim().min(1, "Your name is required").max(200),
    name: z.string().trim().min(1).max(200),
    legalName: z.string().trim().min(1).max(200),
    utr: z
      .string()
      .trim()
      .optional()
      .or(z.literal(""))
      .transform((v) => (v === "" ? null : (v ?? null))),
    addressLines: z
      .string()
      .trim()
      .optional()
      .or(z.literal(""))
      .transform((v) => (v === "" ? null : (v ?? null))),
    email: z
      .union([z.literal(""), z.string().trim().email()])
      .transform((v) => (v === "" ? null : v)),
    financialYearEndMonth: z.coerce.number().int().min(1).max(12),
  }),
]);

/**
 * Create the user's company and attach them as admin.
 * Idempotent if they already have a companyId (redirects to dashboard).
 */
export async function completeOnboarding(
  formData: FormData,
): Promise<ActionResult> {
  let session = await requireUser();
  const localUserId = await ensureLocalUser(session);
  const local = await findLocalUser(session.userId);
  if (local) {
    session = {
      ...session,
        role: local.role,
        companyId: local.companyId,
        localUserId: local.id,
      };
  }

  if (isPlatformAdmin(session)) {
    return {
      ok: false,
      error: "Platform operators cannot join a company. Use the platform portal.",
    };
  }
  if (session.companyId) {
    redirect("/dashboard");
  }

  const entityType = formData.get("entityType");
  const raw =
    entityType === "sole_trader"
      ? {
          entityType: "sole_trader" as const,
          userName: formData.get("userName"),
          name: formData.get("name"),
          legalName: formData.get("legalName"),
          utr: formData.get("utr") ?? "",
          addressLines: formData.get("addressLines") ?? "",
          email: formData.get("email") ?? "",
          financialYearEndMonth: formData.get("financialYearEndMonth") ?? "3",
        }
      : {
          entityType: "limited_company" as const,
          userName: formData.get("userName"),
          name: formData.get("name"),
          legalName: formData.get("legalName"),
          companyNumber: formData.get("companyNumber"),
          addressLines: formData.get("addressLines") ?? "",
          email: formData.get("email") ?? "",
          financialYearEndMonth: formData.get("financialYearEndMonth") ?? "3",
        };

  const parsed = onboardingSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input",
    };
  }

  const bank = resolveBankFieldsFromForm({
    bankProvider: formData.get("bankProvider"),
    bankName: formData.get("bankName"),
    required: false,
  });
  if (!bank.ok) return { ok: false, error: bank.error };

  const db = getDb();
  const data = parsed.data;

  const prefix =
    data.name
      .replace(/[^A-Za-z0-9]/g, "")
      .slice(0, 4)
      .toUpperCase() || "INV";

  const slug = await uniquifyCompanySlug(data.name);

  const [company] = await db
    .insert(companies)
    .values({
      entityType: data.entityType,
      name: data.name,
      legalName: data.legalName,
      slug,
      companyNumber:
        data.entityType === "limited_company" ? data.companyNumber : null,
      utr: data.entityType === "sole_trader" ? data.utr : null,
      addressLines: data.addressLines,
      email: data.email ?? session.email,
      bankProvider: bank.value.bankProvider,
      bankName: bank.value.bankName,
      bankAccountName: (() => {
        const v = formData.get("bankAccountName");
        return typeof v === "string" && v.trim() ? v.trim() : null;
      })(),
      sortCode: (() => {
        const v = formData.get("sortCode");
        return typeof v === "string" && v.trim() ? v.trim() : null;
      })(),
      accountNumber: (() => {
        const v = formData.get("accountNumber");
        return typeof v === "string" && v.trim() ? v.trim() : null;
      })(),
      financialYearEndMonth: data.financialYearEndMonth,
      invoiceNumberPrefix: prefix.slice(0, 10) || "INV",
    })
    .returning();

  const logo = formData.get("logo");
  if (logo instanceof File && logo.size > 0) {
    const uploaded = await storeCompanyLogo(company.id, logo);
    if (!uploaded.ok) {
      return uploaded;
    }
  }

  await assignUserCompany(localUserId, company.id, {
    role: "admin",
    name: data.userName,
  });

  await writeAudit({
    companyId: company.id,
    actorUserId: localUserId,
    action: "onboarding.complete",
    entityType: "company",
    entityId: company.id,
    meta: { entityType: data.entityType },
  });

  redirect("/dashboard");
}
