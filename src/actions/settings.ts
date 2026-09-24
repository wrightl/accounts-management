"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { companySettings } from "@/db/schema";
import { requireActionPermission } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";
import { deleteCompanyById } from "@/lib/companies/delete";
import { mutate } from "@/lib/mutate";
import { financialYearEndMonth } from "@/lib/dates";
import { getOrCreateCompanySettings } from "@/lib/settings/queries";
import { storeCompanyLogo } from "@/lib/company-logo";
import { ensureLocalUser } from "@/lib/users";
import {
  companySettingsRawFromFormData,
  parseCompanySettingsInput,
  parseDeleteOwnCompanyInput,
} from "@/lib/settings/schema";
import type { ActionResult } from "@/actions/result";

export async function updateCompany(formData: FormData): Promise<ActionResult> {
  const parsed = parseCompanySettingsInput(
    companySettingsRawFromFormData(formData),
    { bankRequired: true },
  );
  if (!parsed.ok) {
    return {
      ok: false,
      error: parsed.error,
      fieldErrors: parsed.fieldErrors,
    };
  }

  return mutate(
    "settings:manage",
    async ({ companyId }) => {
      const { financialYearStartMonth: fyStart, ...rest } = parsed.data;
      const current = await getOrCreateCompanySettings(companyId);
      const patch = {
        name: rest.name,
        legalName: rest.legalName,
        vatRegistered: rest.vatRegistered,
        vatNumber: rest.vatRegistered ? rest.vatNumber : null,
        defaultVatRate: rest.defaultVatRate,
        addressLines: rest.addressLines,
        email: rest.email,
        bankAccountName: rest.bankAccountName,
        sortCode: rest.sortCode,
        accountNumber: rest.accountNumber,
        invoiceNumberPrefix: rest.invoiceNumberPrefix,
        quoteNumberPrefix: rest.quoteNumberPrefix,
        orderNumberPrefix: rest.orderNumberPrefix,
        invoicePaymentTermsDays: rest.invoicePaymentTermsDays,
        defaultMileageRatePence: rest.defaultMileageRatePence,
        bankProvider: rest.bankProvider,
        bankName: rest.bankName,
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
        if (!uploaded.ok) {
          return {
            ok: false as const,
            error: uploaded.error,
            fieldErrors: { logo: uploaded.error },
          };
        }
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
    return {
      ok: false,
      error: "Choose an image file",
      fieldErrors: { logo: "Choose an image file" },
    };
  }

  return mutate(
    "settings:manage",
    async ({ companyId, localUserId }) => {
      const uploaded = await storeCompanyLogo(companyId, file);
      if (!uploaded.ok) {
        return {
          ok: false as const,
          error: uploaded.error,
          fieldErrors: { logo: uploaded.error },
        };
      }

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

/**
 * Permanently delete the signed-in admin's company.
 * Bypasses suspended / billing read-only gates so teardown still works.
 */
export async function deleteCompany(
  confirmationName: string,
): Promise<ActionResult> {
  const parsed = parseDeleteOwnCompanyInput({ confirmationName });
  if (!parsed.ok) {
    return {
      ok: false,
      error: parsed.error,
      fieldErrors: parsed.fieldErrors,
    };
  }

  const authz = await requireActionPermission("settings:manage");
  if (!authz.ok) return authz;
  if (!authz.user.companyId) {
    return { ok: false, error: "Complete onboarding before using the dashboard." };
  }

  const companyId = authz.user.companyId;
  const localUserId = await ensureLocalUser(authz.user);
  const result = await deleteCompanyById(
    companyId,
    parsed.data.confirmationName,
    {
      actorUserId: localUserId,
      auditAction: "company.delete",
    },
  );
  if (!result.ok) return result;

  revalidatePath("/settings");
  revalidatePath("/dashboard");
  revalidatePath("/onboarding");
  revalidatePath("/");
  revalidatePath("/platform/companies");

  return { ok: true, id: result.id };
}
