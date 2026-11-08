import "server-only";
import { count, desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { auditLog, users } from "@/db/schema";
import { type ListPaging, fetchPage } from "@/lib/list-paging";

export async function writeAudit(params: {
  companyId: string | null;
  actorUserId: string | null;
  action: string;
  entityType?: string;
  entityId?: string;
  meta?: Record<string, unknown>;
}): Promise<void> {
  const db = getDb();
  await db.insert(auditLog).values({
    companyId: params.companyId,
    actorUserId: params.actorUserId,
    action: params.action,
    entityType: params.entityType ?? null,
    entityId: params.entityId ?? null,
    meta: params.meta ?? null,
  });
  console.info(
    JSON.stringify({
      level: "info",
      msg: "audit",
      action: params.action,
      entityType: params.entityType,
      entityId: params.entityId,
      actorUserId: params.actorUserId,
      companyId: params.companyId,
    }),
  );
}

/** One page of a company's audit log, newest first. */
export async function listAuditPage(companyId: string, paging: ListPaging) {
  const db = getDb();
  const where = eq(auditLog.companyId, companyId);
  return fetchPage(
    paging,
    async () => (await db.select({ n: count() }).from(auditLog).where(where))[0]?.n ?? 0,
    ({ limit, offset }) =>
      db
        .select({
          id: auditLog.id,
          action: auditLog.action,
          entityType: auditLog.entityType,
          entityId: auditLog.entityId,
          createdAt: auditLog.createdAt,
          actorEmail: users.email,
          actorName: users.name,
        })
        .from(auditLog)
        .leftJoin(users, eq(auditLog.actorUserId, users.id))
        .where(where)
        .orderBy(desc(auditLog.createdAt), desc(auditLog.id))
        .limit(limit)
        .offset(offset),
  );
}
