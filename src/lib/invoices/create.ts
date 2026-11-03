import "server-only";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { clients, invoiceLineItems, invoices } from "@/db/schema";
import { allocateInvoiceNumber } from "@/lib/invoices/allocate";
import { defaultDueDate } from "@/lib/invoices/status";
import type { InvoiceParsed } from "@/lib/invoices/schema";
import { invoiceTotals, poundsToPence } from "@/lib/money";
import { periodLockError } from "@/lib/period-lock";
import { checkRebillExpenses } from "@/lib/profitability/queries";
import { getOrCreateCompanySettings } from "@/lib/settings/queries";
import { parseVatRate, resolveLineVatRate } from "@/lib/vat";
import type { ActionResult } from "@/actions/result";

export function buildLineValues(
  lines: InvoiceParsed["lines"],
  company: { vatRegistered: boolean },
) {
  return lines.map((l, i) => {
    const unitPricePence = poundsToPence(l.unitPricePounds);
    return {
      description: l.description,
      quantity: l.quantity,
      unitPricePence,
      vatRate: resolveLineVatRate(company, parseVatRate(l.vatRate)),
      discountPercent: l.discountPercent ?? 0,
      position: i,
      expenseId: l.expenseId ?? null,
    };
  });
}

export function rebilledExpenseIds(lines: Array<{ expenseId: string | null }>): string[] {
  return lines.flatMap((l) => (l.expenseId ? [l.expenseId] : []));
}

/**
 * Create a draft invoice from validated input. Shared by the web action and
 * the AI assistant so both apply the same client, period lock, VAT, rebill
 * and numbering rules. Callers handle authz and the audit entry. Never sends.
 */
export async function createDraftInvoiceRecord(
  ctx: { companyId: string; localUserId: string },
  data: InvoiceParsed,
): Promise<ActionResult> {
  const { companyId, localUserId } = ctx;
  const issueDate = data.issueDate;
  const dueDate = data.dueDate && data.dueDate.length > 0 ? data.dueDate : defaultDueDate(issueDate);

  const db = getDb();
  const [client] = await db
    .select({ id: clients.id })
    .from(clients)
    .where(and(eq(clients.id, data.clientId), eq(clients.companyId, companyId)))
    .limit(1);
  if (!client) return { ok: false, error: "Choose a client" };

  const company = await getOrCreateCompanySettings(companyId);
  const locked = periodLockError(company.booksLockedThrough, issueDate);
  if (locked) return { ok: false, error: locked };
  let lineValues;
  try {
    lineValues = buildLineValues(data.lines, company);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Invalid amount" };
  }
  const totals = invoiceTotals(lineValues);
  const rebillError = await checkRebillExpenses(
    companyId,
    data.clientId,
    rebilledExpenseIds(lineValues),
    null,
  );
  if (rebillError) return { ok: false, error: rebillError };

  const invoiceId = await db.transaction(async (tx) => {
    const number = await allocateInvoiceNumber(tx, companyId, issueDate);
    const [inv] = await tx
      .insert(invoices)
      .values({
        companyId,
        number,
        clientId: data.clientId,
        status: "draft",
        issueDate,
        dueDate,
        notes: data.notes,
        netPence: totals.netPence,
        vatPence: totals.vatPence,
        grossPence: totals.grossPence,
        createdByUserId: localUserId,
      })
      .returning({ id: invoices.id });

    await tx.insert(invoiceLineItems).values(
      lineValues.map((l) => ({ ...l, invoiceId: inv.id })),
    );
    return inv.id;
  });

  return { ok: true, id: invoiceId };
}
