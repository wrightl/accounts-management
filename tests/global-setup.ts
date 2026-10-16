import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createMigratedSnapshot, PGLITE_SNAPSHOT_ENV } from "../src/db/pglite";

// Migrate once for the whole run; every createTestDb() restores this snapshot
// instead of replaying all migrations. Workers inherit the env var.
export default async function setup() {
  const dir = await mkdtemp(join(tmpdir(), "pglite-snapshot-"));
  const file = join(dir, "migrated.tar");
  const dump = await createMigratedSnapshot();
  await writeFile(file, Buffer.from(await dump.arrayBuffer()));
  process.env[PGLITE_SNAPSHOT_ENV] = file;

  return async () => {
    await rm(dir, { recursive: true, force: true });
  };
}
