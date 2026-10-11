import "server-only";
import { and, eq, inArray, isNotNull, isNull, lt, or, sql, sum } from "drizzle-orm";
import { getDb } from "@/db";
import { clients, companies, invoices, payments, sendJobs } from "@/db/schema";
import { sendEmail } from "@/lib/email";
import { resolveClientEmailSender } from "@/lib/email/resolve-client-sender";
import { escapeHtml } from "@/lib/html";
import { formatGBP } from "@/lib/money";
import { getStorage } from "@/lib/storage";
import { getInvoiceDetail } from "@/lib/invoices/queries";
import { getCompanySettings } from "@/lib/settings/queries";
import { renderInvoicePdfV2 } from "@/lib/invoices/pdf-v2";
import { storedStatus, todayIsoDate } from "@/lib/invoices/status";
import { onlinePaymentsStatus, publicInvoiceUrl } from "@/lib/payments/online-status";
import { invoiceAmountDuePence } from "@/lib/invoices/balance";
import { creditAdjustmentsByInvoice } from "@/lib/credit-notes/adjustments";
import { formatIsoDateUk } from "@/lib/dates";
import { latePaymentCharge } from "@/lib/late-payment";
import { dueReminderStep } from "@/lib/reminders/schedule";

/** "View and pay online" when the company takes card payments, else "View online". */
function invoiceLink(
  token: string,
  company: { stripeConnectAccountId: string | null; stripeConnectChargesEnabled: boolean },
): { html: string; text: string } {
  const url = publicInvoiceUrl(token);
  const label =
    onlinePaymentsStatus(company) === "enabled" ? "View and pay online" : "View online";
  return {
    html: `<p><a href="${escapeHtml(url)}">${label}</a></p>`,
    text: `${label}: ${url}`,
  };
}

const MAX_ATTEMPTS = 8;
/** How long a worker owns a claimed job before another may retry it. */
const JOB_LEASE_MS = 10 * 60 * 1000;

export type SendJobKind = "invoice_send" | "invoice_remind";

export async function enqueueSendJob(
  kind: SendJobKind,
  companyId: string,
  invoiceId: string,
  actorUserId?: string | null,
  reminderStep?: number | null,
): Promise<string> {
  const db = getDb();
  const pending = await db
    .select({ id: sendJobs.id })
    .from(sendJobs)
    .where(
      and(
        eq(sendJobs.kind, kind),
        eq(sendJobs.invoiceId, invoiceId),
        eq(sendJobs.status, "pending"),
      ),
    )
    .limit(1);
  if (pending[0]) return pending[0].id;

  const [created] = await db
    .insert(sendJobs)
    .values({
      companyId,
      kind,
      invoiceId,
      actorUserId: actorUserId ?? null,
      status: "pending",
      reminderStep: reminderStep ?? null,
    })
    .returning({ id: sendJobs.id });
  return created.id;
}

