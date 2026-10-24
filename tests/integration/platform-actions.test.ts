import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";
import { createTestDb, type TestDatabase } from "@/db/pglite";
import { setTestDb, type Database } from "@/db";
import {
  auditLog,
  clients,
  companies,
  companyBilling,
  companyMemberships,
  companySupportNotes,
  inboundEmailJobs,
  invoices,
  sendJobs,
  users,
} from "@/db/schema";
import { seedCompany } from "@/lib/test/seed-company";
import {
  addCompanySupportNote,
  extendCompanyTrial,
  grantComplimentaryAccess,
  invitePlatformAdmin,
  platformBulkInboundJobs,
  platformBulkRetrySendJobs,
  platformChangeMemberRole,
  platformDismissInboundJob,
  platformInviteCompanyAdmin,
  platformRemoveCompanyMember,
  platformResendCompanyInvite,
  platformRetrySendJob,
  platformRevokeCompanyInvite,
  removePlatformAdmin,
  resendPlatformAdminInvite,
  revokeComplimentaryAccess,
  suspendCompany,
  unsuspendCompany,
} from "@/actions/platform";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
}));

const mocks = vi.hoisted(() => ({
  auth: vi.fn(async () => ({ userId: "user_clerk_ops" as string | null, sessionClaims: {} })),
  currentUser: vi.fn(async () => ({
    primaryEmailAddress: { emailAddress: "ops@example.com" },
    firstName: "Ops",
    lastName: "Admin",
    publicMetadata: {},
  })),
  sendClerkInvitation: vi.fn(
    async (): Promise<{ ok: true } | { ok: false; error: string }> => ({ ok: true }),
  ),
  getInvitationList: vi.fn(async () => ({ data: [] as { id: string; emailAddress: string }[] })),
  revokeInvitation: vi.fn(async () => ({})),
  deleteClerkUser: vi.fn(async () => ({})),
}));

vi.mock("@/lib/clerk-invite", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/clerk-invite")>()),
  sendClerkInvitation: mocks.sendClerkInvitation,
}));

vi.mock("@clerk/nextjs/server", () => ({
  auth: mocks.auth,
  currentUser: mocks.currentUser,
  clerkClient: vi.fn(async () => ({
    invitations: {
      getInvitationList: mocks.getInvitationList,
      revokeInvitation: mocks.revokeInvitation,
    },
    users: { deleteUser: mocks.deleteClerkUser, updateUser: vi.fn() },
  })),
}));

let ctx: Awaited<ReturnType<typeof createTestDb>>;
let db: TestDatabase;
let opsId: string;

beforeEach(async () => {
  ctx = await createTestDb();
  db = ctx.db;
  setTestDb(db as unknown as Database);
  process.env.PLATFORM_ADMIN_EMAILS = "ops@example.com";
  process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY = "pk_test_mock";
  process.env.CLERK_SECRET_KEY = "sk_test_mock";
  vi.clearAllMocks();

  const [ops] = await db
    .insert(users)
    .values({
      clerkUserId: "user_clerk_ops",
      email: "ops@example.com",
      name: "Ops Admin",
      role: "platform_admin",
      companyId: null,
    })
    .returning();
  opsId = ops.id;
});

afterEach(async () => {
  delete process.env.PLATFORM_ADMIN_EMAILS;
  delete process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
  delete process.env.CLERK_SECRET_KEY;
  setTestDb(null);
  await ctx.client.close();
});

async function addMember(
  companyId: string,
  email: string,
  role: "admin" | "user" | "accountant" = "admin",
  clerkUserId: string | null = `clerk_${email}`,
) {
  const [user] = await db
    .insert(users)
    .values({ clerkUserId, email, companyId, role })
    .returning();
  await db.insert(companyMemberships).values({ userId: user.id, companyId, role });
  return user;
}

async function auditFor(action: string) {
  return db.select().from(auditLog).where(eq(auditLog.action, action));
}

function inviteForm(companyId: string, email: string) {
  const form = new FormData();
  form.set("companyId", companyId);
  form.set("email", email);
  form.set("name", "Invitee");
  return form;
}

