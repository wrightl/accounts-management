import "server-only";
import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { companies, companyMemberships, users } from "@/db/schema";
import { DEFAULT_ROLE, isRole, type Role } from "@/lib/roles";
import { bootstrapRole } from "@/lib/bootstrap";

export interface LocalUser {
  id: string;
  clerkUserId: string | null;
  email: string;
  name: string | null;
  role: Role;
  companyId: string | null;
  expenseInboundSlug: string | null;
}

export interface Identity {
  userId: string;
  email: string | null;
  name: string | null;
}

export interface UserMembership {
  companyId: string;
  companyName: string;
  logoUrl: string | null;
  role: Role;
}

function mapUserRow(row: typeof users.$inferSelect): LocalUser {
  return {
    id: row.id,
    clerkUserId: row.clerkUserId,
    email: row.email,
    name: row.name,
    role: isRole(row.role) ? row.role : DEFAULT_ROLE,
    companyId: row.companyId ?? null,
    expenseInboundSlug: row.expenseInboundSlug ?? null,
  };
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Prefer a non-empty Clerk name; otherwise keep the local value. */
function resolveDisplayName(
  identityName: string | null | undefined,
  localName: string | null,
): string | null {
  const trimmed = identityName?.trim();
  return trimmed || localName;
}

export async function getUser(id: string): Promise<LocalUser | null> {
  const db = getDb();
  const [row] = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return row ? mapUserRow(row) : null;
}

export async function findUserByEmail(email: string): Promise<LocalUser | null> {
  const normalised = normalizeEmail(email);
  const db = getDb();
  const [row] = await db
    .select()
    .from(users)
    .where(sql`lower(${users.email}) = ${normalised}`)
    .limit(1);
  return row ? mapUserRow(row) : null;
}

export async function findLocalUser(clerkUserId: string): Promise<LocalUser | null> {
  const db = getDb();
  const existing = await db
    .select()
    .from(users)
    .where(eq(users.clerkUserId, clerkUserId))
    .limit(1);
  const row = existing[0];
  if (!row) return null;
  return mapUserRow(row);
}

/** Look up the local users row without inserting. Safe on read paths. */
export async function findLocalUserId(clerkUserId: string): Promise<string | null> {
  const local = await findLocalUser(clerkUserId);
  return local?.id ?? null;
}

export async function getMembership(
  userId: string,
  companyId: string,
): Promise<{ role: Role } | null> {
  const db = getDb();
  const [row] = await db
    .select({ role: companyMemberships.role })
    .from(companyMemberships)
    .where(
      and(
        eq(companyMemberships.userId, userId),
        eq(companyMemberships.companyId, companyId),
      ),
    )
    .limit(1);
  if (!row) return null;
  return { role: isRole(row.role) ? row.role : DEFAULT_ROLE };
}

export async function countUserMemberships(userId: string): Promise<number> {
  const db = getDb();
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(companyMemberships)
    .where(eq(companyMemberships.userId, userId));
  return row?.count ?? 0;
}

/** List companies the user belongs to (for the nav switcher). */
export async function listUserMemberships(
  userId: string,
): Promise<UserMembership[]> {
  const db = getDb();
  const rows = await db
    .select({
      companyId: companyMemberships.companyId,
      companyName: companies.name,
      logoUrl: companies.logoUrl,
      role: companyMemberships.role,
    })
    .from(companyMemberships)
    .innerJoin(companies, eq(companies.id, companyMemberships.companyId))
    .where(eq(companyMemberships.userId, userId))
    .orderBy(asc(companies.name));
  return rows.map((row) => ({
    companyId: row.companyId,
    companyName: row.companyName,
    logoUrl: row.logoUrl,
    role: isRole(row.role) ? row.role : DEFAULT_ROLE,
  }));
}

/**
 * Upsert a membership. Does not change `users.companyId` unless the user has
 * no selected company yet.
 */
export async function upsertMembership(
  userId: string,
  companyId: string,
  role: Role,
): Promise<void> {
  const db = getDb();
  const existing = await getMembership(userId, companyId);
  if (existing) {
    await db
      .update(companyMemberships)
      .set({ role })
      .where(
        and(
          eq(companyMemberships.userId, userId),
          eq(companyMemberships.companyId, companyId),
        ),
      );
  } else {
    await db.insert(companyMemberships).values({ userId, companyId, role });
  }

  const [user] = await db
    .select({ companyId: users.companyId })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (user && !user.companyId) {
    await db
      .update(users)
      .set({ companyId, role })
      .where(eq(users.id, userId));
  } else if (user?.companyId === companyId) {
    await db.update(users).set({ role }).where(eq(users.id, userId));
  }
}

/**
 * Remove membership for a company. If it was the active company, retarget
 * `users.companyId` to another membership (or null). Returns whether the
 * user still has any memberships left.
 */
export async function removeMembership(
  userId: string,
  companyId: string,
): Promise<{ remaining: number }> {
  const db = getDb();
  await db
    .delete(companyMemberships)
    .where(
      and(
        eq(companyMemberships.userId, userId),
        eq(companyMemberships.companyId, companyId),
      ),
    );

  const remaining = await listUserMemberships(userId);
  const [user] = await db
    .select({ companyId: users.companyId })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (user?.companyId === companyId) {
    const next = remaining[0];
    await db
      .update(users)
      .set({
        companyId: next?.companyId ?? null,
        role: next?.role ?? DEFAULT_ROLE,
      })
      .where(eq(users.id, userId));
  }

  return { remaining: remaining.length };
}

/** List users who are members of a company (membership role, not selected). */
export async function listUsers(companyId: string): Promise<LocalUser[]> {
  const db = getDb();
  const rows = await db
    .select({
      id: users.id,
      clerkUserId: users.clerkUserId,
      email: users.email,
      name: users.name,
      role: companyMemberships.role,
      companyId: companyMemberships.companyId,
      expenseInboundSlug: users.expenseInboundSlug,
    })
    .from(companyMemberships)
    .innerJoin(users, eq(users.id, companyMemberships.userId))
    .where(eq(companyMemberships.companyId, companyId))
    .orderBy(asc(users.email));
  return rows.map((row) => ({
    id: row.id,
    clerkUserId: row.clerkUserId,
    email: row.email,
    name: row.name,
    role: isRole(row.role) ? row.role : DEFAULT_ROLE,
    companyId: row.companyId,
    expenseInboundSlug: row.expenseInboundSlug ?? null,
  }));
}

export async function countAdminUsers(companyId: string): Promise<number> {
  const db = getDb();
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(companyMemberships)
    .where(
      and(
        eq(companyMemberships.role, "admin"),
        eq(companyMemberships.companyId, companyId),
      ),
    );
  return row?.count ?? 0;
}

/**
 * Ensure a local `users` row exists. Inserts with a bootstrap role (or pending).
 * Claims a seeded/invited row (same email, no Clerk id) instead of inserting a duplicate.
 * Updates email/name only — never overwrites role from Clerk.
 * New self-serve users get companyId = null until onboarding.
 */
export async function ensureLocalUser(identity: Identity): Promise<string> {
  const db = getDb();
  const existing = await db
    .select({ id: users.id, email: users.email, name: users.name })
    .from(users)
    .where(eq(users.clerkUserId, identity.userId))
    .limit(1);

  if (existing[0]) {
    const patch: { email?: string; name?: string | null } = {};
    if (identity.email && identity.email !== existing[0].email) {
      patch.email = identity.email;
    }
    const name = resolveDisplayName(identity.name, existing[0].name);
    if (name !== existing[0].name) {
      patch.name = name;
    }
    if (Object.keys(patch).length > 0) {
      await db.update(users).set(patch).where(eq(users.id, existing[0].id));
    }
    return existing[0].id;
  }

  const normalisedEmail = identity.email?.trim().toLowerCase();
  if (normalisedEmail) {
    const [seeded] = await db
      .select({ id: users.id, name: users.name })
      .from(users)
      .where(and(sql`lower(${users.email}) = ${normalisedEmail}`, isNull(users.clerkUserId)))
      .limit(1);

    if (seeded) {
      await db
        .update(users)
        .set({
          clerkUserId: identity.userId,
          email: identity.email ?? normalisedEmail,
          name: resolveDisplayName(identity.name, seeded.name),
        })
        .where(eq(users.id, seeded.id));
      return seeded.id;
    }
  }

  const [created] = await db
    .insert(users)
    .values({
      clerkUserId: identity.userId,
      email: identity.email ?? `${identity.userId}@clerk.local`,
      name: identity.name?.trim() || null,
      role: bootstrapRole(identity.email),
      companyId: null,
    })
    .returning({ id: users.id });

  return created.id;
}

/** Attach a user to a company (onboarding or invite claim). */
export async function assignUserCompany(
  localUserId: string,
  companyId: string,
  options?: { role?: Role; name?: string | null },
): Promise<void> {
  const db = getDb();
  const [current] = await db
    .select()
    .from(users)
    .where(eq(users.id, localUserId))
    .limit(1);
  if (!current) return;

  const role = options?.role ?? (isRole(current.role) ? current.role : DEFAULT_ROLE);
  const name =
    options?.name !== undefined
      ? options.name?.trim() || null
      : current.name;

  const patch: {
    companyId: string;
    role?: Role;
    name?: string | null;
    expenseInboundSlug?: string;
  } = { companyId, role };
  if (options?.name !== undefined) {
    patch.name = name;
  }

  const shouldHaveInbound = role === "admin" || role === "user";
  if (shouldHaveInbound && !current.expenseInboundSlug) {
    const { uniquifyUserInboundSlug, userInboundSlugSeed } = await import(
      "@/lib/expenses/inbound-mailbox"
    );
    patch.expenseInboundSlug = await uniquifyUserInboundSlug(
      companyId,
      userInboundSlugSeed(name, current.email),
      localUserId,
    );
  }

  await db.update(users).set(patch).where(eq(users.id, localUserId));
  await upsertMembership(localUserId, companyId, role);
}
