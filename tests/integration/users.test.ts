import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb, type TestDatabase } from "@/db/pglite";
import { setTestDb, type Database } from "@/db";
import { companyMemberships, expenses, reimbursementItems, reimbursements, users } from "@/db/schema";
import {
  inviteUser,
  deleteUser,
  revokeUserInvite,
  updateUser,
  switchCompany,
} from "@/actions/users";
import {
  countAdminUsers,
  ensureLocalUser,
  findUserByEmail,
  getMembership,
  listUserMemberships,
  listUsers,
  upsertMembership,
} from "@/lib/users";
import { listFounders } from "@/lib/expenses/queries";
import { seedCompany } from "@/lib/test/seed-company";
import type { Role } from "@/lib/roles";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
}));

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

vi.mock("@clerk/backend", () => ({
  createClerkClient: vi.fn(() => ({
    invitations: { createInvitation, getInvitationList, revokeInvitation },
    users: { updateUser: updateClerkUser, deleteUser: deleteClerkUser },
  })),
}));

let ctx: Awaited<ReturnType<typeof createTestDb>>;
let db: TestDatabase;
let companyId: string;

async function insertMember(values: {
  companyId: string;
  email: string;
  name?: string;
  role: Role;
  clerkUserId?: string | null;
}) {
  const [row] = await db
    .insert(users)
    .values({
      companyId: values.companyId,
      email: values.email,
      name: values.name ?? null,
      role: values.role,
      clerkUserId: values.clerkUserId ?? null,
    })
    .returning();
  await db.insert(companyMemberships).values({
    userId: row.id,
    companyId: values.companyId,
    role: values.role,
  });
  return row;
}

async function seedAdmin() {
  return insertMember({
    companyId,
    clerkUserId: "user_clerk_admin",
    email: "admin@example.com",
    name: "Admin User",
    role: "admin",
  });
}

beforeEach(async () => {
  ctx = await createTestDb();
  db = ctx.db;
  setTestDb(db as unknown as Database);
  const company = await seedCompany(db);
  companyId = company.id;
  process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY = "pk_test_mock";
  process.env.CLERK_SECRET_KEY = "sk_test_mock";
  createInvitation.mockReset();
  updateClerkUser.mockReset();
  deleteClerkUser.mockReset();
  getInvitationList.mockReset();
  revokeInvitation.mockReset();
  getInvitationList.mockResolvedValue({ data: [] });
  createInvitation.mockResolvedValue({});
  updateClerkUser.mockResolvedValue({});
  deleteClerkUser.mockResolvedValue({});
  revokeInvitation.mockResolvedValue({});
});

afterEach(async () => {
  delete process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
  delete process.env.CLERK_SECRET_KEY;
  setTestDb(null);
  await ctx.client.close();
});

