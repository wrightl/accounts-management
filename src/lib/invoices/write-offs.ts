import "server-only";
import { and, asc, eq, sql, sum } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { invoices, invoiceWriteOffs, payments } from "@/db/schema";
import type { ActionResult } from "@/actions/result";
import { writeAudit } from "@/lib/audit";
import { creditAdjustmentForInvoice } from "@/lib/credit-notes/adjustments";
import type { Tx } from "@/lib/invoices/allocate";
import { invoiceBalancePence, isInvoiceSettled } from "@/lib/invoices/balance";
import { storedStatus } from "@/lib/invoices/status";
import { formatGBP, poundsToPence } from "@/lib/money";
import { checkPeriodOpen } from "@/lib/period-lock-queries";
import { FORM_FIELD_ERROR_SUMMARY, parseWithFieldErrors } from "@/lib/validation/field-errors";

export type InvoiceWriteOffKind = (typeof invoiceWriteOffs.$inferSelect)["kind"];

export const WRITE_OFF_KIND_LABELS: Record<InvoiceWriteOffKind, string> = {
  bank_charges: "Bank charges",
  bad_debt: "Bad debt",
};

const writeOffSchema = z.object({
  kind: z.enum(["bank_charges", "bad_debt"], { message: "Choose a reason" }),
  amountPounds: z.string().trim().min(1, "Enter an amount"),
  writtenOffOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a date"),
  note: z
    .string()
    .trim()
    .max(500)
    .optional()
    .or(z.literal(""))
    .transform((v) => (v ? v : null)),
});

export function writeOffRawFromFormData(formData: FormData): Record<string, unknown> {
  return {
    kind: formData.get("kind"),
    amountPounds: formData.get("amountPounds"),
    writtenOffOn: formData.get("writtenOffOn"),
    note: formData.get("note") ?? "",
  };
}

class WriteOffError extends Error {}

async function lockInvoice(tx: Tx, companyId: string, invoiceId: string) {
  await tx.execute(
    sql`select id from invoices where id = ${invoiceId} and company_id = ${companyId} for update`,
  );
  const [inv] = await tx
    .select()
    .from(invoices)
    .where(and(eq(invoices.id, invoiceId), eq(invoices.companyId, companyId)))
    .limit(1);
  if (!inv) throw new WriteOffError("Invoice not found");
  return inv;
}

async function balanceOf(tx: Tx, inv: typeof invoices.$inferSelect) {
  const [paid] = await tx
    .select({ total: sum(payments.amountPence).mapWith(Number) })
    .from(payments)
    .innerJoin(invoices, eq(invoices.id, payments.invoiceId))
    .where(and(eq(payments.invoiceId, inv.id), eq(invoices.companyId, inv.companyId)));
  const settlement = {
    grossPence: inv.grossPence,
    paidPence: paid?.total ?? 0,
    ...(await creditAdjustmentForInvoice(tx, inv.companyId, inv.id)),
  };
  return { balancePence: invoiceBalancePence(settlement), settled: isInvoiceSettled(settlement) };
}

/**
 * Write off some or all of what a client still owes on a sent invoice, as bank
 * charges or bad debt. Marks the invoice paid once nothing is left owing.
 */
