"use server";

import { redirect } from "next/navigation";
import { and, eq, isNull } from "drizzle-orm";
import { getDb } from "@/db";
import { invoices } from "@/db/schema";
import { getPublicInvoiceByToken } from "@/lib/invoices/public-queries";
import { createInvoiceCheckout } from "@/lib/payments/checkout";
import type { ActionResult } from "@/actions/result";

/** First view of the client's invoice page (shown to staff on the invoice). */
export async function markPublicInvoiceViewed(rawToken: string): Promise<void> {
  const data = await getPublicInvoiceByToken(rawToken);
  if (!data || data.suspended || data.detail.invoice.viewedAt) return;
  const db = getDb();
  await db
    .update(invoices)
    .set({ viewedAt: new Date() })
    .where(and(eq(invoices.id, data.detail.invoice.id), isNull(invoices.viewedAt)));
}

/** Send the client to Stripe Checkout for the full amount due. */
export async function startInvoiceCheckout(rawToken: string): Promise<ActionResult> {
  const checkout = await createInvoiceCheckout(rawToken);
  if (!checkout.ok) return checkout;
  redirect(checkout.url);
}
