import "server-only";
import { and, count, desc, eq, isNotNull, lt, or } from "drizzle-orm";
import { getDb } from "@/db";
import {
  companies,
  expenseReceipts,
  expenses,
  inboundEmailJobs,
  users,
} from "@/db/schema";
import { writeAudit } from "@/lib/audit";
import { safeFilename } from "@/lib/files";
import {
  buildInboundExpenseDescription,
  matchesInboundMailboxPattern,
  mergeReceiptExtractions,
  parseEmailAddressHeader,
  parseEmailBodyText,
  parseInboundMailbox,
} from "@/lib/expenses/inbound-merge";
import {
  describeFetchError,
  inboundStepError,
  sanitizeUrlForLog,
} from "@/lib/expenses/inbound-errors";
import {
  extractReceiptFromBytes,
  type ReceiptOcrProvider,
} from "@/lib/expenses/receipt-ocr";
import { isReceiptOcrProvider } from "@/lib/expenses/receipt-parse";
import {
  MAX_RECEIPT_BYTES,
  resolveReceiptContentType,
} from "@/lib/expenses/receipt-file";
import {
  inboundMailboxConfig,
  pickInboundToAddress,
  resolveInboundRecipient,
} from "@/lib/expenses/inbound-mailbox";
import { formatGBP, poundsToPence } from "@/lib/money";
import { getResendClient } from "@/lib/resend/client";
import { getReceiptOcrSettings } from "@/lib/platform-settings";
import { getStorage } from "@/lib/storage";
import { findUserByEmail, getUser, normalizeEmail } from "@/lib/users";
import { isForeignCurrency } from "@/lib/expenses/receipt-parse";

const MAX_ATTEMPTS = 8;

function logInboundJobFailure(
  job: typeof inboundEmailJobs.$inferSelect,
  err: unknown,
): string {
  const detail = describeFetchError(err);
  const message = err instanceof Error ? err.message : String(err);
  console.error(
    JSON.stringify({
      level: "error",
      msg: "inbound-email.process",
      jobId: job.id,
      resendEmailId: job.resendEmailId,
      fromEmail: job.fromEmail,
      toEmail: job.toEmail,
      subject: job.subject,
      error: message,
      cause: detail.cause,
      code: detail.code,
    }),
  );
  void import("@/lib/platform-log").then(({ logPlatformEvent }) =>
    logPlatformEvent({
      level: "error",
      source: "inbound-email.process",
      message,
      companyId: job.companyId,
      meta: {
        jobId: job.id,
        resendEmailId: job.resendEmailId,
        cause: detail.cause,
        code: detail.code,
      },
    }),
  );
  return message;
}

async function fetchAttachmentDownload(
  downloadUrl: string,
  label: string,
): Promise<Response> {
  const urlForLog = sanitizeUrlForLog(downloadUrl);
  try {
    return await fetch(downloadUrl);
  } catch (err) {
    throw inboundStepError("attachment.download", err, {
      attachment: label,
      url: urlForLog,
    });
  }
}

export type InboundEmailReceivedPayload = {
  email_id: string;
  from: string;
  to: string[];
  subject: string;
};

function isFounderRole(role: string): boolean {
  return role === "admin" || role === "user";
}

export async function enqueueInboundEmailJob(
  payload: InboundEmailReceivedPayload,
): Promise<{ jobId: string | null; skipped: boolean }> {
  const config = inboundMailboxConfig();
  if (!matchesInboundMailboxPattern(payload.to, config)) {
    return { jobId: null, skipped: true };
  }

  const toEmail = pickInboundToAddress(payload.to, config);
  if (!toEmail) {
    return { jobId: null, skipped: true };
  }

  const db = getDb();
  const existing = await db
    .select({ id: inboundEmailJobs.id })
    .from(inboundEmailJobs)
    .where(eq(inboundEmailJobs.resendEmailId, payload.email_id))
    .limit(1);
  if (existing[0]) {
    return { jobId: existing[0].id, skipped: false };
  }

  const fromEmail = parseEmailAddressHeader(payload.from);
  const recipient = await resolveInboundRecipient(toEmail, config);

  if (recipient) {
    const [created] = await db
      .insert(inboundEmailJobs)
      .values({
        companyId: recipient.companyId,
        resendEmailId: payload.email_id,
        fromEmail,
        toEmail,
        subject: payload.subject ?? null,
        status: "pending",
      })
      .returning({ id: inboundEmailJobs.id });
    return { jobId: created.id, skipped: false };
  }

  // Pattern matched but company/user unknown → rejected job when company exists.
  const parsed = parseInboundMailbox(toEmail, config);
  if (!parsed) {
    return { jobId: null, skipped: true };
  }
  const [company] = await db
    .select({ id: companies.id })
    .from(companies)
    .where(eq(companies.slug, parsed.companySlug))
    .limit(1);
  if (!company) {
    return { jobId: null, skipped: true };
  }

  const [created] = await db
    .insert(inboundEmailJobs)
    .values({
      companyId: company.id,
      resendEmailId: payload.email_id,
      fromEmail,
      toEmail,
      subject: payload.subject ?? null,
      status: "rejected",
      lastError: `Unknown inbound user for mailbox: ${toEmail}`,
      processedAt: new Date(),
    })
    .returning({ id: inboundEmailJobs.id });
  return { jobId: created.id, skipped: false };
}

