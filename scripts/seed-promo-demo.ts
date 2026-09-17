/**
 * Seed fictional promo demo data into the local database.
 * Usage: npm run promo:seed
 *
 * Prefer PROMO_ACTOR_EMAIL (or --email=) so data lands on a founder company,
 * never the platform admin / oldest company.
 *
 * Refuses NODE_ENV=production. Remote DATABASE_URL requires PROMO_SEED_ALLOW_REMOTE=1.
 */
import { config } from "dotenv";
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { schema } from "../src/db/schema";
import { seedPromoDemo } from "../src/db/seed-promo-demo";
import type { Database } from "../src/db";

config({ path: ".env.local" });
config({ path: ".env" });

function actorEmailFromArgs(): string | undefined {
  const flag = process.argv.find((a) => a.startsWith("--email="));
  if (flag) return flag.slice("--email=".length).trim() || undefined;
  return process.env.PROMO_ACTOR_EMAIL?.trim() || undefined;
}

async function main() {
  const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL is required to seed promo demo");
    process.exit(1);
  }

  const actorEmail = actorEmailFromArgs();
  const client = new pg.Client({ connectionString: url });

  try {
    await client.connect();
    const db = drizzle(client, { schema });
    const result = await seedPromoDemo(db as unknown as Database, {
      force: true,
      actorEmail,
    });

    const promoDir = join(process.cwd(), "promo");
    mkdirSync(promoDir, { recursive: true });
    writeFileSync(
      join(promoDir, "routes.json"),
      JSON.stringify(result.routes, null, 2) + "\n",
    );

    console.log("Promo demo seeded.");
    if (actorEmail) console.log(`Actor: ${actorEmail}`);
    console.log(JSON.stringify(result.routes, null, 2));
    if (result.cleared) console.log("(Previous promo entities cleared.)");
  } catch (err) {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  } finally {
    await client.end().catch(() => {});
  }
}

main();
