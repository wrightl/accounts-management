import "server-only";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { companies, invoices } from "@/db/schema";
import { getInvoiceDetail } from "@/lib/invoices/queries";
import { storedStatus } from "@/lib/invoices/status";
import { onlinePaymentsStatus } from "@/lib/payments/online-status";

/**
 * Invoice for the client's public page. Drafts are never public; void
 * invoices load so the page can say they were cancelled.
 */
export async function getPublicInvoiceByToken(rawToken: string) {
  if (!rawToken || rawToken.length > 128) return null;
  const db = getDb();
  const [row] = await db
    .select({
      invoiceId: invoices.id,
      companyId: invoices.companyId,
      status: invoices.status,
      suspendedAt: companies.suspendedAt,
      companyName: companies.name,
      vatNumber: companies.vatNumber,
      stripeConnectAccountId: companies.stripeConnectAccountId,
      stripeConnectChargesEnabled: companies.stripeConnectChargesEnabled,
    })
    .from(invoices)
    .innerJoin(companies, eq(invoices.companyId, companies.id))
    .where(eq(invoices.publicToken, rawToken))
    .limit(1);

  if (!row || storedStatus(row.status) === "draft") return null;
  if (row.suspendedAt) return { suspended: true as const };

  const detail = await getInvoiceDetail(row.companyId, row.invoiceId);
  if (!detail) return null;

  return {
    suspended: false as const,
    token: rawToken,
    company: {
      name: row.companyName,
      vatNumber: row.vatNumber,
      stripeConnectAccountId: row.stripeConnectAccountId,
      onlinePayments: onlinePaymentsStatus(row),
    },
    detail,
  };
}
