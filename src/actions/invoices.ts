"use server";

import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import {
  invoiceLineItems,
  invoices,
} from "@/db/schema";
import { writeAudit } from "@/lib/audit";
import { mutate } from "@/lib/mutate";
import { invoiceTotals } from "@/lib/money";
import {
  canEditInvoice,
  canTransition,
  defaultDueDate,
  storedStatus,
  type InvoiceStatus,
} from "@/lib/invoices/status";
import { getInvoiceDetail } from "@/lib/invoices/queries";
import {
  buildLineValues,
  createDraftInvoiceRecord,
  rebilledExpenseIds,
} from "@/lib/invoices/create";
import {
  invoiceRawFromFormData,
  parseInvoiceInput,
} from "@/lib/invoices/schema";
import { enqueueSendJob, processSendJob } from "@/lib/outbox";
import { creditAdjustmentForInvoice } from "@/lib/credit-notes/adjustments";
import { periodLockError } from "@/lib/period-lock";
import { checkPeriodOpen } from "@/lib/period-lock-queries";
import { getOrCreateCompanySettings } from "@/lib/settings/queries";
import { checkRebillExpenses } from "@/lib/profitability/queries";
import type { ActionResult } from "@/actions/result";

export async function createInvoice(formData: FormData): Promise<ActionResult> {
  const parsed = parseInvoiceInput(invoiceRawFromFormData(formData));
  if (!parsed.ok) {
    return {
      ok: false,
      error: parsed.error,
      fieldErrors: parsed.fieldErrors,
    };
  }

  return mutate(
    "accounts:write",
    (ctx) => createDraftInvoiceRecord(ctx, parsed.data),
    {
      audit: { action: "invoice.create", entityType: "invoice" },
      paths: ["/invoices", "/dashboard"],
    },
  );
}

export async function updateInvoice(
  id: string,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = parseInvoiceInput(invoiceRawFromFormData(formData));
  if (!parsed.ok) {
    return {
      ok: false,
      error: parsed.error,
      fieldErrors: parsed.fieldErrors,
    };
  }

  const issueDate = parsed.data.issueDate;
  const dueDate =
    parsed.data.dueDate && parsed.data.dueDate.length > 0
      ? parsed.data.dueDate
      : defaultDueDate(issueDate);

  return mutate(
    "accounts:write",
    async ({ companyId }) => {
      const company = await getOrCreateCompanySettings(companyId);
      let lineValues;
      try {
        lineValues = buildLineValues(parsed.data.lines, company);
      } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : "Invalid amount" };
      }
      const totals = invoiceTotals(lineValues);

      const db = getDb();
      const [existing] = await db
        .select()
        .from(invoices)
        .where(and(eq(invoices.id, id), eq(invoices.companyId, companyId)))
        .limit(1);
      if (!existing) return { ok: false, error: "Invoice not found" };
      if (!canEditInvoice(existing.status as InvoiceStatus)) {
        return { ok: false, error: "Only draft invoices can be edited" };
      }
      const locked = periodLockError(company.booksLockedThrough, existing.issueDate, issueDate);
      if (locked) return { ok: false, error: locked };
      const rebillError = await checkRebillExpenses(
        companyId,
        parsed.data.clientId,
        rebilledExpenseIds(lineValues),
        id,
      );
      if (rebillError) return { ok: false, error: rebillError };

      await db.transaction(async (tx) => {
        await tx
          .update(invoices)
          .set({
            clientId: parsed.data.clientId,
            issueDate,
            dueDate,
            notes: parsed.data.notes,
            netPence: totals.netPence,
            vatPence: totals.vatPence,
            grossPence: totals.grossPence,
            pdfBlobPath: null,
          })
          .where(and(eq(invoices.id, id), eq(invoices.companyId, companyId)));

        await tx.delete(invoiceLineItems).where(eq(invoiceLineItems.invoiceId, id));
        await tx.insert(invoiceLineItems).values(
          lineValues.map((l) => ({ ...l, invoiceId: id })),
        );
      });

      return { ok: true, id };
    },
    {
      audit: { action: "invoice.update", entityType: "invoice", entityId: id },
      paths: ["/invoices", `/invoices/${id}`, "/dashboard"],
    },
  );
}

const CREDITED_INVOICE_VOID_ERROR =
  "This invoice has credit notes, so it can't be voided. Raise a credit note for the rest instead.";

