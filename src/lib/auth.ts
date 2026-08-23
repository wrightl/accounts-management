import "server-only";
import { auth, currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import {
  type Role,
  type Permission,
  DEFAULT_ROLE,
  can,
} from "./roles";
import { hasDatabaseClient } from "@/db";
import { findLocalUser } from "@/lib/users";

export interface SessionUser {
  userId: string;
  email: string | null;
  name: string | null;
  role: Role;
}

export type ActionAuth =
  | { ok: true; user: SessionUser }
  | { ok: false; error: string };

/**
 * Resolve the currently signed-in user. Identity comes from Clerk; role comes
 * from the local `users` row (pending until an admin assigns one). Clerk
 * metadata is never used for authorisation.
 */
export async function getCurrentUser(): Promise<SessionUser | null> {
  const { userId } = await auth();
  if (!userId) return null;

  const user = await currentUser();
  const email = user?.primaryEmailAddress?.emailAddress ?? null;
  const name =
    [user?.firstName, user?.lastName].filter(Boolean).join(" ") || null;

  let role: Role = DEFAULT_ROLE;
  if (hasDatabaseClient()) {
    try {
      const local = await findLocalUser(userId);
      if (local) role = local.role;
    } catch {
      role = DEFAULT_ROLE;
    }
  }

  return { userId, email, name, role };
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

export class ForbiddenError extends Error {
  constructor(permission: Permission) {
    super(`Forbidden: missing permission "${permission}"`);
    this.name = "ForbiddenError";
  }
}