export async function processSendJob(jobId: string): Promise<{ ok: boolean; error?: string }> {
  const db = getDb();
  const [job] = await db.select().from(sendJobs).where(eq(sendJobs.id, jobId)).limit(1);
  if (!job) return { ok: false, error: "Send job not found" };
  if (job.status === "sent") return { ok: true };

  const [company] = await db
    .select({ suspendedAt: companies.suspendedAt })
    .from(companies)
    .where(eq(companies.id, job.companyId))
    .limit(1);
  if (company?.suspendedAt) {
    await db
      .update(sendJobs)
      .set({ status: "failed", lastError: "Company is suspended" })
      .where(eq(sendJobs.id, jobId));
    return { ok: false, error: "Company is suspended" };
  }

  if (job.attempts >= MAX_ATTEMPTS) {
    await db
      .update(sendJobs)
      .set({ status: "failed", lastError: job.lastError ?? "Max attempts reached" })
      .where(eq(sendJobs.id, jobId));
    return { ok: false, error: "Max attempts reached" };
  }

  // Atomic claim: exactly one worker (inline send, cron drain, platform retry)
  // wins the lease, so a client is never emailed twice for one job.
  const now = new Date();
  const [claimed] = await db
    .update(sendJobs)
    .set({
      attempts: sql`${sendJobs.attempts} + 1`,
      lockedUntil: new Date(now.getTime() + JOB_LEASE_MS),
    })
    .where(
      and(
        eq(sendJobs.id, jobId),
        inArray(sendJobs.status, ["pending", "failed"]),
        lt(sendJobs.attempts, MAX_ATTEMPTS),
        or(isNull(sendJobs.lockedUntil), lt(sendJobs.lockedUntil, now)),
      ),
    )
    .returning({ attempts: sendJobs.attempts });
  if (!claimed) {
    return { ok: false, error: "Send job is already being processed" };
  }

  try {
    if (job.kind === "invoice_send") {
      await deliverInvoice(job.invoiceId, job.actorUserId);
      await db
        .update(sendJobs)
        .set({ status: "sent", sentAt: new Date(), lastError: null, lockedUntil: null })
        .where(eq(sendJobs.id, jobId));
    } else {
      const delivered = await deliverReminder(job.invoiceId, job.actorUserId, job.reminderStep);
      // Paid or cancelled since it was queued: nothing to chase, so close the job.
      await db
        .update(sendJobs)
        .set({
          status: "sent",
          sentAt: new Date(),
          lastError: delivered ? null : "Skipped: invoice no longer outstanding",
          lockedUntil: null,
        })
        .where(eq(sendJobs.id, jobId));
    }
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await db
      .update(sendJobs)
      .set({
        status: claimed.attempts >= MAX_ATTEMPTS ? "failed" : "pending",
        lastError: message,
        lockedUntil: null,
      })
      .where(eq(sendJobs.id, jobId));
    return { ok: false, error: message };
  }
}

export async function drainSendJobs(limit = 20): Promise<{ processed: number; sent: number; failed: number }> {
  const db = getDb();
  const jobs = await db
    .select({ id: sendJobs.id })
    .from(sendJobs)
    .where(
      and(
        or(
          eq(sendJobs.status, "pending"),
          and(eq(sendJobs.status, "failed"), lt(sendJobs.attempts, MAX_ATTEMPTS)),
        ),
        or(isNull(sendJobs.lockedUntil), lt(sendJobs.lockedUntil, new Date())),
      ),
    )
    .orderBy(sendJobs.createdAt)
    .limit(limit);

  let sent = 0;
  let failed = 0;
  for (const job of jobs) {
    const result = await processSendJob(job.id);
    if (result.ok) sent++;
    else failed++;
  }
  return { processed: jobs.length, sent, failed };
}

/**
 * Queue payment reminders on each company's schedule (days before or after the
 * due date). Each step is sent at most once per invoice, and only the latest
 * step reached is queued, so a missed run never sends a burst of reminders.
 */
export async function enqueueOverdueReminders(): Promise<number> {
  const db = getDb();
  const today = todayIsoDate();
  const open = await db
    .select({
      id: invoices.id,
      companyId: invoices.companyId,
      status: invoices.status,
      issueDate: invoices.issueDate,
      dueDate: invoices.dueDate,
      grossPence: invoices.grossPence,
      schedule: companies.reminderScheduleDays,
    })
    .from(invoices)
    .innerJoin(companies, eq(companies.id, invoices.companyId))
    .innerJoin(clients, eq(clients.id, invoices.clientId))
    .where(
      and(
        eq(invoices.status, "sent"),
        isNotNull(invoices.dueDate),
        isNotNull(clients.email),
        eq(companies.remindersEnabled, true),
        isNull(companies.suspendedAt),
      ),
    );

  const due = open.flatMap((inv) => {
    const step = dueReminderStep({
      schedule: inv.schedule,
      dueDate: inv.dueDate!,
      issueDate: inv.issueDate,
      today,
    });
    return step == null ? [] : [{ ...inv, step }];
  });
  if (due.length === 0) return 0;

  const ids = due.map((i) => i.id);
  const [paidRows, credits, existing] = await Promise.all([
    db
      .select({ invoiceId: payments.invoiceId, total: sum(payments.amountPence).mapWith(Number) })
      .from(payments)
      .where(inArray(payments.invoiceId, ids))
      .groupBy(payments.invoiceId),
    creditAdjustmentsByInvoice(db, ids),
    db
      .select({ invoiceId: sendJobs.invoiceId, step: sendJobs.reminderStep })
      .from(sendJobs)
      .where(
        and(
          eq(sendJobs.kind, "invoice_remind"),
          inArray(sendJobs.invoiceId, ids),
          isNotNull(sendJobs.reminderStep),
        ),
      ),
  ]);
  const paid = new Map(paidRows.map((r) => [r.invoiceId, r.total ?? 0]));
  const done = new Set(existing.map((r) => `${r.invoiceId}:${r.step}`));

  let queued = 0;
  for (const inv of due) {
    if (done.has(`${inv.id}:${inv.step}`)) continue;
    const balance = invoiceAmountDuePence({
      grossPence: inv.grossPence,
      paidPence: paid.get(inv.id) ?? 0,
      ...credits.get(inv.id),
    });
    if (balance <= 0) continue;
    await enqueueSendJob("invoice_remind", inv.companyId, inv.id, null, inv.step);
    queued++;
  }

  return queued;
}

