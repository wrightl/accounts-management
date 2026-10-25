import "server-only";
import {
  and,
  asc,
  count,
  desc,
  eq,
  gte,
  ilike,
  inArray,
  isNotNull,
  or,
  sql,
  type SQL,
} from "drizzle-orm";
import { getDb } from "@/db";
import { PLATFORM_ADMIN_ROLE } from "@/lib/roles";
import {
  auditLog,
  companies,
  companyBilling,
  companyMemberships,
  companySupportNotes,
  inboundEmailJobs,
  invoices,
  platformLogs,
  sendJobs,
  users,
} from "@/db/schema";

export type PlatformCompanyListItem = {
  id: string;
  name: string;
  slug: string;
  entityType: string;
  createdAt: Date;
  suspendedAt: Date | null;
  memberCount: number;
  failedInbound: number;
  failedSend: number;
  lastAuditAt: Date | null;
  billingPlan: string | null;
  billingStatus: string | null;
  complimentary: boolean;
};

export const COMPANY_LIST_FILTERS = [
  "suspended",
  "trialing",
  "active",
  "past_due",
  "canceled",
  "complimentary",
] as const;
export type CompanyListFilter = (typeof COMPANY_LIST_FILTERS)[number];

export function isCompanyListFilter(value: unknown): value is CompanyListFilter {
  return COMPANY_LIST_FILTERS.includes(value as CompanyListFilter);
}

/** id + name only — for filter dropdowns, without the list page's counts. */
export async function listCompanyOptions() {
  return getDb()
    .select({ id: companies.id, name: companies.name })
    .from(companies)
    .orderBy(asc(companies.name));
}

type CompanyListOptions = { q?: string; filter?: CompanyListFilter };

/** Conditions on `companies` left-joined to `companyBilling`. */
function companyListWhere(opts?: CompanyListOptions): SQL | undefined {
  const q = opts?.q?.trim();
  const conditions: SQL[] = [];
  if (q) {
    conditions.push(
      or(
        ilike(companies.name, `%${q}%`),
        ilike(companies.slug, `%${q}%`),
        ilike(companies.legalName, `%${q}%`),
      )!,
    );
  }
  switch (opts?.filter) {
    case "suspended":
      conditions.push(isNotNull(companies.suspendedAt));
      break;
    case "complimentary":
      conditions.push(eq(companyBilling.access, "complimentary_unlimited"));
      break;
    case "canceled":
      conditions.push(inArray(companyBilling.status, ["canceled", "unpaid"]));
      break;
    case "trialing":
    case "active":
    case "past_due":
      conditions.push(eq(companyBilling.status, opts.filter));
      break;
  }
  return conditions.length ? and(...conditions) : undefined;
}

export async function countPlatformCompanies(opts?: CompanyListOptions): Promise<number> {
  const [row] = await getDb()
    .select({ count: count() })
    .from(companies)
    .leftJoin(companyBilling, eq(companyBilling.companyId, companies.id))
    .where(companyListWhere(opts));
  return Number(row?.count ?? 0);
}

export async function listPlatformCompanies(
  opts?: CompanyListOptions & { limit?: number; offset?: number },
): Promise<PlatformCompanyListItem[]> {
  const db = getDb();
  const where = companyListWhere(opts);

  // Qualify the outer reference explicitly: Drizzle leaves columns
  // unqualified in single-table selects, and the subquery would then bind it
  // to its own `id`.
  const companyId = sql`${companies}.${sql.identifier(companies.id.name)}`;

  const rows = await db
    .select({
      id: companies.id,
      name: companies.name,
      slug: companies.slug,
      entityType: companies.entityType,
      createdAt: companies.createdAt,
      suspendedAt: companies.suspendedAt,
      memberCount: sql<number>`(
        select count(*)::int from ${companyMemberships}
        where ${companyMemberships.companyId} = ${companyId}
      )`,
      failedInbound: sql<number>`(
        select count(*)::int from ${inboundEmailJobs}
        where ${inboundEmailJobs.companyId} = ${companyId}
          and ${inboundEmailJobs.status} = 'failed'
      )`,
      failedSend: sql<number>`(
        select count(*)::int from ${sendJobs}
        where ${sendJobs.companyId} = ${companyId}
          and ${sendJobs.status} = 'failed'
      )`,
      lastAuditAt: sql<Date | null>`(
        select max(${auditLog.createdAt}) from ${auditLog}
        where ${auditLog.companyId} = ${companyId}
      )`,
      billingPlan: companyBilling.plan,
      billingStatus: companyBilling.status,
      billingAccess: companyBilling.access,
    })
    .from(companies)
    .leftJoin(companyBilling, eq(companyBilling.companyId, companies.id))
    .where(where)
    .orderBy(asc(companies.name))
    .limit(Math.min(opts?.limit ?? 500, 500))
    .offset(opts?.offset ?? 0);

  return rows.map(({ billingAccess, ...r }) => ({
    ...r,
    lastAuditAt: r.lastAuditAt ? new Date(r.lastAuditAt) : null,
    complimentary: billingAccess === "complimentary_unlimited",
    memberCount: Number(r.memberCount) || 0,
    failedInbound: Number(r.failedInbound) || 0,
    failedSend: Number(r.failedSend) || 0,
  }));
}

