import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestDb, type TestDatabase } from "@/db/pglite";
import { setTestDb, type Database } from "@/db";
import { users } from "@/db/schema";
import { seedCompany } from "@/lib/test/seed-company";

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

const clerkMocks = vi.hoisted(() => ({
  auth: vi.fn(async () => ({ userId: "user_clerk_session", sessionClaims: {} })),
  currentUser: vi.fn(async () => ({
    primaryEmailAddress: { emailAddress: "session@example.com" },
    firstName: "Session",
    lastName: "User",
    publicMetadata: {},
  })),
}));

vi.mock("@clerk/nextjs/server", () => ({
  auth: clerkMocks.auth,
  currentUser: clerkMocks.currentUser,
}));

let ctx: Awaited<ReturnType<typeof createTestDb>>;
let db: TestDatabase;

beforeEach(async () => {
  ctx = await createTestDb();
  db = ctx.db;
  setTestDb(db as unknown as Database);
  vi.spyOn(console, "warn").mockImplementation(() => {});
  clerkMocks.auth.mockResolvedValue({
    userId: "user_clerk_session",
    sessionClaims: {},
  });
  clerkMocks.currentUser.mockResolvedValue({
    primaryEmailAddress: { emailAddress: "session@example.com" },
    firstName: "Session",
    lastName: "User",
    publicMetadata: {},
  });
});

afterEach(async () => {
  setTestDb(null);
  await ctx.client.close();
  vi.restoreAllMocks();
});

describe("getCurrentUser Clerk fetch failures", () => {
  it("falls back to the local users row when currentUser fetch fails", async () => {
    const company = await seedCompany(db);
    const [local] = await db
      .insert(users)
      .values({
        companyId: company.id,
        clerkUserId: "user_clerk_session",
        email: "local@example.com",
        name: "Local Name",
        role: "admin",
      })
      .returning();

    clerkMocks.currentUser.mockRejectedValueOnce(
      Object.assign(new Error("fetch failed"), {
        clerkError: true,
        errors: [{ code: "unexpected_error", message: "fetch failed" }],
      }),
    );

    const { getCurrentUser } = await import("@/lib/auth");
    const session = await getCurrentUser();

    expect(session).toMatchObject({
      userId: "user_clerk_session",
      email: "local@example.com",
      name: "Local Name",
      role: "admin",
      localUserId: local.id,
      companyId: company.id,
      entityType: "limited_company",
    });
  });

  it("still returns a signed-in session when Clerk is down and no local row exists", async () => {
    clerkMocks.currentUser.mockRejectedValueOnce(new Error("fetch failed"));

    const { getCurrentUser } = await import("@/lib/auth");
    const session = await getCurrentUser();

    expect(session).toMatchObject({
      userId: "user_clerk_session",
      email: null,
      name: null,
      role: "pending",
      localUserId: null,
      companyId: null,
    });
  });
});
