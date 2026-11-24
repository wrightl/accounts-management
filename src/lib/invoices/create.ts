import "server-only";
import { storedLineTax } from "@/lib/documents/schema";
import { documentTotals, isForeignDocumentCurrency, type DocumentTotals } from "@/lib/currency";
import { documentRate, type DocumentRateDetails } from "@/lib/document-rate";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { clients, invoiceLineItems, invoices } from "@/db/schema";
import { allocateInvoiceNumber } from "@/lib/invoices/allocate";
import { defaultDueDate } from "@/lib/invoices/status";
import type { InvoiceParsed } from "@/lib/invoices/schema";
import { poundsToPence } from "@/lib/money";
import { periodLockError } from "@/lib/period-lock";
import { checkRebillExpenses } from "@/lib/profitability/queries";
import { getOrCreateCompanySettings } from "@/lib/settings/queries";
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
      ...storedLineTax(company, l),
      discountPercent: l.discountPercent ?? 0,
      position: i,
      expenseId: l.expenseId ?? null,
    };
  });
}

/** The columns an invoice stores for its currency, rate and totals. */
export type InvoiceCurrencyFields = DocumentTotals & {
  currency: string;
  fxRate: number;
  fxRateDate: string | null;
  fxRateSource: DocumentRateDetails["fxRateSource"];
};

/**
 * The currency, rate and both sets of totals for an invoice's lines. A foreign
 * invoice uses the rate typed on the form, or else the Bank of England rate for
 * the issue date, fetched again on every save so it follows the date until the
 * invoice is sent and can no longer be edited.
 */
export async function invoiceCurrencyFields(
  data: Pick<InvoiceParsed, "currency" | "fxRate">,
  issueDate: string,
  lineValues: ReturnType<typeof buildLineValues>,
  fetchImpl: typeof fetch = fetch,
): Promise<
  | { ok: true; fields: InvoiceCurrencyFields }
  | { ok: false; error: string; fieldErrors?: Record<string, string> }
> {
  const foreign = isForeignDocumentCurrency(data.currency);
  if (foreign && lineValues.some((l) => l.expenseId)) {
    // Expenses are recharged at their sterling cost; converting them would
    // bury an exchange difference in the recharge.
    const error = "Recharged expenses can only go on a GBP invoice";
    return { ok: false, error, fieldErrors: { lines: error } };
  }
  const rate = await documentRate(data.currency, issueDate, fetchImpl, foreign ? data.fxRate : null);
  if (!rate.ok) return { ok: false, error: rate.error, fieldErrors: { fxRate: rate.error } };
  return {
    ok: true,
    fields: {
      currency: rate.rate.currency,
      fxRate: rate.rate.fxRate,
      fxRateDate: rate.rate.fxRateDate,
      fxRateSource: rate.rate.fxRateSource,
      ...documentTotals(lineValues, rate.rate),
    },
  };
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
  const priced = await invoiceCurrencyFields(data, issueDate, lineValues);
  if (!priced.ok) return priced;
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
        ...priced.fields,
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