export async function voidInvoice(id: string): Promise<ActionResult> {
  return mutate(
    "accounts:write",
    async ({ companyId }) => {
      const db = getDb();
      const [existing] = await db
        .select()
        .from(invoices)
        .where(and(eq(invoices.id, id), eq(invoices.companyId, companyId)))
        .limit(1);
      if (!existing) return { ok: false, error: "Invoice not found" };

      const from = storedStatus(existing.status);
      if (!canTransition(from, "void")) {
        return { ok: false, error: `Cannot void an invoice in status "${from}"` };
      }
      if ((await creditAdjustmentForInvoice(db, id)).creditedPence > 0) {
        return { ok: false, error: CREDITED_INVOICE_VOID_ERROR };
      }
      const locked = await checkPeriodOpen(companyId, existing.issueDate);
      if (locked) return { ok: false, error: locked };

      await db
        .update(invoices)
        .set({ status: "void" })
        .where(and(eq(invoices.id, id), eq(invoices.companyId, companyId)));

      return { ok: true, id };
    },
    {
      audit: { action: "invoice.void", entityType: "invoice", entityId: id },
      paths: ["/invoices", `/invoices/${id}`, "/dashboard"],
    },
  );
}

export async function sendInvoice(
  id: string,
  options: { confirmedImported?: boolean } = {},
): Promise<ActionResult> {
  return mutate(
    "accounts:write",
    async ({ companyId, localUserId }) => {
      const detail = await getInvoiceDetail(companyId, id);
      if (!detail) return { ok: false, error: "Invoice not found" };

      const from = storedStatus(detail.invoice.status);
      if (from !== "draft" && from !== "sent") {
        return { ok: false, error: `Cannot send an invoice in status "${from}"` };
      }
      if (!detail.client.email) {
        return { ok: false, error: "Client has no email address" };
      }
      if (detail.invoice.source === "import" && !options.confirmedImported) {
        return { ok: false, error: "Confirm before emailing an imported invoice" };
      }
      if (from === "draft") {
        const locked = await checkPeriodOpen(companyId, detail.invoice.issueDate);
        if (locked) return { ok: false, error: locked };
      }

      const jobId = await enqueueSendJob("invoice_send", companyId, id, localUserId);
      const delivered = await processSendJob(jobId);
      if (!delivered.ok) {
        return {
          ok: false,
          error: delivered.error ?? "Failed to send invoice. It will retry automatically.",
        };
      }

      await writeAudit({
        companyId,
        actorUserId: localUserId,
        action: "invoice.send",
        entityType: "invoice",
        entityId: id,
        meta: { to: detail.client.email, jobId },
      });

      return { ok: true, id };
    },
    { paths: ["/invoices", `/invoices/${id}`, "/dashboard"] },
  );
}

const updateStatusSchema = z.object({
  status: z.enum(["draft", "sent", "paid", "void"]),
});

export async function updateInvoiceStatus(
  id: string,
  status: string,
): Promise<ActionResult> {
  const parsed = updateStatusSchema.safeParse({ status });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid status" };
  }

  return mutate(
    "accounts:write",
    async ({ companyId, localUserId }) => {
      const detail = await getInvoiceDetail(companyId, id);
      if (!detail) return { ok: false, error: "Invoice not found" };

      const current = detail.invoice.status as InvoiceStatus;
      const target = parsed.data.status;

      if (!canTransition(current, target)) {
        return {
          ok: false,
          error: `Cannot change status from ${current} to ${target}`,
        };
      }

      const db = getDb();
      const [existing] = await db
        .select()
        .from(invoices)
        .where(and(eq(invoices.id, id), eq(invoices.companyId, companyId)))
        .limit(1);
      if (!existing) return { ok: false, error: "Invoice not found" };
      if (
        target === "void" &&
        (await creditAdjustmentForInvoice(db, id)).creditedPence > 0
      ) {
        return { ok: false, error: CREDITED_INVOICE_VOID_ERROR };
      }
      // Sending or voiding moves the invoice into or out of the books.
      if (target === "void" || (target === "sent" && storedStatus(current) === "draft")) {
        const locked = await checkPeriodOpen(companyId, existing.issueDate);
        if (locked) return { ok: false, error: locked };
      }

      const now = new Date();
      await db
        .update(invoices)
        .set({
          status: target,
          sentAt: target === "sent" ? (existing.sentAt ?? now) : existing.sentAt,
          paidAt: target === "paid" ? now : existing.paidAt,
        })
        .where(and(eq(invoices.id, id), eq(invoices.companyId, companyId)));

      await writeAudit({
        companyId,
        actorUserId: localUserId,
        action: "invoice.status",
        entityType: "invoice",
        entityId: id,
        meta: { from: storedStatus(current), to: target },
      });

      return { ok: true, id };
    },
    { paths: ["/invoices", `/invoices/${id}`, "/dashboard"] },
  );
}
