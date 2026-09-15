import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb, type TestDatabase } from "@/db/pglite";
import { setTestDb, type Database } from "@/db";
import { inboundEmailJobs, expenses, users } from "@/db/schema";
import {
  adminDismissInboundEmailJob,
  adminRetryInboundEmailJob,
  enqueueInboundEmailJob,
  processInboundEmailJob,
} from "@/lib/expenses/inbound-email";
import { seedCompany } from "@/lib/test/seed-company";

vi.mock("server-only", () => ({}));

const mockReceivingGet = vi.fn();
const mockAttachmentsList = vi.fn();
let mockInboundDomain = "dotanddashconsulting.com";
let mockInboundPrefix = "expenses";

vi.mock("@/lib/settings/queries", () => ({
  getCompanySettings: vi.fn(async (companyId: string) => ({
    id: companyId,
    receiptOcrProvider: "local",
    receiptOcrModel: "google/gemini-2.5-flash",
  })),
  getOrCreateCompanySettings: vi.fn(async (companyId: string) => ({
    id: companyId,
    receiptOcrProvider: "local",
    receiptOcrModel: "google/gemini-2.5-flash",
  })),
}));

vi.mock("@/lib/resend/client", () => ({
  getResendClient: () => ({
    emails: {
      receiving: {
        get: mockReceivingGet,
        attachments: {
          list: mockAttachmentsList,
        },
      },
    },
  }),
}));

vi.mock("@/env", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/env")>();
  return {
    ...actual,
    serverEnv: () => ({
      ...actual.serverEnv(),
      EXPENSE_INBOUND_DOMAIN: mockInboundDomain,
      EXPENSE_INBOUND_PREFIX: mockInboundPrefix,
      RESEND_API_KEY: "re_test",
    }),
  };
});

let ctx: Awaited<ReturnType<typeof createTestDb>>;
let db: TestDatabase;
let companyId: string;
let companySlug: string;

beforeEach(async () => {
  ctx = await createTestDb();
  db = ctx.db;
  setTestDb(db as unknown as Database);
  const company = await seedCompany(db);
  companyId = company.id;
  companySlug = company.slug;
  mockInboundDomain = "dotanddashconsulting.com";
  mockInboundPrefix = "expenses";
  mockReceivingGet.mockReset();
  mockAttachmentsList.mockReset();
});

afterEach(async () => {
  setTestDb(null);
  await ctx.client.close();
});

function mailbox(userSlug: string, slug = companySlug) {
  return `expenses+${slug}.${userSlug}@dotanddashconsulting.com`;
}

