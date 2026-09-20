import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestDb, type TestDatabase } from "@/db/pglite";
import { setTestDb, type Database } from "@/db";
import { dataMigrations, users } from "@/db/schema";
import {
  assertMigrationRegistry,
  DataMigrationError,
  runDataMigrations,
} from "@/db/data-migrate";
import {
  migration as platformAdminMigration,
  PLATFORM_ADMIN_BOOTSTRAP_EMAIL,
} from "@/db/data-migrations/0001_platform_admin";
import type { DataMigration } from "@/db/data-migrations/types";
import { eq } from "drizzle-orm";

vi.mock("server-only", () => ({}));

const inviteMock = vi.fn();

vi.mock("@/lib/clerk-invite", () => ({
  sendClerkInvitation: (...args: unknown[]) => inviteMock(...args),
}));

let ctx: Awaited<ReturnType<typeof createTestDb>>;
let db: TestDatabase;

beforeEach(async () => {
  ctx = await createTestDb();
  db = ctx.db;
  setTestDb(db as unknown as Database);
  inviteMock.mockReset();
  inviteMock.mockResolvedValue({ ok: true });
  process.env.CLERK_SECRET_KEY = "sk_test_data_migrate";
});

afterEach(async () => {
  setTestDb(null);
  delete process.env.CLERK_SECRET_KEY;
  await ctx.client.close();
});

describe("assertMigrationRegistry", () => {
  it("rejects duplicate ids", () => {
    const dup: DataMigration = {
      id: "0001_a",
      up: async () => {},
    };
    expect(() => assertMigrationRegistry([dup, dup], ["0001_a"])).toThrow(
      /Duplicate/,
    );
  });

  it("rejects gaps in numbering", () => {
    const m: DataMigration = {
      id: "0002_skip",
      up: async () => {},
    };
    expect(() => assertMigrationRegistry([m], ["0002_skip"])).toThrow(
      /gap or out of order/,
    );
  });
});

describe("runDataMigrations", () => {
  it("applies 0001_platform_admin once and invites via Clerk", async () => {
    const first = await runDataMigrations({
      db: db as unknown as Database,
      migrations: [platformAdminMigration],
      checksumFor: () => "checksum-v1",
      log: () => {},
    });
    expect(first.applied).toEqual(["0001_platform_admin"]);
    expect(inviteMock).toHaveBeenCalledWith(PLATFORM_ADMIN_BOOTSTRAP_EMAIL);

    const rows = await db.select().from(users);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.email).toBe(PLATFORM_ADMIN_BOOTSTRAP_EMAIL);
    expect(rows[0]?.role).toBe("platform_admin");

    const ledger = await db.select().from(dataMigrations);
    expect(ledger).toHaveLength(1);
    expect(ledger[0]?.status).toBe("applied");
    expect(ledger[0]?.checksum).toBe("checksum-v1");

    inviteMock.mockClear();
    const second = await runDataMigrations({
      db: db as unknown as Database,
      migrations: [platformAdminMigration],
      checksumFor: () => "checksum-v1",
      log: () => {},
    });
    expect(second.skipped).toEqual(["0001_platform_admin"]);
    expect(second.applied).toEqual([]);
    expect(inviteMock).not.toHaveBeenCalled();
    expect(await db.select().from(users)).toHaveLength(1);
  });

  it("fails when an applied migration checksum changes", async () => {
    await runDataMigrations({
      db: db as unknown as Database,
      migrations: [platformAdminMigration],
      checksumFor: () => "checksum-v1",
      log: () => {},
    });

    await expect(
      runDataMigrations({
        db: db as unknown as Database,
        migrations: [platformAdminMigration],
        checksumFor: () => "checksum-v2",
        log: () => {},
      }),
    ).rejects.toBeInstanceOf(DataMigrationError);
  });

  it("retries pending_effects without duplicating the user", async () => {
    inviteMock.mockResolvedValueOnce({ ok: false, error: "network" });

    await expect(
      runDataMigrations({
        db: db as unknown as Database,
        migrations: [platformAdminMigration],
        checksumFor: () => "checksum-v1",
        log: () => {},
      }),
    ).rejects.toThrow(/side effects failed/);

    const [ledger] = await db.select().from(dataMigrations);
    expect(ledger?.status).toBe("pending_effects");
    expect(await db.select().from(users)).toHaveLength(1);

    inviteMock.mockResolvedValueOnce({ ok: true });
    const retry = await runDataMigrations({
      db: db as unknown as Database,
      migrations: [platformAdminMigration],
      checksumFor: () => "checksum-v1",
      log: () => {},
    });
    expect(retry.retried).toContain("0001_platform_admin");
    expect(retry.applied).toEqual(["0001_platform_admin"]);

    const [done] = await db
      .select()
      .from(dataMigrations)
      .where(eq(dataMigrations.id, "0001_platform_admin"));
    expect(done?.status).toBe("applied");
    expect(await db.select().from(users)).toHaveLength(1);
  });

  it("marks failed when up() throws", async () => {
    const bad: DataMigration = {
      id: "0001_boom",
      up: async () => {
        throw new Error("db explode");
      },
    };

    await expect(
      runDataMigrations({
        db: db as unknown as Database,
        migrations: [bad],
        checksumFor: () => "x",
        log: () => {},
      }),
    ).rejects.toThrow(/db explode/);

    const [ledger] = await db.select().from(dataMigrations);
    expect(ledger?.status).toBe("failed");
    expect(ledger?.error).toMatch(/db explode/);
  });
});
