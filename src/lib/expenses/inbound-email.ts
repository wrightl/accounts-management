import "server-only";
import { and, count, desc, eq, inArray, isNotNull, isNull, lt, or, sql } from "drizzle-orm";
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
  matchesInboundMailboxPattern,
  parseEmailAddressHeader,
  parseEmailBodyText,
  parseInboundMailbox,
  pickReceiptAttachments,
  planInboundExpenses,
} from "@/lib/expenses/inbound-merge";
import {
  describeFetchError,
  inboundStepError,
  sanitizeUrlForLog,
} from "@/lib/expenses/inbound-errors";
import {
  createSharedImageOcr,
  extractReceiptFromBytes,
  type ReceiptOcrProvider,
} from "@/lib/expenses/receipt-ocr";
import { mapWithConcurrency } from "@/lib/concurrency";
import {
  isForeignCurrency,
  isReceiptOcrProvider,
  type ReceiptExtraction,
} from "@/lib/expenses/receipt-parse";
import {
  MAX_RECEIPT_BYTES,
  resolveReceiptContentType,
} from "@/lib/expenses/receipt-file";
import {
  inboundMailboxConfig,
  pickInboundToAddress,
  resolveInboundRecipient,
} from "@/lib/expenses/inbound-mailbox";
import { formatExpenseAmount, poundsToPence } from "@/lib/money";
import { sterlingFromForeign } from "@/lib/expenses/convert";
import { getResendClient } from "@/lib/resend/client";
import { getReceiptOcrSettings } from "@/lib/platform-settings";
import { getStorage, type StoredObject } from "@/lib/storage";
import { findUserByEmail, getUser, normalizeEmail } from "@/lib/users";
import { refreshExpenseBankSuggestion } from "@/lib/bank/expense-match";
import {
  detectStatedPaymentSource,
  parsePaymentQuestionRef,
  paymentSourceListLabel,
  type PaymentSource,
} from "@/lib/expenses/payment-source";
import { getPaymentSourceSuggestions } from "@/lib/expenses/payment-source-queries";
import {
  applyPaymentAnswer,
  findQuestionedJob,
  maybeAskHowPaid,
} from "@/lib/expenses/payment-question";

const MAX_ATTEMPTS = 8;
/** How long a worker owns a claimed job (OCR can be slow) before another may retry. */
const JOB_LEASE_MS = 10 * 60 * 1000;

/*
 * Vercel kills a function at 300s without letting it record a failure, so an
 * email with many attachments used to time out on every retry. Each job now
 * stays well inside that: OCR gets a fixed budget, downloads and uploads run
 * a few at a time, and drains only start a job that can finish in time.
 */
/** Wall-clock limit on one email's OCR; attachments not read by then still get an expense. */
const OCR_BUDGET_MS = 150_000;
/** AI Gateway reads in flight at once. */
const AI_OCR_CONCURRENCY = 4;
/** Local Tesseract workers; each takes a CPU and its own copy of the language data. */
const LOCAL_OCR_WORKERS = 2;
const TRANSFER_CONCURRENCY = 4;
const DOWNLOAD_TIMEOUT_MS = 30_000;
/** Generous upper bound for one job (downloads + OCR budget + uploads + inserts). */
const JOB_WORST_CASE_MS = 210_000;
/** Matches `maxDuration` on the routes that process jobs, less a safety margin. */
const ROUTE_BUDGET_MS = 280_000;

/** When a route that started at `startedAt` must stop starting inbound jobs. */
export function inboundRouteDeadline(startedAt = Date.now()): number {
  return startedAt + ROUTE_BUDGET_MS;
}

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
    return await fetch(downloadUrl, { signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS) });
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

export type InboundEmailJobResult = {
  ok: boolean;
  busy?: boolean;
  error?: string;
  /** The first expense created; see `expenseIds` for all of them. */
  expenseId?: string;
  expenseIds?: string[];
};

