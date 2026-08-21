import { drizzle, type NeonHttpDatabase } from "drizzle-orm/neon-http";
import { neon } from "@neondatabase/serverless";
import { requireEnv } from "@/env";
import { schema } from "./schema";

export type Database = NeonHttpDatabase<typeof schema>;

let cached: Database | null = null;

/**
 * Lazily-initialised Neon HTTP database client. Throws a clear error if
 * DATABASE_URL is not set, but only when first accessed at request time.
 */
export function getDb(): Database {
  if (cached) return cached;
  const sql = neon(requireEnv("DATABASE_URL"));
  cached = drizzle({ client: sql, schema });
  return cached;
}

export { schema };
