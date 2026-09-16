import "server-only";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  ForbiddenError,
  getCurrentUser,
  requireUser,
  type SessionUser,
} from "@/lib/auth";
import { writeAudit } from "@/lib/audit";
import { resolvePlatformAdmin } from "@/lib/bootstrap";
import { ensureLocalUser } from "@/lib/users";
import type { ActionResult } from "@/actions/result";
import type { MutateAudit } from "@/lib/mutate";

export type PlatformMutateContext = {
  session: SessionUser;
  localUserId: string;
};

/** Whether the session is a platform operator (`platform_admin` role or env email). */
export function isPlatformAdmin(session: SessionUser | null | undefined): boolean {
  if (!session) return false;
  return resolvePlatformAdmin({
    role: session.role,
    email: session.email,
  });
}

/** Require platform admin; redirect non-admins to the tenant dashboard. */
export async function requirePlatformAdmin(): Promise<SessionUser> {
  const user = await requireUser();
  if (!isPlatformAdmin(user)) {
    redirect("/dashboard");
  }
  return user;
}

/** Soft check for layouts that need a boolean without redirecting. */
export async function getPlatformAdminOrNull(): Promise<SessionUser | null> {
  const user = await getCurrentUser();
  if (!user || !isPlatformAdmin(user)) return null;
  return user;
}

/**
 * Authz + local user + audit + revalidation for platform portal actions.
 * No tenant scope — callers pass companyId explicitly when needed.
 */
export async function platformMutate(
  run: (ctx: PlatformMutateContext) => Promise<ActionResult>,
  after?: {
    audit?: MutateAudit & { companyId?: string | null };
    paths?: string[];
  },
): Promise<ActionResult> {
  const session = await getCurrentUser();
  if (!session) redirect("/sign-in");
  if (!isPlatformAdmin(session)) {
    return { ok: false, error: "You do not have platform admin access." };
  }
  const localUserId = await ensureLocalUser(session);
  const result = await run({ session, localUserId });
  if (!result.ok) return result;
  if (after?.audit) {
    await writeAudit({
      companyId: after.audit.companyId ?? null,
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

/** Throw if the caller is not a platform admin (for non-action helpers). */
export async function assertPlatformAdmin(): Promise<SessionUser> {
  const user = await requireUser();
  if (!isPlatformAdmin(user)) {
    throw new ForbiddenError("platform admin required");
  }
  return user;
}
