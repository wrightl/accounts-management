import { Pool, neonConfig } from "@neondatabase/serverless";
import { drizzle, type NeonDatabase } from "drizzle-orm/neon-serverless";
import ws from "ws";
import { requireEnv } from "@/env";
import { schema } from "./schema";

// Neon serverless WebSocket driver (needed for transactions / Pool).
if (typeof WebSocket === "undefined") {
  neonConfig.webSocketConstructor = ws;
}

export type Database = NeonDatabase<typeof schema>;

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
 * Lazily-initialised Neon serverless database client (Pool). Supports
 * `db.transaction()` for atomic invoice-number allocation. Throws a clear
 * error if DATABASE_URL is not set, but only when first accessed at request time.
 */
export function getDb(): Database {
  if (testOverride) return testOverride;
  if (cached) return cached;
  const pool = new Pool({ connectionString: requireEnv("DATABASE_URL") });
  cachedPool = pool;
  cached = drizzle({ client: pool, schema });
  return cached;
}

/** Exposed for tests / graceful shutdown. */
export function getPool(): Pool | null {
  return cachedPool;
}

export { schema };
