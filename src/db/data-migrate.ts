/**
 * Install-time data migration runner.
 *
 * Runs after schema migrate on every build/install. Versioned TypeScript modules
 * in `src/db/data-migrations/` are applied once (idempotent), checksummed, and
 * fail the deploy if incomplete.
 */
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import type { Database } from "@/db";
import { dataMigrations as dataMigrationsTable } from "@/db/schema";
import {
  dataMigrations as registeredMigrations,
  type DataMigration,
  type SideEffect,
} from "@/db/data-migrations";

/** Stable advisory-lock key for data migrations (arbitrary int). */
export const DATA_MIGRATE_LOCK_KEY = 872_014_01;

export class DataMigrationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DataMigrationError";
  }
}

export interface DataMigrateOptions {
  db: Database;
  /**
   * Raw query executor for advisory locks and optional out-of-orm work.
   * When omitted, advisory locking is skipped (tests).
   */
  query?: (sql: string, params?: unknown[]) => Promise<unknown>;
  /** Override registered modules (tests). */
  migrations?: DataMigration[];
  /** Directory of `NNNN_*.ts` files for checksums (defaults to package path). */
  migrationsDir?: string;
  /** Override checksum lookup (tests). */
  checksumFor?: (id: string) => string;
  log?: (message: string) => void;
}

function defaultMigrationsDir(): string {
  return join(process.cwd(), "src/db/data-migrations");
}

/** File basename pattern: 0001_platform_admin.ts */
const FILE_RE = /^(\d{4}_[a-z0-9_]+)\.ts$/i;

export function listMigrationFiles(dir: string): { id: string; path: string }[] {
  const files = readdirSync(dir)
    .filter((name) => FILE_RE.test(name))
    .sort();
  return files.map((name) => {
    const match = name.match(FILE_RE)!;
    return { id: match[1]!, path: join(dir, name) };
  });
}

export function checksumFile(path: string): string {
  const body = readFileSync(path, "utf8");
  return createHash("sha256").update(body).digest("hex");
}

export function assertMigrationRegistry(
  migrations: DataMigration[],
  fileIds: string[],
): void {
  const ids = migrations.map((m) => m.id);
  const unique = new Set(ids);
  if (unique.size !== ids.length) {
    throw new DataMigrationError(
      `Duplicate data migration ids: ${ids.join(", ")}`,
    );
  }

  for (let i = 0; i < ids.length; i++) {
    const expectedNum = String(i + 1).padStart(4, "0");
    if (!ids[i]!.startsWith(`${expectedNum}_`)) {
      throw new DataMigrationError(
        `Data migration id gap or out of order at index ${i}: expected ${expectedNum}_*, got ${ids[i]}`,
      );
    }
  }

  const fileSet = new Set(fileIds);
  for (const id of ids) {
    if (!fileSet.has(id)) {
      throw new DataMigrationError(
        `Registered data migration ${id} has no matching file ${id}.ts`,
      );
    }
  }
  for (const id of fileIds) {
    if (!unique.has(id)) {
      throw new DataMigrationError(
        `Data migration file ${id}.ts is not registered in data-migrations/index.ts`,
      );
    }
  }
}

async function upsertLedger(
  db: Database,
  row: {
    id: string;
    checksum: string;
    status: "pending_effects" | "applied" | "failed";
    error: string | null;
    finishedAt: Date | null;
  },
) {
  const [existing] = await db
    .select({ id: dataMigrationsTable.id })
    .from(dataMigrationsTable)
    .where(eq(dataMigrationsTable.id, row.id))
    .limit(1);

  if (existing) {
    await db
      .update(dataMigrationsTable)
      .set({
        checksum: row.checksum,
        status: row.status,
        error: row.error,
        finishedAt: row.finishedAt,
        startedAt: new Date(),
      })
      .where(eq(dataMigrationsTable.id, row.id));
  } else {
    await db.insert(dataMigrationsTable).values({
      id: row.id,
      checksum: row.checksum,
      status: row.status,
      error: row.error,
      startedAt: new Date(),
      finishedAt: row.finishedAt,
    });
  }
}

