import "server-only";
import { and, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { expenses, inboundEmailJobs } from "@/db/schema";
import { writeAudit } from "@/lib/audit";
import { sendEmail } from "@/lib/email";
import { escapeHtml } from "@/lib/html";
import { formatExpenseAmount } from "@/lib/money";
import {
  paymentQuestionRef,
  type PaymentSource,
} from "@/lib/expenses/payment-source";
import { getPaymentSourceSuggestions } from "@/lib/expenses/payment-source-queries";
import { PRODUCT_NAME } from "@/lib/product";

/*
 * When an emailed claim gives no clue how it was paid, we email the sender
 * once to ask. Their reply comes back to the same expenses mailbox; the
 * "[Claim ABCD1234]" reference in the subject ties it to the claim, and the
 * answer is recorded on that claim's expenses that are still pending review.
 */

type QuestionExpense = {
  description: string;
  amountPence: number;
  detectedCurrency: string | null;
};

export function buildPaymentQuestionEmail(params: {
  jobId: string;
  originalSubject: string | null;
  expenses: QuestionExpense[];
}): { subject: string; html: string; text: string } {
  const ref = paymentQuestionRef(params.jobId);
  const about = params.originalSubject?.trim()
    ? `: ${params.originalSubject.trim().slice(0, 120)}`
    : "";
  const subject = `How did you pay? [Claim ${ref}]${about}`;
  const items = params.expenses.map(
    (e) => `${e.description} (${formatExpenseAmount(e.amountPence, e.detectedCurrency)})`,
  );
  const lead =
    params.expenses.length === 1
      ? "Thanks for sending in this expense. Did you pay for it yourself, or with a company card or account?"
      : "Thanks for sending in these expenses. Did you pay for them yourself, or with a company card or account?";
  const how =
    "Reply to this email with #personal if you paid and need paying back, or #company if the company paid.";
  const next =
    "Next time, add #personal or #company to the subject of your claim and we won't need to ask.";

  const text = [lead, "", ...items.map((i) => `- ${i}`), "", how, "", next].join("\n");
  const html = `<div style="font-family:system-ui,sans-serif;max-width:560px;margin:0 auto;color:#1a1a1a;line-height:1.5">
  <p>${escapeHtml(lead)}</p>
  <ul>${items.map((i) => `<li>${escapeHtml(i)}</li>`).join("")}</ul>
  <p>${escapeHtml(how)}</p>
  <p style="color:#4a4a4a">${escapeHtml(next)}</p>
  <p style="margin-top:24px;font-size:12px;color:#4a4a4a">${escapeHtml(PRODUCT_NAME)}</p>
</div>`;
  return { subject, html, text };
}

/**
 * Ask the sender how they paid when none of the claim's expenses has a
 * suggestion or conflicting evidence. Sends at most once per claim, and
 * never fails the claim: a send error is logged and the reviewer decides.
 */
export async function maybeAskHowPaid(params: {
  job: Pick<typeof inboundEmailJobs.$inferSelect, "id" | "companyId" | "toEmail" | "subject">;
  senderEmail: string;
  expenseIds: string[];
}): Promise<boolean> {
  const { job, senderEmail, expenseIds } = params;
  if (expenseIds.length === 0) return false;

  const suggestions = await getPaymentSourceSuggestions(job.companyId, expenseIds);
  const unknown = expenseIds.some((id) => {
    const s = suggestions.get(id);
    return !s || (s.evidence.length === 0 && !s.conflict);
  });
  if (!unknown) return false;

  const db = getDb();
  // Claim the send first so a concurrent run can't ask twice.
  const [claimed] = await db
    .update(inboundEmailJobs)
    .set({ paymentQuestionSentAt: new Date() })
    .where(and(eq(inboundEmailJobs.id, job.id), isNull(inboundEmailJobs.paymentQuestionSentAt)))
    .returning({ id: inboundEmailJobs.id });
  if (!claimed) return false;

  const rows = await db
    .select({
      description: expenses.description,
      amountPence: expenses.amountPence,
      detectedCurrency: expenses.detectedCurrency,
    })
    .from(expenses)
    .where(and(eq(expenses.companyId, job.companyId), inArray(expenses.id, expenseIds)))
    .orderBy(expenses.createdAt);

  const message = buildPaymentQuestionEmail({
    jobId: job.id,
    originalSubject: job.subject,
    expenses: rows,
  });
  try {
    await sendEmail({
      to: senderEmail,
      replyTo: job.toEmail,
      subject: message.subject,
      html: message.html,
      text: message.text,
    });
    return true;
  } catch (err) {
    // Unclaim so the reviewer isn't told we asked when we didn't.
    await db
      .update(inboundEmailJobs)
      .set({ paymentQuestionSentAt: null })
      .where(eq(inboundEmailJobs.id, job.id));
    console.error(
      JSON.stringify({
        level: "error",
        msg: "inbound-email.payment_question_failed",
        jobId: job.id,
        error: err instanceof Error ? err.message : String(err),
      }),
    );
    return false;
  }
}

/**
 * The claim a reply answers: a job sent to the same mailbox that we asked
 * about, whose id starts with the reference in the reply's subject.
 */
export async function findQuestionedJob(params: {
  companyId: string;
  toEmail: string;
  ref: string;
  excludeJobId: string;
}): Promise<{ id: string } | null> {
  const [row] = await getDb()
    .select({ id: inboundEmailJobs.id })
    .from(inboundEmailJobs)
    .where(
      and(
        eq(inboundEmailJobs.companyId, params.companyId),
        eq(inboundEmailJobs.toEmail, params.toEmail),
        isNotNull(inboundEmailJobs.paymentQuestionSentAt),
        sql`replace(${inboundEmailJobs.id}::text, '-', '') like ${`${params.ref.toLowerCase()}%`}`,
        sql`${inboundEmailJobs.id} <> ${params.excludeJobId}`,
      ),
    )
    .limit(1);
  return row ?? null;
}

/**
 * Record the sender's answer on the claim's expenses that are still pending.
 * Returns the ids updated; approved expenses keep what the reviewer chose.
 */
export async function applyPaymentAnswer(params: {
  companyId: string;
  answeredJobId: string;
  source: PaymentSource;
  actorUserId: string;
}): Promise<string[]> {
  const { companyId, answeredJobId, source, actorUserId } = params;
  const updated = await getDb()
    .update(expenses)
    .set({ statedPaymentSource: source, statedPaymentSourceVia: "reply" })
    .where(
      and(
        eq(expenses.companyId, companyId),
        eq(expenses.inboundEmailJobId, answeredJobId),
        eq(expenses.status, "pending"),
      ),
    )
    .returning({ id: expenses.id });

  for (const { id } of updated) {
    await writeAudit({
      companyId,
      actorUserId,
      action: "expense.payment_source_answer",
      entityType: "expense",
      entityId: id,
      meta: { source, answeredJobId },
    });
  }
  return updated.map((r) => r.id);
}