export async function getPlatformCompanyDetail(companyId: string) {
  const db = getDb();
  const [company] = await db
    .select()
    .from(companies)
    .where(eq(companies.id, companyId))
    .limit(1);
  if (!company) return null;

  const members = await db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      clerkUserId: users.clerkUserId,
      role: companyMemberships.role,
      createdAt: companyMemberships.createdAt,
    })
    .from(companyMemberships)
    .innerJoin(users, eq(users.id, companyMemberships.userId))
    .where(eq(companyMemberships.companyId, companyId))
    .orderBy(asc(users.email));

  const recentAudit = await db
    .select({
      id: auditLog.id,
      action: auditLog.action,
      entityType: auditLog.entityType,
      entityId: auditLog.entityId,
      meta: auditLog.meta,
      createdAt: auditLog.createdAt,
      actorEmail: users.email,
      actorName: users.name,
    })
    .from(auditLog)
    .leftJoin(users, eq(auditLog.actorUserId, users.id))
    .where(eq(auditLog.companyId, companyId))
    .orderBy(desc(auditLog.createdAt))
    .limit(50);

  const notes = await db
    .select({
      id: companySupportNotes.id,
      body: companySupportNotes.body,
      createdAt: companySupportNotes.createdAt,
      authorEmail: users.email,
      authorName: users.name,
    })
    .from(companySupportNotes)
    .leftJoin(users, eq(companySupportNotes.authorUserId, users.id))
    .where(eq(companySupportNotes.companyId, companyId))
    .orderBy(desc(companySupportNotes.createdAt))
    .limit(50);

  const [inboundCounts] = await db
    .select({
      pending: sql<number>`count(*) filter (where ${inboundEmailJobs.status} = 'pending')::int`,
      failed: sql<number>`count(*) filter (where ${inboundEmailJobs.status} = 'failed')::int`,
      rejected: sql<number>`count(*) filter (where ${inboundEmailJobs.status} = 'rejected')::int`,
      processed: sql<number>`count(*) filter (where ${inboundEmailJobs.status} = 'processed')::int`,
    })
    .from(inboundEmailJobs)
    .where(eq(inboundEmailJobs.companyId, companyId));

  const [sendCounts] = await db
    .select({
      pending: sql<number>`count(*) filter (where ${sendJobs.status} = 'pending')::int`,
      failed: sql<number>`count(*) filter (where ${sendJobs.status} = 'failed')::int`,
      sent: sql<number>`count(*) filter (where ${sendJobs.status} = 'sent')::int`,
    })
    .from(sendJobs)
    .where(eq(sendJobs.companyId, companyId));

  return {
    company,
    members,
    recentAudit,
    notes,
    inboundCounts: inboundCounts ?? {
      pending: 0,
      failed: 0,
      rejected: 0,
      processed: 0,
    },
    sendCounts: sendCounts ?? { pending: 0, failed: 0, sent: 0 },
  };
}

export async function getPlatformOverviewStats() {
  const db = getDb();
  const [companyStats] = await db
    .select({
      total: count(),
      suspended: sql<number>`count(*) filter (where ${companies.suspendedAt} is not null)::int`,
    })
    .from(companies);

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const [logStats] = await db
    .select({
      errors: sql<number>`count(*) filter (where ${platformLogs.level} = 'error')::int`,
      warnings: sql<number>`count(*) filter (where ${platformLogs.level} = 'warn')::int`,
    })
    .from(platformLogs)
    .where(gte(platformLogs.createdAt, since));

  const [inboundFailed] = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(inboundEmailJobs)
    .where(eq(inboundEmailJobs.status, "failed"));
  const [inboundPending] = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(inboundEmailJobs)
    .where(eq(inboundEmailJobs.status, "pending"));
  const [sendFailed] = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(sendJobs)
    .where(eq(sendJobs.status, "failed"));
  const [sendPending] = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(sendJobs)
    .where(eq(sendJobs.status, "pending"));

  return {
    companies: Number(companyStats?.total ?? 0),
    suspended: Number(companyStats?.suspended ?? 0),
    errors24h: Number(logStats?.errors ?? 0),
    warnings24h: Number(logStats?.warnings ?? 0),
    failedInbound: Number(inboundFailed?.c ?? 0),
    failedSend: Number(sendFailed?.c ?? 0),
    pendingInbound: Number(inboundPending?.c ?? 0),
    pendingSend: Number(sendPending?.c ?? 0),
  };
}

