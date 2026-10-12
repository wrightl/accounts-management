"use server";

import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { companies } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { mutate } from "@/lib/mutate";
import { lookupCompany } from "@/lib/companies-house/client";
import type { CompaniesHouseCompany } from "@/lib/companies-house/parse";
import {
  companiesHouseDetailsFromFormData,
  parseCompaniesHouseDetails,
} from "@/lib/companies-house/schema";
import type { ActionResult } from "@/actions/result";

export type CompaniesHouseLookupResult =
  | { ok: true; company: CompaniesHouseCompany }
  | { ok: false; error: string };

/** Look a company up by number, for prefilling onboarding. Read only. */
export async function lookupCompaniesHouse(
  companyNumber: string,
): Promise<CompaniesHouseLookupResult> {
  await requireUser();
  return lookupCompany(companyNumber);
}

/**
 * Refresh the incorporation date, filing deadlines and directors from
 * Companies House. The name, address and year end are left alone: those are
 * edited in Settings, where a change is deliberate.
 */
export async function refreshFromCompaniesHouse(): Promise<ActionResult> {
  return mutate(
    "settings:manage",
    async ({ companyId, entityType }) => {
      if (entityType !== "limited_company") {
        return { ok: false, error: "Companies House details are for limited companies." };
      }
      const db = getDb();
      const [company] = await db
        .select({ companyNumber: companies.companyNumber, directorNames: companies.directorNames })
        .from(companies)
        .where(eq(companies.id, companyId))
        .limit(1);
      if (!company?.companyNumber) {
        return { ok: false, error: "Add your company number in Settings first." };
      }

      const result = await lookupCompany(company.companyNumber);
      if (!result.ok) return result;
      const ch = result.company;

      await db
        .update(companies)
        .set({
          incorporatedOn: ch.incorporatedOn,
          accountsDue: ch.accountsDue,
          confirmationStatementDue: ch.confirmationStatementDue,
          // Keep hand-entered directors if Companies House lists none.
          directorNames: ch.directors.length ? ch.directors.join("\n") : company.directorNames,
          companiesHouseSyncedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(companies.id, companyId));
      return { ok: true, id: companyId };
    },
    {
      audit: { action: "company.companies_house_refresh", entityType: "company" },
      paths: ["/company", "/settings/business", "/deadlines"],
    },
  );
}

/** Save the Companies House details by hand. */
export async function saveCompaniesHouseDetails(formData: FormData): Promise<ActionResult> {
  const parsed = parseCompaniesHouseDetails(companiesHouseDetailsFromFormData(formData));
  if (!parsed.ok) return parsed;
  const details = parsed.data;

  return mutate(
    "settings:manage",
    async ({ companyId, entityType }) => {
      if (entityType !== "limited_company") {
        return { ok: false, error: "Companies House details are for limited companies." };
      }
      await getDb()
        .update(companies)
        .set({ ...details, updatedAt: new Date() })
        .where(eq(companies.id, companyId));
      return { ok: true, id: companyId };
    },
    {
      audit: {
        action: "company.companies_house_details",
        entityType: "company",
        meta: {
          incorporatedOn: details.incorporatedOn,
          accountsDue: details.accountsDue,
          confirmationStatementDue: details.confirmationStatementDue,
        },
      },
      paths: ["/company", "/settings/business", "/deadlines"],
    },
  );
}
