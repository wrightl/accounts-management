import "server-only";
import { auth, currentUser } from "@clerk/nextjs/server";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import {
  type Role,
  type Permission,
  DEFAULT_ROLE,
  can,
} from "./roles";
import { hasDatabaseClient, getDb } from "@/db";
import { companies, type EntityType } from "@/db/schema";
import { findLocalUser } from "@/lib/users";
import { resolvePlatformAdmin } from "@/lib/bootstrap";
import { clerkErrorMessage } from "@/lib/clerk-invite";

type ClerkUser = Awaited<ReturnType<typeof currentUser>>;

export interface SessionUser {
  userId: string;
  email: string | null;
  name: string | null;
  role: Role;
  /** Local users.id when known. */
  localUserId: string | null;
  /** Null until onboarding completes. */
  companyId: string | null;
  entityType: EntityType | null;
}

export type ActionAuth =
  | { ok: true; user: SessionUser }
  | { ok: false; error: string };

/**
 * Clerk Backend `currentUser()` makes a network call. A blip ("fetch failed")
 * must not 500 the page — signed-in identity still comes from `auth()`, and
 * email/name can fall back to the local `users` row.
 */
export async function safeCurrentUser(): Promise<ClerkUser> {
  try {
    return await currentUser();
  } catch (error) {
    console.warn(
      JSON.stringify({
        level: "warn",
        msg: "clerk_current_user_failed",
        error: clerkErrorMessage(error),
      }),
    );
    return null;
  }
}

function clerkDisplayName(user: ClerkUser): string | null {
  if (!user) return null;
  return [user.firstName, user.lastName].filter(Boolean).join(" ") || null;
}

/**
 * Resolve the currently signed-in user. Identity comes from Clerk; role and
 * company come from the local `users` row. Clerk metadata is never used for
 * authorisation.
 */
export async function getCurrentUser(): Promise<SessionUser | null> {
  const { userId } = await auth();
  if (!userId) return null;

  const clerkUser = await safeCurrentUser();
  const clerkEmail = clerkUser?.primaryEmailAddress?.emailAddress ?? null;
  const clerkName = clerkDisplayName(clerkUser);

  let role: Role = DEFAULT_ROLE;
  let localUserId: string | null = null;
  let companyId: string | null = null;
  let entityType: EntityType | null = null;
  let localEmail: string | null = null;
  let localName: string | null = null;

  if (hasDatabaseClient()) {
    try {
      const local = await findLocalUser(userId);
      if (local) {
        role = local.role;
        localUserId = local.id;
        companyId = local.companyId;
        localEmail = local.email;
        localName = local.name;
        if (companyId) {
          const db = getDb();
          const [company] = await db
            .select({ entityType: companies.entityType })
            .from(companies)
            .where(eq(companies.id, companyId))
            .limit(1);
          entityType = company?.entityType ?? null;
        }
      }
    } catch {
      role = DEFAULT_ROLE;
    }
  }

  return {
    userId,
    email: clerkEmail ?? localEmail,
    name: clerkName ?? localName,
    role,
    localUserId,
    companyId,
    entityType,
  };
}

/** Require an authenticated session, redirecting to sign-in otherwise. */
export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");
  return user;
}

/** Whether the current user holds a permission. */
export async function hasPermission(permission: Permission): Promise<boolean> {
  const user = await getCurrentUser();
  return can(user?.role, permission);
}

/**
 * Enforce a permission for the current user. Redirects unauthenticated users
 * to sign-in and throws for authenticated-but-unauthorised users (surface as a
 * 403 in route handlers).
 */
export async function requirePermission(permission: Permission): Promise<SessionUser> {
  const user = await requireUser();
  if (!can(user.role, permission)) {
    throw new ForbiddenError(permission);
  }
  return user;
}

/**
 * Server-action guard: same checks as {@link requirePermission}, but returns
 * a failure object instead of throwing so the client can show a 403 message.
 */
export async function requireActionPermission(
  permission: Permission,
): Promise<ActionAuth> {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");
  if (!can(user.role, permission)) {
    return { ok: false, error: "You do not have permission to do that." };
  }
  return { ok: true, user };
}

/**
 * Page-level guard: require a permission, redirecting unauthorised users back
 * to the dashboard (friendlier than a thrown error for navigations).
 */
export async function guardPage(permission: Permission): Promise<SessionUser> {
  const user = await requireUser();
  if (!can(user.role, permission)) redirect("/dashboard");
  return user;
}

/** Page guard that also requires a completed company (fail closed). */
export async function guardTenantPage(
  permission: Permission,
): Promise<SessionUser & { companyId: string; entityType: NonNullable<SessionUser["entityType"]> }> {
  const user = await guardPage(permission);
  if (!user.companyId || !user.entityType) {
    if (
      resolvePlatformAdmin({
        role: user.role,
        email: user.email,
      })
    ) {
      redirect("/platform");
    }
    redirect("/onboarding");
  }
  return {
    ...user,
    companyId: user.companyId,
    entityType: user.entityType,
  };
}

export class ForbiddenError extends Error {
  constructor(permission: Permission | string) {
    super(
      typeof permission === "string" && !permission.includes(":")
        ? permission
        : `Forbidden: missing permission "${permission}"`,
    );
    this.name = "ForbiddenError";
  }
}