export async function processInboundEmailJob(
  jobId: string,
): Promise<InboundEmailJobResult> {
  const db = getDb();
  const [job] = await db
    .select()
    .from(inboundEmailJobs)
    .where(eq(inboundEmailJobs.id, jobId))
    .limit(1);

  if (!job) return { ok: false, error: "Inbound email job not found" };
  if (job.status === "processed") {
    return processedJobResult(job);
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

  // Atomic claim: concurrent webhooks each drain pending jobs, so without a
  // lease two workers could turn one email into two expenses.
  const now = new Date();
  const [claimed] = await db
    .update(inboundEmailJobs)
    .set({
      attempts: sql`${inboundEmailJobs.attempts} + 1`,
      lockedUntil: new Date(now.getTime() + JOB_LEASE_MS),
    })
    .where(
      and(
        eq(inboundEmailJobs.id, jobId),
        inArray(inboundEmailJobs.status, ["pending", "failed"]),
        lt(inboundEmailJobs.attempts, MAX_ATTEMPTS),
        or(
          isNull(inboundEmailJobs.lockedUntil),
          lt(inboundEmailJobs.lockedUntil, now),
        ),
      ),
    )
    .returning({ attempts: inboundEmailJobs.attempts });
  if (!claimed) {
    return { ok: false, busy: true, error: "Inbound email job is already being processed" };
  }

  try {
    const delivered = await deliverInboundEmail(job);
    if (delivered.kind === "answer") {
      return await finishPaymentAnswer(job, delivered);
    }
    const { expenseIds, skipped, unscanned } = delivered;
    const expenseId = expenseIds[0];
    const many = expenseIds.length > 1;
    // Kept on the processed job as a note; it does not flag the job for attention.
    const skippedNote =
      [
        skipped.length
          ? `Skipped ${skipped.length === 1 ? "an attachment" : `${skipped.length} attachments`}: ${skipped.join(", ")}`
          : null,
        unscanned.length
          ? `Not scanned in time, so their details need filling in: ${unscanned.join(", ")}`
          : null,
      ]
        .filter(Boolean)
        .join(". ") || null;
    await db
      .update(inboundEmailJobs)
      .set({
        status: "processed",
        expenseId,
        processedAt: new Date(),
        lastError: skippedNote,
        lockedUntil: null,
      })
      .where(eq(inboundEmailJobs.id, jobId));

    if (!delivered.paymentStated) {
      try {
        await maybeAskHowPaid({ job, senderEmail: delivered.senderEmail, expenseIds });
      } catch (askErr) {
        console.warn(
          JSON.stringify({
            level: "warn",
            msg: "inbound-email.payment_question_skipped",
            jobId,
            error: askErr instanceof Error ? askErr.message : String(askErr),
          }),
        );
      }
    }

    try {
      const { notify } = await import("@/lib/notifications");
      const recipient = await resolveInboundRecipient(job.toEmail);
      await notify({
        companyId: job.companyId,
        type: "expense.inbound.processed",
        title: "Expense email processed",
        body: [
          many
            ? `${expenseIds.length} expenses submitted by email were processed successfully.`
            : "An expense submitted by email was processed successfully.",
          skippedNote ? `${skippedNote}.` : null,
        ]
          .filter(Boolean)
          .join(" "),
        href: many ? `/inbound-email/${jobId}` : `/expenses/${expenseId}`,
        entityType: "expense",
        entityId: expenseId,
        extraUserIds: recipient?.userId ? [recipient.userId] : [],
      });
    } catch (notifyErr) {
      console.warn(
        JSON.stringify({
          level: "warn",
          msg: "notification.inbound_processed_failed",
          error:
            notifyErr instanceof Error ? notifyErr.message : String(notifyErr),
        }),
      );
    }

    return { ok: true, expenseId, expenseIds };
  } catch (err) {
    const message = logInboundJobFailure(job, err);
    const rejected = message.startsWith("REJECTED:");
    const attempts = claimed.attempts;

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
        lockedUntil: null,
      })
      .where(eq(inboundEmailJobs.id, jobId));

    if (rejected || attempts >= MAX_ATTEMPTS) {
      try {
        const { notify } = await import("@/lib/notifications");
        await notify({
          companyId: job.companyId,
          type: "expense.inbound.failed",
          title: "Expense email failed",
          body: rejected
            ? message.slice("REJECTED:".length).trim()
            : message,
          href: "/expenses",
          entityType: "inbound_email_job",
          entityId: jobId,
          roles: ["admin"],
          dedupeKey: `expense.inbound.failed:${jobId}`,
        });
      } catch (notifyErr) {
        console.warn(
          JSON.stringify({
            level: "warn",
            msg: "notification.inbound_failed_emit",
            error:
              notifyErr instanceof Error
                ? notifyErr.message
                : String(notifyErr),
          }),
        );
      }
    }

    return { ok: false, error: message };
  }
}

