"use server";

import { revalidatePath } from "next/cache";
import { storedLineTax } from "@/lib/documents/schema";
import { documentColumns, documentRate, priceDocument } from "@/lib/document-rate";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import {
  invoiceLineItems,
  invoices,
  orderLineItems,
  orderPaymentMilestones,
  orders,
} from "@/db/schema";
import { rowOfCompany } from "@/lib/tenant-scope";
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
import {
  buildInvoiceLineValues,
  computePartAmountPence,
  getUsedMilestoneIds,
  resolveInvoiceDueDate,
  resolveMilestoneAmountPence,
  sumInvoicedForOrder,
  todayIsoDate,
  validateInvoiceAmount,
  type InvoiceFromOrderMode,
} from "@/lib/orders/invoice-from-order";
import {
  createInvoiceFromOrderRawFromFormData,
  orderRawFromFormData,
  parseCreateInvoiceFromOrderInput,
  parseOrderInput,
} from "@/lib/orders/schema";
import { FORM_FIELD_ERROR_SUMMARY } from "@/lib/validation/field-errors";

export async function createOrder(formData: FormData): Promise<ActionResult> {
  const parsed = parseOrderInput(orderRawFromFormData(formData));
  if (!parsed.ok) {
    return {
      ok: false,
      error: parsed.error,
      fieldErrors: parsed.fieldErrors,
    };
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
          ...storedLineTax(company, l),
          discountPercent: l.discountPercent ?? 0,
          position: i,
        }));
      } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : "Invalid amount" };
      }

      const priced = await priceDocument(parsed.data, parsed.data.issueDate, lineValues);
      if (!priced.ok) return priced;
      const totals = priced.fields;
      const milestones = parseMilestonesJson(String(formData.get("milestonesJson") ?? "[]"));
      // Milestones are in the order's currency.
      const milestoneError = validateMilestones(milestones, totals.grossMinor);
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

        await replaceOrderPaymentMilestones(tx, companyId, row.id, milestones);
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

export async function createInvoiceFromOrder(
  orderId: string,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = parseCreateInvoiceFromOrderInput(
    createInvoiceFromOrderRawFromFormData(formData),
  );
  if (!parsed.ok) {
    return {
      ok: false,
      error: parsed.error,
      fieldErrors: parsed.fieldErrors,
    };
  }

  return mutate(
    "accounts:write",
    async ({ companyId, localUserId }) => {
      const detail = await getOrderDetail(companyId, orderId);
      if (!detail) return { ok: false, error: "Order not found" };

      const db = getDb();
      const company = await getOrCreateCompanySettings(companyId);
      const paymentTermsDays = company.invoicePaymentTermsDays;
      // Amounts here are in the order's currency, which its invoices are raised in.
      const priorInvoicedPence = await sumInvoicedForOrder(db, companyId, orderId);
      const remainingPence = detail.order.grossMinor - priorInvoicedPence;

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
        if (!id) {
          return {
            ok: false,
            error: FORM_FIELD_ERROR_SUMMARY,
            fieldErrors: { milestoneId: "Select a payment milestone" },
          };
        }

        const used = await getUsedMilestoneIds(db, orderId);
        if (used.has(id)) {
          return { ok: false, error: "That milestone has already been invoiced" };
        }

        const [milestone] = await db
          .select()
          .from(orderPaymentMilestones)
          .where(
            and(
              eq(orderPaymentMilestones.id, id),
              eq(orderPaymentMilestones.orderId, orderId),
              rowOfCompany(orderPaymentMilestones.orderId, orders, companyId),
            ),
          )
          .limit(1);
        if (!milestone) return { ok: false, error: "Milestone not found" };

        try {
          amountPence = resolveMilestoneAmountPence(milestone, detail.order.grossMinor);
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
          orderGrossPence: detail.order.grossMinor,
        });
        if (typeof resolved === "object" && "error" in resolved) {
          const field = partMode === "percent" ? "percent" : "amountPounds";
          return {
            ok: false,
            error: FORM_FIELD_ERROR_SUMMARY,
            fieldErrors: { [field]: resolved.error },
          };
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
        company,
        mode,
        amountPence,
        orderNumber: detail.order.number,
        milestoneLabel,
        orderLines: detail.lines,
        priorInvoicedPence,
      });
      // A fresh rate for the invoice's own issue date, as for any invoice.
      const rate = await documentRate(detail.order.currency, issueDate);
      if (!rate.ok) {
        return {
          ok: false,
          error: `Couldn't get today's Bank of England ${detail.order.currency} rate for the invoice. Try again later.`,
        };
      }
      const totals = documentColumns(lineValues, rate.rate);

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
            ...totals,
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
            taxCode: l.taxCode,
            vatRate: l.vatRate,
            taxCodeNeedsReview: l.taxCodeNeedsReview,
            discountPercent: l.discountPercent,
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
