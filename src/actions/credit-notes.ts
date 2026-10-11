"use server";

import { and, eq, sql, sum } from "drizzle-orm";
import { getDb, type Database } from "@/db";
import {
  creditNoteLineItems,
  creditNotes,
  invoices,
  payments,
} from "@/db/schema";
import { writeAudit } from "@/lib/audit";
import { mutate } from "@/lib/mutate";
import { formatGBP, invoiceTotals, poundsToPence } from "@/lib/money";
import { parseVatRate } from "@/lib/vat";
import { allocateCreditNoteNumber } from "@/lib/invoices/allocate";
import {
  invoiceRefundDuePence,
  isInvoiceSettled,
} from "@/lib/invoices/balance";
import { storedStatus } from "@/lib/invoices/status";
import { creditAdjustmentForInvoice } from "@/lib/credit-notes/adjustments";
import { getCreditNoteDetail } from "@/lib/credit-notes/queries";
import { canVoidCreditNote } from "@/lib/credit-notes/status";
import {
  creditNoteRawFromFormData,
  creditNoteRefundRawFromFormData,
  parseCreditNoteInput,
  parseCreditNoteRefundInput,
} from "@/lib/credit-notes/schema";
import { renderCreditNotePdf } from "@/lib/invoices/pdf-v2";
import { sendEmail } from "@/lib/email";
import { resolveClientEmailSender } from "@/lib/email/resolve-client-sender";
import { escapeHtml } from "@/lib/html";
import { getCompanySettings } from "@/lib/settings/queries";
import { FORM_FIELD_ERROR_SUMMARY } from "@/lib/validation/field-errors";
import { getBooksLockedThrough } from "@/lib/period-lock-queries";
import { periodLockError } from "@/lib/period-lock";
import type { ActionResult } from "@/actions/result";

type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];

class CreditNoteError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CreditNoteError";
  }
}

function creditNotePaths(invoiceId: string, creditNoteId?: string): string[] {
  return [
    "/invoices",
    `/invoices/${invoiceId}`,
    "/credit-notes",
    ...(creditNoteId ? [`/credit-notes/${creditNoteId}`] : []),
    "/dashboard",
    "/reports",
  ];
}

async function lockInvoice(tx: Tx, companyId: string, invoiceId: string) {
  await tx.execute(sql`select id from invoices where id = ${invoiceId} for update`);
  const [inv] = await tx
    .select()
    .from(invoices)
    .where(and(eq(invoices.id, invoiceId), eq(invoices.companyId, companyId)))
    .limit(1);
  if (!inv) throw new CreditNoteError("Invoice not found");
  return inv;
}

async function paidTotal(tx: Tx, invoiceId: string): Promise<number> {
  const [row] = await tx
    .select({ total: sum(payments.amountPence).mapWith(Number) })
    .from(payments)
    .where(eq(payments.invoiceId, invoiceId));
  return row?.total ?? 0;
}

/**
 * Keep the invoice's stored status in step with payments and credits:
 * settled → paid, no longer settled → back to sent.
 */
async function syncInvoiceSettlement(
  tx: Tx,
  inv: typeof invoices.$inferSelect,
): Promise<void> {
  const settled = isInvoiceSettled({
    grossPence: inv.grossPence,
    paidPence: await paidTotal(tx, inv.id),
    ...(await creditAdjustmentForInvoice(tx, inv.id)),
  });
  const status = storedStatus(inv.status);
  if (settled && status === "sent") {
    await tx
      .update(invoices)
      .set({ status: "paid", paidAt: new Date() })
      .where(eq(invoices.id, inv.id));
  } else if (!settled && status === "paid") {
    await tx
      .update(invoices)
      .set({ status: "sent", paidAt: null })
      .where(eq(invoices.id, inv.id));
  }
}