/** Platform operators only (`platform_admin` role). Env break-glass emails appear once seeded. */
export async function listPlatformUsers(opts?: { q?: string }) {
  const db = getDb();
  const q = opts?.q?.trim();
  const filters: SQL[] = [eq(users.role, PLATFORM_ADMIN_ROLE)];
  if (q) {
    filters.push(
      or(ilike(users.email, `%${q}%`), ilike(users.name, `%${q}%`))!,
    );
  }

  return db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      clerkUserId: users.clerkUserId,
      createdAt: users.createdAt,
    })
    .from(users)
    .where(and(...filters))
    .orderBy(asc(users.email))
    .limit(200);
}

export async function getPlatformUserMemberships(userId: string) {
  const db = getDb();
  return db
    .select({
      companyId: companies.id,
      companyName: companies.name,
      role: companyMemberships.role,
    })
    .from(companyMemberships)
    .innerJoin(companies, eq(companies.id, companyMemberships.companyId))
    .where(eq(companyMemberships.userId, userId))
    .orderBy(asc(companies.name));
}

type ActivityOptions = { companyId?: string; actionPrefix?: string };

function activityWhere(opts?: ActivityOptions): SQL | undefined {
  const conditions: SQL[] = [];
  if (opts?.companyId) {
    conditions.push(eq(auditLog.companyId, opts.companyId));
  }
  if (opts?.actionPrefix?.trim()) {
    conditions.push(ilike(auditLog.action, `${opts.actionPrefix.trim()}%`));
  }
  return conditions.length ? and(...conditions) : undefined;
}

export async function countPlatformActivity(opts?: ActivityOptions): Promise<number> {
  const [row] = await getDb()
    .select({ count: count() })
    .from(auditLog)
    .where(activityWhere(opts));
  return Number(row?.count ?? 0);
}

export async function listPlatformActivity(
  opts?: ActivityOptions & { limit?: number; offset?: number },
) {
  const db = getDb();
  const limit = Math.min(opts?.limit ?? 50, 200);
  const offset = opts?.offset ?? 0;
  const where = activityWhere(opts);

  const rows = await db
    .select({
      id: auditLog.id,
      companyId: auditLog.companyId,
      companyName: companies.name,
      action: auditLog.action,
      entityType: auditLog.entityType,
      entityId: auditLog.entityId,
      meta: auditLog.meta,
      createdAt: auditLog.createdAt,
      actorEmail: users.email,
      actorName: users.name,
    })
    .from(auditLog)
    .leftJoin(companies, eq(auditLog.companyId, companies.id))
    .leftJoin(users, eq(auditLog.actorUserId, users.id))
    .where(where)
    .orderBy(desc(auditLog.createdAt))
    .limit(limit)
    .offset(offset);

  return rows;
}

type LogOptions = {
  level?: string;
  source?: string;
  q?: string;
  sinceHours?: number;
};

function logsWhere(opts?: LogOptions): SQL | undefined {
  const sinceHours = opts?.sinceHours ?? 24;
  const since = new Date(Date.now() - sinceHours * 60 * 60 * 1000);
  const conditions: SQL[] = [gte(platformLogs.createdAt, since)];
  if (opts?.level && opts.level !== "all") {
    conditions.push(eq(platformLogs.level, opts.level));
  } else {
    conditions.push(
      or(eq(platformLogs.level, "error"), eq(platformLogs.level, "warn"))!,
    );
  }
  if (opts?.source?.trim()) {
    conditions.push(ilike(platformLogs.source, `%${opts.source.trim()}%`));
  }
  if (opts?.q?.trim()) {
    conditions.push(ilike(platformLogs.message, `%${opts.q.trim()}%`));
  }
  return and(...conditions);
}

export async function countPlatformLogs(opts?: LogOptions): Promise<number> {
  const [row] = await getDb()
    .select({ count: count() })
    .from(platformLogs)
    .where(logsWhere(opts));
  return Number(row?.count ?? 0);
}

export async function listPlatformLogs(
  opts?: LogOptions & { limit?: number; offset?: number },
) {
  const db = getDb();
  const limit = Math.min(opts?.limit ?? 100, 200);
  const offset = opts?.offset ?? 0;
  return db
    .select({
      id: platformLogs.id,
      level: platformLogs.level,
      source: platformLogs.source,
      message: platformLogs.message,
      digest: platformLogs.digest,
      companyId: platformLogs.companyId,
      companyName: companies.name,
      createdAt: platformLogs.createdAt,
      meta: platformLogs.meta,
    })
    .from(platformLogs)
    .leftJoin(companies, eq(platformLogs.companyId, companies.id))
    .where(logsWhere(opts))
    .orderBy(desc(platformLogs.createdAt))
    .limit(limit)
    .offset(offset);
}