describe("platform authorisation", () => {
  it("rejects callers who are not platform admins", async () => {
    mocks.auth.mockResolvedValueOnce({ userId: "user_clerk_tenant", sessionClaims: {} });
    mocks.currentUser.mockResolvedValueOnce({
      primaryEmailAddress: { emailAddress: "tenant@example.com" },
      firstName: "Tenant",
      lastName: "User",
      publicMetadata: {},
    });
    const company = await seedCompany(db, { slug: "acme" });

    const result = await suspendCompany(company.id, "nope");

    expect(result).toEqual({ ok: false, error: "You do not have platform admin access." });
    const [row] = await db.select().from(companies).where(eq(companies.id, company.id));
    expect(row.suspendedAt).toBeNull();
  });
});

describe("suspend / unsuspend / notes", () => {
  it("suspends and unsuspends with an audit trail on the company", async () => {
    const company = await seedCompany(db, { slug: "acme" });

    expect((await suspendCompany(company.id, "Non-payment")).ok).toBe(true);
    let [row] = await db.select().from(companies).where(eq(companies.id, company.id));
    expect(row.suspendedAt).not.toBeNull();
    expect(row.suspendedReason).toBe("Non-payment");

    expect((await unsuspendCompany(company.id)).ok).toBe(true);
    [row] = await db.select().from(companies).where(eq(companies.id, company.id));
    expect(row.suspendedAt).toBeNull();
    expect(row.suspendedReason).toBeNull();

    const audits = await db.select().from(auditLog).where(eq(auditLog.companyId, company.id));
    expect(audits.map((a) => a.action).sort()).toEqual([
      "platform.company.suspend",
      "platform.company.unsuspend",
    ]);
  });

  it("reports a missing company", async () => {
    const result = await suspendCompany("00000000-0000-0000-0000-000000000000");
    expect(result).toEqual({ ok: false, error: "Company not found" });
  });

  it("adds a support note authored by the operator", async () => {
    const company = await seedCompany(db, { slug: "acme" });
    expect((await addCompanySupportNote(company.id, "Called about VAT")).ok).toBe(true);
    const [note] = await db.select().from(companySupportNotes);
    expect(note).toMatchObject({ companyId: company.id, authorUserId: opsId, body: "Called about VAT" });
  });
});

describe("platformInviteCompanyAdmin", () => {
  it("creates a pending admin and sends an invite", async () => {
    const company = await seedCompany(db, { slug: "acme" });

    const result = await platformInviteCompanyAdmin(inviteForm(company.id, "new@example.com"));

    expect(result.ok).toBe(true);
    expect(mocks.sendClerkInvitation).toHaveBeenCalledWith("new@example.com", {
      companyId: expect.any(String),
      invitedByUserId: opsId,
    });
    const [membership] = await db.select().from(companyMemberships);
    expect(membership).toMatchObject({ companyId: company.id, role: "admin" });
  });

  it("refuses platform operator emails", async () => {
    const company = await seedCompany(db, { slug: "acme" });
    const result = await platformInviteCompanyAdmin(inviteForm(company.id, "ops@example.com"));
    expect(result).toMatchObject({ ok: false, error: expect.stringMatching(/Platform operators/) });
  });

  it("refuses existing members and people in another company", async () => {
    const acme = await seedCompany(db, { slug: "acme" });
    const other = await seedCompany(db, { name: "Other", slug: "other" });
    await addMember(acme.id, "member@example.com");
    await addMember(other.id, "elsewhere@example.com");

    expect(
      await platformInviteCompanyAdmin(inviteForm(acme.id, "member@example.com")),
    ).toMatchObject({ ok: false, error: expect.stringMatching(/already a member/) });
    expect(
      await platformInviteCompanyAdmin(inviteForm(acme.id, "elsewhere@example.com")),
    ).toMatchObject({ ok: false, error: expect.stringMatching(/another company/) });
  });

  it("heals a legacy user who has companyId but no membership", async () => {
    const company = await seedCompany(db, { slug: "acme" });
    const [legacy] = await db
      .insert(users)
      .values({ email: "legacy@example.com", companyId: company.id, role: "user" })
      .returning();

    const result = await platformInviteCompanyAdmin(inviteForm(company.id, "legacy@example.com"));

    expect(result.ok).toBe(false);
    const memberships = await db
      .select()
      .from(companyMemberships)
      .where(eq(companyMemberships.userId, legacy.id));
    expect(memberships).toMatchObject([{ companyId: company.id, role: "user" }]);
  });

  it("rolls back a new user when the Clerk invite fails, so a retry works", async () => {
    const company = await seedCompany(db, { slug: "acme" });
    mocks.sendClerkInvitation.mockResolvedValueOnce({ ok: false, error: "Clerk is down" });

    const failed = await platformInviteCompanyAdmin(inviteForm(company.id, "new@example.com"));

    expect(failed).toEqual({ ok: false, error: "Clerk is down" });
    expect(await db.select().from(users).where(eq(users.email, "new@example.com"))).toHaveLength(0);
    expect(await db.select().from(companyMemberships)).toHaveLength(0);
    expect(await auditFor("platform.company.invite_admin")).toHaveLength(0);

    expect((await platformInviteCompanyAdmin(inviteForm(company.id, "new@example.com"))).ok).toBe(
      true,
    );
  });

  it("restores an existing unattached user when the Clerk invite fails", async () => {
    const company = await seedCompany(db, { slug: "acme" });
    const [orphan] = await db
      .insert(users)
      .values({ email: "orphan@example.com", name: "Orphan", role: "pending", companyId: null })
      .returning();
    mocks.sendClerkInvitation.mockResolvedValueOnce({ ok: false, error: "Clerk is down" });

    expect((await platformInviteCompanyAdmin(inviteForm(company.id, "orphan@example.com"))).ok).toBe(
      false,
    );

    const [after] = await db.select().from(users).where(eq(users.id, orphan.id));
    expect(after).toMatchObject({ name: "Orphan", role: "pending", companyId: null });
    expect(await db.select().from(companyMemberships)).toHaveLength(0);
  });
});

