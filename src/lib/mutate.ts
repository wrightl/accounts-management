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
import {
  getEntitlements,
  readOnlyMessage,
} from "@/lib/billing/entitlements";

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

type MutatePrep =
  | { ok: true; ctx: MutateContext }
  | { ok: false; error: string };

async function prepareMutate(permission: Permission): Promise<MutatePrep> {
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

  try {
    const entitlements = await getEntitlements(authz.user.companyId);
    if (entitlements.readOnly) {
      return { ok: false, error: readOnlyMessage(entitlements.reason) };
    }
  } catch (err) {
    console.warn(
      JSON.stringify({
        level: "warn",
        msg: "entitlements_check_failed",
        error: err instanceof Error ? err.message : String(err),
      }),
    );
  }

  const localUserId = await ensureLocalUser(authz.user);
  return {
    ok: true,
    ctx: {
      session: authz.user,
      localUserId,
      companyId: authz.user.companyId,
      entityType: authz.user.entityType,
    },
  };
}

async function applyAfter(
  ctx: MutateContext,
  result: { ok: true; id?: string },
  after?: { audit?: MutateAudit; paths?: string[] },
): Promise<void> {
  if (after?.audit) {
    await writeAudit({
      companyId: ctx.companyId,
      actorUserId: ctx.localUserId,
      action: after.audit.action,
      entityType: after.audit.entityType,
      entityId: after.audit.entityId ?? result.id ?? "",
      meta: after.audit.meta,
    });
  }
  for (const path of after?.paths ?? []) {
    revalidatePath(path);
  }
}

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
  const prep = await prepareMutate(permission);
  if (!prep.ok) return prep;
  const result = await run(prep.ctx);
  if (!result.ok) return result;
  await applyAfter(prep.ctx, result, after);
  return result;
}

/**
 * Like `mutate`, but allows a wider success payload than `ActionResult`
 * (e.g. OCR extraction, import previews with extra fields).
 */
export async function mutateWide<T extends { ok: boolean; error?: string; id?: string }>(
  permission: Permission,
  run: (ctx: MutateContext) => Promise<T>,
  after?: { audit?: MutateAudit; paths?: string[] },
): Promise<T | { ok: false; error: string }> {
  const prep = await prepareMutate(permission);
  if (!prep.ok) return prep;
  const result = await run(prep.ctx);
  if (!result.ok) return result;
  await applyAfter(prep.ctx, result as { ok: true; id?: string }, after);
  return result;
}