export async function drainInboundEmailJobs(
  limit = 20,
  options: { deadline?: number } = {},
): Promise<{
  processed: number;
  sent: number;
  failed: number;
}> {
  const db = getDb();
  const jobs = await db
    .select({ id: inboundEmailJobs.id })
    .from(inboundEmailJobs)
    .where(
      and(
        or(
          eq(inboundEmailJobs.status, "pending"),
          and(eq(inboundEmailJobs.status, "failed"), lt(inboundEmailJobs.attempts, MAX_ATTEMPTS)),
        ),
        or(isNull(inboundEmailJobs.lockedUntil), lt(inboundEmailJobs.lockedUntil, new Date())),
      ),
    )
    .orderBy(inboundEmailJobs.createdAt)
    .limit(limit);

  let processed = 0;
  let sent = 0;
  let failed = 0;
  for (const job of jobs) {
    // The rest wait for the next webhook or cron run rather than being cut off mid-job.
    if (options.deadline && Date.now() + JOB_WORST_CASE_MS > options.deadline) break;
    processed++;
    const result = await processInboundEmailJob(job.id);
    if (result.ok) sent++;
    else failed++;
  }
  return { processed, sent, failed };
}

type DeliveredClaim = {
  kind: "claim";
  expenseIds: string[];
  skipped: string[];
  unscanned: string[];
  /** The sender said how they paid, so there is no need to ask. */
  paymentStated: boolean;
  senderEmail: string;
};

type DeliveredAnswer = {
  kind: "answer";
  answeredJobId: string;
  source: PaymentSource | undefined;
  expenseIds: string[];
};

/**
 * Creates the email's expenses and returns their ids, first attachment first,
 * plus the attachments that were skipped and why, and those OCR didn't reach.
 * A reply to our "how did you pay?" question, with no receipts attached,
 * records the answer on that claim instead of creating expenses.
 */