describe("inviteUser", () => {
  it("rejects inviting a PLATFORM_ADMIN_EMAILS address", async () => {
    await seedAdmin();
    const prev = process.env.PLATFORM_ADMIN_EMAILS;
    process.env.PLATFORM_ADMIN_EMAILS = "ops@example.com";

    const form = new FormData();
    form.set("email", "ops@example.com");
    form.set("role", "user");

    try {
      const result = await inviteUser(form);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toMatch(/platform operators/i);
      expect(createInvitation).not.toHaveBeenCalled();
    } finally {
      if (prev === undefined) delete process.env.PLATFORM_ADMIN_EMAILS;
      else process.env.PLATFORM_ADMIN_EMAILS = prev;
    }
  });

  it("rejects inviting an existing platform_admin user", async () => {
    await seedAdmin();
    await db.insert(users).values({
      email: "portal@example.com",
      role: "platform_admin",
      companyId: null,
    });

    const form = new FormData();
    form.set("email", "portal@example.com");
    form.set("role", "user");

    const result = await inviteUser(form);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/platform operators/i);
    expect(createInvitation).not.toHaveBeenCalled();
  });

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
    expect(invited?.companyId).toBe(companyId);
    expect(await getMembership(invited!.id, companyId)).toEqual({
      role: "accountant",
    });

    const listed = await listUsers(companyId);
    expect(listed.map((u) => u.email)).toContain("accountant@example.com");
    expect(await countAdminUsers(companyId)).toBe(1);
  });

  it("rejects when the email is already a member of this company", async () => {
    await seedAdmin();
    await insertMember({
      companyId,
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
    if (!result.ok) expect(result.error).toMatch(/already a member/i);
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
        companyId: null,
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
    expect(rows[0]?.companyId).toBe(companyId);
    expect(await getMembership(invited.id, companyId)).toEqual({ role: "user" });
  });

  it("invites the same accountant to a second company without Clerk invite when signed in", async () => {
    await seedAdmin();
    const companyAId = companyId;
    const companyB = await seedCompany(db, { name: "Company B" });
    const accountant = await insertMember({
      companyId: companyAId,
      clerkUserId: "user_clerk_accountant",
      email: "accountant@example.com",
      name: "Alex Accountant",
      role: "accountant",
    });

    // Move admin session to company B
    const admin = await findUserByEmail("admin@example.com");
    await db
      .delete(companyMemberships)
      .where(eq(companyMemberships.userId, admin!.id));
    await db.delete(users).where(eq(users.id, admin!.id));
    await insertMember({
      companyId: companyB.id,
      clerkUserId: "user_clerk_admin",
      email: "admin@example.com",
      name: "Admin User",
      role: "admin",
    });

    const form = new FormData();
    form.set("email", "accountant@example.com");
    form.set("role", "accountant");

    const result = await inviteUser(form);
    expect(result.ok).toBe(true);
    expect(createInvitation).not.toHaveBeenCalled();

    const memberships = await listUserMemberships(accountant.id);
    expect(memberships.map((m) => m.companyId).sort()).toEqual(
      [companyAId, companyB.id].sort(),
    );
    const local = await findUserByEmail("accountant@example.com");
    expect(local?.companyId).toBe(companyAId);

    // Company A still lists the accountant while they remain selected on A
    expect((await listUsers(companyAId)).map((u) => u.email)).toContain(
      "accountant@example.com",
    );
    expect((await listUsers(companyB.id)).map((u) => u.email)).toContain(
      "accountant@example.com",
    );
  });

  it("rejects inviting an existing admin as accountant of another company", async () => {
    await seedAdmin();
    const companyAId = companyId;
    const companyB = await seedCompany(db, { name: "Company B" });
    await insertMember({
      companyId: companyAId,
      clerkUserId: "user_clerk_founder",
      email: "founder@example.com",
      name: "Founder",
      role: "admin",
    });

    const admin = await findUserByEmail("admin@example.com");
    await db
      .delete(companyMemberships)
      .where(eq(companyMemberships.userId, admin!.id));
    await db.delete(users).where(eq(users.id, admin!.id));
    await insertMember({
      companyId: companyB.id,
      clerkUserId: "user_clerk_admin",
      email: "admin@example.com",
      name: "Admin User",
      role: "admin",
    });

    const form = new FormData();
    form.set("email", "founder@example.com");
    form.set("role", "accountant");

    const result = await inviteUser(form);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/only accountants/i);
  });
});

describe("revokeUserInvite", () => {
  it("revokes the Clerk invitation and deletes the invited row", async () => {
    await seedAdmin();
    const invited = await insertMember({
      companyId,
      email: "pending@example.com",
      name: "Pending User",
      role: "accountant",
    });

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
    const active = await insertMember({
      companyId,
      clerkUserId: "user_clerk_active",
      email: "active@example.com",
      name: "Active",
      role: "user",
    });

    const result = await revokeUserInvite(active.id);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/already signed in/i);
    expect(getInvitationList).not.toHaveBeenCalled();
    expect(revokeInvitation).not.toHaveBeenCalled();
  });

  it("deletes the invited row when Clerk has no pending invitation", async () => {
    await seedAdmin();
    const invited = await insertMember({
      companyId,
      email: "orphan@example.com",
      name: "Orphan",
      role: "pending",
    });

    getInvitationList.mockResolvedValueOnce({ data: [] });

    const result = await revokeUserInvite(invited.id);
    expect(result.ok).toBe(true);
    expect(revokeInvitation).not.toHaveBeenCalled();

    const rows = await db.select().from(users).where(eq(users.id, invited.id));
    expect(rows).toHaveLength(0);
  });

  it("removes only one membership when the accountant belongs to two companies", async () => {
    await seedAdmin();
    const companyB = await seedCompany(db, { name: "Company B" });
    const invited = await insertMember({
      companyId,
      email: "pending@example.com",
      name: "Pending",
      role: "accountant",
    });
    await upsertMembership(invited.id, companyB.id, "accountant");

    getInvitationList.mockResolvedValueOnce({ data: [] });

    const result = await revokeUserInvite(invited.id);
    expect(result.ok).toBe(true);

    const rows = await db.select().from(users).where(eq(users.id, invited.id));
    expect(rows).toHaveLength(1);
    expect(await getMembership(invited.id, companyId)).toBeNull();
    expect(await getMembership(invited.id, companyB.id)).toEqual({
      role: "accountant",
    });
  });
});

