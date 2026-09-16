import "server-only";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { companies, type Company, type EntityType } from "@/db/schema";
import {
  ForbiddenError,
  getCurrentUser,
  requireUser,
  type SessionUser,
} from "@/lib/auth";
import { redirect } from "next/navigation";
import { resolvePlatformAdmin } from "@/lib/bootstrap";

// ForbiddenError is the canonical name in auth.ts.

export type TenantContext = {
  companyId: string;
  entityType: EntityType;
  company: Company;
  session: SessionUser;
  localUserId: string;
};

/** Load a company by id. Throws if missing (fail closed). */
export async function getCompany(companyId: string): Promise<Company> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(companies)
    .where(eq(companies.id, companyId))
    .limit(1);
  if (!row) {
    throw new Error(`Company not found: ${companyId}`);
  }
  return row;
}

/** List all companies (cron / ops). */
export async function listCompanies(): Promise<Company[]> {
  const db = getDb();
  return db.select().from(companies);
}

/**
 * First company created (Dot + Dash after backfill). Prefer tenant-scoped
 * helpers; kept for ops / legacy single-tenant call sites.
 */
export async function getPrimaryCompany(): Promise<Company | null> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(companies)
    .orderBy(companies.createdAt)
    .limit(1);
  return row ?? null;
}

/**
 * Require a signed-in user with a completed company. Redirects platform
 * operators to the portal and everyone else to onboarding when companyId is null.
 */
export async function requireTenant(): Promise<{
  session: SessionUser;
  companyId: string;
  entityType: EntityType;
}> {
  const session = await requireUser();
  if (!session.companyId || !session.entityType) {
    if (
      resolvePlatformAdmin({
        role: session.role,
        email: session.email,
      })
    ) {
      redirect("/platform");
    }
    redirect("/onboarding");
  }
  return {
    session,
    companyId: session.companyId,
    entityType: session.entityType,
  };
}

/** Soft check: current user has a company, or null. */
export async function getTenantOrNull(): Promise<{
  session: SessionUser;
  companyId: string;
  entityType: EntityType;
} | null> {
  const session = await getCurrentUser();
  if (!session?.companyId || !session.entityType) return null;
  return {
    session,
    companyId: session.companyId,
    entityType: session.entityType,
  };
}

/** Guard Ltd-only features (shareholders / dividends). */
export function assertLimitedCompany(entityType: EntityType): void {
  if (entityType !== "limited_company") {
    throw new ForbiddenError("accounts:read");
  }
}