async function deliverInvoice(invoiceId: string, actorUserId?: string | null) {
  const db = getDb();
  const [invRow] = await db
    .select({ companyId: invoices.companyId })
    .from(invoices)
    .where(eq(invoices.id, invoiceId))
    .limit(1);
  if (!invRow) throw new Error("Invoice not found");

  const detail = await getInvoiceDetail(invRow.companyId, invoiceId);
  if (!detail) throw new Error("Invoice not found");
  const stored = storedStatus(detail.invoice.status);
  if (stored !== "draft" && stored !== "sent") {
    throw new Error(`Cannot send an invoice in status "${detail.invoice.status}"`);
  }
  if (!detail.client.email) throw new Error("Client has no email address");

  const company = await getCompanySettings(invRow.companyId);
  const pdfBytes = await loadOrRenderPdf(invoiceId, detail, company);
  const filename = `${detail.invoice.number}.pdf`;
  const companyName = escapeHtml(company.name);
  const invoiceNumber = escapeHtml(detail.invoice.number);
  const amount = escapeHtml(detail.invoice.grossFormatted);
  const link = invoiceLink(detail.invoice.publicToken, company);
  const sender = await resolveClientEmailSender({
    companyId: invRow.companyId,
    companyName: company.name,
    actorUserId,
  });

  await sendEmail({
    to: detail.client.email,
    from: sender.from,
    replyTo: sender.replyTo,
    subject: `Invoice ${detail.invoice.number} from ${company.name}`,
    html: `<p>Hi,</p><p>Please find attached invoice <strong>${invoiceNumber}</strong> for ${amount}.</p>${link.html}<p>Kind regards,<br/>${companyName}</p>`,
    text: `Please find attached invoice ${detail.invoice.number} for ${detail.invoice.grossFormatted}.\n\n${link.text}`,
    attachments: [
      {
        filename,
        content: Buffer.from(pdfBytes),
        contentType: "application/pdf",
      },
    ],
  });

  await db
    .update(invoices)
    .set({
      status: "sent",
      sentAt: detail.invoice.sentAt ?? new Date(),
      pdfBlobPath: detail.invoice.pdfBlobPath,
    })
    .where(eq(invoices.id, invoiceId));
}

/**
 * Email a payment reminder. Wording follows the schedule step: a friendly
 * nudge before the due date, then overdue reminders that can include
 * statutory late payment charges. Returns false when there is nothing to
 * chase any more.
 */
