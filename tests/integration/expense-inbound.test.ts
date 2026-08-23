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

vi.mock("server-only", () => ({}));

const mockReceivingGet = vi.fn();
const mockAttachmentsList = vi.fn();
let mockExpenseInboundAddress = "expenses@dotanddashconsulting.com";

vi.mock("@/lib/settings/queries", () => ({
  getOrCreateCompanySettings: vi.fn(async () => ({
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
      EXPENSE_INBOUND_ADDRESS: mockExpenseInboundAddress,
      RESEND_API_KEY: "re_test",
    }),
  };
});

let ctx: Awaited<ReturnType<typeof createTestDb>>;
let db: TestDatabase;

beforeEach(async () => {
  ctx = await createTestDb();
  db = ctx.db;
  setTestDb(db as unknown as Database);
  mockExpenseInboundAddress = "expenses@dotanddashconsulting.com";
  mockReceivingGet.mockReset();
  mockAttachmentsList.mockReset();
});

afterEach(async () => {
  setTestDb(null);
  await ctx.client.close();
});

describe("inbound email jobs", () => {
  it("dedupes enqueue on resend email id", async () => {
    const first = await enqueueInboundEmailJob({
      email_id: "email-1",
      from: "founder@example.com",
      to: ["expenses@dotanddashconsulting.com"],
      subject: "Receipt",
    });
    const second = await enqueueInboundEmailJob({
      email_id: "email-1",
      from: "founder@example.com",
      to: ["expenses@dotanddashconsulting.com"],
      subject: "Receipt",
    });

    expect(first.jobId).toBeTruthy();
    expect(second.jobId).toBe(first.jobId);

    const jobs = await db.select().from(inboundEmailJobs);
    expect(jobs).toHaveLength(1);
  });

  it("skips enqueue when recipient does not match inbound address", async () => {
    const result = await enqueueInboundEmailJob({
      email_id: "email-2",
      from: "founder@example.com",
      to: ["other@dotanddashconsulting.com"],
      subject: "Receipt",
    });

    expect(result.skipped).toBe(true);
    expect(result.jobId).toBeNull();
  });

  it("accepts any address from a comma-delimited inbound list", async () => {
    mockExpenseInboundAddress =
      "expenses@dotanddashconsulting.com, receipts@dotanddashconsulting.com";

    const result = await enqueueInboundEmailJob({
      email_id: "email-list",
      from: "founder@example.com",
      to: ["receipts@dotanddashconsulting.com"],
      subject: "Receipt",
    });

    expect(result.skipped).toBe(false);
    expect(result.jobId).toBeTruthy();
  });

  it("rejects unknown senders silently", async () => {
    const { jobId } = await enqueueInboundEmailJob({
      email_id: "email-3",
      from: "stranger@example.com",
      to: ["expenses@dotanddashconsulting.com"],
      subject: "Receipt",
    });
    if (!jobId) throw new Error("expected job");

    const result = await processInboundEmailJob(jobId);
    expect(result.ok).toBe(false);

    const [job] = await db.select().from(inboundEmailJobs).where(eq(inboundEmailJobs.id, jobId));
    expect(job.status).toBe("rejected");
  });

  it("creates pending expense for authorised founder with attachments", async () => {
    await db.insert(users).values({
      email: "founder@example.com",
      role: "user",
      clerkUserId: "clerk-founder",
      name: "Founder",
    });

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
      from: "founder@example.com",
      to: ["expenses@dotanddashconsulting.com"],
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
  });

  it("allows admin retry after a failed job", async () => {
    await db.insert(users).values({
      email: "founder@example.com",
      role: "user",
      clerkUserId: "clerk-founder-retry",
      name: "Founder",
    });

    mockReceivingGet.mockResolvedValue({
      data: { subject: "Retry me", text: "Total £10.00", html: null },
      error: null,
    });
    mockAttachmentsList.mockResolvedValue({ data: { data: [] }, error: null });

    const { jobId } = await enqueueInboundEmailJob({
      email_id: "email-retry",
      from: "founder@example.com",
      to: ["expenses@dotanddashconsulting.com"],
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
    const { jobId } = await enqueueInboundEmailJob({
      email_id: "email-dismiss",
      from: "founder@example.com",
      to: ["expenses@dotanddashconsulting.com"],
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
