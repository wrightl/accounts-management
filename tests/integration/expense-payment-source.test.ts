import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb, type TestDatabase } from "@/db/pglite";
import { setTestDb, type Database } from "@/db";
import {
  bankAccounts,
  bankTransactions,
  companyMemberships,
  expenses,
  inboundEmailJobs,
  reconciliationMatches,
  users,
} from "@/db/schema";
import { enqueueInboundEmailJob, processInboundEmailJob } from "@/lib/expenses/inbound-email";
import { getPaymentSourceSuggestion } from "@/lib/expenses/payment-source-queries";
import { setBankAccountCards } from "@/lib/bank/company-cards";
import { paymentQuestionRef } from "@/lib/expenses/payment-source";
import { setInboundAlias } from "@/lib/expenses/inbound-mailbox";
import { seedCompany } from "@/lib/test/seed-company";

vi.mock("server-only", () => ({}));

const mockReceivingGet = vi.fn();
const mockAttachmentsList = vi.fn();
const mockExtractReceipt = vi.fn();
const mockSendEmail = vi.fn();

vi.mock("@/lib/email", () => ({
  sendEmail: (...args: unknown[]) => mockSendEmail(...args),
}));

vi.mock("@/lib/settings/queries", () => ({
  getCompanySettings: vi.fn(async (companyId: string) => ({ id: companyId })),
  getOrCreateCompanySettings: vi.fn(async (companyId: string) => ({ id: companyId })),
}));

vi.mock("@/lib/platform-settings", () => ({
  getPlatformSettings: vi.fn(async () => ({
    id: 1,
    defaultReceiptOcrProvider: "local",
    defaultReceiptOcrModel: "google/gemini-2.5-flash",
  })),
  getReceiptOcrSettings: vi.fn(async () => ({
    provider: "local",
    model: "google/gemini-2.5-flash",
  })),
  updatePlatformSettings: vi.fn(),
}));

vi.mock("@/lib/expenses/receipt-ocr", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/expenses/receipt-ocr")>()),
  extractReceiptFromBytes: (...args: unknown[]) => mockExtractReceipt(...args),
}));

vi.mock("@/lib/resend/client", () => ({
  getResendClient: () => ({
    emails: {
      receiving: {
        get: mockReceivingGet,
        attachments: { list: mockAttachmentsList },
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
      EXPENSE_INBOUND_DOMAIN: "dotanddashconsulting.com",
      EXPENSE_INBOUND_PREFIX: "expenses",
      RESEND_API_KEY: "re_test",
    }),
  };
});

let ctx: Awaited<ReturnType<typeof createTestDb>>;
let db: TestDatabase;
let companyId: string;
let companySlug: string;
let founderId: string;

const mailbox = () => `expenses+${companySlug}.founder@dotanddashconsulting.com`;

beforeEach(async () => {
  ctx = await createTestDb();
  db = ctx.db;
  setTestDb(db as unknown as Database);
  const company = await seedCompany(db);
  companyId = company.id;
  companySlug = company.slug;
  mockReceivingGet.mockReset();
  mockAttachmentsList.mockReset();
  mockExtractReceipt.mockReset();
  mockSendEmail.mockReset();
  mockSendEmail.mockResolvedValue({ id: "sent-1" });

  const [founder] = await db
    .insert(users)
    .values({
      companyId,
      email: "founder@example.com",
      role: "user",
      name: "Founder",
      expenseInboundSlug: "founder",
    })
    .returning();
  await db.insert(companyMemberships).values({ userId: founder.id, companyId, role: "user" });
  founderId = founder.id;
});

afterEach(async () => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  setTestDb(null);
  await ctx.client.close();
});

/** Receive one email, with an optional single PDF receipt, and process it. */
async function receive(
  emailId: string,
  email: { subject: string; text: string },
  receipt?: { description: string; amountPounds: string; cardLast4?: string },
  envelope: { from?: string; to?: string; headers?: Record<string, string> } = {},
) {
  mockReceivingGet.mockResolvedValue({
    data: { ...email, html: null, headers: envelope.headers ?? null },
    error: null,
  });
  mockAttachmentsList.mockResolvedValue({
    data: {
      data: receipt
        ? [
            {
              id: "r1",
              filename: "receipt.pdf",
              size: 100,
              content_disposition: "attachment",
              download_url: "https://files.example/r1",
            },
          ]
        : [],
    },
    error: null,
  });
  if (receipt) {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("%PDF-1.4 receipt")));
    mockExtractReceipt.mockResolvedValue({ ...receipt, confidence: "partial" });
  }
  const { jobId } = await enqueueInboundEmailJob({
    email_id: emailId,
    from: envelope.from ?? "founder@example.com",
    to: [envelope.to ?? mailbox()],
    subject: email.subject,
  });
  if (!jobId) throw new Error("expected job");
  const result = await processInboundEmailJob(jobId);
  return { jobId, result };
}

async function jobRow(jobId: string) {
  const [job] = await db.select().from(inboundEmailJobs).where(eq(inboundEmailJobs.id, jobId));
  return job;
}