type JobOptions = { status?: string };

function inboundJobsWhere(opts?: JobOptions): SQL {
  if (opts?.status && opts.status !== "all") {
    return eq(
      inboundEmailJobs.status,
      opts.status as "pending" | "processed" | "rejected" | "failed",
    );
  }
  return or(
    eq(inboundEmailJobs.status, "failed"),
    eq(inboundEmailJobs.status, "pending"),
    eq(inboundEmailJobs.status, "rejected"),
  )!;
}

export async function countPlatformInboundJobs(opts?: JobOptions): Promise<number> {
  const [row] = await getDb()
    .select({ count: count() })
    .from(inboundEmailJobs)
    .innerJoin(companies, eq(companies.id, inboundEmailJobs.companyId))
    .where(inboundJobsWhere(opts));
  return Number(row?.count ?? 0);
}

export async function listPlatformInboundJobs(
  opts?: JobOptions & { limit?: number; offset?: number },
) {
  const db = getDb();
  const limit = Math.min(opts?.limit ?? 50, 200);
  return db
    .select({
      id: inboundEmailJobs.id,
      companyId: inboundEmailJobs.companyId,
      companyName: companies.name,
      status: inboundEmailJobs.status,
      fromEmail: inboundEmailJobs.fromEmail,
      toEmail: inboundEmailJobs.toEmail,
      subject: inboundEmailJobs.subject,
      attempts: inboundEmailJobs.attempts,
      lastError: inboundEmailJobs.lastError,
      createdAt: inboundEmailJobs.createdAt,
    })
    .from(inboundEmailJobs)
    .innerJoin(companies, eq(companies.id, inboundEmailJobs.companyId))
    .where(inboundJobsWhere(opts))
    .orderBy(desc(inboundEmailJobs.createdAt))
    .limit(limit)
    .offset(opts?.offset ?? 0);
}

function sendJobsWhere(opts?: JobOptions): SQL {
  if (opts?.status && opts.status !== "all") {
    return eq(sendJobs.status, opts.status as "pending" | "sent" | "failed");
  }
  return or(eq(sendJobs.status, "failed"), eq(sendJobs.status, "pending"))!;
}

export async function countPlatformSendJobs(opts?: JobOptions): Promise<number> {
  const [row] = await getDb()
    .select({ count: count() })
    .from(sendJobs)
    .innerJoin(companies, eq(companies.id, sendJobs.companyId))
    .where(sendJobsWhere(opts));
  return Number(row?.count ?? 0);
}

export async function listPlatformSendJobs(
  opts?: JobOptions & { limit?: number; offset?: number },
) {
  const db = getDb();
  const limit = Math.min(opts?.limit ?? 50, 200);
  return db
    .select({
      id: sendJobs.id,
      companyId: sendJobs.companyId,
      companyName: companies.name,
      kind: sendJobs.kind,
      status: sendJobs.status,
      invoiceId: sendJobs.invoiceId,
      invoiceNumber: invoices.number,
      attempts: sendJobs.attempts,
      lastError: sendJobs.lastError,
      createdAt: sendJobs.createdAt,
    })
    .from(sendJobs)
    .innerJoin(companies, eq(companies.id, sendJobs.companyId))
    .leftJoin(invoices, eq(invoices.id, sendJobs.invoiceId))
    .where(sendJobsWhere(opts))
    .orderBy(desc(sendJobs.createdAt))
    .limit(limit)
    .offset(opts?.offset ?? 0);
}

export async function countSuspendedCompanies(): Promise<number> {
  const db = getDb();
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(companies)
    .where(isNotNull(companies.suspendedAt));
  return Number(row?.count ?? 0);
}

/** Most recent logged run for each cron (scheduled or manual). */
export async function getLatestCronRuns() {
  const db = getDb();
  const latest = async (prefix: string) => {
    const [row] = await db
      .select({
        source: platformLogs.source,
        level: platformLogs.level,
        message: platformLogs.message,
        meta: platformLogs.meta,
        createdAt: platformLogs.createdAt,
      })
      .from(platformLogs)
      .where(ilike(platformLogs.source, `${prefix}%`))
      .orderBy(desc(platformLogs.createdAt))
      .limit(1);
    return row ?? null;
  };
  const [daily, inbound] = await Promise.all([
    latest("cron.daily"),
    latest("cron.inbound-email"),
  ]);
  return { daily, inbound };
}
