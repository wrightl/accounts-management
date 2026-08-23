import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestDb, type TestDatabase } from "@/db/pglite";
import { setTestDb, type Database } from "@/db";
import { users } from "@/db/schema";
import { seedAdminUsers } from "@/db/seed";
import { ensureLocalUser, findLocalUser } from "@/lib/users";

vi.mock("server-only", () => ({}));

let ctx: Awaited<ReturnType<typeof createTestDb>>;
let db: TestDatabase;

beforeEach(async () => {
  ctx = await createTestDb();
  db = ctx.db;
  setTestDb(db as unknown as Database);
});

afterEach(async () => {
  setTestDb(null);
  await ctx.client.close();
});

describe("seedAdminUsers", () => {
  it("inserts the bootstrap admin once", async () => {
    const first = await seedAdminUsers(db as unknown as Database);
    expect(first.inserted).toEqual(["lee@dotanddashconsulting.com"]);

    const second = await seedAdminUsers(db as unknown as Database);
    expect(second.inserted).toEqual([]);
    expect(second.skipped).toEqual(["lee@dotanddashconsulting.com"]);

    const rows = await db.select().from(users);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.role).toBe("admin");
    expect(rows[0]?.clerkUserId).toBeNull();
  });

  it("promotes a pending row for the same email", async () => {
    await db.insert(users).values({
      email: "lee@dotanddashconsulting.com",
      role: "pending",
    });

    const result = await seedAdminUsers(db as unknown as Database);
    expect(result.promoted).toEqual(["lee@dotanddashconsulting.com"]);

    const rows = await db.select().from(users);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.role).toBe("admin");
  });

  it("does not overwrite a non-pending role", async () => {
    await db.insert(users).values({
      email: "lee@dotanddashconsulting.com",
      role: "accountant",
    });

    const result = await seedAdminUsers(db as unknown as Database);
    expect(result.skipped).toEqual(["lee@dotanddashconsulting.com"]);
    expect(result.promoted).toEqual([]);

    const [row] = await db.select().from(users);
    expect(row?.role).toBe("accountant");
  });
});

describe("ensureLocalUser with a seeded admin", () => {
  it("attaches the Clerk id and keeps admin", async () => {
    await seedAdminUsers(db as unknown as Database);

    const id = await ensureLocalUser({
      userId: "user_clerk_lee",
      email: "Lee@dotanddashconsulting.com",
      name: "Lee Wright",
    });

    const local = await findLocalUser("user_clerk_lee");
    expect(local?.id).toBe(id);
    expect(local?.role).toBe("admin");
    expect(local?.name).toBe("Lee Wright");

    const rows = await db.select().from(users);
    expect(rows).toHaveLength(1);
  });
});