async function deliverInboundEmail(
  job: typeof inboundEmailJobs.$inferSelect,
): Promise<DeliveredClaim | DeliveredAnswer> {
  const recipient = await resolveInboundRecipient(job.toEmail);
  if (!recipient || !isFounderRole(recipient.role)) {
    throw new Error("REJECTED: Inbound mailbox is not an authorised founder");
  }
  if (recipient.companyId !== job.companyId) {
    throw new Error("REJECTED: Inbound mailbox company mismatch");
  }

  // `recipient.role` is the membership role for this company; `users.role`
  // tracks whichever company is active, so it is not checked here.
  const sender = await getUser(recipient.userId);
  if (!sender) {
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

  const subject = email.subject ?? job.subject ?? "";
  const bodyExtraction = parseEmailBodyText(subject, email.text ?? "");
  const statedPaymentSource = detectStatedPaymentSource(subject, email.text ?? "");

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

  const candidates = pickReceiptAttachments(attachmentList?.data ?? []);

  const questionRef = parsePaymentQuestionRef(subject);
  if (questionRef && candidates.length === 0) {
    const answered = await findQuestionedJob({
      companyId,
      toEmail: job.toEmail,
      ref: questionRef,
      excludeJobId: job.id,
    });
    if (answered) {
      const expenseIds = statedPaymentSource
        ? await applyPaymentAnswer({
            companyId,
            answeredJobId: answered.id,
            source: statedPaymentSource,
            actorUserId: sender.id,
          })
        : [];
      return {
        kind: "answer",
        answeredJobId: answered.id,
        source: statedPaymentSource,
        expenseIds,
      };
    }
  }
  // Per attachment, in order: its receipt, or why it was skipped.
  const downloads: (InboundReceipt | string)[] = candidates.map(() => "");
  await mapWithConcurrency(candidates, TRANSFER_CONCURRENCY, async (attachment, i) => {
    const label = attachment.filename ?? attachment.id;
    if (!attachment.download_url) {
      downloads[i] = `${label} (no download link)`;
      return;
    }
    if (attachment.size > MAX_RECEIPT_BYTES) {
      console.warn(
        `[inbound-email] Skipping oversized attachment ${attachment.filename} (${attachment.size} bytes)`,
      );
      downloads[i] = `${label} (too large)`;
      return;
    }

    const response = await fetchAttachmentDownload(attachment.download_url, label);
    if (!response.ok) {
      throw new Error(
        `[attachment.download] HTTP ${response.status} for ${label} from ${sanitizeUrlForLog(attachment.download_url)}`,
      );
    }

    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length > MAX_RECEIPT_BYTES) {
      downloads[i] = `${label} (too large)`;
      return;
    }

    const contentType = resolveReceiptContentType(bytes);
    if (!contentType) {
      console.warn(`[inbound-email] Skipping unsupported attachment ${label}`);
      downloads[i] = `${label} (not a PDF or image)`;
      return;
    }

    downloads[i] = {
      bytes,
      contentType,
      filename: safeFilename(attachment.filename ?? `attachment-${attachment.id}`),
      extraction: null,
    };
  });
  const receipts = downloads.filter((d): d is InboundReceipt => typeof d !== "string");
  /** Attachments that got no expense, with why, so the job can say so. */
  const skipped = downloads.filter((d): d is string => typeof d === "string");

  const { extractions, unread } = await readReceipts(receipts, {
    provider,
    model: ocr.model,
    jobId: job.id,
  });
  extractions.forEach((extraction, i) => {
    receipts[i]!.extraction = extraction;
  });
  const unscanned = unread.map((i) => receipts[i]!.filename);

  // One expense per receipt attachment; an email without any still makes one.
  const drafts = planInboundExpenses(
    bodyExtraction,
    receipts.map((r) => r.extraction),
    email.subject ?? job.subject ?? "",
    email.created_at || job.createdAt,
  );

  const db = getDb();
  const storage = getStorage();
  // Ids are chosen up front so receipts can be uploaded before the
  // transaction: storage is not rolled back with it, so uploads made by a
  // failed attempt are deleted rather than left orphaned.
  const plannedIds = drafts.map(() => globalThis.crypto.randomUUID());
  const uploaded: (StoredObject | null)[] = plannedIds.map(() => null);
  let expenseIds: string[];
  try {
    // Let every started upload settle before failing, so the cleanup below sees it.
    let uploadError: unknown = null;
    await mapWithConcurrency(plannedIds, TRANSFER_CONCURRENCY, async (id, i) => {
      const receipt = receipts[i];
      if (!receipt || uploadError) return;
      try {
        uploaded[i] = await storage.put(
          `receipts/${id}/${Date.now()}-${receipt.filename}`,
          receipt.bytes,
          receipt.contentType,
        );
      } catch (err) {
        uploadError ??= err;
      }
    });
    if (uploadError) throw uploadError;

    // All-or-nothing, so a retry after a failure cannot leave some expenses behind.
    // Convert foreign receipts before the transaction so it doesn't wait on the
    // Bank of England. Without a rate the reviewer enters the sterling amount.
    const amounts = await Promise.all(
      drafts.map(async (draft) => {
        const merged = draft.extraction;
        let receiptAmount = 0;
        if (merged.amountPounds) {
          try {
            receiptAmount = poundsToPence(merged.amountPounds);
          } catch {
            receiptAmount = 0;
          }
        }
        if (!isForeignCurrency(merged.currency)) {
          return { amountPence: receiptAmount, currency: null, originalAmountMinor: null };
        }
        const currency = merged.currency!.toUpperCase();
        const amountPence =
          receiptAmount > 0
            ? ((await sterlingFromForeign(currency, receiptAmount, draft.spentAt ?? null)) ?? 0)
            : 0;
        return { amountPence, currency, originalAmountMinor: receiptAmount };
      }),
    );

    // now() is fixed within a transaction; step createdAt so attachment order survives.
    const createdBase = Date.now();
    expenseIds = await db.transaction(async (tx) => {
      for (const [i, draft] of drafts.entries()) {
        const merged = draft.extraction;
        const { amountPence, currency, originalAmountMinor } = amounts[i]!;

        await tx.insert(expenses).values({
          id: plannedIds[i],
          companyId,
          description: draft.description,
          category: merged.category ?? null,
          spentAt: draft.spentAt ?? null,
          amountPence,
          vatPence: 0,
          status: "pending",
          source: "email",
          billable: false,
          paidByUserId: null,
          submittedByUserId: sender.id,
          createdByUserId: sender.id,
          inboundEmailJobId: job.id,
          createdAt: new Date(createdBase + i),
          detectedCurrency: currency,
          originalAmountMinor,
          statedPaymentSource: statedPaymentSource ?? null,
          statedPaymentSourceVia: statedPaymentSource ? "email" : null,
          receiptCardLast4: merged.cardLast4 ?? null,
        });

        const receipt = receipts[i];
        const stored = uploaded[i];
        if (receipt && stored) {
          await tx.insert(expenseReceipts).values({
            expenseId: plannedIds[i],
            blobPath: stored.path,
            filename: receipt.filename,
            contentType: receipt.contentType,
            sizeBytes: stored.size,
          });
        }
      }
      return plannedIds;
    });
  } catch (err) {
    await Promise.all(
      uploaded.map(async (stored) => {
        if (!stored) return;
        try {
          await storage.delete(stored.path);
        } catch (cleanupErr) {
          console.error(
            `[inbound-email] Could not delete orphaned receipt ${stored.path}:`,
            cleanupErr instanceof Error ? cleanupErr.message : cleanupErr,
          );
        }
      }),
    );
    throw err;
  }

  for (const [i, expenseId] of expenseIds.entries()) {
    await writeAudit({
      companyId,
      actorUserId: sender.id,
      action: "expense.inbound_create",
      entityType: "expense",
      entityId: expenseId,
      meta: {
        resendEmailId: job.resendEmailId,
        from: job.fromEmail,
        attachmentCount: receipts[i] ? 1 : 0,
        expensesFromEmail: expenseIds.length,
        skippedAttachments: skipped,
      },
    });

    try {
      await refreshExpenseBankSuggestion(companyId, expenseId);
    } catch (err) {
      console.error("expense bank suggestion failed after inbound create", err);
    }
  }

  return {
    kind: "claim",
    expenseIds,
    skipped,
    unscanned,
    paymentStated: Boolean(statedPaymentSource),
    senderEmail: sender.email,
  };
}