/**
 * Apply all pending (or retryable) data migrations in order.
 * Throws {@link DataMigrationError} on failure — callers should exit non-zero.
 */
export async function runDataMigrations(
  options: DataMigrateOptions,
): Promise<{ applied: string[]; skipped: string[]; retried: string[] }> {
  const log = options.log ?? console.log;
  const migrations = options.migrations ?? registeredMigrations;
  const usingDefaults =
    options.migrations === undefined && options.checksumFor === undefined;
  const dir = options.migrationsDir ?? defaultMigrationsDir();

  if (usingDefaults) {
    const files = listMigrationFiles(dir);
    assertMigrationRegistry(
      migrations,
      files.map((f) => f.id),
    );
  } else {
    // Tests / overrides: still enforce id order and uniqueness.
    assertMigrationRegistry(
      migrations,
      migrations.map((m) => m.id),
    );
  }

  const files = usingDefaults ? listMigrationFiles(dir) : [];
  const checksumFor =
    options.checksumFor ??
    ((id: string) => {
      const file = files.find((f) => f.id === id);
      if (!file) {
        throw new DataMigrationError(`No file for migration ${id}`);
      }
      return checksumFile(file.path);
    });

  const result = { applied: [] as string[], skipped: [] as string[], retried: [] as string[] };

  if (options.query) {
    await options.query(`SELECT pg_advisory_lock($1)`, [DATA_MIGRATE_LOCK_KEY]);
  }

  try {
    for (const migration of migrations) {
      const checksum = checksumFor(migration.id);
      const [ledger] = await options.db
        .select()
        .from(dataMigrationsTable)
        .where(eq(dataMigrationsTable.id, migration.id))
        .limit(1);

      if (ledger?.status === "applied") {
        if (ledger.checksum !== checksum) {
          throw new DataMigrationError(
            `Data migration ${migration.id} was already applied with a different checksum. Fix-forward with a new migration; do not edit applied files.`,
          );
        }
        result.skipped.push(migration.id);
        continue;
      }

      if (ledger && (ledger.status === "pending_effects" || ledger.status === "failed")) {
        result.retried.push(migration.id);
      }

      const effects: SideEffect[] = [];
      try {
        await options.db.transaction(async (tx) => {
          await migration.up({
            db: tx as unknown as Database,
            queueEffect: (effect) => {
              effects.push(effect);
            },
          });
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        await upsertLedger(options.db, {
          id: migration.id,
          checksum,
          status: "failed",
          error: message,
          finishedAt: new Date(),
        });
        throw new DataMigrationError(
          `Data migration ${migration.id} failed: ${message}`,
        );
      }

      if (effects.length === 0) {
        await upsertLedger(options.db, {
          id: migration.id,
          checksum,
          status: "applied",
          error: null,
          finishedAt: new Date(),
        });
        log(`Data migration applied: ${migration.id}`);
        result.applied.push(migration.id);
        continue;
      }

      await upsertLedger(options.db, {
        id: migration.id,
        checksum,
        status: "pending_effects",
        error: null,
        finishedAt: null,
      });

      try {
        for (const effect of effects) {
          await effect();
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        await upsertLedger(options.db, {
          id: migration.id,
          checksum,
          status: "pending_effects",
          error: message,
          finishedAt: null,
        });
        throw new DataMigrationError(
          `Data migration ${migration.id} side effects failed: ${message}`,
        );
      }

      await upsertLedger(options.db, {
        id: migration.id,
        checksum,
        status: "applied",
        error: null,
        finishedAt: new Date(),
      });
      log(`Data migration applied: ${migration.id}`);
      result.applied.push(migration.id);
    }
  } finally {
    if (options.query) {
      await options.query(`SELECT pg_advisory_unlock($1)`, [
        DATA_MIGRATE_LOCK_KEY,
      ]).catch(() => {});
    }
  }

  return result;
}