describe("payment source on emailed expenses", () => {
  it("records what the sender says and doesn't ask", async () => {
    const { jobId, result } = await receive("e1", {
      subject: "Train ticket #personal",
      text: "Total £45.20",
    });
    expect(result.ok).toBe(true);

    const [expense] = await db.select().from(expenses).where(eq(expenses.id, result.expenseId!));
    expect(expense.status).toBe("pending");
    expect(expense.statedPaymentSource).toBe("personal");
    expect(expense.statedPaymentSourceVia).toBe("email");

    const suggestion = await getPaymentSourceSuggestion(companyId, expense.id);
    expect(suggestion?.suggestion).toBe("personal");
    expect(mockSendEmail).not.toHaveBeenCalled();
    expect((await jobRow(jobId)).paymentQuestionSentAt).toBeNull();
  });

  it("asks when there is no clue, and records the reply on the claim", async () => {
    const claim = await receive("e2", { subject: "Lunch", text: "Total £24.00" });
    expect(claim.result.ok).toBe(true);

    expect(mockSendEmail).toHaveBeenCalledTimes(1);
    const sent = mockSendEmail.mock.calls[0][0] as {
      to: string;
      replyTo: string;
      subject: string;
      text: string;
    };
    expect(sent.to).toBe("founder@example.com");
    expect(sent.replyTo).toBe(mailbox());
    expect(sent.subject).toContain(`[Claim ${paymentQuestionRef(claim.jobId)}]`);
    expect(sent.text).toContain("Lunch");
    expect((await jobRow(claim.jobId)).paymentQuestionSentAt).not.toBeNull();

    const reply = await receive("e3", {
      subject: `Re: ${sent.subject}`,
      text: `#company\n\nOn Sat, 25 Oct 2026, Alfa wrote:\n> ${sent.text.split("\n").join("\n> ")}`,
    });
    expect(reply.result.ok).toBe(true);
    expect(reply.result.expenseIds).toEqual([claim.result.expenseId]);

    // The reply makes no expense of its own.
    const all = await db.select().from(expenses);
    expect(all).toHaveLength(1);
    expect(all[0].statedPaymentSource).toBe("company");
    expect(all[0].statedPaymentSourceVia).toBe("reply");

    const replyJob = await jobRow(reply.jobId);
    expect(replyJob.status).toBe("processed");
    expect(replyJob.answersJobId).toBe(claim.jobId);
    // Only the claim was asked about.
    expect(mockSendEmail).toHaveBeenCalledTimes(1);
  });

  it("treats a reply without a clear answer as answered, and creates nothing", async () => {
    const claim = await receive("e4", { subject: "Taxi", text: "Total £12.00" });
    const subject = (mockSendEmail.mock.calls[0][0] as { subject: string }).subject;

    const reply = await receive("e5", { subject: `Re: ${subject}`, text: "Not sure, sorry" });
    expect(reply.result.ok).toBe(true);
    expect(await db.select().from(expenses)).toHaveLength(1);
    const [expense] = await db
      .select()
      .from(expenses)
      .where(eq(expenses.id, claim.result.expenseId!));
    expect(expense.statedPaymentSource).toBeNull();
    expect((await jobRow(reply.jobId)).lastError).toContain("didn't say");
  });

  it("recognises a company card on the receipt", async () => {
    const [account] = await db
      .insert(bankAccounts)
      .values({ companyId, name: "Starling", provider: "starling" })
      .returning();
    expect((await setBankAccountCards(companyId, account.id, "4242")).ok).toBe(true);

    const { result } = await receive(
      "e6",
      { subject: "Adobe", text: "" },
      { description: "Adobe", amountPounds: "19.99", cardLast4: "4242" },
    );
    const [expense] = await db.select().from(expenses).where(eq(expenses.id, result.expenseId!));
    expect(expense.receiptCardLast4).toBe("4242");

    const suggestion = await getPaymentSourceSuggestion(companyId, expense.id);
    expect(suggestion?.suggestion).toBe("company");
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it("counts a matching company bank payment, and flags disagreement", async () => {
    const [account] = await db
      .insert(bankAccounts)
      .values({ companyId, name: "Starling", provider: "starling" })
      .returning();
    const { result } = await receive("e7", {
      subject: "Hotel #personal",
      text: "Total £89.00 on 12/10/2026",
    });
    const expenseId = result.expenseId!;
    const [tx] = await db
      .insert(bankTransactions)
      .values({
        bankAccountId: account.id,
        externalId: "tx-1",
        bookedAt: "2026-10-12",
        amountPence: -8900,
        counterparty: "Premier Inn",
      })
      .returning();
    await db.insert(reconciliationMatches).values({
      bankTransactionId: tx.id,
      matchType: "expense",
      expenseId,
      confirmed: false,
    });

    const suggestion = await getPaymentSourceSuggestion(companyId, expenseId);
    expect(suggestion?.conflict).toBe(true);
    expect(suggestion?.suggestion).toBeNull();
    expect(suggestion?.evidence.map((e) => e.kind)).toEqual(["stated", "bank_match"]);
  });

  it("doesn't fail the claim when the question can't be sent", async () => {
    mockSendEmail.mockRejectedValue(new Error("provider down"));
    const { jobId, result } = await receive("e8", { subject: "Parking", text: "Total £6.00" });
    expect(result.ok).toBe(true);
    const job = await jobRow(jobId);
    expect(job.status).toBe("processed");
    expect(job.paymentQuestionSentAt).toBeNull();
  });

  it("only takes answers from the mailbox that was asked", async () => {
    const claim = await receive("e9", { subject: "Lunch", text: "Total £24.00" });
    const subject = (mockSendEmail.mock.calls[0][0] as { subject: string }).subject;

    const [other] = await db
      .insert(users)
      .values({
        companyId,
        email: "other@example.com",
        role: "user",
        expenseInboundSlug: "other",
      })
      .returning();
    await db.insert(companyMemberships).values({ userId: other.id, companyId, role: "user" });

    mockReceivingGet.mockResolvedValue({
      data: { subject: `Re: ${subject}`, text: "#personal Total £5.00", html: null },
      error: null,
    });
    mockAttachmentsList.mockResolvedValue({ data: { data: [] }, error: null });
    const { jobId } = await enqueueInboundEmailJob({
      email_id: "e10",
      from: "other@example.com",
      to: [`expenses+${companySlug}.other@dotanddashconsulting.com`],
      subject: `Re: ${subject}`,
    });
    await processInboundEmailJob(jobId!);

    const [original] = await db
      .select()
      .from(expenses)
      .where(eq(expenses.id, claim.result.expenseId!));
    expect(original.statedPaymentSource).toBeNull();
    // Treated as a new claim from the other person instead.
    const theirs = await db.select().from(expenses).where(eq(expenses.submittedByUserId, other.id));
    expect(theirs).toHaveLength(1);
  });
});

describe("claims sent by someone other than the mailbox owner", () => {
  const short = "founder@dotanddashconsulting.com";

  beforeEach(async () => {
    expect((await setInboundAlias(founderId, companyId, "founder")).ok).toBe(true);
  });

  async function expenseOf(result: { expenseId?: string }) {
    const [expense] = await db.select().from(expenses).where(eq(expenses.id, result.expenseId!));
    return expense;
  }

  it("routes a short address and doesn't flag the owner's own claim", async () => {
    const { result } = await receive("s1", { subject: "Lunch", text: "Total £24.00" }, undefined, {
      to: short,
      headers: { "Authentication-Results": "mx.resend.com; dkim=pass; dmarc=pass" },
    });
    expect(result.ok).toBe(true);
    const expense = await expenseOf(result);
    expect(expense.submittedByUserId).toBe(founderId);
    expect(expense.externalSenderEmail).toBeNull();
    expect(mockSendEmail).toHaveBeenCalledTimes(1);
    expect((mockSendEmail.mock.calls[0][0] as { replyTo: string }).replyTo).toBe(short);
  });

  it("flags a supplier's claim and doesn't ask the supplier how it was paid", async () => {
    const { result } = await receive(
      "s2",
      { subject: "Your invoice", text: "Total £80.00" },
      undefined,
      { to: short, from: "Shop Billing <billing@shop.com>" },
    );
    expect(result.ok).toBe(true);
    const expense = await expenseOf(result);
    expect(expense.status).toBe("pending");
    expect(expense.submittedByUserId).toBe(founderId);
    expect(expense.externalSenderEmail).toBe("billing@shop.com");
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it("flags mail that claims to be from the owner but fails DMARC", async () => {
    const { result } = await receive("s3", { subject: "Lunch", text: "Total £24.00" }, undefined, {
      to: short,
      headers: { "Authentication-Results": "mx.resend.com; spf=fail; dmarc=fail" },
    });
    expect((await expenseOf(result)).externalSenderEmail).toBe("founder@example.com");
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it("flags the legacy address the same way", async () => {
    const { result } = await receive(
      "s4",
      { subject: "Your invoice", text: "Total £80.00" },
      undefined,
      { from: "billing@shop.com" },
    );
    expect((await expenseOf(result)).externalSenderEmail).toBe("billing@shop.com");
  });

  it("doesn't let anyone else answer the owner's payment question", async () => {
    const claim = await receive("s5", { subject: "Lunch", text: "Total £24.00" }, undefined, {
      to: short,
    });
    const subject = (mockSendEmail.mock.calls[0][0] as { subject: string }).subject;

    const reply = await receive(
      "s6",
      { subject: `Re: ${subject}`, text: "#personal Total £5.00" },
      undefined,
      { to: short, from: "stranger@example.net" },
    );
    expect(reply.result.ok).toBe(true);
    expect((await expenseOf(claim.result)).statedPaymentSource).toBeNull();
    expect((await jobRow(reply.jobId)).answersJobId).toBeNull();
    // Kept as a claim of its own, flagged for checking.
    expect((await expenseOf(reply.result)).externalSenderEmail).toBe("stranger@example.net");
  });
});
