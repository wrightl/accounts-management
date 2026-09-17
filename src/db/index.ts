import { Pool } from "pg";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { attachDatabasePool } from "@vercel/functions";
import { requireEnv } from "@/env";
import { schema } from "./schema";

export type Database = NodePgDatabase<typeof schema>;

let cached: Database | null = null;
let cachedPool: Pool | null = null;
let testOverride: Database | null = null;

/**
 * Inject a PGlite (or other) client for tests so actions can call {@link getDb}.
 */
export function setTestDb(db: Database | null) {
  testOverride = db;
}

/** True when Neon is configured or a test client has been injected. */
export function hasDatabaseClient(): boolean {
  return testOverride !== null || Boolean(process.env.DATABASE_URL);
}

/**
 * Lazily-initialised Postgres pool (node-postgres) + Drizzle.
 *
 * Uses TCP via `pg` rather than the Neon WebSocket driver: concurrent dashboard
 * queries over WebSockets were failing with TLS disconnects ("Failed query"),
 * which surfaced as an empty dashboard. Prefer the pooled `DATABASE_URL`.
 * `attachDatabasePool` lets Vercel Fluid Compute reuse connections safely.
 */
export function getDb(): Database {
  if (testOverride) return testOverride;
  if (cached) return cached;
  const pool = new Pool({
    connectionString: requireEnv("DATABASE_URL"),
    max: 10,
  });
  attachDatabasePool(pool);
  cachedPool = pool;
  cached = drizzle({ client: pool, schema });
  return cached;
}

/** Exposed for tests / graceful shutdown. */
export function getPool(): Pool | null {
  return cachedPool;
}

export { schema };
