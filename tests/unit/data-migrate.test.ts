import { describe, expect, it } from "vitest";
import {
  assertMigrationRegistry,
  DATA_MIGRATE_LOCK_KEY,
  DataMigrationError,
} from "@/db/data-migrate";
import type { DataMigration } from "@/db/data-migrations/types";

describe("data-migrate helpers", () => {
  it("exports a stable advisory lock key", () => {
    expect(DATA_MIGRATE_LOCK_KEY).toBe(872_014_01);
  });

  it("accepts a contiguous registry matching file ids", () => {
    const migrations: DataMigration[] = [
      { id: "0001_a", up: async () => {} },
      { id: "0002_b", up: async () => {} },
    ];
    expect(() =>
      assertMigrationRegistry(migrations, ["0001_a", "0002_b"]),
    ).not.toThrow();
  });

  it("rejects unregistered files", () => {
    const migrations: DataMigration[] = [
      { id: "0001_a", up: async () => {} },
    ];
    expect(() =>
      assertMigrationRegistry(migrations, ["0001_a", "0002_orphan"]),
    ).toThrow(DataMigrationError);
  });
});
