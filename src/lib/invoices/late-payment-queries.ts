import "server-only";
import { and, eq, ne } from "drizzle-orm";
import { getDb } from "@/db";
import { invoices } from "@/db/schema";

/**
 * The live late payment claim raised on an invoice, and the invoice a claim
 * was raised for.
 */
export async function getLatePaymentClaims(
  companyId: string,
  invoiceId: string,
  latePaymentForInvoiceId: string | null,
) {
  const db = getDb();
  const [claim] = await db
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
  const [claimFor] = latePaymentForInvoiceId
    ? await db
        .select({ id: invoices.id, number: invoices.number })
        .from(invoices)
        .where(and(eq(invoices.companyId, companyId), eq(invoices.id, latePaymentForInvoiceId)))
        .limit(1)
    : [];
  return { claim: claim ?? null, claimFor: claimFor ?? null };
}
