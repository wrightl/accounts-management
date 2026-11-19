/**
 * Create or reset the demo company.
 *
 *   npm run demo:create -- --admin-email=demo@example.com --accountant-email=accountant@example.com
 *   npm run demo:reset                       # the demo company, data rebuilt to today
 *   npm run demo:reset -- --company=<id> --today=2027-06-01
 *
 * Works against whatever DATABASE_URL points at, production included: only a
 * company flagged `is_demo` can be reset. Asks before changing anything unless
 * --yes is passed. Receipts go to Blob storage when BLOB_READ_WRITE_TOKEN is
 * set; without it they live in this process's memory and won't open in the app.
 */
import { config } from "dotenv";
import { createInterface } from "node:readline/promises";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { eq } from "drizzle-orm";
import { postgresConnectionString } from "../src/db/connection-string";
import { companies, schema } from "../src/db/schema";
import { setTestDb, type Database } from "../src/db";
import { createDemoCompany } from "../src/lib/demo/create";
import { resetDemoCompany } from "../src/lib/demo/reset";
import { DEMO_COMPANY } from "../src/lib/demo/story";

config({ path: ".env.local" });
config({ path: ".env" });

function flag(name: string): string | undefined {
  const arg = process.argv.find((a) => a.startsWith(`--${name}=`));
  return arg ? arg.slice(name.length + 3).trim() || undefined : undefined;
}

function usage(message?: string): never {
  if (message) console.error(message);
  console.error(
    [
      "Usage:",
      "  npm run demo:create -- --admin-email=<email> --accountant-email=<email> [--yes]",
      "  npm run demo:reset [-- --company=<id>] [--today=YYYY-MM-DD] [--yes]",
    ].join("\n"),
  );
  process.exit(1);
}

async function confirm(question: string): Promise<boolean> {
  if (process.argv.includes("--yes")) return true;
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question(`${question} [y/N] `);
  rl.close();
  return /^y(es)?$/i.test(answer.trim());
}

async function main() {
  const command = process.argv[2];
  if (command !== "create" && command !== "reset") usage();
  const today = flag("today");
  if (today && !/^\d{4}-\d{2}-\d{2}$/.test(today)) usage("--today must be YYYY-MM-DD");

  const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
  if (!url) usage("DATABASE_URL is required");
  const host = new URL(postgresConnectionString(url)).host;

  const client = new pg.Client({ connectionString: postgresConnectionString(url) });
  await client.connect();
  const db = drizzle(client, { schema }) as unknown as Database;
  setTestDb(db);

  try {
    if (command === "create") {
      const adminEmail = flag("admin-email");
      const accountantEmail = flag("accountant-email");
      if (!adminEmail || !accountantEmail) usage("--admin-email and --accountant-email are required");
      console.log(`Database: ${host}`);
      console.log(`Set up "${DEMO_COMPANY.legalName}" with admin ${adminEmail} and accountant ${accountantEmail}.`);
      if (!(await confirm("Continue?"))) return;
      const result = await createDemoCompany({ adminEmail, accountantEmail, today });
      console.log(result.created ? "Demo company created." : "Demo company already existed; reset it.");
      report(result.companyId, result.reset);
      console.log(
        `\nSign up (or sign in) at the app with ${adminEmail} and ${accountantEmail}; the demo company is linked on first sign-in.`,
      );
      return;
    }

    let companyId = flag("company");
    if (!companyId) {
      const [demo] = await db
        .select({ id: companies.id })
        .from(companies)
        .where(eq(companies.slug, DEMO_COMPANY.slugBase))
        .limit(1);
      if (!demo) usage("No demo company found. Run demo:create first, or pass --company=<id>.");
      companyId = demo.id;
    }
    const [company] = await db
      .select({ name: companies.name, isDemo: companies.isDemo })
      .from(companies)
      .where(eq(companies.id, companyId))
      .limit(1);
    if (!company) usage(`No company ${companyId}`);
    if (!company.isDemo) usage(`"${company.name}" is not a demo company. Refusing to reset it.`);
    console.log(`Database: ${host}`);
    console.log(`Reset "${company.name}" (${companyId}): all its records are deleted and rebuilt to ${today ?? "today"}.`);
    if (!(await confirm("Continue?"))) return;
    report(companyId, await resetDemoCompany({ companyId, today }));
  } finally {
    await client.end().catch(() => {});
  }
}

function report(companyId: string, r: Awaited<ReturnType<typeof resetDemoCompany>>) {
  console.log(`Company: ${companyId}`);
  console.log(`Records from ${r.recordsStart} to ${r.today}, built in ${(r.durationMs / 1000).toFixed(1)}s:`);
  const c = r.counts;
  console.log(
    `  ${c.clients} clients, ${c.quotes} quotes, ${c.orders} orders, ${c.invoices} invoices, ${c.expenses} expenses, ` +
      `${c.bankTransactions} bank transactions, ${c.receipts} receipts`,
  );
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  // Drizzle wraps the database error; its cause says what actually went wrong.
  const cause = err instanceof Error ? (err.cause as Error | undefined) : undefined;
  if (cause?.message) console.error(`Cause: ${cause.message}`);
  if (cause?.message?.includes("is_demo")) {
    console.error("This database doesn't have the demo migration (0095) yet. Apply migrations first.");
  }
  process.exit(1);
});
