import { isDocumentCurrency } from "@/lib/currency";
import { storedStatus } from "@/lib/invoices/status";

/** Checkout metadata `kind` for client invoice payments on connected accounts. */
export const INVOICE_PAYMENT_KIND = "invoice_payment";

export type OnlinePaymentsStatus = "not_connected" | "pending" | "enabled";

export function onlinePaymentsStatus(company: {
  stripeConnectAccountId: string | null;
  stripeConnectChargesEnabled: boolean;
}): OnlinePaymentsStatus {
  if (!company.stripeConnectAccountId) return "not_connected";
  return company.stripeConnectChargesEnabled ? "enabled" : "pending";
}

/** Whether the client can pay this invoice online right now. */
export function canPayInvoiceOnline(params: {
  status: string;
  /** In the invoice's currency. */
  amountDueMinor: number;
  currency: string;
  onlinePayments: OnlinePaymentsStatus;
}): boolean {
  return (
    params.onlinePayments === "enabled" &&
    // Checkout charges in the invoice's own currency.
    isDocumentCurrency(params.currency) &&
    storedStatus(params.status) === "sent" &&
    params.amountDueMinor > 0
  );
}

export function publicInvoiceUrl(token: string): string {
  const base =
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") || "http://localhost:3001";
  return `${base}/i/${token}`;
}
