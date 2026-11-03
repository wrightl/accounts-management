import "server-only";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { clients, quoteLineItems, quotes } from "@/db/schema";
import { allocateQuoteNumber } from "@/lib/invoices/allocate";
import { invoiceTotals, poundsToPence } from "@/lib/money";
import { replaceQuotePaymentMilestones } from "@/lib/orders/copy-from-quote";
import { validateMilestones, type PaymentMilestoneInput } from "@/lib/quotes/payment-schedule";
import type { QuoteParsed } from "@/lib/quotes/schema";
import { insertQuoteVersion, linesToSnapshot } from "@/lib/quotes/versions";
import { getOrCreateCompanySettings } from "@/lib/settings/queries";
import { parseVatRate, resolveLineVatRate } from "@/lib/vat";
import type { ActionResult } from "@/actions/result";

/**
 * Create a draft quote (version 1) from validated input. Shared by the web
 * action and the AI assistant so both apply the same client, VAT, payment
 * schedule and numbering rules. Callers handle authz and the audit entry.
 * Never sends.
 */
export async function createDraftQuoteRecord(
  ctx: { companyId: string; localUserId: string },
  data: QuoteParsed,
  milestones: PaymentMilestoneInput[] = [],
): Promise<ActionResult> {
  const { companyId, localUserId } = ctx;
  const db = getDb();
  const [client] = await db
    .select({ id: clients.id })
    .from(clients)
    .where(and(eq(clients.id, data.clientId), eq(clients.companyId, companyId)))
    .limit(1);
  if (!client) return { ok: false, error: "Choose a client" };

  const company = await getOrCreateCompanySettings(companyId);
  let lineValues;
  try {
    lineValues = data.lines.map((l, i) => ({
      description: l.description,
      quantity: l.quantity,
      unitPricePence: poundsToPence(l.unitPricePounds),
      vatRate: resolveLineVatRate(company, parseVatRate(l.vatRate)),
      discountPercent: l.discountPercent ?? 0,
      position: i,
    }));
  } catch {
    return { ok: false, error: "Enter a valid unit price on each line item" };
  }
  const totals = invoiceTotals(lineValues);
  const milestoneError = validateMilestones(milestones, totals.grossPence);
  if (milestoneError) return { ok: false, error: milestoneError };

  const quoteId = await db.transaction(async (tx) => {
    const number = await allocateQuoteNumber(tx, companyId, data.issueDate);
    const [row] = await tx
      .insert(quotes)
      .values({
        companyId,
        number,
        clientId: data.clientId,
        status: "draft",
        version: 1,
        issueDate: data.issueDate,
        validUntil: data.validUntil,
        notes: data.notes,
        depositOnAccept: data.depositOnAccept && milestones.length > 0,
        ...totals,
        createdByUserId: localUserId,
      })
      .returning({ id: quotes.id });

    await tx.insert(quoteLineItems).values(
      lineValues.map((l) => ({ ...l, quoteId: row.id })),
    );

    await replaceQuotePaymentMilestones(tx, row.id, milestones);

    await insertQuoteVersion(tx, {
      quoteId: row.id,
      version: 1,
      snapshot: {
        clientId: data.clientId,
        issueDate: data.issueDate,
        validUntil: data.validUntil,
        notes: data.notes,
        ...totals,
        lines: linesToSnapshot(lineValues),
      },
      source: "create",
      createdByUserId: localUserId,
    });

    return row.id;
  });

  return { ok: true, id: quoteId };
}
