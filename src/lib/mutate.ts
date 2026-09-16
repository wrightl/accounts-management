import "server-only";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { requireActionPermission, type SessionUser } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";
import { ensureLocalUser } from "@/lib/users";
import type { Permission } from "@/lib/roles";
import type { ActionResult } from "@/actions/result";
import { companies, type EntityType } from "@/db/schema";
import { getDb } from "@/db";

export interface MutateAudit {
  action: string;
  entityType: string;
  entityId?: string;
  meta?: Record<string, unknown>;
}

export type MutateContext = {
  session: SessionUser;
  localUserId: string;
  companyId: string;
  entityType: EntityType;
};

/**
 * Authz + local user + tenant + audit + cache revalidation for server actions.
 * Fails closed when the user has not completed onboarding (no companyId).
 * Refuses writes when the company is suspended by platform ops.
 */
export async function mutate(
  permission: Permission,
  run: (ctx: MutateContext) => Promise<ActionResult>,
  after?: { audit?: MutateAudit; paths?: string[] },
): Promise<ActionResult> {
  const authz = await requireActionPermission(permission);
  if (!authz.ok) return authz;
  if (!authz.user.companyId || !authz.user.entityType) {
    return { ok: false, error: "Complete onboarding before using the dashboard." };
  }

  const db = getDb();
  const [company] = await db
    .select({
      suspendedAt: companies.suspendedAt,
      suspendedReason: companies.suspendedReason,
    })
    .from(companies)
    .where(eq(companies.id, authz.user.companyId))
    .limit(1);
  if (company?.suspendedAt) {
    return {
      ok: false,
      error: company.suspendedReason?.trim()
        ? `This company is suspended: ${company.suspendedReason.trim()}`
        : "This company is suspended. Contact support for help.",
    };
  }

  const localUserId = await ensureLocalUser(authz.user);
  const result = await run({
    session: authz.user,
    localUserId,
    companyId: authz.user.companyId,
    entityType: authz.user.entityType,
  });
  if (!result.ok) return result;
  if (after?.audit) {
    await writeAudit({
      companyId: authz.user.companyId,
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
