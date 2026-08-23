import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb, type TestDatabase } from "@/db/pglite";
import { setTestDb, type Database } from "@/db";
import { users } from "@/db/schema";
import { inviteUser, deleteUser, revokeUserInvite, updateUser } from "@/actions/users";
import { ensureLocalUser, findUserByEmail } from "@/lib/users";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

const { createInvitation, updateClerkUser, deleteClerkUser, getInvitationList, revokeInvitation } = vi.hoisted(() => ({
  createInvitation: vi.fn(async () => ({})),
  updateClerkUser: vi.fn(async () => ({})),
  deleteClerkUser: vi.fn(async () => ({})),
  getInvitationList: vi.fn(async () => ({ data: [] as { id: string; emailAddress: string }[] })),
  revokeInvitation: vi.fn(async () => ({})),
}));

vi.mock("@clerk/nextjs/server", () => ({
  auth: vi.fn(async () => ({ userId: "user_clerk_admin", sessionClaims: {} })),
  currentUser: vi.fn(async () => ({
    primaryEmailAddress: { emailAddress: "admin@example.com" },
    firstName: "Admin",
    lastName: "User",
    publicMetadata: {},
  })),
  clerkClient: vi.fn(async () => ({
    invitations: { createInvitation, getInvitationList, revokeInvitation },
    users: { updateUser: updateClerkUser, deleteUser: deleteClerkUser },
  })),
}));

let ctx: Awaited<ReturnType<typeof createTestDb>>;
let db: TestDatabase;

async function seedAdmin() {
  const [admin] = await db
    .insert(users)
    .values({
      clerkUserId: "user_clerk_admin",
      email: "admin@example.com",
      name: "Admin User",
      role: "admin",
    })
    .returning();
  return admin;
}

beforeEach(async () => {
  ctx = await createTestDb();
  db = ctx.db;
  setTestDb(db as unknown as Database);
  process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY = "pk_test_mock";
  process.env.CLERK_SECRET_KEY = "sk_test_mock";
  createInvitation.mockClear();
  updateClerkUser.mockClear();
  deleteClerkUser.mockClear();
  getInvitationList.mockClear();
  revokeInvitation.mockClear();
});

afterEach(async () => {
  delete process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
  delete process.env.CLERK_SECRET_KEY;
  setTestDb(null);
  await ctx.client.close();
});

describe("inviteUser", () => {
  it("creates an invited row and sends a Clerk invitation", async () => {
    await seedAdmin();

    const form = new FormData();
    form.set("email", "accountant@example.com");
    form.set("name", "Alex Accountant");
    form.set("role", "accountant");

    const result = await inviteUser(form);
    expect(result.ok).toBe(true);
    expect(createInvitation).toHaveBeenCalledWith({
      emailAddress: "accountant@example.com",
      redirectUrl: expect.stringMatching(/\/sign-up$/),
    });

    const invited = await findUserByEmail("accountant@example.com");
    expect(invited?.name).toBe("Alex Accountant");
    expect(invited?.role).toBe("accountant");
    expect(invited?.clerkUserId).toBeNull();
  });

  it("rejects when the email belongs to a signed-in user", async () => {
    await seedAdmin();
    await db.insert(users).values({
      clerkUserId: "user_clerk_existing",
      email: "existing@example.com",
      name: "Existing",
      role: "user",
    });

    const form = new FormData();
    form.set("email", "existing@example.com");
    form.set("role", "accountant");

    const result = await inviteUser(form);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/already signed in/i);
    expect(createInvitation).not.toHaveBeenCalled();
  });

  it("updates an existing invited row before re-sending", async () => {
    await seedAdmin();
    const [invited] = await db
      .insert(users)
      .values({
        email: "pending@example.com",
        name: "Old Name",
        role: "pending",
      })
      .returning();

    const form = new FormData();
    form.set("email", "pending@example.com");
    form.set("name", "New Name");
    form.set("role", "user");

    const result = await inviteUser(form);
    expect(result.ok).toBe(true);

    const rows = await db.select().from(users).where(eq(users.email, "pending@example.com"));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.id).toBe(invited.id);
    expect(rows[0]?.name).toBe("New Name");
    expect(rows[0]?.role).toBe("user");
  });
});

