import "server-only";
import { getDb } from "@/db";
import { auditLog } from "@/db/schema";

export async function writeAudit(params: {
  actorUserId: string | null;
  action: string;
  entityType?: string;
  entityId?: string;
  meta?: Record<string, unknown>;
}): Promise<void> {
  const db = getDb();
  await db.insert(auditLog).values({
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
    }),
  );
}
