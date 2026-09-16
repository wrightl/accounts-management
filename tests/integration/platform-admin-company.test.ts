import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb, type TestDatabase } from "@/db/pglite";
import { setTestDb, type Database } from "@/db";
import { companyMemberships, users } from "@/db/schema";
import { seedPlatformAdmins } from "@/db/seed";
import { completeOnboarding } from "@/actions/onboarding";
import { invitePlatformAdmin } from "@/actions/platform";
import { seedCompany } from "@/lib/test/seed-company";
import { listPlatformUsers } from "@/lib/platform/queries";
import {
  PlatformAdminCompanyError,
  upsertMembership,
} from "@/lib/users";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
}));

vi.mock("@/lib/clerk-invite", () => ({
  sendClerkInvitation: vi.fn(async () => ({ ok: true as const })),
}));

vi.mock("@clerk/nextjs/server", () => ({
  auth: vi.fn(async () => ({ userId: "user_clerk_ops", sessionClaims: {} })),
  currentUser: vi.fn(async () => ({
    primaryEmailAddress: { emailAddress: "ops@example.com" },
    firstName: "Ops",
    lastName: "Admin",
    publicMetadata: {},
  })),
  clerkClient: vi.fn(async () => ({
    invitations: {
      createInvitation: vi.fn(async () => ({})),
      getInvitationList: vi.fn(async () => ({ data: [] })),
      revokeInvitation: vi.fn(async () => ({})),
    },
    users: { updateUser: vi.fn(), deleteUser: vi.fn() },
  })),
}));

let ctx: Awaited<ReturnType<typeof createTestDb>>;
let db: TestDatabase;

beforeEach(async () => {
  ctx = await createTestDb();
  db = ctx.db;
  setTestDb(db as unknown as Database);
  process.env.PLATFORM_ADMIN_EMAILS = "ops@example.com";
  process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY = "pk_test_mock";
  process.env.CLERK_SECRET_KEY = "sk_test_mock";

  await db.insert(users).values({
    clerkUserId: "user_clerk_ops",
    email: "ops@example.com",
    name: "Ops Admin",
    role: "platform_admin",
    companyId: null,
  });
});

afterEach(async () => {
  delete process.env.PLATFORM_ADMIN_EMAILS;
  delete process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
  delete process.env.CLERK_SECRET_KEY;
  setTestDb(null);
  await ctx.client.close();
});

describe("completeOnboarding", () => {
  it("refuses platform operators", async () => {
    const form = new FormData();
    form.set("entityType", "limited_company");
    form.set("userName", "Ops Admin");
    form.set("name", "Should Not Exist Ltd");
    form.set("legalName", "Should Not Exist Ltd");
    form.set("companyNumber", "12345678");
    form.set("financialYearEndMonth", "3");

    const result = await completeOnboarding(form);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/platform operators/i);

    const [ops] = await db
      .select()
      .from(users)
      .where(eq(users.clerkUserId, "user_clerk_ops"));
    expect(ops.companyId).toBeNull();
  });
});

describe("invitePlatformAdmin", () => {
  it("creates a platform admin with no company and sends invite", async () => {
    const form = new FormData();
    form.set("email", "new-ops@example.com");
    form.set("name", "New Ops");

    const result = await invitePlatformAdmin(form);
    expect(result.ok).toBe(true);

    const [row] = await db
      .select()
      .from(users)
      .where(eq(users.email, "new-ops@example.com"));
    expect(row.role).toBe("platform_admin");
    expect(row.companyId).toBeNull();
    expect(row.clerkUserId).toBeNull();
    expect(row.name).toBe("New Ops");
  });

  it("rejects an email that already belongs to a company user", async () => {
    const company = await seedCompany(db);
    await db.insert(users).values({
      email: "member@example.com",
      name: "Member",
      role: "user",
      companyId: company.id,
    });

    const form = new FormData();
    form.set("email", "member@example.com");

    const result = await invitePlatformAdmin(form);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/already belongs to a user/i);

    const admins = await listPlatformUsers();
    expect(admins.some((u) => u.email === "member@example.com")).toBe(false);
  });

  it("rejects an email that is already a platform admin", async () => {
    const form = new FormData();
    form.set("email", "ops@example.com");

    const result = await invitePlatformAdmin(form);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/already a platform admin/i);
  });
});

describe("listPlatformUsers", () => {
  it("returns only platform admins", async () => {
    const company = await seedCompany(db);
    const [member] = await db
      .insert(users)
      .values({
        email: "member@example.com",
        role: "user",
        companyId: company.id,
      })
      .returning();
    await db.insert(companyMemberships).values({
      userId: member.id,
      companyId: company.id,
      role: "user",
    });

    const rows = await listPlatformUsers();
    expect(rows.map((r) => r.email)).toEqual(["ops@example.com"]);
  });
});

describe("platform admin invariants", () => {
  it("rejects platform_admin with a company_id", async () => {
    const company = await seedCompany(db);
    await expect(
      db.insert(users).values({
        email: "bad-ops@example.com",
        role: "platform_admin",
        companyId: company.id,
      }),
    ).rejects.toThrow();
  });

  it("rejects platform_admin with an expense inbound slug", async () => {
    await expect(
      db.insert(users).values({
        email: "slug-ops@example.com",
        role: "platform_admin",
        companyId: null,
        expenseInboundSlug: "ops",
      }),
    ).rejects.toThrow();
  });

  it("rejects membership rows with platform_admin role", async () => {
    const company = await seedCompany(db);
    const [member] = await db
      .insert(users)
      .values({
        email: "member@example.com",
        role: "user",
        companyId: company.id,
      })
      .returning();

    await expect(
      db.insert(companyMemberships).values({
        userId: member.id,
        companyId: company.id,
        role: "platform_admin",
      }),
    ).rejects.toThrow();
  });

  it("refuses upsertMembership for a platform admin", async () => {
    const company = await seedCompany(db);
    const [ops] = await db
      .select()
      .from(users)
      .where(eq(users.clerkUserId, "user_clerk_ops"));

    await expect(
      upsertMembership(ops.id, company.id, "admin"),
    ).rejects.toBeInstanceOf(PlatformAdminCompanyError);

    const [still] = await db
      .select()
      .from(users)
      .where(eq(users.id, ops.id));
    expect(still.role).toBe("platform_admin");
    expect(still.companyId).toBeNull();

    const memberships = await db
      .select()
      .from(companyMemberships)
      .where(eq(companyMemberships.userId, ops.id));
    expect(memberships).toHaveLength(0);
  });

  it("seedPlatformAdmins clears inbound slug and memberships", async () => {
    const company = await seedCompany(db);
    const [existing] = await db
      .insert(users)
      .values({
        email: "promote@example.com",
        role: "user",
        companyId: company.id,
        expenseInboundSlug: "promote",
      })
      .returning();
    await db.insert(companyMemberships).values({
      userId: existing.id,
      companyId: company.id,
      role: "user",
    });

    const result = await seedPlatformAdmins(db as unknown as Database, [
      "promote@example.com",
    ]);
    expect(result.updated).toEqual(["promote@example.com"]);

    const [row] = await db
      .select()
      .from(users)
      .where(eq(users.id, existing.id));
    expect(row.role).toBe("platform_admin");
    expect(row.companyId).toBeNull();
    expect(row.expenseInboundSlug).toBeNull();

    const memberships = await db
      .select()
      .from(companyMemberships)
      .where(eq(companyMemberships.userId, existing.id));
    expect(memberships).toHaveLength(0);
  });
});
