import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb, type TestDatabase } from "@/db/pglite";
import { setTestDb, type Database } from "@/db";
import {
  auditLog,
  clients,
  companies,
  companyBilling,
  companyMemberships,
  inboundEmailJobs,
  invoices,
  platformLogs,
  sendJobs,
  users,
} from "@/db/schema";
import { seedCompany } from "@/lib/test/seed-company";
import {
  countPlatformActivity,
  countPlatformCompanies,
  countPlatformInboundJobs,
  countPlatformLogs,
  countPlatformSendJobs,
  getLatestCronRuns,
  getPlatformCompanyDetail,
  getPlatformOverviewStats,
  listCompanyOptions,
  listPlatformActivity,
  listPlatformCompanies,
  listPlatformInboundJobs,
  listPlatformLogs,
  listPlatformSendJobs,
} from "@/lib/platform/queries";

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

async function addMember(companyId: string, email: string) {
  const [user] = await db
    .insert(users)
    .values({ clerkUserId: `clerk_${email}`, email, companyId, role: "admin" })
    .returning();
  await db
    .insert(companyMemberships)
    .values({ userId: user.id, companyId, role: "admin" });
  return user;
}

describe("listPlatformCompanies", () => {
  it("counts members, failed inbound jobs and last audit per company", async () => {
    const alpha = await seedCompany(db, { name: "Alpha", slug: "alpha" });
    const beta = await seedCompany(db, { name: "Beta", slug: "beta" });

    await addMember(alpha.id, "a1@example.com");
    await addMember(alpha.id, "a2@example.com");
    await addMember(beta.id, "b1@example.com");

    await db.insert(inboundEmailJobs).values([
      {
        companyId: alpha.id,
        resendEmailId: "em_1",
        fromEmail: "x@example.com",
        toEmail: "alpha@in.example.com",
        status: "failed",
      },
      {
        companyId: alpha.id,
        resendEmailId: "em_2",
        fromEmail: "x@example.com",
        toEmail: "alpha@in.example.com",
        status: "pending",
      },
    ]);

    const auditAt = new Date("2026-01-02T03:04:05Z");
    await db
      .insert(auditLog)
      .values({ companyId: beta.id, action: "test.action", createdAt: auditAt });

    const rows = await listPlatformCompanies();
    const byName = Object.fromEntries(rows.map((r) => [r.name, r]));

    expect(byName.Alpha).toMatchObject({
      memberCount: 2,
      failedInbound: 1,
      failedSend: 0,
      lastAuditAt: null,
    });
    expect(byName.Beta).toMatchObject({ memberCount: 1, failedInbound: 0 });
    expect(new Date(byName.Beta.lastAuditAt!).toISOString()).toBe(
      auditAt.toISOString(),
    );
  });
});

describe("listPlatformCompanies filters and paging", () => {
  it("filters by suspension and billing state, and pages", async () => {
    const alpha = await seedCompany(db, { name: "Alpha", slug: "alpha" });
    const beta = await seedCompany(db, { name: "Beta", slug: "beta" });
    const gamma = await seedCompany(db, { name: "Gamma", slug: "gamma" });
    await db.insert(companyBilling).values([
      { companyId: alpha.id, plan: "premium", status: "active" },
      { companyId: beta.id, status: "trialing", access: "complimentary_unlimited" },
      { companyId: gamma.id, status: "canceled" },
    ]);
    await db
      .update(companies)
      .set({ suspendedAt: new Date() })
      .where(eq(companies.id, gamma.id));

    const names = async (opts: Parameters<typeof listPlatformCompanies>[0]) =>
      (await listPlatformCompanies(opts)).map((r) => r.name);

    expect(await names({ filter: "suspended" })).toEqual(["Gamma"]);
    expect(await names({ filter: "active" })).toEqual(["Alpha"]);
    expect(await names({ filter: "complimentary" })).toEqual(["Beta"]);
    expect(await names({ filter: "canceled" })).toEqual(["Gamma"]);
    expect(await names({ q: "gam" })).toEqual(["Gamma"]);
    expect(await names({ limit: 2, offset: 1 })).toEqual(["Beta", "Gamma"]);
    expect(await countPlatformCompanies()).toBe(3);
    expect(await countPlatformCompanies({ filter: "active" })).toBe(1);
    expect(await countPlatformCompanies({ q: "a" })).toBe(3);

    const [alphaRow] = await listPlatformCompanies({ q: "alpha" });
    expect(alphaRow).toMatchObject({
      billingPlan: "premium",
      billingStatus: "active",
      complimentary: false,
    });
    expect(await listCompanyOptions()).toEqual([
      { id: alpha.id, name: "Alpha" },
      { id: beta.id, name: "Beta" },
      { id: gamma.id, name: "Gamma" },
    ]);
  });
});