describe("deleteUser", () => {
  it("deletes a signed-in user from Clerk and the database", async () => {
    await seedAdmin();
    const active = await insertMember({
      companyId,
      clerkUserId: "user_clerk_active",
      email: "active@example.com",
      name: "Active User",
      role: "user",
    });

    const result = await deleteUser(active.id);
    expect(result.ok).toBe(true);
    expect(deleteClerkUser).toHaveBeenCalledWith("user_clerk_active");

    const rows = await db.select().from(users).where(eq(users.id, active.id));
    expect(rows).toHaveLength(0);
  });

  it("deletes an invited user and revokes pending Clerk invitations", async () => {
    await seedAdmin();
    const invited = await insertMember({
      companyId,
      email: "pending@example.com",
      name: "Pending",
      role: "pending",
    });

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
    const otherAdmin = await insertMember({
      companyId,
      clerkUserId: "user_clerk_other_admin",
      email: "other-admin@example.com",
      name: "Other Admin",
      role: "admin",
    });

    expect(await countAdminUsers(companyId)).toBe(2);

    const result = await deleteUser(otherAdmin.id);
    expect(result.ok).toBe(true);
    expect(deleteClerkUser).toHaveBeenCalledWith("user_clerk_other_admin");
    expect(await countAdminUsers(companyId)).toBe(1);
  });

  it("removes one membership and keeps the user on the other company", async () => {
    await seedAdmin();
    const companyB = await seedCompany(db, { name: "Company B" });
    const accountant = await insertMember({
      companyId,
      clerkUserId: "user_clerk_accountant",
      email: "accountant@example.com",
      name: "Alex",
      role: "accountant",
    });
    await upsertMembership(accountant.id, companyB.id, "accountant");

    // listUsers on A includes them while selected company is A
    expect((await listUsers(companyId)).map((u) => u.email)).toContain(
      "accountant@example.com",
    );

    // Switch selected company to B, then delete from A (admin still on A)
    await db
      .update(users)
      .set({ companyId: companyB.id })
      .where(eq(users.id, accountant.id));

    expect((await listUsers(companyId)).map((u) => u.email)).toContain(
      "accountant@example.com",
    );

    const result = await deleteUser(accountant.id);
    expect(result.ok).toBe(true);
    expect(deleteClerkUser).not.toHaveBeenCalled();

    const local = await findUserByEmail("accountant@example.com");
    expect(local).not.toBeNull();
    expect(local?.companyId).toBe(companyB.id);
    expect(await getMembership(accountant.id, companyId)).toBeNull();
    expect(await getMembership(accountant.id, companyB.id)).toEqual({
      role: "accountant",
    });
  });

  it("keeps the user row when a paid reimbursement remains", async () => {
    await seedAdmin();
    const founder = await insertMember({
      companyId,
      clerkUserId: "user_clerk_founder",
      email: "founder@example.com",
      name: "Founder",
      role: "user",
    });

    await db.insert(reimbursements).values({
      companyId,
      payeeUserId: founder.id,
      status: "paid",
      totalPence: 5000,
      paidAt: new Date(),
      reference: "REIMB-PAID",
    });

    const result = await deleteUser(founder.id);
    expect(result.ok).toBe(true);
    expect(deleteClerkUser).toHaveBeenCalledWith("user_clerk_founder");

    const local = await findUserByEmail("founder@example.com");
    expect(local).not.toBeNull();
    expect(local?.clerkUserId).toBeNull();
    expect(local?.companyId).toBeNull();
    expect(await getMembership(founder.id, companyId)).toBeNull();
    expect((await listUsers(companyId)).map((u) => u.id)).not.toContain(founder.id);
    expect((await listFounders(companyId)).map((u) => u.id)).not.toContain(founder.id);

    const runs = await db
      .select()
      .from(reimbursements)
      .where(eq(reimbursements.payeeUserId, founder.id));
    expect(runs).toHaveLength(1);
    expect(runs[0].status).toBe("paid");
  });

  it("cancels pending reimbursements and hard-deletes when none remain", async () => {
    await seedAdmin();
    const founder = await insertMember({
      companyId,
      clerkUserId: "user_clerk_pending_payee",
      email: "pending-payee@example.com",
      name: "Pending Payee",
      role: "user",
    });

    const [exp] = await db
      .insert(expenses)
      .values({
        companyId,
        description: "Train",
        amountPence: 2500,
        status: "reimbursable",
        paidByUserId: founder.id,
      })
      .returning();

    const [run] = await db
      .insert(reimbursements)
      .values({
        companyId,
        payeeUserId: founder.id,
        status: "pending",
        totalPence: 2500,
        reference: "REIMB-PENDING",
      })
      .returning();

    await db.insert(reimbursementItems).values({
      reimbursementId: run.id,
      expenseId: exp.id,
    });

    const result = await deleteUser(founder.id);
    expect(result.ok).toBe(true);
    expect(deleteClerkUser).toHaveBeenCalledWith("user_clerk_pending_payee");

    const runs = await db.select().from(reimbursements);
    expect(runs).toHaveLength(0);

    const [expense] = await db.select().from(expenses).where(eq(expenses.id, exp.id));
    expect(expense.status).toBe("reimbursable");

    const rows = await db.select().from(users).where(eq(users.id, founder.id));
    expect(rows).toHaveLength(0);
  });

  it("cancels pending runs but keeps the user when a paid run remains", async () => {
    await seedAdmin();
    const founder = await insertMember({
      companyId,
      clerkUserId: "user_clerk_mixed_payee",
      email: "mixed@example.com",
      name: "Mixed",
      role: "user",
    });

    const [exp] = await db
      .insert(expenses)
      .values({
        companyId,
        description: "Taxi",
        amountPence: 1200,
        status: "reimbursable",
        paidByUserId: founder.id,
      })
      .returning();

    const [pendingRun] = await db
      .insert(reimbursements)
      .values({
        companyId,
        payeeUserId: founder.id,
        status: "pending",
        totalPence: 1200,
        reference: "REIMB-PEND",
      })
      .returning();

    await db.insert(reimbursementItems).values({
      reimbursementId: pendingRun.id,
      expenseId: exp.id,
    });

    await db.insert(reimbursements).values({
      companyId,
      payeeUserId: founder.id,
      status: "paid",
      totalPence: 9000,
      paidAt: new Date(),
      reference: "REIMB-DONE",
    });

    const result = await deleteUser(founder.id);
    expect(result.ok).toBe(true);

    const runs = await db
      .select()
      .from(reimbursements)
      .where(eq(reimbursements.payeeUserId, founder.id));
    expect(runs).toHaveLength(1);
    expect(runs[0].status).toBe("paid");

    const [expense] = await db.select().from(expenses).where(eq(expenses.id, exp.id));
    expect(expense.status).toBe("reimbursable");

    const local = await findUserByEmail("mixed@example.com");
    expect(local).not.toBeNull();
    expect(local?.clerkUserId).toBeNull();
    expect(local?.companyId).toBeNull();
  });

  it("reuses a retained user row when re-inviting the same email", async () => {
    await seedAdmin();
    const founder = await insertMember({
      companyId,
      clerkUserId: "user_clerk_rehire",
      email: "rehire@example.com",
      name: "Rehire",
      role: "user",
    });

    await db.insert(reimbursements).values({
      companyId,
      payeeUserId: founder.id,
      status: "paid",
      totalPence: 3000,
      paidAt: new Date(),
    });

    const deleted = await deleteUser(founder.id);
    expect(deleted.ok).toBe(true);

    const form = new FormData();
    form.set("email", "rehire@example.com");
    form.set("name", "Rehire Again");
    form.set("role", "user");

    const invited = await inviteUser(form);
    expect(invited.ok).toBe(true);
    if (invited.ok) expect(invited.id).toBe(founder.id);

    const local = await findUserByEmail("rehire@example.com");
    expect(local?.id).toBe(founder.id);
    expect(local?.companyId).toBe(companyId);
    expect(local?.name).toBe("Rehire Again");
    expect(await getMembership(founder.id, companyId)).toEqual({ role: "user" });

    const runs = await db
      .select()
      .from(reimbursements)
      .where(eq(reimbursements.payeeUserId, founder.id));
    expect(runs).toHaveLength(1);
  });
});

