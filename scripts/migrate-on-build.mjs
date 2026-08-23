#!/usr/bin/env node
/**
 * Apply Drizzle migrations over a direct Postgres TCP connection (`pg`).
 * drizzle-kit migrate auto-selects @neondatabase/serverless (WebSocket), which
 * fails in Node with the warning the CLI prints and then exits 1.
 *
 * Prefers DATABASE_URL_UNPOOLED (required for session-level migrate).
 * Skips when neither URL is set (local/CI builds without a database).
 *
 * Postgres will not let you *use* a newly added enum value in the same
 * transaction that added it. Drizzle wraps every pending file in one
 * transaction, so `role = pending` is applied here after migrate commits.
 */
import { config } from "dotenv";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";

config({ path: ".env.local" });
config({ path: ".env" });

const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
if (!url) {
  console.log("Skipping migrations (no DATABASE_URL)");
  process.exit(0);
}

if (!process.env.DATABASE_URL_UNPOOLED && url.includes("-pooler")) {
  console.warn(
    "DATABASE_URL_UNPOOLED is unset; migrating over a pooled URL can fail. Set the direct Neon connection string.",
  );
}

const client = new pg.Client({ connectionString: url });

try {
  await client.connect();
  await client.query(
    `ALTER TYPE "role" ADD VALUE IF NOT EXISTS 'pending'`,
  );

  const db = drizzle(client);
  await migrate(db, { migrationsFolder: "drizzle" });

  await client.query(
    `ALTER TABLE "users" ALTER COLUMN "role" SET DEFAULT 'pending'`,
  );
  console.log("Migrations applied");
} catch (err) {
  const cause = err && typeof err === "object" && "cause" in err ? err.cause : undefined;
  console.error(err instanceof Error ? err.message : err);
  if (cause) console.error(cause);
  process.exit(1);
} finally {
  await client.end().catch(() => {});
}
