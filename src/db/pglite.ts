import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { schema } from "./schema";

/** Env var naming a file written by {@link createMigratedSnapshot} (see tests/global-setup.ts). */
export const PGLITE_SNAPSHOT_ENV = "PGLITE_SNAPSHOT";

/**
 * Dump of a freshly migrated PGlite data directory. Booting PGlite and replaying
 * every migration takes about a second; restoring a snapshot takes a fraction of
 * that, and each restore is still a fully independent database.
 */
export async function createMigratedSnapshot() {
  const client = new PGlite();
  await migrate(drizzle({ client }), { migrationsFolder: "drizzle" });
  const dump = await client.dumpDataDir("none");
  await client.close();
  return dump;
}

let snapshot: Promise<Blob> | undefined;

async function loadSnapshot(): Promise<Blob> {
  const path = process.env[PGLITE_SNAPSHOT_ENV];
  if (path) return new Blob([await readFile(path)]);
  return createMigratedSnapshot();
}

/**
 * Create an in-memory Postgres (PGlite) database with all migrations applied,
 * so tests can exercise the schema without external services.
 */
export async function createTestDb() {
  snapshot ??= loadSnapshot().catch((error) => {
    snapshot = undefined;
    throw error;
  });
  const client = await PGlite.create({ loadDataDir: await snapshot });
  const db = drizzle({ client, schema });
  return { db, client };
}

export type TestDatabase = Awaited<ReturnType<typeof createTestDb>>["db"];
