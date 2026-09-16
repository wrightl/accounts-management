import { and, eq, isNull } from "drizzle-orm";
import { getDb } from "@/db";
import { companies, invoiceLineItems, invoices, recurringInvoices } from "@/db/schema";
import { invoiceTotals } from "@/lib/money";
import { allocateInvoiceNumber } from "@/lib/invoices/allocate";
import { defaultDueDate, todayIsoDate } from "@/lib/invoices/status";
import { isRecurringInvoicesEnabled } from "@/lib/platform-settings";

export type RecurringGenerateResult =
  | { skipped: "feature flag off" | "no database"; generated?: undefined }
  | { skipped?: undefined; generated: number };

/**
 * Generate draft invoices from enabled recurring templates for today's day-of-month.
 * Enabled via platform settings (or RECURRING_INVOICES_ENABLED env override).
 * Skips suspended companies.
 */
export async function generateRecurringInvoices(): Promise<RecurringGenerateResult> {
  if (!(await isRecurringInvoicesEnabled())) {
    return { skipped: "feature flag off" };
  }
  if (!process.env.DATABASE_URL) {
    return { skipped: "no database" };
  }

  const db = getDb();
  const today = todayIsoDate();
  const day = Number(today.slice(8, 10));

  const templates = await db
    .select({
      id: recurringInvoices.id,
      companyId: recurringInvoices.companyId,
      clientId: recurringInvoices.clientId,
      lineTemplate: recurringInvoices.lineTemplate,
      notes: recurringInvoices.notes,
      lastGeneratedAt: recurringInvoices.lastGeneratedAt,
    })
    .from(recurringInvoices)
    .innerJoin(companies, eq(companies.id, recurringInvoices.companyId))
    .where(
      and(
        eq(recurringInvoices.enabled, true),
        eq(recurringInvoices.dayOfMonth, day),
        isNull(companies.suspendedAt),
      ),
    );

  let generated = 0;

  for (const tmpl of templates) {
    if (tmpl.lastGeneratedAt) {
      const last = todayIsoDate(tmpl.lastGeneratedAt).slice(0, 7);
      if (last === today.slice(0, 7)) continue;
    }

    const lines = tmpl.lineTemplate as {
      description: string;
      quantity: number;
      unitPricePence: number;
    }[];
    if (!Array.isArray(lines) || lines.length === 0) continue;

    const totals = invoiceTotals(
      lines.map((l) => ({
        quantity: l.quantity,
        unitPricePence: l.unitPricePence,
        vatRate: 0,
      })),
    );

    await db.transaction(async (tx) => {
      const number = await allocateInvoiceNumber(tx, tmpl.companyId, today);
      const [inv] = await tx
        .insert(invoices)
        .values({
          companyId: tmpl.companyId,
          number,
          clientId: tmpl.clientId,
          status: "draft",
          issueDate: today,
          dueDate: defaultDueDate(today),
          notes: tmpl.notes,
          ...totals,
        })
        .returning({ id: invoices.id });

      await tx.insert(invoiceLineItems).values(
        lines.map((l, i) => ({
          invoiceId: inv.id,
          description: l.description,
          quantity: l.quantity,
          unitPricePence: l.unitPricePence,
          vatRate: 0,
          position: i,
        })),
      );

      await tx
        .update(recurringInvoices)
        .set({ lastGeneratedAt: new Date() })
        .where(eq(recurringInvoices.id, tmpl.id));
    });

    generated++;
  }

  return { generated };
}