export async function processInboundEmailJob(
  jobId: string,
): Promise<{ ok: boolean; error?: string; expenseId?: string }> {
  const db = getDb();
  const [job] = await db
    .select()
    .from(inboundEmailJobs)
    .where(eq(inboundEmailJobs.id, jobId))
    .limit(1);

  if (!job) return { ok: false, error: "Inbound email job not found" };
  if (job.status === "processed") {
    return { ok: true, expenseId: job.expenseId ?? undefined };
  }
  if (job.status === "rejected") {
    return { ok: false, error: job.lastError ?? "Rejected" };
  }
  if (job.attempts >= MAX_ATTEMPTS) {
    await db
      .update(inboundEmailJobs)
      .set({
        status: "failed",
        lastError: job.lastError ?? "Max attempts reached",
      })
      .where(eq(inboundEmailJobs.id, jobId));
    return { ok: false, error: "Max attempts reached" };
  }

  await db
    .update(inboundEmailJobs)
    .set({ attempts: job.attempts + 1 })
    .where(eq(inboundEmailJobs.id, jobId));

  try {
    const expenseId = await deliverInboundEmail(job);
    await db
      .update(inboundEmailJobs)
      .set({
        status: "processed",
        expenseId,
        processedAt: new Date(),
        lastError: null,
      })
      .where(eq(inboundEmailJobs.id, jobId));
    return { ok: true, expenseId };
  } catch (err) {
    const message = logInboundJobFailure(job, err);
    const rejected = message.startsWith("REJECTED:");
    const attempts = job.attempts + 1;

    await db
      .update(inboundEmailJobs)
      .set({
        status: rejected
          ? "rejected"
          : attempts >= MAX_ATTEMPTS
            ? "failed"
            : "pending",
        lastError: rejected ? message.slice("REJECTED:".length).trim() : message,
        processedAt: rejected ? new Date() : null,
      })
      .where(eq(inboundEmailJobs.id, jobId));

    return { ok: false, error: message };
  }
}

export async function drainInboundEmailJobs(limit = 20): Promise<{
  processed: number;
  sent: number;
  failed: number;
}> {
  const db = getDb();
  const jobs = await db
    .select({ id: inboundEmailJobs.id })
    .from(inboundEmailJobs)
    .where(
      or(
        eq(inboundEmailJobs.status, "pending"),
        and(eq(inboundEmailJobs.status, "failed"), lt(inboundEmailJobs.attempts, MAX_ATTEMPTS)),
      ),
    )
    .orderBy(inboundEmailJobs.createdAt)
    .limit(limit);

  let sent = 0;
  let failed = 0;
  for (const job of jobs) {
    const result = await processInboundEmailJob(job.id);
    if (result.ok) sent++;
    else failed++;
  }
  return { processed: jobs.length, sent, failed };
}

