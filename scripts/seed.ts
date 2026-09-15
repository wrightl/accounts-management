/**
 * Seed bootstrap admin users into Postgres.
 * Usage: npm run db:seed
 *
 * Emails come from BOOTSTRAP_ADMIN_EMAILS (default: lee@dotanddashconsulting.com).
 * Idempotent: existing non-pending roles are not overwritten.
 */
import { config } from "dotenv";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { schema } from "../src/db/schema";
import { seedAdminUsers } from "../src/db/seed";
import type { Database } from "../src/db";

config({ path: ".env.local" });
config({ path: ".env" });

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
    const result = await seedAdminUsers(db as unknown as Database);

    for (const email of result.inserted) {
      console.log(`Inserted admin: ${email}`);
    }
    for (const email of result.promoted) {
      console.log(`Promoted pending → admin: ${email}`);
    }
    for (const email of result.skipped) {
      console.log(`Already present: ${email}`);
    }

    if (
      result.inserted.length === 0 &&
      result.promoted.length === 0 &&
      result.skipped.length === 0
    ) {
      console.log("No bootstrap admin emails to seed");
    }
  } catch (err) {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  } finally {
    await client.end().catch(() => {});
  }
}

main();
