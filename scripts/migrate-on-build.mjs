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
 *
 * Do not ALTER TYPE "role" before migrate: on a fresh database the type is
 * created in 0000_init.sql, so a pre-migrate ALTER fails with
 * `type "role" does not exist`.
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

/** Keep in sync with src/db/connection-string.ts — this script is plain Node. */
function postgresConnectionString(connectionString) {
  const qIndex = connectionString.indexOf("?");
  if (qIndex === -1) return connectionString;
  const base = connectionString.slice(0, qIndex);
  const params = new URLSearchParams(connectionString.slice(qIndex + 1));
  if (params.get("uselibpqcompat") === "true") return connectionString;
  const mode = params.get("sslmode")?.toLowerCase();
  if (!mode || !["prefer", "require", "verify-ca"].includes(mode)) {
    return connectionString;
  }
  params.set("sslmode", "verify-full");
  return `${base}?${params.toString()}`;
}

const client = new pg.Client({
  connectionString: postgresConnectionString(url),
});

async function roleTypeExists() {
  const { rowCount } = await client.query(
    `SELECT 1 FROM pg_type WHERE typname = 'role' LIMIT 1`,
  );
  return (rowCount ?? 0) > 0;
}

try {
  await client.connect();

  const db = drizzle(client);
  await migrate(db, { migrationsFolder: "drizzle" });

  if (await roleTypeExists()) {
    await client.query(
      `ALTER TYPE "role" ADD VALUE IF NOT EXISTS 'pending'`,
    );
    await client.query(
      `ALTER TYPE "role" ADD VALUE IF NOT EXISTS 'platform_admin'`,
    );
    await client.query(
      `ALTER TABLE "users" ALTER COLUMN "role" SET DEFAULT 'pending'`,
    );
  }

  console.log("Migrations applied");
} catch (err) {
  const cause = err && typeof err === "object" && "cause" in err ? err.cause : undefined;
  console.error(err instanceof Error ? err.message : err);
  if (cause) console.error(cause);
  process.exit(1);
} finally {
  await client.end().catch(() => {});
}
