import "server-only";
import {
  and,
  asc,
  count,
  desc,
  eq,
  gte,
  ilike,
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
  companyMemberships,
  companySupportNotes,
  inboundEmailJobs,
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
};

export async function listPlatformCompanies(opts?: {
  q?: string;
}): Promise<PlatformCompanyListItem[]> {
  const db = getDb();
  const q = opts?.q?.trim();
  const where = q
    ? or(
        ilike(companies.name, `%${q}%`),
        ilike(companies.slug, `%${q}%`),
        ilike(companies.legalName, `%${q}%`),
      )
    : undefined;

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
        where ${companyMemberships.companyId} = ${companies.id}
      )`,
      failedInbound: sql<number>`(
        select count(*)::int from ${inboundEmailJobs}
        where ${inboundEmailJobs.companyId} = ${companies.id}
          and ${inboundEmailJobs.status} = 'failed'
      )`,
      failedSend: sql<number>`(
        select count(*)::int from ${sendJobs}
        where ${sendJobs.companyId} = ${companies.id}
          and ${sendJobs.status} = 'failed'
      )`,
      lastAuditAt: sql<Date | null>`(
        select max(${auditLog.createdAt}) from ${auditLog}
        where ${auditLog.companyId} = ${companies.id}
      )`,
    })
    .from(companies)
    .where(where)
    .orderBy(asc(companies.name));

  return rows.map((r) => ({
    ...r,
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

export async function listPlatformActivity(opts?: {
  companyId?: string;
  actionPrefix?: string;
  limit?: number;
  offset?: number;
}) {
  const db = getDb();
  const limit = Math.min(opts?.limit ?? 50, 200);
  const offset = opts?.offset ?? 0;
  const conditions: SQL[] = [];
  if (opts?.companyId) {
    conditions.push(eq(auditLog.companyId, opts.companyId));
  }
  if (opts?.actionPrefix?.trim()) {
    conditions.push(ilike(auditLog.action, `${opts.actionPrefix.trim()}%`));
  }
  const where = conditions.length ? and(...conditions) : undefined;

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

export async function listPlatformLogs(opts?: {
  level?: string;
  source?: string;
  q?: string;
  sinceHours?: number;
  limit?: number;
  offset?: number;
}) {
  const db = getDb();
  const limit = Math.min(opts?.limit ?? 100, 200);
  const offset = opts?.offset ?? 0;
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
    .where(and(...conditions))
    .orderBy(desc(platformLogs.createdAt))
    .limit(limit)
    .offset(offset);
}

export async function listPlatformInboundJobs(opts?: {
  status?: string;
  limit?: number;
}) {
  const db = getDb();
  const limit = Math.min(opts?.limit ?? 50, 200);
  const conditions: SQL[] = [];
  if (opts?.status && opts.status !== "all") {
    conditions.push(
      eq(
        inboundEmailJobs.status,
        opts.status as "pending" | "processed" | "rejected" | "failed",
      ),
    );
  } else {
    conditions.push(
      or(
        eq(inboundEmailJobs.status, "failed"),
        eq(inboundEmailJobs.status, "pending"),
        eq(inboundEmailJobs.status, "rejected"),
      )!,
    );
  }
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
    .where(and(...conditions))
    .orderBy(desc(inboundEmailJobs.createdAt))
    .limit(limit);
}

export async function listPlatformSendJobs(opts?: {
  status?: string;
  limit?: number;
}) {
  const db = getDb();
  const limit = Math.min(opts?.limit ?? 50, 200);
  const conditions: SQL[] = [];
  if (opts?.status && opts.status !== "all") {
    conditions.push(
      eq(sendJobs.status, opts.status as "pending" | "sent" | "failed"),
    );
  } else {
    conditions.push(
      or(eq(sendJobs.status, "failed"), eq(sendJobs.status, "pending"))!,
    );
  }
  return db
    .select({
      id: sendJobs.id,
      companyId: sendJobs.companyId,
      companyName: companies.name,
      kind: sendJobs.kind,
      status: sendJobs.status,
      invoiceId: sendJobs.invoiceId,
      attempts: sendJobs.attempts,
      lastError: sendJobs.lastError,
      createdAt: sendJobs.createdAt,
    })
    .from(sendJobs)
    .innerJoin(companies, eq(companies.id, sendJobs.companyId))
    .where(and(...conditions))
    .orderBy(desc(sendJobs.createdAt))
    .limit(limit);
}

export async function countSuspendedCompanies(): Promise<number> {
  const db = getDb();
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(companies)
    .where(isNotNull(companies.suspendedAt));
  return Number(row?.count ?? 0);
}
