import "server-only";
import { count, desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import {
  companies,
  companyBilling,
  subscriptionTiers,
} from "@/db/schema";
import { catalogAmountPence, getStripeCatalog } from "@/lib/billing/catalog";
import {
  getEntitlements,
  isComplimentaryActive,
} from "@/lib/billing/entitlements";
import { ensureCompanyBilling } from "@/lib/billing/company-billing";

export async function getCompanyBillingDetail(companyId: string) {
  await ensureCompanyBilling(companyId);
  const db = getDb();
  const [row] = await db
    .select()
    .from(companyBilling)
    .where(eq(companyBilling.companyId, companyId))
    .limit(1);
  const entitlements = await getEntitlements(companyId);
  return { billing: row!, entitlements };
}

export async function listSubscriptionTiers() {
  const db = getDb();
  return db.select().from(subscriptionTiers).orderBy(subscriptionTiers.slug);
}

export type PlatformBillingStats = {
  trialing: number;
  activeEssentials: number;
  activePremium: number;
  pastDue: number;
  canceled: number;
  complimentary: number;
  readOnly: number;
  trialsEnding7d: number;
  mrrPence: number;
};

export async function getPlatformBillingStats(): Promise<PlatformBillingStats> {
  const db = getDb();
  const [rows, catalog] = await Promise.all([
    db.select().from(companyBilling),
    getStripeCatalog(),
  ]);
  const now = new Date();
  const in7 = new Date(now);
  in7.setUTCDate(in7.getUTCDate() + 7);

  let trialing = 0;
  let activeEssentials = 0;
  let activePremium = 0;
  let pastDue = 0;
  let canceled = 0;
  let complimentary = 0;
  let readOnly = 0;
  let trialsEnding7d = 0;
  let mrrPence = 0;

  for (const row of rows) {
    // Complimentary is its own bucket: the grant leaves `status` untouched
    // (often "trialing"), so counting status too would double-count it.
    // Complimentary companies are never read-only and pay nothing.
    if (isComplimentaryActive(row.access, row.complimentaryExpiresAt, now)) {
      complimentary += 1;
      continue;
    }

    if (row.status === "trialing") {
      trialing += 1;
      if (
        row.trialEndsAt &&
        row.trialEndsAt.getTime() >= now.getTime() &&
        row.trialEndsAt.getTime() <= in7.getTime()
      ) {
        trialsEnding7d += 1;
      }
    } else if (row.status === "active") {
      if (row.plan === "essentials") activeEssentials += 1;
      if (row.plan === "premium") activePremium += 1;
      if (row.plan === "essentials") {
        const year = catalogAmountPence(catalog, "essentials", "year");
        const month = catalogAmountPence(catalog, "essentials", "month");
        mrrPence +=
          row.billingInterval === "year" ? Math.round(year / 12) : month;
      } else if (row.plan === "premium") {
        const year = catalogAmountPence(catalog, "premium", "year");
        const month = catalogAmountPence(catalog, "premium", "month");
        mrrPence +=
          row.billingInterval === "year" ? Math.round(year / 12) : month;
      }
    } else if (row.status === "past_due") {
      pastDue += 1;
    } else if (row.status === "canceled" || row.status === "unpaid") {
      canceled += 1;
    }

    try {
      const e = await getEntitlements(row.companyId);
      if (e.readOnly) readOnly += 1;
    } catch {
      /* skip */
    }
  }

  return {
    trialing,
    activeEssentials,
    activePremium,
    pastDue,
    canceled,
    complimentary,
    readOnly,
    trialsEnding7d,
    mrrPence,
  };
}

export type PlatformBillingListItem = {
  companyId: string;
  companyName: string;
  plan: string;
  status: string;
  access: string;
  trialEndsAt: Date | null;
  currentPeriodEnd: Date | null;
  readOnly: boolean;
};

export async function countPlatformBillingCompanies(): Promise<number> {
  const [row] = await getDb()
    .select({ count: count() })
    .from(companyBilling)
    .innerJoin(companies, eq(companies.id, companyBilling.companyId));
  return Number(row?.count ?? 0);
}

export async function listPlatformBillingCompanies(
  opts?: { limit?: number; offset?: number },
): Promise<PlatformBillingListItem[]> {
  const db = getDb();
  const rows = await db
    .select({
      companyId: companyBilling.companyId,
      companyName: companies.name,
      plan: companyBilling.plan,
      status: companyBilling.status,
      access: companyBilling.access,
      trialEndsAt: companyBilling.trialEndsAt,
      currentPeriodEnd: companyBilling.currentPeriodEnd,
    })
    .from(companyBilling)
    .innerJoin(companies, eq(companies.id, companyBilling.companyId))
    .orderBy(desc(companyBilling.updatedAt), desc(companyBilling.companyId))
    .limit(Math.min(opts?.limit ?? 200, 200))
    .offset(opts?.offset ?? 0);

  const out: PlatformBillingListItem[] = [];
  for (const row of rows) {
    let readOnly = false;
    try {
      readOnly = (await getEntitlements(row.companyId)).readOnly;
    } catch {
      /* ignore */
    }
    out.push({ ...row, readOnly });
  }
  return out;
}
