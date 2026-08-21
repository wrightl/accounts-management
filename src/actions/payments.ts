"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { invoices, payments } from "@/db/schema";
import { requirePermission } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";
import { ensureLocalUser } from "@/lib/users";
import { poundsToPence } from "@/lib/money";
import {
  effectiveStatus,
  isFullySettled,
  todayIsoDate,
  type InvoiceStatus,
} from "@/lib/invoices/status";
import { sumPaymentsForInvoice } from "@/lib/invoices/queries";
import type { ActionResult } from "@/actions/clients";

const paymentSchema = z.object({
  amountPounds: z.string().trim().min(1),
  method: z
    .string()
    .trim()
    .optional()
    .or(z.literal(""))
    .transform((v) => (v === "" ? null : v ?? null)),
  reference: z
    .string()
    .trim()
    .optional()
    .or(z.literal(""))
    .transform((v) => (v === "" ? null : v ?? null)),
  receivedAt: z
    .string()
    .optional()
    .or(z.literal(""))
    .transform((v) => (v === "" ? null : v ?? null)),
});

export async function recordPayment(
  invoiceId: string,
  formData: FormData,
): Promise<ActionResult> {
  const session = await requirePermission("accounts:write");
  const localUserId = await ensureLocalUser(session);

  const db = getDb();
  const [inv] = await db
    .select()
    .from(invoices)
    .where(eq(invoices.id, invoiceId))
    .limit(1);
  if (!inv) return { ok: false, error: "Invoice not found" };

  const status = effectiveStatus(
    inv.status as InvoiceStatus,
    inv.dueDate,
    todayIsoDate(),
  );
  if (status === "draft" || status === "void" || status === "paid") {
    return {
      ok: false,
      error: `Cannot record a payment against a ${status} invoice`,
    };
  }

  const parsed = paymentSchema.safeParse({
    amountPounds: formData.get("amountPounds"),
    method: formData.get("method") ?? "",
    reference: formData.get("reference") ?? "",
    receivedAt: formData.get("receivedAt") ?? "",
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  let amountPence: number;
  try {
    amountPence = poundsToPence(parsed.data.amountPounds);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Invalid amount" };
  }
  if (amountPence <= 0) {
    return { ok: false, error: "Payment amount must be positive" };
  }

  const receivedAt = parsed.data.receivedAt
    ? new Date(parsed.data.receivedAt)
    : new Date();

  const [payment] = await db
    .insert(payments)
    .values({
      invoiceId,
      amountPence,
      method: parsed.data.method ?? "bank_transfer",
      reference: parsed.data.reference,
      receivedAt,
    })
    .returning({ id: payments.id });

  const paidTotal = await sumPaymentsForInvoice(invoiceId);
  if (isFullySettled(inv.grossPence, paidTotal)) {
    await db
      .update(invoices)
      .set({ status: "paid", paidAt: receivedAt })
      .where(eq(invoices.id, invoiceId));
  } else if (status === "overdue" && inv.status === "sent") {
    // Persist overdue when we notice it during a payment mutation.
    await db
      .update(invoices)
      .set({ status: "overdue" })
      .where(eq(invoices.id, invoiceId));
  }

  await writeAudit({
    actorUserId: localUserId,
    action: "payment.record",
    entityType: "payment",
    entityId: payment.id,
    meta: { invoiceId, amountPence },
  });

  revalidatePath("/dashboard/invoices");
  revalidatePath(`/dashboard/invoices/${invoiceId}`);
  revalidatePath("/dashboard");
  return { ok: true, id: payment.id };
}