describe("updateUser", () => {
  it("updates name and role on an invited user, including email", async () => {
    await seedAdmin();
    const invited = await insertMember({
      companyId,
      email: "invite@example.com",
      name: "Before",
      role: "pending",
    });

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
    const active = await insertMember({
      companyId,
      clerkUserId: "user_clerk_active",
      email: "active@example.com",
      name: "Old Active",
      role: "user",
    });

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

  it("blocks demoting a multi-company accountant", async () => {
    await seedAdmin();
    const companyB = await seedCompany(db, { name: "Company B" });
    const accountant = await insertMember({
      companyId,
      clerkUserId: "user_clerk_accountant",
      email: "accountant@example.com",
      name: "Alex",
      role: "accountant",
    });
    await upsertMembership(accountant.id, companyB.id, "accountant");

    const form = new FormData();
    form.set("name", "Alex");
    form.set("role", "user");

    const result = await updateUser(accountant.id, form);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/remain accountants/i);
  });
});

describe("switchCompany", () => {
  it("switches the active company for a multi-company accountant", async () => {
    const { auth, currentUser } = await import("@clerk/nextjs/server");
    await seedAdmin();
    const companyB = await seedCompany(db, { name: "Company B" });
    const accountant = await insertMember({
      companyId,
      clerkUserId: "user_clerk_accountant",
      email: "accountant@example.com",
      name: "Alex",
      role: "accountant",
    });
    await upsertMembership(accountant.id, companyB.id, "accountant");

    vi.mocked(auth).mockResolvedValueOnce({
      userId: "user_clerk_accountant",
      sessionClaims: {},
    } as never);
    vi.mocked(currentUser).mockResolvedValueOnce({
      primaryEmailAddress: { emailAddress: "accountant@example.com" },
      firstName: "Alex",
      lastName: null,
      publicMetadata: {},
    } as never);

    await expect(switchCompany(companyB.id)).rejects.toThrow("REDIRECT:/dashboard");

    const local = await findUserByEmail("accountant@example.com");
    expect(local?.companyId).toBe(companyB.id);
    expect(local?.role).toBe("accountant");
  });

  it("rejects switching to a company the user is not a member of", async () => {
    const { auth, currentUser } = await import("@clerk/nextjs/server");
    await seedAdmin();
    const companyB = await seedCompany(db, { name: "Company B" });
    await insertMember({
      companyId,
      clerkUserId: "user_clerk_accountant",
      email: "accountant@example.com",
      name: "Alex",
      role: "accountant",
    });

    vi.mocked(auth).mockResolvedValueOnce({
      userId: "user_clerk_accountant",
      sessionClaims: {},
    } as never);
    vi.mocked(currentUser).mockResolvedValueOnce({
      primaryEmailAddress: { emailAddress: "accountant@example.com" },
      firstName: "Alex",
      lastName: null,
      publicMetadata: {},
    } as never);

    const result = await switchCompany(companyB.id);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/do not have access/i);
  });
});

describe("ensureLocalUser with an invited row", () => {
  it("claims the invited row on first sign-in", async () => {
    await seedAdmin();
    await insertMember({
      companyId,
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
    await insertMember({
      companyId,
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
    await insertMember({
      companyId,
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
    await insertMember({
      companyId,
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