describe("revokeUserInvite", () => {
  it("revokes the Clerk invitation and deletes the invited row", async () => {
    await seedAdmin();
    const [invited] = await db
      .insert(users)
      .values({
        email: "pending@example.com",
        name: "Pending User",
        role: "accountant",
      })
      .returning();

    getInvitationList.mockResolvedValueOnce({
      data: [{ id: "inv_123", emailAddress: "pending@example.com" }],
    });

    const result = await revokeUserInvite(invited.id);
    expect(result.ok).toBe(true);
    expect(getInvitationList).toHaveBeenCalledWith({
      query: "pending@example.com",
      status: "pending",
    });
    expect(revokeInvitation).toHaveBeenCalledWith("inv_123");

    const rows = await db.select().from(users).where(eq(users.id, invited.id));
    expect(rows).toHaveLength(0);
  });

  it("rejects revoking a signed-in user", async () => {
    await seedAdmin();
    const [active] = await db
      .insert(users)
      .values({
        clerkUserId: "user_clerk_active",
        email: "active@example.com",
        name: "Active",
        role: "user",
      })
      .returning();

    const result = await revokeUserInvite(active.id);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/already signed in/i);
    expect(getInvitationList).not.toHaveBeenCalled();
    expect(revokeInvitation).not.toHaveBeenCalled();
  });

  it("deletes the invited row when Clerk has no pending invitation", async () => {
    await seedAdmin();
    const [invited] = await db
      .insert(users)
      .values({
        email: "orphan@example.com",
        name: "Orphan",
        role: "pending",
      })
      .returning();

    getInvitationList.mockResolvedValueOnce({ data: [] });

    const result = await revokeUserInvite(invited.id);
    expect(result.ok).toBe(true);
    expect(revokeInvitation).not.toHaveBeenCalled();

    const rows = await db.select().from(users).where(eq(users.id, invited.id));
    expect(rows).toHaveLength(0);
  });
});

describe("deleteUser", () => {
  it("deletes a signed-in user from Clerk and the database", async () => {
    await seedAdmin();
    const [active] = await db
      .insert(users)
      .values({
        clerkUserId: "user_clerk_active",
        email: "active@example.com",
        name: "Active User",
        role: "user",
      })
      .returning();

    const result = await deleteUser(active.id);
    expect(result.ok).toBe(true);
    expect(deleteClerkUser).toHaveBeenCalledWith("user_clerk_active");

    const rows = await db.select().from(users).where(eq(users.id, active.id));
    expect(rows).toHaveLength(0);
  });

  it("deletes an invited user and revokes pending Clerk invitations", async () => {
    await seedAdmin();
    const [invited] = await db
      .insert(users)
      .values({
        email: "pending@example.com",
        name: "Pending",
        role: "pending",
      })
      .returning();

    getInvitationList.mockResolvedValueOnce({
      data: [{ id: "inv_456", emailAddress: "pending@example.com" }],
    });

    const result = await deleteUser(invited.id);
    expect(result.ok).toBe(true);
    expect(revokeInvitation).toHaveBeenCalledWith("inv_456");
    expect(deleteClerkUser).not.toHaveBeenCalled();

    const rows = await db.select().from(users).where(eq(users.id, invited.id));
    expect(rows).toHaveLength(0);
  });

  it("blocks deleting your own account", async () => {
    const admin = await seedAdmin();

    const result = await deleteUser(admin.id);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/own account/i);
    expect(deleteClerkUser).not.toHaveBeenCalled();
  });

  it("allows deleting an admin when another admin remains", async () => {
    await seedAdmin();
    const [otherAdmin] = await db
      .insert(users)
      .values({
        clerkUserId: "user_clerk_other_admin",
        email: "other-admin@example.com",
        name: "Other Admin",
        role: "admin",
      })
      .returning();

    const result = await deleteUser(otherAdmin.id);
    expect(result.ok).toBe(true);
    expect(deleteClerkUser).toHaveBeenCalledWith("user_clerk_other_admin");
  });
});

