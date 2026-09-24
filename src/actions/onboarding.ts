"use server";

import { cookies } from "next/headers";
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
import {
  SIGNUP_PLAN_COOKIE,
  parseSignupPlanCookie,
  type SignupPlanChoice,
} from "@/lib/signup-plan";
import type { ActionResult } from "@/actions/result";

async function readSignupPlanChoice(): Promise<SignupPlanChoice | null> {
  const jar = await cookies();
  return parseSignupPlanCookie(jar.get(SIGNUP_PLAN_COOKIE)?.value);
}

/**
 * Create the user's company and attach them as admin.
 * Idempotent if they already have a companyId (redirects to dashboard).
 * Trial starts a 30-day trial; paid tiers open Stripe Checkout.
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

  const planChoice = await readSignupPlanChoice();
  if (!planChoice) {
    return {
      ok: false,
      error: "Choose a subscription tier before finishing setup.",
    };
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

  const { clearSignupPlanCookie } = await import("@/actions/signup-plan");

  if (planChoice.plan === "trial") {
    const { startCompanyTrial } = await import("@/lib/billing/company-billing");
    await startCompanyTrial(company.id);

    try {
      const { sendBillingEmail } = await import("@/lib/billing/emails");
      await sendBillingEmail(
        company.id,
        "trial_welcome",
        `welcome_${company.id}`,
      );
    } catch {
      /* best-effort */
    }

    await writeAudit({
      companyId: company.id,
      actorUserId: localUserId,
      action: "onboarding.complete",
      entityType: "company",
      entityId: company.id,
      meta: { entityType: data.entityType, plan: "trial" },
    });

    await clearSignupPlanCookie();
    redirect("/dashboard");
  }

  const { startCompanyPaidSignup } = await import(
    "@/lib/billing/company-billing"
  );
  await startCompanyPaidSignup(
    company.id,
    planChoice.plan,
    planChoice.interval,
  );

  await writeAudit({
    companyId: company.id,
    actorUserId: localUserId,
    action: "onboarding.complete",
    entityType: "company",
    entityId: company.id,
    meta: {
      entityType: data.entityType,
      plan: planChoice.plan,
      interval: planChoice.interval,
    },
  });

  await clearSignupPlanCookie();

  const { startSignupCheckout } = await import("@/actions/billing");
  return startSignupCheckout({
    companyId: company.id,
    plan: planChoice.plan,
    interval: planChoice.interval,
    actorEmail: session.email,
  });
}
