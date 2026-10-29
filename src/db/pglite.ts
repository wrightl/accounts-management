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

interface SequenceState {
  name: string;
  value: string;
  isCalled: boolean;
}

/** What a freshly restored snapshot holds, so a reused database can go back to it. */
interface Baseline {
  tables: string[];
  seeds: { table: string; rows: string }[];
  sequences: SequenceState[];
}

const quoteIdent = (name: string) => `"${name.replaceAll('"', '""')}"`;

async function readBaseline(client: PGlite): Promise<Baseline> {
  const { rows: tables } = await client.query<{ name: string }>(
    `select tablename as name from pg_tables where schemaname = 'public' order by tablename`,
  );
  // Rows the migrations seed (spending categories, subscription tiers, ...).
  const seeds: Baseline["seeds"] = [];
  for (const { name } of tables) {
    const { rows } = await client.query<{ rows: string | null }>(
      `select json_agg(t)::text as rows from ${quoteIdent(name)} t`,
    );
    if (rows[0]?.rows) seeds.push({ table: name, rows: rows[0].rows });
  }
  const { rows: sequences } = await client.query<{ name: string }>(
    `select format('%I.%I', schemaname, sequencename) as name from pg_sequences where schemaname = 'public'`,
  );
  const states: SequenceState[] = [];
  for (const { name } of sequences) {
    const { rows } = await client.query<{ value: string; isCalled: boolean }>(
      `select last_value::text as value, is_called as "isCalled" from ${name}`,
    );
    states.push({ name, ...rows[0]! });
  }
  return { tables: tables.map((t) => t.name), seeds, sequences: states };
}

/** Put a used database back to how the snapshot left it. */
async function resetToBaseline(client: PGlite, baseline: Baseline): Promise<void> {
  await client.transaction(async (tx) => {
    if (baseline.tables.length > 0) {
      await tx.exec(`truncate ${baseline.tables.map(quoteIdent).join(", ")} cascade`);
    }
    for (const { table, rows } of baseline.seeds) {
      await tx.query(
        `insert into ${quoteIdent(table)} overriding system value
         select * from json_populate_recordset(null::${quoteIdent(table)}, $1::json)`,
        [rows],
      );
    }
    for (const { name, value, isCalled } of baseline.sequences) {
      await tx.query(`select setval($1, $2::bigint, $3)`, [name, value, isCalled]);
    }
  });
}

/**
 * One database per test file, reset between tests. Restoring the snapshot
 * costs a few hundred milliseconds under load; truncating and re-seeding costs
 * a few dozen. Vitest loads this module afresh for each test file, so files
 * never share a database.
 */
let cached:
  | { client: PGlite; baseline: Baseline; inUse: boolean; dirty: boolean }
  | undefined;

async function restoreSnapshot(): Promise<PGlite> {
  snapshot ??= loadSnapshot().catch((error) => {
    snapshot = undefined;
    throw error;
  });
  return PGlite.create({ loadDataDir: await snapshot });
}

/** The client handed to a test: `close()` releases the shared database for the next test. */
function releasingClient(client: PGlite, release: () => void): PGlite {
  return new Proxy(client, {
    get(target, prop) {
      if (prop === "close") return async () => release();
      const value = Reflect.get(target, prop, target);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}

/**
 * Create an in-memory Postgres (PGlite) database with all migrations applied,
 * so tests can exercise the schema without external services.
 *
 * Within a test file, a database that was closed is reset and reused rather
 * than restored again. Pass `fresh: true` for a database no other test in the
 * file has touched, e.g. one whose schema the test changes.
 */
export async function createTestDb({ fresh = false }: { fresh?: boolean } = {}) {
  if (fresh || cached?.inUse) {
    // Not shared: the test's own `client.close()` really closes it.
    const client = await restoreSnapshot();
    return { db: drizzle({ client, schema }), client };
  }

  if (!cached) {
    const client = await restoreSnapshot();
    cached = { client, baseline: await readBaseline(client), inUse: false, dirty: false };
    closeOnExit(client);
  }
  const shared = cached;
  if (shared.dirty) await resetToBaseline(shared.client, shared.baseline);
  shared.inUse = true;
  shared.dirty = true;

  const client = releasingClient(shared.client, () => {
    shared.inUse = false;
  });
  return { db: drizzle({ client: shared.client, schema }), client };
}

/** Global the vitest setup file calls after each test file (see tests/setup.ts). */
export const CLOSE_TEST_DB_GLOBAL = "__closeTestDb";

function closeOnExit(client: PGlite) {
  (globalThis as Record<string, unknown>)[CLOSE_TEST_DB_GLOBAL] = async () => {
    cached = undefined;
    await client.close();
  };
}

export type TestDatabase = Awaited<ReturnType<typeof createTestDb>>["db"];