async function deliverInboundEmail(
  job: typeof inboundEmailJobs.$inferSelect,
): Promise<string> {
  const recipient = await resolveInboundRecipient(job.toEmail);
  if (!recipient || !isFounderRole(recipient.role)) {
    throw new Error("REJECTED: Inbound mailbox is not an authorised founder");
  }
  if (recipient.companyId !== job.companyId) {
    throw new Error("REJECTED: Inbound mailbox company mismatch");
  }

  const sender = await getUser(recipient.userId);
  if (!sender || !isFounderRole(sender.role)) {
    throw new Error("REJECTED: Inbound mailbox is not an authorised founder");
  }

  const resend = getResendClient();

  let email;
  try {
    const { data, error: emailError } = await resend.emails.receiving.get(
      job.resendEmailId,
    );
    if (emailError || !data) {
      throw new Error(emailError?.message ?? "empty response");
    }
    email = data;
  } catch (err) {
    throw inboundStepError("resend.receiving.get", err, {
      resendEmailId: job.resendEmailId,
    });
  }

  const companyId = job.companyId;
  const ocr = await getReceiptOcrSettings();
  const providerRaw = ocr.provider ?? "local";
  const provider: ReceiptOcrProvider = isReceiptOcrProvider(providerRaw)
    ? providerRaw
    : "local";

  const bodyExtraction = parseEmailBodyText(
    email.subject ?? job.subject ?? "",
    email.text ?? "",
  );

  let attachmentList;
  try {
    const { data, error: attachmentError } =
      await resend.emails.receiving.attachments.list({ emailId: job.resendEmailId });
    if (attachmentError) {
      throw new Error(attachmentError.message);
    }
    attachmentList = data;
  } catch (err) {
    throw inboundStepError("resend.receiving.attachments.list", err, {
      resendEmailId: job.resendEmailId,
    });
  }

  const attachmentExtractions = [];
  const storedAttachments: {
    bytes: Buffer;
    contentType: string;
    filename: string;
  }[] = [];

  for (const attachment of attachmentList?.data ?? []) {
    if (!attachment.download_url) continue;
    if (attachment.size > MAX_RECEIPT_BYTES) {
      console.warn(
        `[inbound-email] Skipping oversized attachment ${attachment.filename} (${attachment.size} bytes)`,
      );
      continue;
    }

    const label = attachment.filename ?? attachment.id;
    const response = await fetchAttachmentDownload(attachment.download_url, label);
    if (!response.ok) {
      throw new Error(
        `[attachment.download] HTTP ${response.status} for ${label} from ${sanitizeUrlForLog(attachment.download_url)}`,
      );
    }

    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length > MAX_RECEIPT_BYTES) continue;

    const contentType = resolveReceiptContentType(bytes);
    if (!contentType) {
      console.warn(
        `[inbound-email] Skipping unsupported attachment ${attachment.filename ?? attachment.id}`,
      );
      continue;
    }

    try {
      const extraction = await extractReceiptFromBytes(
        bytes,
        contentType,
        provider,
        ocr.model,
      );
      attachmentExtractions.push(extraction);
    } catch (error) {
      console.error(
        "[inbound-email] OCR failed for attachment:",
        error instanceof Error ? error.message : error,
      );
    }

    storedAttachments.push({
      bytes,
      contentType,
      filename: safeFilename(attachment.filename ?? `attachment-${attachment.id}`),
    });
  }

  const merged = mergeReceiptExtractions(bodyExtraction, ...attachmentExtractions);
  const description = buildInboundExpenseDescription(
    merged,
    email.subject ?? job.subject ?? "",
  );

  let amountPence = 0;
  if (merged.amountPounds) {
    try {
      amountPence = poundsToPence(merged.amountPounds);
    } catch {
      amountPence = 0;
    }
  }

  const db = getDb();
  const expenseId = await db.transaction(async (tx) => {
    const [expense] = await tx
      .insert(expenses)
      .values({
        companyId,
        description,
        category: merged.category ?? null,
        spentAt: merged.spentAt ?? null,
        amountPence,
        vatPence: 0,
        status: "pending",
        source: "email",
        billable: false,
        paidByUserId: null,
        submittedByUserId: sender.id,
        createdByUserId: sender.id,
        detectedCurrency: isForeignCurrency(merged.currency)
          ? merged.currency!.toUpperCase()
          : null,
      })
      .returning({ id: expenses.id });

    const storage = getStorage();
    for (const attachment of storedAttachments) {
      const stored = await storage.put(
        `receipts/${expense.id}/${Date.now()}-${attachment.filename}`,
        attachment.bytes,
        attachment.contentType,
      );
      await tx.insert(expenseReceipts).values({
        expenseId: expense.id,
        blobPath: stored.path,
        filename: attachment.filename,
        contentType: attachment.contentType,
        sizeBytes: stored.size,
      });
    }

    return expense.id;
  });

  await writeAudit({
    companyId,
    actorUserId: sender.id,
    action: "expense.inbound_create",
    entityType: "expense",
    entityId: expenseId,
    meta: {
      resendEmailId: job.resendEmailId,
      from: job.fromEmail,
      attachmentCount: storedAttachments.length,
    },
  });

  return expenseId;
}

