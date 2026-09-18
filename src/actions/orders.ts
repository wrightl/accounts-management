"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import {
  invoiceLineItems,
  invoices,
  orderLineItems,
  orderPaymentMilestones,
  orders,
} from "@/db/schema";
import type { ActionResult } from "@/actions/result";
import { writeAudit } from "@/lib/audit";
import { mutate } from "@/lib/mutate";
import { allocateInvoiceNumber, allocateOrderNumber } from "@/lib/invoices/allocate";
import { poundsToPence } from "@/lib/money";
import { getOrderDetail } from "@/lib/orders/queries";
import { replaceOrderPaymentMilestones } from "@/lib/orders/copy-from-quote";
import {
  parseMilestonesJson,
  validateMilestones,
} from "@/lib/quotes/payment-schedule";
import { getOrCreateCompanySettings } from "@/lib/settings/queries";
import { parseVatRate, resolveLineVatRate } from "@/lib/vat";
import {
  buildInvoiceLineValues,
  computePartAmountPence,
  getUsedMilestoneIds,
  invoiceTotals,
  resolveInvoiceDueDate,
  resolveMilestoneAmountPence,
  sumInvoicedPenceForOrder,
  todayIsoDate,
  validateInvoiceAmount,
  type InvoiceFromOrderMode,
} from "@/lib/orders/invoice-from-order";

const lineSchema = z.object({
  description: z.string().trim().min(1, "Description is required"),
  quantity: z.coerce.number().int().positive(),
  unitPricePounds: z.string().trim().min(1, "Unit price is required"),
  vatRate: z.coerce.number().int().min(0).max(100).optional(),
});

const orderSchema = z.object({
  clientId: z.string().uuid(),
  issueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  notes: z
    .string()
    .optional()
    .or(z.literal(""))
    .transform((v) => (v === "" || !v ? null : v)),
  lines: z.array(lineSchema).min(1, "Add at least one line item"),
});

function parseLines(formData: FormData) {
  try {
    const raw = JSON.parse(String(formData.get("linesJson") ?? "[]"));
    if (!Array.isArray(raw)) return [];
    return raw.filter((line) => {
      if (!line || typeof line !== "object") return false;
      const row = line as Record<string, unknown>;
      return (
        String(row.description ?? "").trim().length > 0 &&
        String(row.unitPricePounds ?? "").trim().length > 0
      );
    });
  } catch {
    return [];
  }
}

export async function createOrder(formData: FormData): Promise<ActionResult> {
  const parsed = orderSchema.safeParse({
    clientId: formData.get("clientId"),
    issueDate: formData.get("issueDate") || todayIsoDate(),
    notes: formData.get("notes") ?? "",
    lines: parseLines(formData),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  return mutate(
    "accounts:write",
    async ({ companyId, localUserId }) => {
      const company = await getOrCreateCompanySettings(companyId);
      let lineValues;
      try {
        lineValues = parsed.data.lines.map((l, i) => ({
          description: l.description,
          quantity: l.quantity,
          unitPricePence: poundsToPence(l.unitPricePounds),
          vatRate: resolveLineVatRate(company, parseVatRate(l.vatRate)),
          position: i,
        }));
      } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : "Invalid amount" };
      }

      const totals = invoiceTotals(lineValues);
      const milestones = parseMilestonesJson(String(formData.get("milestonesJson") ?? "[]"));
      const milestoneError = validateMilestones(milestones, totals.grossPence);
      if (milestoneError) return { ok: false, error: milestoneError };

      const db = getDb();
      const orderId = await db.transaction(async (tx) => {
        const number = await allocateOrderNumber(tx, companyId, parsed.data.issueDate);
        const [row] = await tx
          .insert(orders)
          .values({
            companyId,
            number,
            clientId: parsed.data.clientId,
            status: "active",
            issueDate: parsed.data.issueDate,
            notes: parsed.data.notes,
            ...totals,
            createdByUserId: localUserId,
          })
          .returning({ id: orders.id });

        await tx.insert(orderLineItems).values(
          lineValues.map((l) => ({ ...l, orderId: row.id })),
        );

        await replaceOrderPaymentMilestones(tx, row.id, milestones);
        return row.id;
      });

      return { ok: true, id: orderId };
    },
    {
      audit: { action: "order.create", entityType: "order" },
      paths: ["/orders"],
    },
  );
}

const createInvoiceSchema = z.object({
  mode: z.enum(["milestone", "remaining", "part"]),
  milestoneId: z.string().uuid().optional().or(z.literal("")),
  partMode: z.enum(["amount", "percent"]).optional(),
  amountPounds: z.string().optional(),
  percent: z.string().optional(),
  dueDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .or(z.literal("")),
});

