/**
 * Apply install-time data migrations (after schema migrate).
 * Invoked by scripts/migrate-on-build.mjs on every build/install.
 */
import { config } from "dotenv";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { postgresConnectionString } from "../src/db/connection-string";
import { schema } from "../src/db/schema";
import { runDataMigrations, DataMigrationError } from "../src/db/data-migrate";
import type { Database } from "../src/db";

config({ path: ".env.local" });
config({ path: ".env" });

async function main() {
  const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
  if (!url) {
    console.log("Skipping data migrations (no DATABASE_URL)");
    process.exit(0);
  }

  const client = new pg.Client({
    connectionString: postgresConnectionString(url),
  });

  try {
    await client.connect();
    const db = drizzle(client, { schema });
    const result = await runDataMigrations({
      db: db as unknown as Database,
      query: (sql, params) => client.query(sql, params as unknown[]),
    });

    if (
      result.applied.length === 0 &&
      result.skipped.length > 0 &&
      result.retried.length === 0
    ) {
      console.log(
        `Data migrations up to date (${result.skipped.length} already applied)`,
      );
    }
  } catch (err) {
    const message =
      err instanceof DataMigrationError
        ? err.message
        : err instanceof Error
          ? err.message
          : String(err);
    console.error(message);
    process.exit(1);
  } finally {
    await client.end().catch(() => {});
  }
}

main();
