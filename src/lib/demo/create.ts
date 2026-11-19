import "server-only";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { companies, companyBilling, users } from "@/db/schema";
import { DEMO_ACCOUNTANT_NAME, DEMO_COMPANY, DEMO_DIRECTORS } from "@/lib/demo/story";
import { resetDemoCompany, type DemoResetResult } from "@/lib/demo/reset";
import { findUserByEmail, normalizeEmail, upsertMembership } from "@/lib/users";
import type { TenantRole } from "@/lib/roles";

export type CreateDemoResult = {
  companyId: string;
  created: boolean;
  reset: DemoResetResult;
};

/**
 * A user for the demo, by email. A new row has no Clerk id: the person's first
 * verified sign-in with that email claims it (see `ensureLocalUser`).
 */
async function ensureDemoUser(email: string, name: string, role: TenantRole, companyId: string) {
  const existing = await findUserByEmail(email);
  let id = existing?.id;
  if (!id) {
    const [row] = await getDb()
      .insert(users)
      .values({ email: normalizeEmail(email), name, role, companyId })
      .returning({ id: users.id });
    id = row!.id;
  }
  await upsertMembership(id, companyId, role);
  return id;
}

/**
 * Set up the demo company once: the company (flagged `is_demo`), complimentary
 * premium billing, the demo logins and the second director, then fill it with
 * data. Running it again reuses the same company and just resets it.
 */
export async function createDemoCompany(options: {
  adminEmail: string;
  accountantEmail: string;
  today?: string;
}): Promise<CreateDemoResult> {
  const db = getDb();
  let created = false;
  let [company] = await db
    .select({ id: companies.id, isDemo: companies.isDemo })
    .from(companies)
    .where(eq(companies.slug, DEMO_COMPANY.slugBase))
    .limit(1);
  if (company && !company.isDemo) {
    throw new Error(`A company with the slug ${DEMO_COMPANY.slugBase} exists but isn't a demo company.`);
  }
  if (!company) {
    [company] = await db
      .insert(companies)
      .values({
        entityType: "limited_company",
        name: DEMO_COMPANY.name,
        legalName: DEMO_COMPANY.legalName,
        slug: DEMO_COMPANY.slugBase,
        isDemo: true,
      })
      .returning({ id: companies.id, isDemo: companies.isDemo });
    created = true;
  }
  const companyId = company!.id;

  const now = new Date();
  await db
    .insert(companyBilling)
    .values({
      companyId,
      plan: "premium",
      status: "active",
      access: "complimentary_unlimited",
      complimentaryGrantedAt: now,
      complimentaryNote: "Demo company",
    })
    .onConflictDoUpdate({
      target: companyBilling.companyId,
      set: {
        plan: "premium",
        status: "active",
        access: "complimentary_unlimited",
        complimentaryExpiresAt: null,
        complimentaryNote: "Demo company",
        updatedAt: now,
      },
    });

  await ensureDemoUser(options.adminEmail, DEMO_DIRECTORS.lead.name, "admin", companyId);
  await ensureDemoUser(DEMO_DIRECTORS.second.email, DEMO_DIRECTORS.second.name, "user", companyId);
  await ensureDemoUser(options.accountantEmail, DEMO_ACCOUNTANT_NAME, "accountant", companyId);

  const reset = await resetDemoCompany({ companyId, today: options.today });
  return { companyId, created, reset };
}
