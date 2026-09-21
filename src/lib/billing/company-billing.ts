import "server-only";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { companyBilling } from "@/db/schema";
import { TRIAL_DAYS } from "@/lib/billing/constants";

export function trialEndsAtFrom(now = new Date()): Date {
  const d = new Date(now);
  d.setUTCDate(d.getUTCDate() + TRIAL_DAYS);
  return d;
}

/** Insert trial billing row if missing (idempotent). */
export async function ensureCompanyBilling(companyId: string): Promise<void> {
  const db = getDb();
  const [existing] = await db
    .select({ id: companyBilling.id })
    .from(companyBilling)
    .where(eq(companyBilling.companyId, companyId))
    .limit(1);
  if (existing) return;

  await db.insert(companyBilling).values({
    companyId,
    plan: "trial",
    status: "trialing",
    access: "standard",
    trialEndsAt: trialEndsAtFrom(),
  });
}

export async function startCompanyTrial(companyId: string): Promise<void> {
  const db = getDb();
  await db.insert(companyBilling).values({
    companyId,
    plan: "trial",
    status: "trialing",
    access: "standard",
    trialEndsAt: trialEndsAtFrom(),
  });
}