/** Whether a user email belongs to an authorised founder (admin or user role). */
export async function isAuthorisedExpenseSender(email: string): Promise<boolean> {
  const user = await findUserByEmail(normalizeEmail(email));
  return Boolean(user && isFounderRole(user.role));
}

export async function countPendingExpenses(companyId: string): Promise<number> {
  const db = getDb();
  const [row] = await db
    .select({ total: count() })
    .from(expenses)
    .where(and(eq(expenses.companyId, companyId), eq(expenses.status, "pending")));
  return row?.total ?? 0;
}

export async function listPendingExpenses(companyId: string, limit = 5) {
  const db = getDb();
  const rows = await db
    .select({
      id: expenses.id,
      description: expenses.description,
      amountPence: expenses.amountPence,
      createdAt: expenses.createdAt,
      submitterName: users.name,
      submitterEmail: users.email,
    })
    .from(expenses)
    .leftJoin(users, eq(expenses.submittedByUserId, users.id))
    .where(and(eq(expenses.companyId, companyId), eq(expenses.status, "pending")))
    .orderBy(desc(expenses.createdAt))
    .limit(limit);

  return rows.map((r) => ({
    ...r,
    amountFormatted: formatGBP(r.amountPence),
    submitterLabel: r.submitterName || r.submitterEmail || "Unknown",
  }));
}

const inboundIssueFilter = or(
  eq(inboundEmailJobs.status, "failed"),
  and(eq(inboundEmailJobs.status, "pending"), isNotNull(inboundEmailJobs.lastError)),
);

export async function countInboundEmailIssues(companyId: string): Promise<number> {
  const db = getDb();
  const [row] = await db
    .select({ total: count() })
    .from(inboundEmailJobs)
    .where(and(eq(inboundEmailJobs.companyId, companyId), inboundIssueFilter));
  return row?.total ?? 0;
}

export async function listInboundEmailIssues(companyId: string, limit = 5) {
  const db = getDb();
  const rows = await db
    .select({
      id: inboundEmailJobs.id,
      resendEmailId: inboundEmailJobs.resendEmailId,
      fromEmail: inboundEmailJobs.fromEmail,
      subject: inboundEmailJobs.subject,
      status: inboundEmailJobs.status,
      attempts: inboundEmailJobs.attempts,
      lastError: inboundEmailJobs.lastError,
      createdAt: inboundEmailJobs.createdAt,
      expenseId: inboundEmailJobs.expenseId,
    })
    .from(inboundEmailJobs)
    .where(and(eq(inboundEmailJobs.companyId, companyId), inboundIssueFilter))
    .orderBy(desc(inboundEmailJobs.createdAt))
    .limit(limit);

  return rows;
}

export type InboundEmailJobListFilter =
  | "all"
  | "attention"
  | "pending"
  | "failed"
  | "rejected"
  | "processed";

export async function listInboundEmailJobs(input: {
  companyId: string;
  filter?: InboundEmailJobListFilter;
  limit?: number;
}) {
  const db = getDb();
  const limit = input.limit ?? 100;
  const filter = input.filter ?? "all";

  const conditions = [eq(inboundEmailJobs.companyId, input.companyId)];
  switch (filter) {
    case "attention":
      conditions.push(inboundIssueFilter!);
      break;
    case "pending":
      conditions.push(eq(inboundEmailJobs.status, "pending"));
      break;
    case "failed":
      conditions.push(eq(inboundEmailJobs.status, "failed"));
      break;
    case "rejected":
      conditions.push(eq(inboundEmailJobs.status, "rejected"));
      break;
    case "processed":
      conditions.push(eq(inboundEmailJobs.status, "processed"));
      break;
    default:
      break;
  }

  return db
    .select({
      id: inboundEmailJobs.id,
      resendEmailId: inboundEmailJobs.resendEmailId,
      fromEmail: inboundEmailJobs.fromEmail,
      toEmail: inboundEmailJobs.toEmail,
      subject: inboundEmailJobs.subject,
      status: inboundEmailJobs.status,
      attempts: inboundEmailJobs.attempts,
      lastError: inboundEmailJobs.lastError,
      createdAt: inboundEmailJobs.createdAt,
      processedAt: inboundEmailJobs.processedAt,
      expenseId: inboundEmailJobs.expenseId,
    })
    .from(inboundEmailJobs)
    .where(and(...conditions))
    .orderBy(desc(inboundEmailJobs.createdAt))
    .limit(limit);
}