describe("invitePlatformAdmin", () => {
  it("removes the new row when the Clerk invite fails", async () => {
    mocks.sendClerkInvitation.mockResolvedValueOnce({ ok: false, error: "Clerk is down" });
    const form = new FormData();
    form.set("email", "new-ops@example.com");
    form.set("name", "New Ops");

    expect(await invitePlatformAdmin(form)).toEqual({ ok: false, error: "Clerk is down" });
    expect(await db.select().from(users).where(eq(users.email, "new-ops@example.com"))).toHaveLength(
      0,
    );
  });
});

describe("company member management", () => {
  it("changes a member's role", async () => {
    const company = await seedCompany(db, { slug: "acme" });
    await addMember(company.id, "admin@example.com");
    const member = await addMember(company.id, "user@example.com", "user");

    expect((await platformChangeMemberRole(company.id, member.id, "accountant")).ok).toBe(true);
    const [membership] = await db
      .select()
      .from(companyMemberships)
      .where(eq(companyMemberships.userId, member.id));
    expect(membership.role).toBe("accountant");
  });

  it("will not demote the last admin", async () => {
    const company = await seedCompany(db, { slug: "acme" });
    const admin = await addMember(company.id, "admin@example.com");

    expect(await platformChangeMemberRole(company.id, admin.id, "user")).toMatchObject({
      ok: false,
      error: expect.stringMatching(/at least one administrator/),
    });
  });

  it("rejects roles outside the tenant set", async () => {
    const company = await seedCompany(db, { slug: "acme" });
    const admin = await addMember(company.id, "admin@example.com");
    expect((await platformChangeMemberRole(company.id, admin.id, "platform_admin")).ok).toBe(false);
  });

  it("removes a member and deletes their Clerk account", async () => {
    const company = await seedCompany(db, { slug: "acme" });
    await addMember(company.id, "admin@example.com");
    const member = await addMember(company.id, "user@example.com", "user");

    expect((await platformRemoveCompanyMember(company.id, member.id)).ok).toBe(true);
    expect(mocks.deleteClerkUser).toHaveBeenCalledWith("clerk_user@example.com");
    expect(await db.select().from(users).where(eq(users.id, member.id))).toHaveLength(0);
    const [audit] = await auditFor("platform.company.member_remove");
    expect(audit.companyId).toBe(company.id);
  });

  it("will not remove the last admin", async () => {
    const company = await seedCompany(db, { slug: "acme" });
    const admin = await addMember(company.id, "admin@example.com");
    expect(await platformRemoveCompanyMember(company.id, admin.id)).toMatchObject({
      ok: false,
      error: expect.stringMatching(/last administrator/),
    });
  });

  it("resends and revokes a pending invite", async () => {
    const company = await seedCompany(db, { slug: "acme" });
    await addMember(company.id, "admin@example.com");
    const invitee = await addMember(company.id, "invitee@example.com", "user", null);
    mocks.getInvitationList.mockResolvedValue({
      data: [{ id: "inv_1", emailAddress: "invitee@example.com" }],
    });

    expect((await platformResendCompanyInvite(company.id, invitee.id)).ok).toBe(true);
    expect(mocks.revokeInvitation).toHaveBeenCalledWith("inv_1");
    expect(mocks.sendClerkInvitation).toHaveBeenCalledWith("invitee@example.com", {
      companyId: expect.any(String),
      invitedByUserId: opsId,
    });

    expect((await platformRevokeCompanyInvite(company.id, invitee.id)).ok).toBe(true);
    expect(await db.select().from(users).where(eq(users.id, invitee.id))).toHaveLength(0);
  });

  it("won't resend an invite to someone who already signed in", async () => {
    const company = await seedCompany(db, { slug: "acme" });
    const admin = await addMember(company.id, "admin@example.com");
    expect(await platformResendCompanyInvite(company.id, admin.id)).toMatchObject({
      ok: false,
      error: expect.stringMatching(/already signed in/),
    });
  });
});