/** Close a reply to our payment question; it creates no expenses of its own. */
async function finishPaymentAnswer(
  job: typeof inboundEmailJobs.$inferSelect,
  answer: DeliveredAnswer,
): Promise<InboundEmailJobResult> {
  const note = !answer.source
    ? "Reply to a payment question, but it didn't say how the expenses were paid"
    : answer.expenseIds.length
      ? `Reply to a payment question: ${answer.source === "personal" ? "paid personally" : "paid by the company"}`
      : "Reply to a payment question, but the expenses were already reviewed";
  await getDb()
    .update(inboundEmailJobs)
    .set({
      status: "processed",
      answersJobId: answer.answeredJobId,
      expenseId: answer.expenseIds[0] ?? null,
      processedAt: new Date(),
      lastError: note,
      lockedUntil: null,
    })
    .where(eq(inboundEmailJobs.id, job.id));

  if (answer.source && answer.expenseIds.length) {
    try {
      const { notify } = await import("@/lib/notifications");
      const many = answer.expenseIds.length > 1;
      await notify({
        companyId: job.companyId,
        type: "expense.inbound.processed",
        title: "Expense payment confirmed",
        body: `The sender says ${many ? "these expenses were" : "this expense was"} ${
          answer.source === "personal" ? "paid personally" : "paid by the company"
        }.`,
        href: many
          ? `/inbound-email/${answer.answeredJobId}`
          : `/expenses/${answer.expenseIds[0]}`,
        entityType: "expense",
        entityId: answer.expenseIds[0],
      });
    } catch (notifyErr) {
      console.warn(
        JSON.stringify({
          level: "warn",
          msg: "notification.payment_answer_failed",
          error: notifyErr instanceof Error ? notifyErr.message : String(notifyErr),
        }),
      );
    }
  }

  return { ok: true, expenseId: answer.expenseIds[0], expenseIds: answer.expenseIds };
}

