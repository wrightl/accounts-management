import "server-only";
import { getStripe } from "@/lib/billing/stripe";
import { getPublicInvoiceByToken } from "@/lib/invoices/public-queries";
import {
  INVOICE_PAYMENT_KIND,
  canPayInvoiceOnline,
  publicInvoiceUrl,
} from "@/lib/payments/online-status";

export type InvoiceCheckoutResult = { ok: true; url: string } | { ok: false; error: string };

/**
 * Create Stripe Checkout, on the company's own Stripe account, for the full
 * amount due on an invoice. The Connect webhook records the payment.
 */
export async function createInvoiceCheckout(rawToken: string): Promise<InvoiceCheckoutResult> {
  const data = await getPublicInvoiceByToken(rawToken);
  if (!data || data.suspended) {
    return { ok: false, error: "This invoice is no longer available" };
  }
  const { detail, company } = data;
  const amountDuePence = detail.balancePence;
  if (
    !company.stripeConnectAccountId ||
    !canPayInvoiceOnline({
      status: detail.invoice.status,
      amountDuePence,
      onlinePayments: company.onlinePayments,
    })
  ) {
    return {
      ok: false,
      error:
        amountDuePence <= 0
          ? "Nothing is left to pay on this invoice"
          : "This invoice can't be paid online. Use the bank details on the invoice instead.",
    };
  }

  const pageUrl = publicInvoiceUrl(rawToken);
  const metadata = {
    kind: INVOICE_PAYMENT_KIND,
    companyId: detail.invoice.companyId,
    invoiceId: detail.invoice.id,
    invoiceNumber: detail.invoice.number,
  };
  const session = await getStripe().checkout.sessions.create(
    {
      mode: "payment",
      // Card covers Apple Pay and Google Pay in Checkout.
      payment_method_types: ["card"],
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "gbp",
            unit_amount: amountDuePence,
            product_data: {
              name: `Invoice ${detail.invoice.number}`,
              description: `From ${company.name}`,
            },
          },
        },
      ],
      customer_email: detail.client.email ?? undefined,
      client_reference_id: detail.invoice.id,
      metadata,
      payment_intent_data: {
        description: `Invoice ${detail.invoice.number}`,
        metadata,
      },
      success_url: `${pageUrl}?payment=success`,
      cancel_url: `${pageUrl}?payment=cancelled`,
    },
    { stripeAccount: company.stripeConnectAccountId },
  );
  if (!session.url) {
    return { ok: false, error: "Couldn't start the payment. Try again." };
  }
  return { ok: true, url: session.url };
}