describe("platform admin management", () => {
  it("refuses to remove yourself or an env-allowlisted admin", async () => {
    expect(await removePlatformAdmin(opsId)).toMatchObject({
      ok: false,
      error: expect.stringMatching(/yourself/),
    });

    process.env.PLATFORM_ADMIN_EMAILS = "ops@example.com,break-glass@example.com";
    const [envAdmin] = await db
      .insert(users)
      .values({ email: "break-glass@example.com", role: "platform_admin", clerkUserId: "clerk_bg" })
      .returning();
    expect(await removePlatformAdmin(envAdmin.id)).toMatchObject({
      ok: false,
      error: expect.stringMatching(/PLATFORM_ADMIN_EMAILS/),
    });
  });

  it("cancels a pending invite and removes an active admin", async () => {
    const [pending] = await db
      .insert(users)
      .values({ email: "pending-ops@example.com", role: "platform_admin" })
      .returning();
    const [active] = await db
      .insert(users)
      .values({ email: "active-ops@example.com", role: "platform_admin", clerkUserId: "clerk_active" })
      .returning();

    expect((await resendPlatformAdminInvite(pending.id)).ok).toBe(true);
    expect(mocks.sendClerkInvitation).toHaveBeenCalledWith("pending-ops@example.com", {
      invitedByUserId: opsId,
    });
    expect((await removePlatformAdmin(pending.id)).ok).toBe(true);
    expect((await removePlatformAdmin(active.id)).ok).toBe(true);

    expect(mocks.deleteClerkUser).toHaveBeenCalledWith("clerk_active");
    const remaining = await db.select().from(users).where(eq(users.role, "platform_admin"));
    expect(remaining.map((u) => u.email)).toEqual(["ops@example.com"]);
  });

  it("does not remove tenant users through the platform admin action", async () => {
    const company = await seedCompany(db, { slug: "acme" });
    const tenant = await addMember(company.id, "admin@example.com");
    expect(await removePlatformAdmin(tenant.id)).toMatchObject({ ok: false });
  });
});

describe("billing operations", () => {
  async function billing(companyId: string) {
    const [row] = await db.select().from(companyBilling).where(eq(companyBilling.companyId, companyId));
    return row;
  }

  function trialForm(companyId: string, days: number) {
    const form = new FormData();
    form.set("companyId", companyId);
    form.set("days", String(days));
    return form;
  }

  it("extends a trial from its current end date", async () => {
    const company = await seedCompany(db, { slug: "acme" });
    const trialEndsAt = new Date(Date.now() + 2 * 86_400_000);
    await db.insert(companyBilling).values({ companyId: company.id, trialEndsAt });

    expect((await extendCompanyTrial(trialForm(company.id, 7))).ok).toBe(true);

    const row = await billing(company.id);
    expect(row.trialEndsAt!.getTime() - trialEndsAt.getTime()).toBe(7 * 86_400_000);
  });

  it("refuses to extend a trial for a paying company", async () => {
    const company = await seedCompany(db, { slug: "acme" });
    await db.insert(companyBilling).values({
      companyId: company.id,
      plan: "premium",
      status: "active",
      stripeSubscriptionId: "sub_123",
    });

    const result = await extendCompanyTrial(trialForm(company.id, 7));

    expect(result).toMatchObject({ ok: false, error: expect.stringMatching(/paid subscription/) });
    expect(await billing(company.id)).toMatchObject({ plan: "premium", status: "active" });
  });

  it("grants and revokes complimentary access", async () => {
    const company = await seedCompany(db, { slug: "acme" });
    const form = new FormData();
    form.set("companyId", company.id);
    form.set("note", "Friend of the firm");

    expect((await grantComplimentaryAccess(form)).ok).toBe(true);
    expect(await billing(company.id)).toMatchObject({
      access: "complimentary_unlimited",
      complimentaryNote: "Friend of the firm",
      complimentaryGrantedByUserId: opsId,
    });

    expect((await revokeComplimentaryAccess(company.id)).ok).toBe(true);
    expect(await billing(company.id)).toMatchObject({
      access: "standard",
      complimentaryNote: null,
    });
  });
});