describe("inbound email jobs", () => {
  it("dedupes enqueue on resend email id", async () => {
    await db.insert(users).values({
      companyId,
      email: "founder@example.com",
      role: "user",
      expenseInboundSlug: "founder",
      name: "Founder",
    });

    const to = [mailbox("founder")];
    const first = await enqueueInboundEmailJob({
      email_id: "email-1",
      from: "vendor@shop.com",
      to,
      subject: "Receipt",
    });
    const second = await enqueueInboundEmailJob({
      email_id: "email-1",
      from: "vendor@shop.com",
      to,
      subject: "Receipt",
    });

    expect(first.jobId).toBeTruthy();
    expect(second.jobId).toBe(first.jobId);

    const jobs = await db.select().from(inboundEmailJobs);
    expect(jobs).toHaveLength(1);
    expect(jobs[0].companyId).toBe(companyId);
  });

  it("skips enqueue when recipient does not match plus-address pattern", async () => {
    const result = await enqueueInboundEmailJob({
      email_id: "email-2",
      from: "founder@example.com",
      to: ["other@dotanddashconsulting.com"],
      subject: "Receipt",
    });

    expect(result.skipped).toBe(true);
    expect(result.jobId).toBeNull();
  });

  it("stamps jobs with the company resolved from the To address", async () => {
    const other = await seedCompany(db as unknown as Database, {
      name: "Other Co",
      slug: "other-co",
    });
    await db.insert(users).values({
      companyId: other.id,
      email: "other@example.com",
      role: "admin",
      expenseInboundSlug: "pat",
      name: "Pat",
    });

    const result = await enqueueInboundEmailJob({
      email_id: "email-tenant",
      from: "vendor@shop.com",
      to: [mailbox("pat", "other-co")],
      subject: "Receipt",
    });

    expect(result.skipped).toBe(false);
    expect(result.jobId).toBeTruthy();
    const [job] = await db
      .select()
      .from(inboundEmailJobs)
      .where(eq(inboundEmailJobs.id, result.jobId!));
    expect(job.companyId).toBe(other.id);
  });

  it("rejects unknown user slugs on a known company", async () => {
    const result = await enqueueInboundEmailJob({
      email_id: "email-unknown-user",
      from: "vendor@shop.com",
      to: [mailbox("nobody")],
      subject: "Receipt",
    });

    expect(result.skipped).toBe(false);
    expect(result.jobId).toBeTruthy();
    const [job] = await db
      .select()
      .from(inboundEmailJobs)
      .where(eq(inboundEmailJobs.id, result.jobId!));
    expect(job.status).toBe("rejected");
    expect(job.companyId).toBe(companyId);
  });

  it("creates pending expense for mailbox user even when From is a vendor", async () => {
    const [founder] = await db
      .insert(users)
      .values({
        companyId,
        email: "founder@example.com",
        role: "user",
        clerkUserId: "clerk-founder",
        name: "Founder",
        expenseInboundSlug: "founder",
      })
      .returning();

    mockReceivingGet.mockResolvedValue({
      data: {
        subject: "Lunch receipt",
        text: "Total £24.00",
        html: null,
      },
      error: null,
    });
    mockAttachmentsList.mockResolvedValue({
      data: { data: [] },
      error: null,
    });

    const { jobId } = await enqueueInboundEmailJob({
      email_id: "email-4",
      from: "receipts@amazon.co.uk",
      to: [mailbox("founder")],
      subject: "Lunch receipt",
    });
    if (!jobId) throw new Error("expected job");

    const result = await processInboundEmailJob(jobId);
    expect(result.ok).toBe(true);
    expect(result.expenseId).toBeTruthy();

    const [job] = await db.select().from(inboundEmailJobs).where(eq(inboundEmailJobs.id, jobId));
    expect(job.status).toBe("processed");
    expect(job.expenseId).toBe(result.expenseId);

    const [expense] = await db.select().from(expenses).where(eq(expenses.id, result.expenseId!));
    expect(expense.status).toBe("pending");
    expect(expense.source).toBe("email");
    expect(expense.companyId).toBe(companyId);
    expect(expense.submittedByUserId).toBe(founder.id);
    expect(expense.createdByUserId).toBe(founder.id);
    expect(expense.detectedCurrency).toBeNull();
  });

  it("stores detected foreign currency for pending review", async () => {
    await db.insert(users).values({
      companyId,
      email: "founder@example.com",
      role: "user",
      expenseInboundSlug: "founder",
      name: "Founder",
    });

    mockReceivingGet.mockResolvedValue({
      data: {
        subject: "Miro receipt",
        text: "RealtimeBoard Inc.\nTotal USD $29.00",
        html: null,
      },
      error: null,
    });
    mockAttachmentsList.mockResolvedValue({ data: { data: [] }, error: null });

    const { jobId } = await enqueueInboundEmailJob({
      email_id: "email-usd",
      from: "receipts@miro.com",
      to: [mailbox("founder")],
      subject: "Miro receipt",
    });
    if (!jobId) throw new Error("expected job");

    const result = await processInboundEmailJob(jobId);
    expect(result.ok).toBe(true);

    const [expense] = await db
      .select()
      .from(expenses)
      .where(eq(expenses.id, result.expenseId!));
    expect(expense.detectedCurrency).toBe("USD");
  });

  it("rejects accountant mailboxes", async () => {
    await db.insert(users).values({
      companyId,
      email: "books@example.com",
      role: "accountant",
      expenseInboundSlug: "books",
      name: "Books",
    });

    const { jobId } = await enqueueInboundEmailJob({
      email_id: "email-accountant",
      from: "vendor@shop.com",
      to: [mailbox("books")],
      subject: "Receipt",
    });
    if (!jobId) throw new Error("expected job");

    const result = await processInboundEmailJob(jobId);
    expect(result.ok).toBe(false);

    const [job] = await db.select().from(inboundEmailJobs).where(eq(inboundEmailJobs.id, jobId));
    expect(job.status).toBe("rejected");
  });

  it("allows admin retry after a failed job", async () => {
    await db.insert(users).values({
      companyId,
      email: "founder@example.com",
      role: "user",
      clerkUserId: "clerk-founder-retry",
      name: "Founder",
      expenseInboundSlug: "founder",
    });

    mockReceivingGet.mockResolvedValue({
      data: { subject: "Retry me", text: "Total £10.00", html: null },
      error: null,
    });
    mockAttachmentsList.mockResolvedValue({ data: { data: [] }, error: null });

    const { jobId } = await enqueueInboundEmailJob({
      email_id: "email-retry",
      from: "vendor@shop.com",
      to: [mailbox("founder")],
      subject: "Retry me",
    });
    if (!jobId) throw new Error("expected job");

    await db
      .update(inboundEmailJobs)
      .set({ status: "failed", attempts: 8, lastError: "[attachment.download] · fetch failed" })
      .where(eq(inboundEmailJobs.id, jobId));

    const result = await adminRetryInboundEmailJob(jobId);
    expect(result.ok).toBe(true);

    const [job] = await db.select().from(inboundEmailJobs).where(eq(inboundEmailJobs.id, jobId));
    expect(job.status).toBe("processed");
    expect(job.lastError).toBeNull();
  });

  it("allows admin to dismiss a stuck job", async () => {
    await db.insert(users).values({
      companyId,
      email: "founder@example.com",
      role: "user",
      expenseInboundSlug: "founder",
    });

    const { jobId } = await enqueueInboundEmailJob({
      email_id: "email-dismiss",
      from: "vendor@shop.com",
      to: [mailbox("founder")],
      subject: "Dismiss me",
    });
    if (!jobId) throw new Error("expected job");

    await db
      .update(inboundEmailJobs)
      .set({ status: "failed", lastError: "network down" })
      .where(eq(inboundEmailJobs.id, jobId));

    const result = await adminDismissInboundEmailJob(jobId, "Not needed");
    expect(result.ok).toBe(true);

    const [job] = await db.select().from(inboundEmailJobs).where(eq(inboundEmailJobs.id, jobId));
    expect(job.status).toBe("rejected");
    expect(job.lastError).toBe("Dismissed by admin: Not needed");
  });
});