export async function createInvoiceFromOrder(
  orderId: string,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = createInvoiceSchema.safeParse({
    mode: formData.get("mode"),
    milestoneId: formData.get("milestoneId") ?? "",
    partMode: formData.get("partMode") ?? undefined,
    amountPounds: formData.get("amountPounds") ?? undefined,
    percent: formData.get("percent") ?? undefined,
    dueDate: formData.get("dueDate") ?? "",
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  return mutate(
    "accounts:write",
    async ({ companyId, localUserId }) => {
      const detail = await getOrderDetail(companyId, orderId);
      if (!detail) return { ok: false, error: "Order not found" };

      const db = getDb();
      const company = await getOrCreateCompanySettings(companyId);
      const paymentTermsDays = company.invoicePaymentTermsDays;
      const priorInvoicedPence = await sumInvoicedPenceForOrder(db, orderId);
      const remainingPence = detail.order.grossPence - priorInvoicedPence;

      if (remainingPence <= 0) {
        return { ok: false, error: "Nothing left to invoice on this order" };
      }

      const mode = parsed.data.mode as InvoiceFromOrderMode;
      let amountPence: number;
      let milestoneId: string | null = null;
      let milestoneRow: typeof orderPaymentMilestones.$inferSelect | null = null;
      let milestoneLabel: string | undefined;

      if (mode === "milestone") {
        const id = parsed.data.milestoneId?.trim();
        if (!id) return { ok: false, error: "Select a payment milestone" };

        const used = await getUsedMilestoneIds(db, orderId);
        if (used.has(id)) {
          return { ok: false, error: "That milestone has already been invoiced" };
        }

        const [milestone] = await db
          .select()
          .from(orderPaymentMilestones)
          .where(
            and(eq(orderPaymentMilestones.id, id), eq(orderPaymentMilestones.orderId, orderId)),
          )
          .limit(1);
        if (!milestone) return { ok: false, error: "Milestone not found" };

        try {
          amountPence = resolveMilestoneAmountPence(milestone, detail.order.grossPence);
        } catch (e) {
          return {
            ok: false,
            error: e instanceof Error ? e.message : "Invalid milestone",
          };
        }
        milestoneId = milestone.id;
        milestoneRow = milestone;
        milestoneLabel = milestone.label;
      } else if (mode === "remaining") {
        amountPence = remainingPence;
      } else {
        const partMode = parsed.data.partMode ?? "amount";
        const resolved = computePartAmountPence({
          partMode,
          amountPounds: parsed.data.amountPounds,
          percent: parsed.data.percent,
          orderGrossPence: detail.order.grossPence,
        });
        if (typeof resolved === "object" && "error" in resolved) {
          return { ok: false, error: resolved.error };
        }
        amountPence = resolved;
      }

      const amountError = validateInvoiceAmount(amountPence, remainingPence);
      if (amountError) return { ok: false, error: amountError };

      const issueDate = todayIsoDate();
      const dueDateOverride =
        parsed.data.dueDate && parsed.data.dueDate.length > 0
          ? parsed.data.dueDate
          : null;
      const dueDate = resolveInvoiceDueDate({
        override: dueDateOverride,
        milestone: milestoneRow,
        issueDate,
        paymentTermsDays,
      });

      const lineValues = buildInvoiceLineValues({
        mode,
        amountPence,
        orderNumber: detail.order.number,
        milestoneLabel,
        orderLines: detail.lines,
        priorInvoicedPence,
      });
      const totals = invoiceTotals(lineValues);

      const invoiceId = await db.transaction(async (tx) => {
        const number = await allocateInvoiceNumber(tx, companyId, issueDate);
        const [inv] = await tx
          .insert(invoices)
          .values({
            companyId,
            number,
            clientId: detail.order.clientId,
            status: "draft",
            issueDate,
            dueDate,
            notes: detail.order.notes,
            netPence: totals.netPence,
            vatPence: totals.vatPence,
            grossPence: totals.grossPence,
            orderId,
            paymentMilestoneId: milestoneId,
            createdByUserId: localUserId,
          })
          .returning({ id: invoices.id });

        await tx.insert(invoiceLineItems).values(
          lineValues.map((l) => ({
            invoiceId: inv.id,
            description: l.description,
            quantity: l.quantity,
            unitPricePence: l.unitPricePence,
            vatRate: l.vatRate,
            position: l.position,
          })),
        );

        return inv.id;
      });

      await writeAudit({
        companyId,
        actorUserId: localUserId,
        action: "order.create_invoice",
        entityType: "order",
        entityId: orderId,
        meta: { invoiceId, mode, amountPence },
      });

      revalidatePath(`/invoices/${invoiceId}`);
      return { ok: true, id: invoiceId };
    },
    {
      paths: ["/orders", `/orders/${orderId}`, "/invoices"],
    },
  );
}

/** @deprecated Use createInvoiceFromOrder */
export async function convertOrderToInvoice(orderId: string): Promise<ActionResult> {
  const form = new FormData();
  form.set("mode", "remaining");
  return createInvoiceFromOrder(orderId, form);
}