export async function createCreditNote(
  invoiceId: string,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = parseCreditNoteInput(creditNoteRawFromFormData(formData));
  if (!parsed.ok) {
    return { ok: false, error: parsed.error, fieldErrors: parsed.fieldErrors };
  }

  return mutate(
    "accounts:write",
    async ({ companyId, localUserId }) => {
      const db = getDb();
      let created: { id: string; number: string; grossPence: number };
      try {
        created = await db.transaction(async (tx) => {
          const inv = await lockInvoice(tx, companyId, invoiceId);
          const status = storedStatus(inv.status);
          if (status !== "sent" && status !== "paid") {
            throw new CreditNoteError(
              "Only sent or paid invoices can be credited. Edit or void a draft instead.",
            );
          }
          if (inv.issueDate && parsed.data.issueDate < inv.issueDate) {
            throw new CreditNoteError("A credit note can't be dated before its invoice");
          }
          const locked = periodLockError(
            await getBooksLockedThrough(companyId, tx),
            parsed.data.issueDate,
          );
          if (locked) throw new CreditNoteError(locked);

          let lineValues;
          try {
            lineValues = parsed.data.lines.map((l, i) => ({
              description: l.description,
              quantity: l.quantity,
              unitPricePence: poundsToPence(l.unitPricePounds),
              // Reverse VAT at the invoice's rates; an invoice without VAT credits without VAT.
              vatRate: inv.vatPence > 0 ? parseVatRate(l.vatRate) : 0,
              discountPercent: l.discountPercent ?? 0,
              position: i,
            }));
          } catch {
            throw new CreditNoteError("Enter a valid unit price on each line item");
          }
          const totals = invoiceTotals(lineValues);
          if (totals.grossPence <= 0) {
            throw new CreditNoteError("The credit note total must be more than £0.00");
          }

          const { creditedPence } = await creditAdjustmentForInvoice(tx, inv.id);
          const creditable = inv.grossPence - creditedPence;
          if (totals.grossPence > creditable) {
            throw new CreditNoteError(
              `The credit note total (${formatGBP(totals.grossPence)}) is more than the ${formatGBP(creditable)} left to credit on this invoice`,
            );
          }

          const number = await allocateCreditNoteNumber(tx, companyId, parsed.data.issueDate);
          const [note] = await tx
            .insert(creditNotes)
            .values({
              companyId,
              invoiceId: inv.id,
              clientId: inv.clientId,
              number,
              issueDate: parsed.data.issueDate,
              reason: parsed.data.reason,
              ...totals,
              createdByUserId: localUserId,
            })
            .returning({ id: creditNotes.id });
          await tx
            .insert(creditNoteLineItems)
            .values(lineValues.map((l) => ({ ...l, creditNoteId: note.id })));

          await syncInvoiceSettlement(tx, inv);
          return { id: note.id, number, grossPence: totals.grossPence };
        });
      } catch (e) {
        if (e instanceof CreditNoteError) return { ok: false, error: e.message };
        throw e;
      }

      await writeAudit({
        companyId,
        actorUserId: localUserId,
        action: "credit_note.create",
        entityType: "credit_note",
        entityId: created.id,
        meta: { invoiceId, number: created.number, grossPence: created.grossPence },
      });
      return { ok: true, id: created.id };
    },
    { paths: creditNotePaths(invoiceId) },
  );
}

export async function voidCreditNote(id: string): Promise<ActionResult> {
  return mutate(
    "accounts:write",
    async ({ companyId, localUserId }) => {
      const db = getDb();
      let invoiceId: string;
      try {
        invoiceId = await db.transaction(async (tx) => {
          const [note] = await tx
            .select()
            .from(creditNotes)
            .where(and(eq(creditNotes.id, id), eq(creditNotes.companyId, companyId)))
            .limit(1);
          if (!note) throw new CreditNoteError("Credit note not found");
          if (!canVoidCreditNote(note)) {
            throw new CreditNoteError(
              note.status === "void"
                ? "This credit note is already void"
                : "A credit note can only be voided before it's sent and before any refund",
            );
          }
          const locked = periodLockError(
            await getBooksLockedThrough(companyId, tx),
            note.issueDate,
          );
          if (locked) throw new CreditNoteError(locked);
          const inv = await lockInvoice(tx, companyId, note.invoiceId);
          await tx
            .update(creditNotes)
            .set({ status: "void", voidedAt: new Date() })
            .where(eq(creditNotes.id, id));
          await syncInvoiceSettlement(tx, inv);
          return inv.id;
        });
      } catch (e) {
        if (e instanceof CreditNoteError) return { ok: false, error: e.message };
        throw e;
      }

      await writeAudit({
        companyId,
        actorUserId: localUserId,
        action: "credit_note.void",
        entityType: "credit_note",
        entityId: id,
        meta: { invoiceId },
      });
      return { ok: true, id };
    },
    { paths: ["/credit-notes", `/credit-notes/${id}`, "/invoices", "/dashboard", "/reports"] },
  );
}

