import "server-only";
import { count, eq } from "drizzle-orm";
import { getDb } from "@/db";
import {
  companyBilling,
  companyMemberships,
  subscriptionTiers,
  type BillingPlan,
  type BillingStatus,
} from "@/db/schema";
import {
  DEFAULT_TIER_LIMITS,
  PAST_DUE_GRACE_DAYS,
  type PlanSlug,
} from "@/lib/billing/constants";

export type Entitlements = {
  plan: BillingPlan;
  status: BillingStatus;
  readOnly: boolean;
  maxUsers: number;
  vatExport: boolean;
  liveBankFeed: boolean;
  prioritySupport: boolean;
  complimentary: boolean;
  trialEndsAt: Date | null;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
  pastDueSince: Date | null;
  reason: "ok" | "trial_expired" | "plan_read_only" | "past_due";
};

const FALLBACK_ENTITLEMENTS: Entitlements = {
  plan: "trial",
  status: "trialing",
  readOnly: false,
  maxUsers: DEFAULT_TIER_LIMITS.trial.maxUsers,
  vatExport: false,
  liveBankFeed: false,
  prioritySupport: false,
  complimentary: false,
  trialEndsAt: null,
  currentPeriodEnd: null,
  cancelAtPeriodEnd: false,
  pastDueSince: null,
  reason: "ok",
};

function addDays(from: Date, days: number): Date {
  const d = new Date(from);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

function isComplimentaryActive(
  access: string,
  expiresAt: Date | null,
  now: Date,
): boolean {
  if (access !== "complimentary_unlimited") return false;
  if (expiresAt && expiresAt.getTime() <= now.getTime()) return false;
  return true;
}

function tierForPlan(plan: BillingPlan): PlanSlug {
  if (plan === "essentials" || plan === "premium" || plan === "trial") {
    return plan;
  }
  return "trial";
}

/**
 * Resolve write/feature entitlements for a company.
 * Complimentary unlimited bypasses every plan check.
 */
export async function getEntitlements(companyId: string): Promise<Entitlements> {
  const db = getDb();
  const now = new Date();

  const [billing] = await db
    .select()
    .from(companyBilling)
    .where(eq(companyBilling.companyId, companyId))
    .limit(1);

  if (!billing) {
    return { ...FALLBACK_ENTITLEMENTS };
  }

  const complimentary = isComplimentaryActive(
    billing.access,
    billing.complimentaryExpiresAt,
    now,
  );

  if (complimentary) {
    return {
      plan: billing.plan,
      status: billing.status,
      readOnly: false,
      maxUsers: 0,
      vatExport: true,
      liveBankFeed: true,
      prioritySupport: true,
      complimentary: true,
      trialEndsAt: billing.trialEndsAt,
      currentPeriodEnd: billing.currentPeriodEnd,
      cancelAtPeriodEnd: billing.cancelAtPeriodEnd,
      pastDueSince: billing.pastDueSince,
      reason: "ok",
    };
  }

  const planSlug = tierForPlan(billing.plan);
  const [tierRow] = await db
    .select()
    .from(subscriptionTiers)
    .where(eq(subscriptionTiers.slug, planSlug))
    .limit(1);
  const defaults = DEFAULT_TIER_LIMITS[planSlug];
  const maxUsers = tierRow?.maxUsers ?? defaults.maxUsers;
  const vatExport = tierRow?.vatExport ?? defaults.vatExport;
  const liveBankFeed = tierRow?.liveBankFeed ?? defaults.liveBankFeed;
  const prioritySupport = tierRow?.prioritySupport ?? defaults.prioritySupport;

  let readOnly = false;
  let reason: Entitlements["reason"] = "ok";

  if (billing.status === "trialing") {
    if (billing.trialEndsAt && billing.trialEndsAt.getTime() <= now.getTime()) {
      readOnly = true;
      reason = "trial_expired";
    }
  } else if (billing.status === "canceled" || billing.status === "unpaid") {
    readOnly = true;
    reason = "plan_read_only";
  } else if (billing.status === "past_due") {
    const since = billing.pastDueSince ?? now;
    if (addDays(since, PAST_DUE_GRACE_DAYS).getTime() <= now.getTime()) {
      readOnly = true;
      reason = "past_due";
    }
  } else if (billing.status === "active") {
    // Active paid — writable.
    readOnly = false;
  }

  return {
    plan: billing.plan,
    status: billing.status,
    readOnly,
    maxUsers,
    vatExport,
    liveBankFeed,
    prioritySupport,
    complimentary: false,
    trialEndsAt: billing.trialEndsAt,
    currentPeriodEnd: billing.currentPeriodEnd,
    cancelAtPeriodEnd: billing.cancelAtPeriodEnd,
    pastDueSince: billing.pastDueSince,
    reason,
  };
}

export async function countCompanyMembers(companyId: string): Promise<number> {
  const db = getDb();
  const [row] = await db
    .select({ n: count() })
    .from(companyMemberships)
    .where(eq(companyMemberships.companyId, companyId));
  return Number(row?.n ?? 0);
}

/** Whether inviting one more user is allowed. maxUsers 0 = unlimited. */
export async function canInviteUser(companyId: string): Promise<{
  ok: boolean;
  maxUsers: number;
  userCount: number;
  error?: string;
}> {
  const entitlements = await getEntitlements(companyId);
  const userCount = await countCompanyMembers(companyId);
  if (entitlements.readOnly) {
    return {
      ok: false,
      maxUsers: entitlements.maxUsers,
      userCount,
      error:
        entitlements.reason === "trial_expired"
          ? "Your trial has ended. Choose a plan to invite users."
          : "Your subscription is read-only. Choose a plan or update billing to invite users.",
    };
  }
  if (entitlements.maxUsers > 0 && userCount >= entitlements.maxUsers) {
    return {
      ok: false,
      maxUsers: entitlements.maxUsers,
      userCount,
      error: `This plan allows up to ${entitlements.maxUsers} users. Upgrade to invite more.`,
    };
  }
  return { ok: true, maxUsers: entitlements.maxUsers, userCount };
}

export function readOnlyMessage(reason: Entitlements["reason"]): string {
  switch (reason) {
    case "trial_expired":
      return "Your free trial has ended. Choose a plan to keep editing your books.";
    case "past_due":
      return "Payment is overdue. Update billing to restore write access.";
    case "plan_read_only":
      return "Your subscription is inactive. Choose a plan to restore write access.";
    default:
      return "This company is read-only. Contact support or choose a plan.";
  }
}
