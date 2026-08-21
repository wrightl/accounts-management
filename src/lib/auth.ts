import "server-only";
import { auth, currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import {
  type Role,
  type Permission,
  isRole,
  DEFAULT_ROLE,
  can,
} from "./roles";

export interface SessionUser {
  userId: string;
  email: string | null;
  name: string | null;
  role: Role;
}

function readRole(source: unknown): Role | null {
  const role = (source as { role?: unknown } | null | undefined)?.role;
  return isRole(role) ? role : null;
}

/**
 * Resolve the currently signed-in user and their app role, or null if there is
 * no authenticated session. Role is read from Clerk session claims (fast path)
 * and falls back to the user's public metadata.
 */
export async function getCurrentUser(): Promise<SessionUser | null> {
  const { userId, sessionClaims } = await auth();
  if (!userId) return null;

  let role = readRole((sessionClaims as { metadata?: unknown })?.metadata);
  let email: string | null = null;
  let name: string | null = null;

  if (!role) {
    const user = await currentUser();
    role = readRole(user?.publicMetadata) ?? DEFAULT_ROLE;
    email = user?.primaryEmailAddress?.emailAddress ?? null;
    name = [user?.firstName, user?.lastName].filter(Boolean).join(" ") || null;
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
 * 403 in route handlers / server actions).
 */
export async function requirePermission(permission: Permission): Promise<SessionUser> {
  const user = await requireUser();
  if (!can(user.role, permission)) {
    throw new ForbiddenError(permission);
  }
  return user;
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
