import "server-only";
import { revalidatePath } from "next/cache";
import { requireActionPermission, type SessionUser } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";
import { ensureLocalUser } from "@/lib/users";
import type { Permission } from "@/lib/roles";
import type { ActionResult } from "@/actions/result";

export interface MutateAudit {
  action: string;
  entityType: string;
  entityId?: string;
  meta?: Record<string, unknown>;
}

/**
 * Authz + local user + audit + cache revalidation for server actions.
 * Not a framework — just the boilerplate every mutation was repeating.
 */
export async function mutate(
  permission: Permission,
  run: (ctx: { session: SessionUser; localUserId: string }) => Promise<ActionResult>,
  after?: { audit?: MutateAudit; paths?: string[] },
): Promise<ActionResult> {
  const authz = await requireActionPermission(permission);
  if (!authz.ok) return authz;
  const localUserId = await ensureLocalUser(authz.user);
  const result = await run({ session: authz.user, localUserId });
  if (!result.ok) return result;
  if (after?.audit) {
    await writeAudit({
      actorUserId: localUserId,
      action: after.audit.action,
      entityType: after.audit.entityType,
      entityId: after.audit.entityId ?? result.id ?? "",
      meta: after.audit.meta,
    });
  }
  for (const path of after?.paths ?? []) {
    revalidatePath(path);
  }
  return result;
}
