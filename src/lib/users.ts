import "server-only";
import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { users } from "@/db/schema";
import { DEFAULT_ROLE, isRole, type Role } from "@/lib/roles";
import { bootstrapRole } from "@/lib/bootstrap";

export interface LocalUser {
  id: string;
  clerkUserId: string | null;
  email: string;
  name: string | null;
  role: Role;
}

export interface Identity {
  userId: string;
  email: string | null;
  name: string | null;
}

function mapUserRow(row: typeof users.$inferSelect): LocalUser {
  return {
    id: row.id,
    clerkUserId: row.clerkUserId,
    email: row.email,
    name: row.name,
    role: isRole(row.role) ? row.role : DEFAULT_ROLE,
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

export async function listUsers(): Promise<LocalUser[]> {
  const db = getDb();
  const rows = await db.select().from(users).orderBy(asc(users.email));
  return rows.map(mapUserRow);
}

export async function countAdminUsers(): Promise<number> {
  const db = getDb();
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(users)
    .where(eq(users.role, "admin"));
  return row?.count ?? 0;
}

/**
 * Ensure a local `users` row exists. Inserts with a bootstrap role (or pending).
 * Claims a seeded row (same email, no Clerk id) instead of inserting a duplicate.
 * Updates email/name only — never overwrites role from Clerk.
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
    })
    .returning({ id: users.id });

  return created.id;
}
