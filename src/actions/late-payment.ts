"use server";

import { and, eq, ne } from "drizzle-orm";
import { getDb } from "@/db";
import { invoiceLineItems, invoices } from "@/db/schema";
import { writeAudit } from "@/lib/audit";
import { mutate } from "@/lib/mutate";
import { formatIsoDateUk, todayIsoDate } from "@/lib/dates";
import { allocateInvoiceNumber } from "@/lib/invoices/allocate";
import { getInvoiceDetail } from "@/lib/invoices/queries";
import { defaultDueDate, storedStatus } from "@/lib/invoices/status";
import { latePaymentCharge } from "@/lib/late-payment";
import { formatGBP } from "@/lib/money";
import { getOrCreateCompanySettings } from "@/lib/settings/queries";
import type { ActionResult } from "@/actions/result";

/**
 * Raise a draft invoice claiming statutory interest to today and fixed
 * compensation on an overdue invoice. Both are outside the scope of VAT.
 */
export async function raiseLatePaymentInvoice(invoiceId: string): Promise<ActionResult> {
  return mutate(
    "accounts:write",
    async ({ companyId, localUserId }) => {
      const detail = await getInvoiceDetail(companyId, invoiceId);
      if (!detail) return { ok: false, error: "Invoice not found" };
      const { invoice } = detail;
      if (invoice.latePaymentForInvoiceId) {
        return { ok: false, error: "This invoice is already a late payment claim" };
      }
      const today = todayIsoDate();
      const charge =
        storedStatus(invoice.status) === "sent" && invoice.dueDate
          ? latePaymentCharge({
              amountDuePence: detail.balancePence,
              dueDate: invoice.dueDate,
              asOf: today,
            })
          : null;
      if (!charge) return { ok: false, error: "This invoice isn't overdue" };

      const db = getDb();
      const [existing] = await db
        .select({ id: invoices.id, number: invoices.number })
        .from(invoices)
        .where(
          and(
            eq(invoices.companyId, companyId),
            eq(invoices.latePaymentForInvoiceId, invoiceId),
            ne(invoices.status, "void"),
          ),
        )
        .limit(1);
      if (existing) {
        return {
          ok: false,
          error: `Late payment is already claimed on ${existing.number}. Void it to raise a new one.`,
        };
      }

      const company = await getOrCreateCompanySettings(companyId);
      const lines = [
        {
          description: `Statutory interest on invoice ${invoice.number}: ${formatGBP(detail.balancePence)} at ${charge.ratePercent}% a year for ${charge.daysLate} days from ${formatIsoDateUk(invoice.dueDate)}`,
          quantity: 1,
          unitPricePence: charge.interestPence,
          vatRate: 0,
          discountPercent: 0,
          position: 0,
        },
        {
          description: `Fixed compensation for late payment of invoice ${invoice.number}`,
          quantity: 1,
          unitPricePence: charge.compensationPence,
          vatRate: 0,
          discountPercent: 0,
          position: 1,
        },
      ];

      const newId = await db.transaction(async (tx) => {
        const number = await allocateInvoiceNumber(tx, companyId, today);
        const [row] = await tx
          .insert(invoices)
          .values({
            companyId,
            number,
            clientId: invoice.clientId,
            status: "draft",
            issueDate: today,
            dueDate: defaultDueDate(today, company.invoicePaymentTermsDays),
            notes:
              "Claimed under the Late Payment of Commercial Debts (Interest) Act 1998. Interest and compensation are outside the scope of VAT.",
            netPence: charge.totalPence,
            vatPence: 0,
            grossPence: charge.totalPence,
            latePaymentForInvoiceId: invoiceId,
            createdByUserId: localUserId,
          })
          .returning({ id: invoices.id });
        await tx.insert(invoiceLineItems).values(lines.map((l) => ({ ...l, invoiceId: row.id })));
        return row.id;
      });

      await writeAudit({
        companyId,
        actorUserId: localUserId,
        action: "invoice.late_payment_claim",
        entityType: "invoice",
        entityId: newId,
        meta: {
          forInvoiceId: invoiceId,
          interestPence: charge.interestPence,
          compensationPence: charge.compensationPence,
          ratePercent: charge.ratePercent,
        },
      });
      return { ok: true, id: newId };
    },
    { paths: ["/invoices", `/invoices/${invoiceId}`] },
  );
}