type InboundReceipt = {
  bytes: Buffer;
  contentType: string;
  filename: string;
  extraction: ReceiptExtraction | null;
};

/**
 * OCR each receipt within OCR_BUDGET_MS, several at a time. Returns an
 * extraction per receipt (null when OCR failed or ran out of time) and the
 * indexes of those it didn't reach.
 */
async function readReceipts(
  receipts: InboundReceipt[],
  { provider, model, jobId }: { provider: ReceiptOcrProvider; model?: string; jobId: string },
): Promise<{ extractions: (ReceiptExtraction | null)[]; unread: number[] }> {
  const extractions: (ReceiptExtraction | null)[] = receipts.map(() => null);
  const finished = receipts.map(() => false);
  if (!receipts.length) return { extractions, unread: [] };

  const budget = new AbortController();
  const timer = setTimeout(() => budget.abort(), OCR_BUDGET_MS);
  const sharedOcr = provider === "local" ? createSharedImageOcr(LOCAL_OCR_WORKERS) : null;
  const concurrency = provider === "local" ? LOCAL_OCR_WORKERS : AI_OCR_CONCURRENCY;

  const work = mapWithConcurrency(receipts, concurrency, async (receipt, i) => {
    if (budget.signal.aborted) return;
    try {
      const extraction = await extractReceiptFromBytes(
        receipt.bytes,
        receipt.contentType,
        provider,
        model,
        { ocrImage: sharedOcr?.ocrImage, abortSignal: budget.signal },
      );
      if (budget.signal.aborted) return;
      extractions[i] = extraction;
      finished[i] = true;
    } catch (error) {
      if (budget.signal.aborted) return;
      finished[i] = true;
      console.error(
        "[inbound-email] OCR failed for attachment:",
        error instanceof Error ? error.message : error,
      );
    }
  });
  // Local OCR can't be interrupted mid-image, so stop waiting at the deadline.
  const timedOut = new Promise<void>((resolve) =>
    budget.signal.addEventListener("abort", () => resolve(), { once: true }),
  );
  await Promise.race([work, timedOut]);
  clearTimeout(timer);
  budget.abort();
  await sharedOcr?.close();

  // Copy so reads still in flight can't change the result after this returns.
  const result = [...extractions];
  const unread = finished.flatMap((done, i) => (done ? [] : [i]));
  if (unread.length) {
    console.info(
      JSON.stringify({
        level: "info",
        msg: "inbound-email.ocr_budget_exhausted",
        jobId,
        receipts: receipts.length,
        unread: unread.length,
      }),
    );
  }
  return { extractions: result, unread };
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
      detectedCurrency: expenses.detectedCurrency,
      originalAmountMinor: expenses.originalAmountMinor,
      createdAt: expenses.createdAt,
      submitterName: users.name,
      submitterEmail: users.email,
    })
    .from(expenses)
    .leftJoin(users, eq(expenses.submittedByUserId, users.id))
    .where(and(eq(expenses.companyId, companyId), eq(expenses.status, "pending")))
    .orderBy(desc(expenses.createdAt))
    .limit(limit);

  const sources = await getPaymentSourceSuggestions(
    companyId,
    rows.map((r) => r.id),
  );
  return rows.map((r) => ({
    ...r,
    amountFormatted: formatExpenseAmount(r),
    submitterLabel: r.submitterName || r.submitterEmail || "Unknown",
    paymentSourceLabel: paymentSourceListLabel(sources.get(r.id)),
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
      // Qualified by hand: Drizzle leaves columns unqualified in a one-table select.
      expenseCount: sql<number>`(select count(*)::int from "expenses" e where e."inbound_email_job_id" = "inbound_email_jobs"."id")`,
    })
    .from(inboundEmailJobs)
    .where(and(...conditions))
    .orderBy(desc(inboundEmailJobs.createdAt))
    .limit(limit);
}