describe("other platform queries", () => {
  async function seedJobs() {
    const alpha = await seedCompany(db, { name: "Alpha", slug: "alpha" });
    const beta = await seedCompany(db, { name: "Beta", slug: "beta" });
    await addMember(alpha.id, "a1@example.com");
    await db.insert(inboundEmailJobs).values([
      { companyId: alpha.id, resendEmailId: "em_1", fromEmail: "x@example.com", toEmail: "a@in", status: "failed" },
      { companyId: alpha.id, resendEmailId: "em_2", fromEmail: "x@example.com", toEmail: "a@in", status: "processed" },
      { companyId: beta.id, resendEmailId: "em_3", fromEmail: "x@example.com", toEmail: "b@in", status: "pending" },
    ]);
    const [client] = await db.insert(clients).values({ companyId: alpha.id, name: "Client" }).returning();
    const [invoice] = await db
      .insert(invoices)
      .values({ companyId: alpha.id, clientId: client.id, number: "INV-001" })
      .returning();
    await db.insert(sendJobs).values([
      { companyId: alpha.id, invoiceId: invoice.id, kind: "invoice_send", status: "failed" },
      { companyId: alpha.id, invoiceId: invoice.id, kind: "invoice_remind", status: "sent" },
    ]);
    return { alpha, beta };
  }

  it("returns company detail with members and job counts", async () => {
    const { alpha } = await seedJobs();

    const detail = await getPlatformCompanyDetail(alpha.id);

    expect(detail?.members).toMatchObject([{ email: "a1@example.com", role: "admin" }]);
    expect(detail?.inboundCounts).toEqual({ pending: 0, failed: 1, rejected: 0, processed: 1 });
    expect(detail?.sendCounts).toEqual({ pending: 0, failed: 1, sent: 1 });
    expect(await getPlatformCompanyDetail("00000000-0000-0000-0000-000000000000")).toBeNull();
  });

  it("computes overview stats across tenants", async () => {
    await seedJobs();
    await db.insert(platformLogs).values([
      { level: "error", source: "x", message: "boom" },
      { level: "warn", source: "x", message: "hmm" },
      { level: "error", source: "x", message: "old", createdAt: new Date(Date.now() - 3 * 86_400_000) },
    ]);

    expect(await getPlatformOverviewStats()).toEqual({
      companies: 2,
      suspended: 0,
      errors24h: 1,
      warnings24h: 1,
      failedInbound: 1,
      failedSend: 1,
      pendingInbound: 1,
      pendingSend: 0,
    });
  });

  it("lists jobs needing attention by default, with paging and invoice numbers", async () => {
    await seedJobs();

    const inbound = await listPlatformInboundJobs();
    expect(inbound.map((j) => j.status).sort()).toEqual(["failed", "pending"]);
    expect(await listPlatformInboundJobs({ status: "processed" })).toHaveLength(1);
    expect(await listPlatformInboundJobs({ limit: 1, offset: 1 })).toHaveLength(1);
    expect(await countPlatformInboundJobs()).toBe(2);
    expect(await countPlatformInboundJobs({ status: "processed" })).toBe(1);

    const send = await listPlatformSendJobs();
    expect(send).toMatchObject([{ status: "failed", invoiceNumber: "INV-001" }]);
    expect(await listPlatformSendJobs({ status: "sent" })).toHaveLength(1);
    expect(await countPlatformSendJobs()).toBe(1);
    expect(await countPlatformSendJobs({ status: "all" })).toBe(1);
  });

  it("filters activity by company and action prefix", async () => {
    const { alpha, beta } = await seedJobs();
    await db.insert(auditLog).values([
      { companyId: alpha.id, action: "platform.company.suspend" },
      { companyId: alpha.id, action: "invoice.create" },
      { companyId: beta.id, action: "platform.company.note" },
    ]);

    const forAlpha = await listPlatformActivity({ companyId: alpha.id });
    expect(forAlpha.map((r) => r.action).sort()).toEqual([
      "invoice.create",
      "platform.company.suspend",
    ]);
    const platformOnly = await listPlatformActivity({ actionPrefix: "platform." });
    expect(platformOnly).toHaveLength(2);
    expect(platformOnly.every((r) => r.companyName)).toBe(true);
    expect(await countPlatformActivity({ companyId: alpha.id })).toBe(2);
    expect(await countPlatformActivity({ actionPrefix: "platform." })).toBe(2);
  });

  it("filters logs by level, text and window, and finds the latest cron runs", async () => {
    await db.insert(platformLogs).values([
      { level: "error", source: "stripe.webhook", message: "signature mismatch" },
      { level: "info", source: "cron.daily", message: "Daily cron completed", createdAt: new Date(Date.now() - 60_000) },
      { level: "info", source: "cron.daily.manual", message: "Platform admin triggered daily cron" },
      { level: "warn", source: "cron.inbound-email", message: "slow" },
    ]);

    expect((await listPlatformLogs()).map((r) => r.level).sort()).toEqual(["error", "warn"]);
    expect(await listPlatformLogs({ level: "info" })).toHaveLength(2);
    expect(await listPlatformLogs({ q: "signature" })).toHaveLength(1);
    expect(await listPlatformLogs({ source: "stripe" })).toHaveLength(1);
    expect(await countPlatformLogs()).toBe(2);
    expect(await countPlatformLogs({ level: "info" })).toBe(2);

    const runs = await getLatestCronRuns();
    expect(runs.daily?.source).toBe("cron.daily.manual");
    expect(runs.inbound?.level).toBe("warn");
  });
});
