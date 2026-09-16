/**
 * Seed platform admins into Postgres and invite them via Clerk.
 * Usage: npm run db:seed
 *
 * Emails come from PLATFORM_ADMIN_EMAILS (default: admin@dotanddashconsulting.com).
 * Idempotent: existing `platform_admin` roles are left alone; Clerk "already exists"
 * invitation errors are non-fatal.
 */
import { config } from "dotenv";

// Load env before any Clerk / app imports so keys are present at call time.
config({ path: ".env.local" });
config({ path: ".env" });

import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { sql } from "drizzle-orm";
import { schema, users } from "../src/db/schema";
import { seedPlatformAdmins } from "../src/db/seed";
import type { Database } from "../src/db";
import { platformAdminEmails } from "../src/lib/bootstrap";
import { isAuthConfigured } from "../src/env";
import { sendClerkInvitation } from "../src/lib/clerk-invite";

async function main() {
  const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL is required to seed");
    process.exit(1);
  }

  const client = new pg.Client({ connectionString: url });

  try {
    await client.connect();
    const db = drizzle(client, { schema });
    const emails = platformAdminEmails();
    const result = await seedPlatformAdmins(db as unknown as Database, emails);

    for (const email of result.inserted) {
      console.log(`Inserted platform admin: ${email}`);
    }
    for (const email of result.updated) {
      console.log(`Granted platform_admin role: ${email}`);
    }
    for (const email of result.skipped) {
      console.log(`Already platform admin: ${email}`);
    }

    if (
      result.inserted.length === 0 &&
      result.updated.length === 0 &&
      result.skipped.length === 0
    ) {
      console.log("No PLATFORM_ADMIN_EMAILS to seed");
    }

    if (!isAuthConfigured()) {
      console.warn(
        "Clerk is not configured — skipped invitations. Set CLERK_SECRET_KEY and NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY, then re-run seed to email invites.",
      );
      return;
    }

    for (const email of emails) {
      const normalised = email.trim().toLowerCase();
      if (!normalised) continue;

      const [row] = await db
        .select({
          clerkUserId: users.clerkUserId,
        })
        .from(users)
        .where(sql`lower(${users.email}) = ${normalised}`)
        .limit(1);

      if (row?.clerkUserId) {
        console.log(`Clerk user already linked, skip invite: ${normalised}`);
        continue;
      }

      const invited = await sendClerkInvitation(normalised);
      if (invited.ok) {
        console.log(`Clerk invitation sent (or already pending): ${normalised}`);
      } else {
        console.warn(`Clerk invitation failed for ${normalised}: ${invited.error}`);
      }
    }
  } catch (err) {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  } finally {
    await client.end().catch(() => {});
  }
}

main();
