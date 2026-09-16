import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestDb, type TestDatabase } from "@/db/pglite";
import { setTestDb, type Database } from "@/db";
import { users, companyMemberships } from "@/db/schema";
import { seedPlatformAdmins } from "@/db/seed";
import {
  assignUserCompany,
  ensureLocalUser,
  findLocalUser,
  PlatformAdminCompanyError,
} from "@/lib/users";
import { seedCompany } from "@/lib/test/seed-company";

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

describe("seedPlatformAdmins", () => {
  it("inserts the platform admin once", async () => {
    const first = await seedPlatformAdmins(db as unknown as Database, [
      "admin@dotanddashconsulting.com",
    ]);
    expect(first.inserted).toEqual(["admin@dotanddashconsulting.com"]);

    const second = await seedPlatformAdmins(db as unknown as Database, [
      "admin@dotanddashconsulting.com",
    ]);
    expect(second.inserted).toEqual([]);
    expect(second.skipped).toEqual(["admin@dotanddashconsulting.com"]);

    const rows = await db.select().from(users);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.role).toBe("platform_admin");
    expect(rows[0]?.companyId).toBeNull();
    expect(rows[0]?.clerkUserId).toBeNull();
  });

  it("grants platform_admin on an existing row and detaches any company", async () => {
    const company = await seedCompany(db);
    const [existing] = await db
      .insert(users)
      .values({
        email: "admin@dotanddashconsulting.com",
        role: "accountant",
        companyId: company.id,
        expenseInboundSlug: "admin",
      })
      .returning();
    await db.insert(companyMemberships).values({
      userId: existing.id,
      companyId: company.id,
      role: "accountant",
    });

    const result = await seedPlatformAdmins(db as unknown as Database, [
      "admin@dotanddashconsulting.com",
    ]);
    expect(result.updated).toEqual(["admin@dotanddashconsulting.com"]);

    const rows = await db.select().from(users);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.role).toBe("platform_admin");
    expect(rows[0]?.companyId).toBeNull();
    expect(rows[0]?.expenseInboundSlug).toBeNull();

    const memberships = await db.select().from(companyMemberships);
    expect(memberships).toHaveLength(0);
  });

  it("does not overwrite when already platform admin", async () => {
    await db.insert(users).values({
      email: "admin@dotanddashconsulting.com",
      role: "platform_admin",
    });

    const result = await seedPlatformAdmins(db as unknown as Database, [
      "admin@dotanddashconsulting.com",
    ]);
    expect(result.skipped).toEqual(["admin@dotanddashconsulting.com"]);
    expect(result.updated).toEqual([]);
  });
});

describe("ensureLocalUser with a seeded platform admin", () => {
  it("attaches the Clerk id and keeps platform_admin", async () => {
    await seedPlatformAdmins(db as unknown as Database, [
      "admin@dotanddashconsulting.com",
    ]);

    const id = await ensureLocalUser({
      userId: "user_clerk_admin",
      email: "Admin@dotanddashconsulting.com",
      name: "Platform Admin",
    });

    const local = await findLocalUser("user_clerk_admin");
    expect(local?.id).toBe(id);
    expect(local?.role).toBe("platform_admin");
    expect(local?.name).toBe("Platform Admin");

    const rows = await db.select().from(users);
    expect(rows).toHaveLength(1);
  });
});

describe("assignUserCompany", () => {
  it("refuses to attach a platform operator to a company", async () => {
    const company = await seedCompany(db);
    await seedPlatformAdmins(db as unknown as Database, [
      "admin@dotanddashconsulting.com",
    ]);
    const id = await ensureLocalUser({
      userId: "user_clerk_ops",
      email: "admin@dotanddashconsulting.com",
      name: "Ops",
    });

    await expect(assignUserCompany(id, company.id, { role: "admin" })).rejects.toBeInstanceOf(
      PlatformAdminCompanyError,
    );

    const local = await findLocalUser("user_clerk_ops");
    expect(local?.companyId).toBeNull();
  });
});