describe("updateUser", () => {
  it("updates name and role on an invited user, including email", async () => {
    await seedAdmin();
    const [invited] = await db
      .insert(users)
      .values({
        email: "invite@example.com",
        name: "Before",
        role: "pending",
      })
      .returning();

    const form = new FormData();
    form.set("email", "revised@example.com");
    form.set("name", "After");
    form.set("role", "accountant");

    const result = await updateUser(invited.id, form);
    expect(result.ok).toBe(true);

    const updated = await findUserByEmail("revised@example.com");
    expect(updated?.name).toBe("After");
    expect(updated?.role).toBe("accountant");
    expect(updateClerkUser).not.toHaveBeenCalled();
  });

  it("blocks changing your own role", async () => {
    const admin = await seedAdmin();

    const form = new FormData();
    form.set("name", admin.name ?? "");
    form.set("role", "user");

    const result = await updateUser(admin.id, form);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/own role/i);
  });

  it("syncs name to Clerk for signed-in users", async () => {
    await seedAdmin();
    const [active] = await db
      .insert(users)
      .values({
        clerkUserId: "user_clerk_active",
        email: "active@example.com",
        name: "Old Active",
        role: "user",
      })
      .returning();

    const form = new FormData();
    form.set("email", "changed@example.com");
    form.set("name", "New Active");
    form.set("role", "user");

    const result = await updateUser(active.id, form);
    expect(result.ok).toBe(true);
    expect(updateClerkUser).toHaveBeenCalledWith("user_clerk_active", {
      firstName: "New",
      lastName: "Active",
    });

    const [row] = await db.select().from(users).where(eq(users.id, active.id));
    expect(row?.name).toBe("New Active");
    expect(row?.email).toBe("active@example.com");
  });
});

describe("ensureLocalUser with an invited row", () => {
  it("claims the invited row on first sign-in", async () => {
    await seedAdmin();
    await db.insert(users).values({
      email: "invite@example.com",
      name: "Invited User",
      role: "accountant",
    });

    const id = await ensureLocalUser({
      userId: "user_clerk_invited",
      email: "invite@example.com",
      name: "Invited User",
    });

    const local = await findUserByEmail("invite@example.com");
    expect(local?.id).toBe(id);
    expect(local?.clerkUserId).toBe("user_clerk_invited");
    expect(local?.role).toBe("accountant");

    const rows = await db.select().from(users);
    expect(rows).toHaveLength(2);
  });

  it("keeps the invited name when Clerk has no name yet", async () => {
    await seedAdmin();
    await db.insert(users).values({
      email: "invite@example.com",
      name: "Invited User",
      role: "accountant",
    });

    await ensureLocalUser({
      userId: "user_clerk_invited",
      email: "invite@example.com",
      name: null,
    });

    const local = await findUserByEmail("invite@example.com");
    expect(local?.name).toBe("Invited User");
  });

  it("does not wipe the invited name on a later sync without a Clerk name", async () => {
    await seedAdmin();
    await db.insert(users).values({
      email: "invite@example.com",
      name: "Invited User",
      role: "accountant",
    });

    await ensureLocalUser({
      userId: "user_clerk_invited",
      email: "invite@example.com",
      name: null,
    });

    await ensureLocalUser({
      userId: "user_clerk_invited",
      email: "invite@example.com",
      name: null,
    });

    const local = await findUserByEmail("invite@example.com");
    expect(local?.name).toBe("Invited User");
  });

  it("updates the local name when Clerk provides one", async () => {
    await seedAdmin();
    await db.insert(users).values({
      email: "invite@example.com",
      name: "Invited User",
      role: "accountant",
    });

    await ensureLocalUser({
      userId: "user_clerk_invited",
      email: "invite@example.com",
      name: "Google Name",
    });

    const local = await findUserByEmail("invite@example.com");
    expect(local?.name).toBe("Google Name");
  });
});