/** Record the money returned to the client for a credit on a paid invoice. */
export async function recordCreditNoteRefund(
  id: string,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = parseCreditNoteRefundInput(creditNoteRefundRawFromFormData(formData));
  if (!parsed.ok) {
    return { ok: false, error: parsed.error, fieldErrors: parsed.fieldErrors };
  }
  let amountPence: number;
  try {
    amountPence = poundsToPence(parsed.data.amountPounds);
  } catch {
    return {
      ok: false,
      error: FORM_FIELD_ERROR_SUMMARY,
      fieldErrors: { amountPounds: "Enter a valid amount" },
    };
  }
  if (amountPence <= 0) {
    return {
      ok: false,
      error: FORM_FIELD_ERROR_SUMMARY,
      fieldErrors: { amountPounds: "Refund amount must be more than £0.00" },
    };
  }

  return mutate(
    "accounts:write",
    async ({ companyId, localUserId }) => {
      const db = getDb();
      let invoiceId: string;
      try {
        invoiceId = await db.transaction(async (tx) => {
          const [note] = await tx
            .select()
            .from(creditNotes)
            .where(and(eq(creditNotes.id, id), eq(creditNotes.companyId, companyId)))
            .limit(1);
          if (!note) throw new CreditNoteError("Credit note not found");
          if (note.status !== "issued") {
            throw new CreditNoteError("You can't refund a void credit note");
          }
          if (note.refundedPence > 0) {
            throw new CreditNoteError("A refund is already recorded on this credit note");
          }
          if (parsed.data.refundedAt < note.issueDate) {
            throw new CreditNoteError("The refund can't be dated before the credit note");
          }
          const locked = periodLockError(
            await getBooksLockedThrough(companyId, tx),
            parsed.data.refundedAt,
          );
          if (locked) throw new CreditNoteError(locked);
          const inv = await lockInvoice(tx, companyId, note.invoiceId);
          const refundDue = invoiceRefundDuePence({
            grossPence: inv.grossPence,
            paidPence: await paidTotal(tx, inv.id),
            ...(await creditAdjustmentForInvoice(tx, inv.id)),
          });
          const maxRefund = Math.min(refundDue, note.grossPence);
          if (maxRefund <= 0) {
            throw new CreditNoteError(
              "Nothing is owed back to the client: the credit reduced an unpaid balance",
            );
          }
          if (amountPence > maxRefund) {
            throw new CreditNoteError(
              `The refund can't be more than the ${formatGBP(maxRefund)} owed to the client`,
            );
          }
          await tx
            .update(creditNotes)
            .set({
              refundedPence: amountPence,
              refundedAt: parsed.data.refundedAt,
              refundReference: parsed.data.reference,
            })
            .where(eq(creditNotes.id, id));
          await syncInvoiceSettlement(tx, inv);
          return inv.id;
        });
      } catch (e) {
        if (e instanceof CreditNoteError) return { ok: false, error: e.message };
        throw e;
      }

      await writeAudit({
        companyId,
        actorUserId: localUserId,
        action: "credit_note.refund",
        entityType: "credit_note",
        entityId: id,
        meta: { invoiceId, amountPence },
      });
      return { ok: true, id };
    },
    { paths: ["/credit-notes", `/credit-notes/${id}`, "/invoices", "/dashboard", "/reports"] },
  );
}

export async function sendCreditNote(id: string): Promise<ActionResult> {
  return mutate(
    "accounts:write",
    async ({ companyId, localUserId }) => {
      const detail = await getCreditNoteDetail(companyId, id);
      if (!detail) return { ok: false, error: "Credit note not found" };
      const { creditNote, invoice, client, lines } = detail;
      if (creditNote.status !== "issued") {
        return { ok: false, error: "You can't send a void credit note" };
      }
      if (!client.email) return { ok: false, error: "Client has no email address" };

      const company = await getCompanySettings(companyId);
      const pdfBytes = await renderCreditNotePdf({
        creditNote,
        invoiceNumber: invoice.number,
        client,
        lines,
        company,
      });
      const sender = await resolveClientEmailSender({
        companyId,
        companyName: company.name,
        actorUserId: localUserId,
      });
      const number = escapeHtml(creditNote.number);
      const invoiceNumber = escapeHtml(invoice.number);
      const amount = escapeHtml(creditNote.grossFormatted);
      await sendEmail({
        to: client.email,
        from: sender.from,
        replyTo: sender.replyTo,
        subject: `Credit note ${creditNote.number} from ${company.name}`,
        html: `<p>Hi,</p><p>Please find attached credit note <strong>${number}</strong> for ${amount} against invoice ${invoiceNumber}.</p><p>Kind regards,<br/>${escapeHtml(company.name)}</p>`,
        text: `Please find attached credit note ${creditNote.number} for ${creditNote.grossFormatted} against invoice ${invoice.number}.`,
        attachments: [
          {
            filename: `${creditNote.number}.pdf`,
            content: Buffer.from(pdfBytes),
            contentType: "application/pdf",
          },
        ],
      });

      const db = getDb();
      await db
        .update(creditNotes)
        .set({ sentAt: creditNote.sentAt ?? new Date() })
        .where(eq(creditNotes.id, id));

      await writeAudit({
        companyId,
        actorUserId: localUserId,
        action: "credit_note.send",
        entityType: "credit_note",
        entityId: id,
        meta: { to: client.email },
      });
      return { ok: true, id };
    },
    { paths: ["/credit-notes", `/credit-notes/${id}`] },
  );
}
