import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb, type TestDatabase } from "@/db/pglite";
import { setTestDb, type Database } from "@/db";
import {
  clients,
  companies,
  companyMemberships,
  expenses,
  invoices,
  reimbursements,
  users,
} from "@/db/schema";
import { deleteCompany } from "@/actions/settings";
import { deleteCompanyAsPlatform } from "@/actions/platform";
import { seedCompany } from "@/lib/test/seed-company";
import { ensureCompanyBilling } from "@/lib/billing/company-billing";
import { listUserMemberships } from "@/lib/users";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
}));

const clerkMocks = vi.hoisted(() => ({
  auth: vi.fn(async () => ({ userId: "user_clerk_admin", sessionClaims: {} })),
  currentUser: vi.fn(async () => ({
    primaryEmailAddress: { emailAddress: "admin@example.com" },
    firstName: "Admin",
    lastName: "User",
    publicMetadata: {},
  })),
  getInvitationList: vi.fn(async () => ({ data: [] as { id: string; emailAddress: string }[] })),
  revokeInvitation: vi.fn(async () => ({})),
  deleteClerkUser: vi.fn(async () => ({})),
}));

vi.mock("@clerk/nextjs/server", () => ({
  auth: clerkMocks.auth,
  currentUser: clerkMocks.currentUser,
  clerkClient: vi.fn(async () => ({
    invitations: {
      getInvitationList: clerkMocks.getInvitationList,
      revokeInvitation: clerkMocks.revokeInvitation,
    },
    users: { deleteUser: clerkMocks.deleteClerkUser },
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

  clerkMocks.auth.mockResolvedValue({
    userId: "user_clerk_admin",
    sessionClaims: {},
  });
  clerkMocks.currentUser.mockResolvedValue({
    primaryEmailAddress: { emailAddress: "admin@example.com" },
    firstName: "Admin",
    lastName: "User",
    publicMetadata: {},
  });
  clerkMocks.getInvitationList.mockResolvedValue({ data: [] });
  clerkMocks.revokeInvitation.mockResolvedValue({});
  clerkMocks.deleteClerkUser.mockReset();
  clerkMocks.deleteClerkUser.mockResolvedValue({});
  clerkMocks.getInvitationList.mockClear();
  clerkMocks.revokeInvitation.mockClear();
});

afterEach(async () => {
  delete process.env.PLATFORM_ADMIN_EMAILS;
  delete process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
  delete process.env.CLERK_SECRET_KEY;
  setTestDb(null);
  await ctx.client.close();
});

describe("deleteCompany (company admin)", () => {
  it("refuses a mismatched confirmation name", async () => {
    const company = await seedCompany(db, { name: "Acme Trading" });
    await db.insert(users).values({
      clerkUserId: "user_clerk_admin",
      email: "admin@example.com",
      name: "Admin User",
      role: "admin",
      companyId: company.id,
    });
    const [admin] = await db
      .select()
      .from(users)
      .where(eq(users.clerkUserId, "user_clerk_admin"));
    await db.insert(companyMemberships).values({
      userId: admin.id,
      companyId: company.id,
      role: "admin",
    });

    const result = await deleteCompany("Wrong Name");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.fieldErrors?.confirmationName).toMatch(/exactly/i);
    }

    const [still] = await db
      .select()
      .from(companies)
      .where(eq(companies.id, company.id));
    expect(still).toBeTruthy();
  });

  it("deletes the company, cascades data, and purges members from DB and Clerk", async () => {
    const company = await seedCompany(db, { name: "Acme Trading" });
    await ensureCompanyBilling(company.id);

    const [admin] = await db
      .insert(users)
      .values({
        clerkUserId: "user_clerk_admin",
        email: "admin@example.com",
        name: "Admin User",
        role: "admin",
        companyId: company.id,
      })
      .returning();
    await db.insert(companyMemberships).values({
      userId: admin.id,
      companyId: company.id,
      role: "admin",
    });

    const [invitee] = await db
      .insert(users)
      .values({
        email: "pending@example.com",
        name: "Pending",
        role: "user",
        companyId: company.id,
        clerkUserId: null,
      })
      .returning();
    await db.insert(companyMemberships).values({
      userId: invitee.id,
      companyId: company.id,
      role: "user",
    });

    const [client] = await db
      .insert(clients)
      .values({ companyId: company.id, name: "Client One" })
      .returning();
    await db.insert(invoices).values({
      companyId: company.id,
      number: "INV-1",
      clientId: client.id,
      status: "draft",
    });
    await db.insert(expenses).values({
      companyId: company.id,
      description: "Taxi",
      amountPence: 1200,
      createdByUserId: admin.id,
    });
    await db.insert(reimbursements).values({
      companyId: company.id,
      payeeUserId: admin.id,
      status: "pending",
      totalPence: 1200,
    });

    const result = await deleteCompany("Acme Trading");
    expect(result.ok).toBe(true);

    const remainingCompanies = await db
      .select()
      .from(companies)
      .where(eq(companies.id, company.id));
    expect(remainingCompanies).toHaveLength(0);

    const remainingClients = await db.select().from(clients);
    expect(remainingClients).toHaveLength(0);

    const remainingInvoices = await db.select().from(invoices);
    expect(remainingInvoices).toHaveLength(0);

    const remainingReimbursements = await db.select().from(reimbursements);
    expect(remainingReimbursements).toHaveLength(0);

    const adminAfter = await db
      .select()
      .from(users)
      .where(eq(users.id, admin.id));
    expect(adminAfter).toHaveLength(0);

    const invitees = await db
      .select()
      .from(users)
      .where(eq(users.email, "pending@example.com"));
    expect(invitees).toHaveLength(0);

    expect(clerkMocks.deleteClerkUser).toHaveBeenCalledWith("user_clerk_admin");
    expect(clerkMocks.getInvitationList).toHaveBeenCalled();
  });

  it("keeps multi-company members and their Clerk accounts", async () => {
    const companyA = await seedCompany(db, { name: "Acme Trading" });
    const companyB = await seedCompany(db, { name: "Other Co" });

    const [admin] = await db
      .insert(users)
      .values({
        clerkUserId: "user_clerk_admin",
        email: "admin@example.com",
        name: "Admin User",
        role: "admin",
        companyId: companyA.id,
      })
      .returning();
    await db.insert(companyMemberships).values([
      { userId: admin.id, companyId: companyA.id, role: "admin" },
      { userId: admin.id, companyId: companyB.id, role: "accountant" },
    ]);

    const [member] = await db
      .insert(users)
      .values({
        clerkUserId: "user_clerk_multi",
        email: "multi@example.com",
        name: "Multi",
        role: "accountant",
        companyId: companyA.id,
      })
      .returning();
    await db.insert(companyMemberships).values([
      { userId: member.id, companyId: companyA.id, role: "accountant" },
      { userId: member.id, companyId: companyB.id, role: "accountant" },
    ]);

    const result = await deleteCompany("Acme Trading");
    expect(result.ok).toBe(true);

    // Admin only belonged to A as last? Admin has B too — keep both users.
    expect(clerkMocks.deleteClerkUser).not.toHaveBeenCalled();

    const [adminAfter] = await db
      .select()
      .from(users)
      .where(eq(users.id, admin.id));
    expect(adminAfter).toBeTruthy();
    expect(adminAfter.companyId).toBe(companyB.id);
    expect(await listUserMemberships(admin.id)).toHaveLength(1);

    const [memberAfter] = await db
      .select()
      .from(users)
      .where(eq(users.id, member.id));
    expect(memberAfter).toBeTruthy();
    expect(await listUserMemberships(member.id)).toHaveLength(1);
  });

  it("refuses non-admin roles", async () => {
    const company = await seedCompany(db, { name: "Acme Trading" });
    await db.insert(users).values({
      clerkUserId: "user_clerk_admin",
      email: "admin@example.com",
      name: "User",
      role: "user",
      companyId: company.id,
    });
    const [member] = await db
      .select()
      .from(users)
      .where(eq(users.clerkUserId, "user_clerk_admin"));
    await db.insert(companyMemberships).values({
      userId: member.id,
      companyId: company.id,
      role: "user",
    });

    const result = await deleteCompany("Acme Trading");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/permission/i);
  });
});

describe("deleteCompanyAsPlatform", () => {
  it("lets platform admins delete any company", async () => {
    await db.insert(users).values({
      clerkUserId: "user_clerk_ops",
      email: "ops@example.com",
      name: "Ops Admin",
      role: "platform_admin",
      companyId: null,
    });

    clerkMocks.auth.mockResolvedValue({
      userId: "user_clerk_ops",
      sessionClaims: {},
    });
    clerkMocks.currentUser.mockResolvedValue({
      primaryEmailAddress: { emailAddress: "ops@example.com" },
      firstName: "Ops",
      lastName: "Admin",
      publicMetadata: {},
    });

    const company = await seedCompany(db, { name: "Target Co" });
    const [tenantAdmin] = await db
      .insert(users)
      .values({
        clerkUserId: "user_clerk_tenant",
        email: "tenant@example.com",
        name: "Tenant Admin",
        role: "admin",
        companyId: company.id,
      })
      .returning();
    await db.insert(companyMemberships).values({
      userId: tenantAdmin.id,
      companyId: company.id,
      role: "admin",
    });

    const result = await deleteCompanyAsPlatform(company.id, "Target Co");
    expect(result.ok).toBe(true);

    const remaining = await db
      .select()
      .from(companies)
      .where(eq(companies.id, company.id));
    expect(remaining).toHaveLength(0);

    const tenantAfter = await db
      .select()
      .from(users)
      .where(eq(users.id, tenantAdmin.id));
    expect(tenantAfter).toHaveLength(0);
    expect(clerkMocks.deleteClerkUser).toHaveBeenCalledWith("user_clerk_tenant");
  });
});
