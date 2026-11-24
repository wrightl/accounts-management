/**
 * Show what the tax code backfill (data migration 0005) would write, per
 * company, without changing anything.
 *
 *   npm run tax-codes:dry-run
 *   npm run tax-codes:dry-run -- --company=<id>
 *
 * Works against whatever DATABASE_URL points at, production included. It only
 * reads: every query is a select.
 */
import { config } from "dotenv";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { postgresConnectionString } from "../src/db/connection-string";
import { schema } from "../src/db/schema";
import type { Database } from "../src/db";
import { formatBackfillPlan, planTaxCodeBackfill } from "../src/lib/tax-code-backfill";

config({ path: ".env.local" });
config({ path: ".env" });

function flag(name: string): string | undefined {
  const arg = process.argv.find((a) => a.startsWith(`--${name}=`));
  return arg ? arg.slice(name.length + 3).trim() || undefined : undefined;
}

async function main() {
  const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
  if (!url) {
    console.error("Set DATABASE_URL (or DATABASE_URL_UNPOOLED) first.");
    process.exit(1);
  }
  const client = new pg.Client({ connectionString: postgresConnectionString(url) });
  await client.connect();
  try {
    // Belt and braces: the plan only selects, but refuse writes at the session level too.
    await client.query("SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY");
    const db = drizzle(client, { schema }) as unknown as Database;
    const plans = await planTaxCodeBackfill(db, { companyId: flag("company") });
    console.log(formatBackfillPlan(plans));
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