export async function getInboundEmailJob(companyId: string, jobId: string) {
  const db = getDb();
  const [job] = await db
    .select()
    .from(inboundEmailJobs)
    .where(
      and(eq(inboundEmailJobs.id, jobId), eq(inboundEmailJobs.companyId, companyId)),
    )
    .limit(1);
  return job ?? null;
}

/** Admin: reset a failed job and retry processing immediately. */
export async function adminRetryInboundEmailJob(
  jobId: string,
): Promise<{ ok: boolean; error?: string; expenseId?: string }> {
  const db = getDb();
  const [job] = await db
    .select()
    .from(inboundEmailJobs)
    .where(eq(inboundEmailJobs.id, jobId))
    .limit(1);

  if (!job) return { ok: false, error: "Inbound email job not found" };
  if (job.status === "processed") {
    return { ok: true, expenseId: job.expenseId ?? undefined };
  }

  await db
    .update(inboundEmailJobs)
    .set({
      status: "pending",
      attempts: job.status === "failed" ? 0 : job.attempts,
      lastError: null,
      processedAt: null,
    })
    .where(eq(inboundEmailJobs.id, jobId));

  return processInboundEmailJob(jobId);
}

/** Admin: mark a stuck job as dismissed so it stops retrying. */
export async function adminDismissInboundEmailJob(
  jobId: string,
  reason?: string,
): Promise<{ ok: boolean; error?: string }> {
  const db = getDb();
  const [job] = await db
    .select({ id: inboundEmailJobs.id, status: inboundEmailJobs.status })
    .from(inboundEmailJobs)
    .where(eq(inboundEmailJobs.id, jobId))
    .limit(1);

  if (!job) return { ok: false, error: "Inbound email job not found" };
  if (job.status === "processed") {
    return { ok: false, error: "This job has already been processed." };
  }

  const note = reason?.trim()
    ? `Dismissed by admin: ${reason.trim()}`
    : "Dismissed by admin";

  await db
    .update(inboundEmailJobs)
    .set({
      status: "rejected",
      lastError: note,
      processedAt: new Date(),
    })
    .where(eq(inboundEmailJobs.id, jobId));

  return { ok: true };
}

/** Admin: retry all jobs that currently need attention. */
export async function adminRetryAllInboundEmailIssues(): Promise<{
  retried: number;
  succeeded: number;
  failed: number;
}> {
  const db = getDb();
  const jobs = await db
    .select({ id: inboundEmailJobs.id })
    .from(inboundEmailJobs)
    .where(inboundIssueFilter)
    .orderBy(inboundEmailJobs.createdAt)
    .limit(20);

  let succeeded = 0;
  let failed = 0;
  for (const job of jobs) {
    const result = await adminRetryInboundEmailJob(job.id);
    if (result.ok) succeeded++;
    else failed++;
  }

  return { retried: jobs.length, succeeded, failed };
}

/** Tenant: retry a job only if it belongs to the caller's company. */
export async function retryInboundEmailJobForCompany(
  companyId: string,
  jobId: string,
): Promise<{ ok: boolean; error?: string; expenseId?: string }> {
  const job = await getInboundEmailJob(companyId, jobId);
  if (!job) return { ok: false, error: "Inbound email job not found" };
  return adminRetryInboundEmailJob(jobId);
}

/** Tenant: dismiss a job only if it belongs to the caller's company. */
export async function dismissInboundEmailJobForCompany(
  companyId: string,
  jobId: string,
  reason?: string,
): Promise<{ ok: boolean; error?: string }> {
  const job = await getInboundEmailJob(companyId, jobId);
  if (!job) return { ok: false, error: "Inbound email job not found" };
  return adminDismissInboundEmailJob(jobId, reason);
}

/** Tenant: retry issue jobs scoped to one company. */
export async function retryAllInboundEmailIssuesForCompany(
  companyId: string,
): Promise<{
  retried: number;
  succeeded: number;
  failed: number;
}> {
  const db = getDb();
  const jobs = await db
    .select({ id: inboundEmailJobs.id })
    .from(inboundEmailJobs)
    .where(and(eq(inboundEmailJobs.companyId, companyId), inboundIssueFilter))
    .orderBy(inboundEmailJobs.createdAt)
    .limit(20);

  let succeeded = 0;
  let failed = 0;
  for (const job of jobs) {
    const result = await adminRetryInboundEmailJob(job.id);
    if (result.ok) succeeded++;
    else failed++;
  }

  return { retried: jobs.length, succeeded, failed };
}
