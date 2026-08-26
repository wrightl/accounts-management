import { and, asc, eq, sql } from "drizzle-orm";
import { bootstrapAdminEmails } from "@/lib/bootstrap";
import type { Database } from "@/db";
import { companies, companyMemberships, users } from "./schema";
import { slugifyInbound } from "@/lib/expenses/inbound-merge";

export interface SeedResult {
  inserted: string[];
  promoted: string[];
  skipped: string[];
}

async function ensureMembership(
  db: Database,
  userId: string,
  companyId: string,
  role: "admin" | "user" | "accountant" | "pending",
) {
  const [existing] = await db
    .select({ id: companyMemberships.id })
    .from(companyMemberships)
    .where(
      and(
        eq(companyMemberships.userId, userId),
        eq(companyMemberships.companyId, companyId),
      ),
    )
    .limit(1);
  if (existing) {
    await db
      .update(companyMemberships)
      .set({ role })
      .where(eq(companyMemberships.id, existing.id));
  } else {
    await db.insert(companyMemberships).values({ userId, companyId, role });
  }
}

/**
 * Idempotent admin seed. Inserts a `users` row for each bootstrap admin email
 * (or promotes a pending row). Existing non-pending roles are left alone.
 * Clerk id is attached later on first sign-in.
 * When a primary company exists (post-migration), new/promoted admins are attached to it.
 */
export async function seedAdminUsers(
  db: Database,
  emails: string[] = bootstrapAdminEmails(),
): Promise<SeedResult> {
  const result: SeedResult = { inserted: [], promoted: [], skipped: [] };

  const [primary] = await db
    .select({ id: companies.id })
    .from(companies)
    .orderBy(asc(companies.createdAt))
    .limit(1);
  const companyId = primary?.id ?? null;

  for (const raw of emails) {
    const email = raw.trim().toLowerCase();
    if (!email) continue;

    const [existing] = await db
      .select({
        id: users.id,
        role: users.role,
        expenseInboundSlug: users.expenseInboundSlug,
      })
      .from(users)
      .where(sql`lower(${users.email}) = ${email}`)
      .limit(1);

    const inboundSlug =
      companyId && !existing?.expenseInboundSlug
        ? slugifyInbound(email.split("@")[0] ?? "admin", "admin")
        : null;

    if (!existing) {
      const [created] = await db
        .insert(users)
        .values({
          email,
          role: "admin",
          companyId,
          expenseInboundSlug: inboundSlug,
        })
        .returning({ id: users.id });
      if (companyId) {
        await ensureMembership(db, created.id, companyId, "admin");
      }
      result.inserted.push(email);
      continue;
    }

    if (existing.role === "pending") {
      await db
        .update(users)
        .set({
          role: "admin",
          ...(companyId ? { companyId } : {}),
          ...(inboundSlug ? { expenseInboundSlug: inboundSlug } : {}),
        })
        .where(eq(users.id, existing.id));
      if (companyId) {
        await ensureMembership(db, existing.id, companyId, "admin");
      }
      result.promoted.push(email);
      continue;
    }

    if (companyId && !existing.expenseInboundSlug && inboundSlug) {
      await db
        .update(users)
        .set({ expenseInboundSlug: inboundSlug })
        .where(eq(users.id, existing.id));
    }
    if (companyId) {
      const role =
        existing.role === "admin" ||
        existing.role === "user" ||
        existing.role === "accountant"
          ? existing.role
          : "admin";
      await ensureMembership(db, existing.id, companyId, role);
    }

    result.skipped.push(email);
  }

  return result;
}