describe("job operations", () => {
  async function inboundJob(companyId: string, n: number, status: "failed" | "pending" = "failed") {
    const [job] = await db
      .insert(inboundEmailJobs)
      .values({
        companyId,
        resendEmailId: `em_${n}`,
        fromEmail: "x@example.com",
        toEmail: "acme@in.example.com",
        status,
      })
      .returning();
    return job;
  }

  async function sendJob(companyId: string, status: "failed" | "pending" | "sent") {
    const [client] = await db.insert(clients).values({ companyId, name: "Client" }).returning();
    const [invoice] = await db
      .insert(invoices)
      .values({ companyId, clientId: client.id, number: `INV-${status}` })
      .returning();
    const [job] = await db
      .insert(sendJobs)
      .values({ companyId, invoiceId: invoice.id, kind: "invoice_send", status })
      .returning();
    return job;
  }

  it("dismisses an inbound job with a reason and audits it against the company", async () => {
    const company = await seedCompany(db, { slug: "acme" });
    const job = await inboundJob(company.id, 1);

    expect((await platformDismissInboundJob(job.id, "Spam")).ok).toBe(true);

    const [row] = await db.select().from(inboundEmailJobs).where(eq(inboundEmailJobs.id, job.id));
    expect(row).toMatchObject({ status: "rejected", lastError: "Dismissed by admin: Spam" });
    const [audit] = await auditFor("platform.inbound_email.dismiss");
    expect(audit.companyId).toBe(company.id);
  });

  it("bulk-dismisses inbound jobs and reports the counts", async () => {
    const company = await seedCompany(db, { slug: "acme" });
    const a = await inboundJob(company.id, 1);
    const b = await inboundJob(company.id, 2, "pending");

    const result = await platformBulkInboundJobs([a.id, b.id], "dismiss", "Cleanup");

    expect(result).toMatchObject({ ok: true, succeeded: 2, failed: 0 });
    const rows = await db.select().from(inboundEmailJobs);
    expect(rows.every((r) => r.status === "rejected")).toBe(true);
  });

  it("rejects an empty bulk selection", async () => {
    expect((await platformBulkInboundJobs([], "retry")).ok).toBe(false);
  });

  it("only retries failed send jobs, and never for a suspended company", async () => {
    const company = await seedCompany(db, { slug: "acme" });
    const pending = await sendJob(company.id, "pending");

    expect(await platformRetrySendJob(pending.id)).toMatchObject({
      ok: false,
      error: expect.stringMatching(/Only failed/),
    });
    const [audit] = await auditFor("platform.send_job.retry");
    expect(audit).toBeUndefined();

    await db.update(companies).set({ suspendedAt: new Date() }).where(eq(companies.id, company.id));
    const failed = await sendJob(company.id, "failed");
    expect(await platformRetrySendJob(failed.id)).toMatchObject({
      ok: false,
      error: expect.stringMatching(/suspended/),
    });
    const [row] = await db.select().from(sendJobs).where(eq(sendJobs.id, failed.id));
    expect(row.status).toBe("failed");
  });

  it("counts bulk send retries that fail", async () => {
    const company = await seedCompany(db, { slug: "acme" });
    await db.update(companies).set({ suspendedAt: new Date() }).where(eq(companies.id, company.id));
    const failed = await sendJob(company.id, "failed");

    expect(await platformBulkRetrySendJobs([failed.id])).toMatchObject({
      ok: true,
      succeeded: 0,
      failed: 1,
    });
    const [audit] = await db
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.action, "platform.send_job.bulk_retry")));
    expect(audit.meta).toMatchObject({ succeeded: 0, failed: 1 });
  });
});
