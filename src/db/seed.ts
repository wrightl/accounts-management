import { eq, sql } from "drizzle-orm";
import { bootstrapAdminEmails } from "@/lib/bootstrap";
import type { Database } from "@/db";
import { users } from "./schema";

export interface SeedResult {
  inserted: string[];
  promoted: string[];
  skipped: string[];
}

/**
 * Idempotent admin seed. Inserts a `users` row for each bootstrap admin email
 * (or promotes a pending row). Existing non-pending roles are left alone.
 * Clerk id is attached later on first sign-in.
 */
export async function seedAdminUsers(
  db: Database,
  emails: string[] = bootstrapAdminEmails(),
): Promise<SeedResult> {
  const result: SeedResult = { inserted: [], promoted: [], skipped: [] };

  for (const raw of emails) {
    const email = raw.trim().toLowerCase();
    if (!email) continue;

    const [existing] = await db
      .select({ id: users.id, role: users.role })
      .from(users)
      .where(sql`lower(${users.email}) = ${email}`)
      .limit(1);

    if (!existing) {
      await db.insert(users).values({ email, role: "admin" });
      result.inserted.push(email);
      continue;
    }

    if (existing.role === "pending") {
      await db.update(users).set({ role: "admin" }).where(eq(users.id, existing.id));
      result.promoted.push(email);
      continue;
    }

    result.skipped.push(email);
  }

  return result;
}
