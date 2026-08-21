import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { schema } from "./schema";

/**
 * Create an in-memory Postgres (PGlite) database with all migrations applied.
 * Used by the test suite and for local development when no Neon DATABASE_URL
 * is configured, so the schema can be exercised without external services.
 */
export async function createTestDb() {
  const client = new PGlite();
  const db = drizzle({ client, schema });
  await migrate(db, { migrationsFolder: "drizzle" });
  return { db, client };
}

export type TestDatabase = Awaited<ReturnType<typeof createTestDb>>["db"];