export async function writeOffInvoiceBalance(
  ctx: { companyId: string; localUserId: string },
  invoiceId: string,
  raw: Record<string, unknown>,
): Promise<ActionResult> {
  const { companyId, localUserId } = ctx;
  const parsed = parseWithFieldErrors(writeOffSchema, raw);
  if (!parsed.ok) {
    return { ok: false, error: parsed.error, fieldErrors: parsed.fieldErrors };
  }
  const { kind, writtenOffOn, note } = parsed.data;

  let amountPence: number;
  try {
    amountPence = poundsToPence(parsed.data.amountPounds);
  } catch (e) {
    return {
      ok: false,
      error: FORM_FIELD_ERROR_SUMMARY,
      fieldErrors: { amountPounds: e instanceof Error ? e.message : "Invalid amount" },
    };
  }
  if (amountPence <= 0) {
    return {
      ok: false,
      error: FORM_FIELD_ERROR_SUMMARY,
      fieldErrors: { amountPounds: "Amount must be positive" },
    };
  }

  const locked = await checkPeriodOpen(companyId, writtenOffOn);
  if (locked) return { ok: false, error: locked };

  let id: string;
  try {
    id = await getDb().transaction(async (tx) => {
      const inv = await lockInvoice(tx, companyId, invoiceId);
      if (storedStatus(inv.status) !== "sent") {
        throw new WriteOffError("Only a sent invoice with money still owing can be written off");
      }
      if (inv.issueDate && writtenOffOn < inv.issueDate) {
        throw new WriteOffError("A write-off can't be dated before its invoice");
      }
      const { balancePence } = await balanceOf(tx, inv);
      if (amountPence > balancePence) {
        throw new WriteOffError(
          `Write-off is more than the ${formatGBP(Math.max(0, balancePence))} still owed`,
        );
      }

      const [row] = await tx
        .insert(invoiceWriteOffs)
        .values({
          companyId,
          invoiceId,
          kind,
          amountPence,
          writtenOffOn,
          note,
          createdByUserId: localUserId,
        })
        .returning({ id: invoiceWriteOffs.id });

      if (amountPence === balancePence) {
        await tx
          .update(invoices)
          .set({ status: "paid", paidAt: new Date(`${writtenOffOn}T12:00:00Z`) })
          .where(and(eq(invoices.id, invoiceId), eq(invoices.companyId, companyId)));
      }
      return row.id;
    });
  } catch (e) {
    if (e instanceof WriteOffError) return { ok: false, error: e.message };
    throw e;
  }

  await writeAudit({
    companyId,
    actorUserId: localUserId,
    action: "invoice.write_off",
    entityType: "invoice",
    entityId: invoiceId,
    meta: { writeOffId: id, kind, amountPence, writtenOffOn },
  });
  return { ok: true, id };
}

/** Remove a write-off, putting the amount back on what the client owes. */
export async function removeInvoiceWriteOff(
  ctx: { companyId: string; localUserId: string },
  writeOffId: string,
): Promise<ActionResult> {
  const { companyId, localUserId } = ctx;
  const db = getDb();
  const [existing] = await db
    .select()
    .from(invoiceWriteOffs)
    .where(and(eq(invoiceWriteOffs.id, writeOffId), eq(invoiceWriteOffs.companyId, companyId)))
    .limit(1);
  if (!existing) return { ok: false, error: "Write-off not found" };

  const locked = await checkPeriodOpen(companyId, existing.writtenOffOn);
  if (locked) return { ok: false, error: locked };

  try {
    await db.transaction(async (tx) => {
      const inv = await lockInvoice(tx, companyId, existing.invoiceId);
      const deleted = await tx
        .delete(invoiceWriteOffs)
        .where(and(eq(invoiceWriteOffs.id, writeOffId), eq(invoiceWriteOffs.companyId, companyId)))
        .returning({ id: invoiceWriteOffs.id });
      if (deleted.length === 0) throw new WriteOffError("Write-off not found");

      const { settled } = await balanceOf(tx, inv);
      if (!settled && storedStatus(inv.status) === "paid") {
        await tx
          .update(invoices)
          .set({ status: "sent", paidAt: null })
          .where(and(eq(invoices.id, inv.id), eq(invoices.companyId, companyId)));
      }
    });
  } catch (e) {
    if (e instanceof WriteOffError) return { ok: false, error: e.message };
    throw e;
  }

  await writeAudit({
    companyId,
    actorUserId: localUserId,
    action: "invoice.write_off_remove",
    entityType: "invoice",
    entityId: existing.invoiceId,
    meta: { writeOffId, kind: existing.kind, amountPence: existing.amountPence },
  });
  return { ok: true, id: writeOffId };
}

/** Write-offs on one invoice, oldest first, for the invoice page. */
export async function listInvoiceWriteOffs(companyId: string, invoiceId: string) {
  const rows = await getDb()
    .select()
    .from(invoiceWriteOffs)
    .where(
      and(eq(invoiceWriteOffs.invoiceId, invoiceId), eq(invoiceWriteOffs.companyId, companyId)),
    )
    .orderBy(asc(invoiceWriteOffs.writtenOffOn), asc(invoiceWriteOffs.createdAt));
  return rows.map((r) => ({
    id: r.id,
    kind: r.kind,
    kindLabel: WRITE_OFF_KIND_LABELS[r.kind],
    amountPence: r.amountPence,
    amountFormatted: formatGBP(r.amountPence),
    writtenOffOn: r.writtenOffOn,
    note: r.note,
  }));
}