/** Expenses an inbound email created, in the order of its attachments. */
export async function listInboundEmailJobExpenses(companyId: string, jobId: string) {
  const db = getDb();
  const rows = await db
    .select({
      id: expenses.id,
      description: expenses.description,
      amountPence: expenses.amountPence,
      detectedCurrency: expenses.detectedCurrency,
      originalAmountMinor: expenses.originalAmountMinor,
      status: expenses.status,
    })
    .from(expenses)
    .where(
      and(eq(expenses.companyId, companyId), eq(expenses.inboundEmailJobId, jobId)),
    )
    .orderBy(expenses.createdAt, expenses.id);
  return rows.map((r) => ({
    ...r,
    amountFormatted: formatExpenseAmount(r),
  }));
}

async function processedJobResult(
  job: typeof inboundEmailJobs.$inferSelect,
): Promise<InboundEmailJobResult> {
  const rows = await listInboundEmailJobExpenses(job.companyId, job.id);
  const expenseIds = rows.length
    ? rows.map((r) => r.id)
    : job.expenseId
      ? [job.expenseId]
      : [];
  return { ok: true, expenseId: job.expenseId ?? expenseIds[0], expenseIds };
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
): Promise<InboundEmailJobResult> {
  const db = getDb();
  const [job] = await db
    .select()
    .from(inboundEmailJobs)
    .where(eq(inboundEmailJobs.id, jobId))
    .limit(1);

  if (!job) return { ok: false, error: "Inbound email job not found" };
  if (job.status === "processed") {
    return processedJobResult(job);
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

  const deadline = inboundRouteDeadline();
  let retried = 0;
  let succeeded = 0;
  let failed = 0;
  for (const job of jobs) {
    if (Date.now() + JOB_WORST_CASE_MS > deadline) break;
    retried++;
    const result = await adminRetryInboundEmailJob(job.id);
    if (result.ok) succeeded++;
    else failed++;
  }

  return { retried, succeeded, failed };
}

/** Tenant: retry a job only if it belongs to the caller's company. */
export async function retryInboundEmailJobForCompany(
  companyId: string,
  jobId: string,
): Promise<InboundEmailJobResult> {
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

  const deadline = inboundRouteDeadline();
  let retried = 0;
  let succeeded = 0;
  let failed = 0;
  for (const job of jobs) {
    if (Date.now() + JOB_WORST_CASE_MS > deadline) break;
    retried++;
    const result = await adminRetryInboundEmailJob(job.id);
    if (result.ok) succeeded++;
    else failed++;
  }

  return { retried, succeeded, failed };
}
