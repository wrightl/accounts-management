import "server-only";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { users } from "@/db/schema";
import type { SessionUser } from "@/lib/auth";
import type { Role } from "@/lib/roles";

/**
 * Ensure a local `users` row exists for the Clerk session user, upserting
 * email/name/role. Returns the local UUID for FK columns (createdBy, audit).
 */
export async function ensureLocalUser(session: SessionUser): Promise<string> {
  const db = getDb();
  const existing = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.clerkUserId, session.userId))
    .limit(1);

  if (existing[0]) {
    await db
      .update(users)
      .set({
        email: session.email ?? "unknown@example.com",
        name: session.name,
        role: session.role as Role,
      })
      .where(eq(users.id, existing[0].id));
    return existing[0].id;
  }

  const [created] = await db
    .insert(users)
    .values({
      clerkUserId: session.userId,
      email: session.email ?? "unknown@example.com",
      name: session.name,
      role: session.role as Role,
    })
    .returning({ id: users.id });

  return created.id;
}
