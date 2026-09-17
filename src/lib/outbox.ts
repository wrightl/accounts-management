import "server-only";
import { and, eq, isNull, lt, or, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { clients, companies, invoices, sendJobs } from "@/db/schema";
import { sendEmail } from "@/lib/email";
import { escapeHtml } from "@/lib/html";
import { formatGBP } from "@/lib/money";
import { getStorage } from "@/lib/storage";
import { getInvoiceDetail } from "@/lib/invoices/queries";
import { getCompanySettings } from "@/lib/settings/queries";
import { renderInvoicePdfV2 } from "@/lib/invoices/pdf-v2";
import { storedStatus, todayIsoDate } from "@/lib/invoices/status";

const MAX_ATTEMPTS = 8;
const REMIND_COOLDOWN_DAYS = 7;

export type SendJobKind = "invoice_send" | "invoice_remind";

export async function enqueueSendJob(
  kind: SendJobKind,
  companyId: string,
  invoiceId: string,
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
    .values({ companyId, kind, invoiceId, status: "pending" })
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

  await db
    .update(sendJobs)
    .set({ attempts: job.attempts + 1 })
    .where(eq(sendJobs.id, jobId));

  try {
    if (job.kind === "invoice_send") {
      await deliverInvoice(job.invoiceId);
    } else {
      await deliverReminder(job.invoiceId);
    }
    await db
      .update(sendJobs)
      .set({ status: "sent", sentAt: new Date(), lastError: null })
      .where(eq(sendJobs.id, jobId));
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const attempts = job.attempts + 1;
    await db
      .update(sendJobs)
      .set({
        status: attempts >= MAX_ATTEMPTS ? "failed" : "pending",
        lastError: message,
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
      or(
        eq(sendJobs.status, "pending"),
        and(eq(sendJobs.status, "failed"), lt(sendJobs.attempts, MAX_ATTEMPTS)),
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
 * Queue a reminder for each sent invoice whose due date has passed, unless a
 * reminder is already pending or was sent within the cooldown window.
 */
export async function enqueueOverdueReminders(): Promise<number> {
  const db = getDb();
  const today = todayIsoDate();
  const overdue = await db
    .select({
      id: invoices.id,
      companyId: invoices.companyId,
      status: invoices.status,
      dueDate: invoices.dueDate,
    })
    .from(invoices)
    .innerJoin(companies, eq(companies.id, invoices.companyId))
    .where(
      and(
        eq(invoices.status, "sent"),
        lt(invoices.dueDate, today),
        isNull(companies.suspendedAt),
      ),
    );

  const cooldown = new Date(Date.now() - REMIND_COOLDOWN_DAYS * 24 * 60 * 60 * 1000);
  let queued = 0;

  for (const inv of overdue) {
    if (storedStatus(inv.status) !== "sent") continue;
    const recent = await db
      .select({ id: sendJobs.id, status: sendJobs.status })
      .from(sendJobs)
      .where(
        and(
          eq(sendJobs.kind, "invoice_remind"),
          eq(sendJobs.invoiceId, inv.id),
          or(
            eq(sendJobs.status, "pending"),
            and(eq(sendJobs.status, "failed"), lt(sendJobs.attempts, MAX_ATTEMPTS)),
            and(eq(sendJobs.status, "sent"), sql`${sendJobs.sentAt} > ${cooldown}`),
          ),
        ),
      )
      .limit(1);
    if (recent[0]) continue;
    await enqueueSendJob("invoice_remind", inv.companyId, inv.id);
    queued++;
  }

  return queued;
}

async function deliverInvoice(invoiceId: string) {
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

  await sendEmail({
    to: detail.client.email,
    subject: `Invoice ${detail.invoice.number} from ${company.name}`,
    html: `<p>Hi,</p><p>Please find attached invoice <strong>${invoiceNumber}</strong> for ${amount}.</p><p>Kind regards,<br/>${companyName}</p>`,
    text: `Please find attached invoice ${detail.invoice.number} for ${detail.invoice.grossFormatted}.`,
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

async function deliverReminder(invoiceId: string) {
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
  if (storedStatus(row.invoice.status) !== "sent") {
    throw new Error("Invoice is not outstanding");
  }
  if (!row.clientEmail) throw new Error("Client has no email address");

  const company = await getCompanySettings(row.invoice.companyId);
  const name = escapeHtml(row.clientName);
  const number = escapeHtml(row.invoice.number);
  const amount = escapeHtml(formatGBP(row.invoice.grossPence));
  const due = escapeHtml(row.invoice.dueDate ?? "");

  await sendEmail({
    to: row.clientEmail,
    subject: `Reminder: invoice ${row.invoice.number} is overdue`,
    html: `<p>Hi ${name},</p><p>Invoice <strong>${number}</strong> for ${amount} was due on ${due} and remains unpaid.</p><p>Kind regards,<br/>${escapeHtml(company.name)}</p>`,
    text: `Invoice ${row.invoice.number} for ${formatGBP(row.invoice.grossPence)} is overdue (due ${row.invoice.dueDate}).`,
  });
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
