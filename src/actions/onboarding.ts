"use server";

import { redirect } from "next/navigation";
import { getDb } from "@/db";
import { companies } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";
import { storeCompanyLogo } from "@/lib/company-logo";
import { uniquifyCompanySlug } from "@/lib/expenses/inbound-mailbox";
import { isPlatformAdmin } from "@/lib/platform";
import { ensureLocalUser, assignUserCompany, findLocalUser } from "@/lib/users";
import {
  onboardingRawFromFormData,
  parseOnboardingInput,
} from "@/lib/onboarding/schema";
import type { ActionResult } from "@/actions/result";

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

  const parsed = parseOnboardingInput(onboardingRawFromFormData(formData));
  if (!parsed.ok) {
    return {
      ok: false,
      error: parsed.error,
      fieldErrors: parsed.fieldErrors,
    };
  }

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
      bankProvider: data.bankProvider,
      bankName: data.bankName,
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
      return {
        ok: false,
        error: uploaded.error,
        fieldErrors: { logo: uploaded.error },
      };
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
