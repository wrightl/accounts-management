import { afterAll } from "vitest";

// Close the database createTestDb() shares across a file's tests. Looked up
// through a global so unit tests that never touch the database don't load PGlite.
afterAll(async () => {
  const g = globalThis as { __closeTestDb?: () => Promise<void> };
  const close = g.__closeTestDb;
  delete g.__closeTestDb;
  await close?.();
});