async function deliverReminder(
  invoiceId: string,
  actorUserId?: string | null,
  step?: number | null,
): Promise<boolean> {
  const db = getDb();
  const [row] = await db
    .select({
      invoice: invoices,
      clientEmail: clients.email,
      clientName: clients.name,
    })
    .from(invoices)
    .innerJoin(clients, eq(invoices.clientId, clients.id))
    .where(eq(invoices.id, invoiceId))
    .limit(1);
  if (!row) throw new Error("Invoice not found");
  if (storedStatus(row.invoice.status) !== "sent") return false;
  if (!row.clientEmail) throw new Error("Client has no email address");

  const company = await getCompanySettings(row.invoice.companyId);
  const detail = await getInvoiceDetail(row.invoice.companyId, invoiceId);
  const amountDuePence = detail?.balancePence ?? row.invoice.grossPence;
  if (amountDuePence <= 0) return false;
  const link = invoiceLink(row.invoice.publicToken, company);
  const name = escapeHtml(row.clientName);
  const number = escapeHtml(row.invoice.number);
  const amount = escapeHtml(formatGBP(amountDuePence));
  const dueDate = row.invoice.dueDate ?? todayIsoDate();
  const due = escapeHtml(formatIsoDateUk(dueDate) ?? dueDate);
  const sender = await resolveClientEmailSender({
    companyId: row.invoice.companyId,
    companyName: company.name,
    actorUserId,
  });

  const beforeDue = step != null && step <= 0;
  let subject: string;
  let lead: string;
  if (beforeDue) {
    subject =
      step === 0
        ? `Invoice ${row.invoice.number} is due today`
        : `Invoice ${row.invoice.number} is due on ${formatIsoDateUk(dueDate)}`;
    lead = `Just a reminder that invoice ${row.invoice.number} for ${formatGBP(amountDuePence)} is due ${step === 0 ? "today" : `on ${formatIsoDateUk(dueDate)}`}.`;
  } else {
    subject = `Reminder: invoice ${row.invoice.number} is overdue`;
    lead = `Invoice ${row.invoice.number} was due on ${formatIsoDateUk(dueDate)} and ${formatGBP(amountDuePence)} remains unpaid.`;
  }
  const leadHtml = beforeDue
    ? `Just a reminder that invoice <strong>${number}</strong> for ${amount} is due ${step === 0 ? "today" : `on ${due}`}.`
    : `Invoice <strong>${number}</strong> was due on ${due} and ${amount} remains unpaid.`;

  const charge =
    !beforeDue && company.latePaymentCharges
      ? latePaymentCharge({ amountDuePence, dueDate, asOf: todayIsoDate() })
      : null;
  const chargeText = charge
    ? `Under the Late Payment of Commercial Debts (Interest) Act 1998 we're entitled to statutory interest at ${charge.ratePercent}% a year (Bank of England base rate of ${charge.basePercent}% plus 8%) and fixed compensation of ${formatGBP(charge.compensationPence)}. Interest to date is ${formatGBP(charge.interestPence)} and is adding up at ${formatGBP(charge.dailyInterestPence)} a day until the invoice is paid.`
    : null;

  await sendEmail({
    to: row.clientEmail,
    from: sender.from,
    replyTo: sender.replyTo,
    subject,
    html: `<p>Hi ${name},</p><p>${leadHtml}</p>${chargeText ? `<p>${escapeHtml(chargeText)}</p>` : ""}${link.html}<p>Kind regards,<br/>${escapeHtml(company.name)}</p>`,
    text: `${lead}${chargeText ? `\n\n${chargeText}` : ""}\n\n${link.text}`,
  });
  return true;
}

async function loadOrRenderPdf(
  invoiceId: string,
  detail: NonNullable<Awaited<ReturnType<typeof getInvoiceDetail>>>,
  company: Awaited<ReturnType<typeof getCompanySettings>>,
): Promise<Uint8Array> {
  if (detail.invoice.pdfBlobPath?.includes(".v2.")) {
    try {
      const stored = await getStorage().get(detail.invoice.pdfBlobPath);
      return new Uint8Array(stored.body);
    } catch {
      // Fall through to render.
    }
  }

  const pdfBytes = await renderInvoicePdfV2({
    invoice: detail.invoice,
    client: detail.client,
    lines: detail.lines,
    company,
  });
  const stored = await getStorage().put(
    `invoices/${invoiceId}.v2.pdf`,
    Buffer.from(pdfBytes),
    "application/pdf",
  );
  const db = getDb();
  await db
    .update(invoices)
    .set({ pdfBlobPath: stored.path })
    .where(eq(invoices.id, invoiceId));
  detail.invoice.pdfBlobPath = stored.path;
  return pdfBytes;
}
