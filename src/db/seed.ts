import { eq, sql } from "drizzle-orm";
import { platformAdminEmails } from "@/lib/bootstrap";
import { PLATFORM_ADMIN_ROLE } from "@/lib/roles";
import type { Database } from "@/db";
import { companyMemberships, users } from "./schema";

export interface SeedResult {
  inserted: string[];
  updated: string[];
  skipped: string[];
}

/**
 * Idempotent platform-admin seed. Inserts a `users` row for each
 * PLATFORM_ADMIN_EMAILS address (or sets role `platform_admin` on an existing
 * row and detaches any company). Clerk invitations are sent by scripts/seed.ts
 * when Clerk is configured.
 */
export async function seedPlatformAdmins(
  db: Database,
  emails: string[] = platformAdminEmails(),
): Promise<SeedResult> {
  const result: SeedResult = { inserted: [], updated: [], skipped: [] };

  for (const raw of emails) {
    const email = raw.trim().toLowerCase();
    if (!email) continue;

    const [existing] = await db
      .select({
        id: users.id,
        role: users.role,
      })
      .from(users)
      .where(sql`lower(${users.email}) = ${email}`)
      .limit(1);

    if (!existing) {
      await db.insert(users).values({
        email,
        role: PLATFORM_ADMIN_ROLE,
        companyId: null,
      });
      result.inserted.push(email);
      continue;
    }

    if (existing.role !== PLATFORM_ADMIN_ROLE) {
      await db
        .delete(companyMemberships)
        .where(eq(companyMemberships.userId, existing.id));
      await db
        .update(users)
        .set({
          role: PLATFORM_ADMIN_ROLE,
          companyId: null,
          expenseInboundSlug: null,
        })
        .where(eq(users.id, existing.id));
      result.updated.push(email);
      continue;
    }

    result.skipped.push(email);
  }

  return result;
}
