"use server";

import { revalidatePath } from "next/cache";
import { eq, sql, sum } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { invoices, payments } from "@/db/schema";
import { requireActionPermission } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";
import { ensureLocalUser } from "@/lib/users";
import { poundsToPence } from "@/lib/money";
import {
  effectiveStatus,
  isFullySettled,
  todayIsoDate,
  type InvoiceStatus,
} from "@/lib/invoices/status";
import type { ActionResult } from "@/actions/result";

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

class PaymentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PaymentError";
  }
}

export async function recordPayment(
  invoiceId: string,
  formData: FormData,
): Promise<ActionResult> {
  const authz = await requireActionPermission("accounts:write");
  if (!authz.ok) return authz;
  const session = authz.user;
  const localUserId = await ensureLocalUser(session);

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

  const db = getDb();
  let paymentId: string;
  try {
    paymentId = await db.transaction(async (tx) => {
      await tx.execute(
        sql`select id from invoices where id = ${invoiceId} for update`,
      );

      const [inv] = await tx
        .select()
        .from(invoices)
        .where(eq(invoices.id, invoiceId))
        .limit(1);
      if (!inv) throw new PaymentError("Invoice not found");

      const status = effectiveStatus(
        inv.status as InvoiceStatus,
        inv.dueDate,
        todayIsoDate(),
      );
      if (status === "draft" || status === "void" || status === "paid") {
        throw new PaymentError(`Cannot record a payment against a ${status} invoice`);
      }

      const [paidRow] = await tx
        .select({ total: sum(payments.amountPence).mapWith(Number) })
        .from(payments)
        .where(eq(payments.invoiceId, invoiceId));
      const alreadyPaid = paidRow?.total ?? 0;
      const remaining = inv.grossPence - alreadyPaid;
      if (amountPence > remaining) {
        throw new PaymentError(
          `Payment exceeds remaining balance of ${(remaining / 100).toFixed(2)}`,
        );
      }

      const [payment] = await tx
        .insert(payments)
        .values({
          invoiceId,
          amountPence,
          method: parsed.data.method ?? "bank_transfer",
          reference: parsed.data.reference,
          receivedAt,
        })
        .returning({ id: payments.id });

      const paidTotal = alreadyPaid + amountPence;
      if (isFullySettled(inv.grossPence, paidTotal)) {
        await tx
          .update(invoices)
          .set({ status: "paid", paidAt: receivedAt })
          .where(eq(invoices.id, invoiceId));
      }

      return payment.id;
    });
  } catch (e) {
    if (e instanceof PaymentError) return { ok: false, error: e.message };
    throw e;
  }

  await writeAudit({
    actorUserId: localUserId,
    action: "payment.record",
    entityType: "payment",
    entityId: paymentId,
    meta: { invoiceId, amountPence },
  });

  revalidatePath("/dashboard/invoices");
  revalidatePath(`/dashboard/invoices/${invoiceId}`);
  revalidatePath("/dashboard");
  return { ok: true, id: paymentId };
}
