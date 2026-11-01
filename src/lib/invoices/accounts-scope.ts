import { eq, sql, type SQL } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { creditNotes, invoices, payments } from "@/db/schema";

/**
 * What counts in P&L, VAT, reserves and cash figures once a company has a
 * cutover. A brought-forward invoice is still owed, so aged debtors, the
 * forecast and bank matching deliberately don't use these. Activity on or after
 * cutover is real, so it counts even when its invoice is brought forward.
 */
export const invoiceCountsInAccounts = eq(invoices.broughtForward, false);

function activityCounts(invoiceId: AnyPgColumn, date: SQL | AnyPgColumn): SQL {
  return sql`not exists (
    select 1 from invoices bf
    join companies bf_company on bf_company.id = bf.company_id
    where bf.id = ${invoiceId}
      and bf.brought_forward
      and ${date} < bf_company.invoice_cutover_date
  )`;
}

/** Pass the credit note's issue date, or its refund date for refund totals. */
export function creditNoteCountsInAccounts(date: AnyPgColumn): SQL {
  return activityCounts(creditNotes.invoiceId, date);
}

export const paymentCountsInAccounts = activityCounts(
  payments.invoiceId,
  sql`(${payments.receivedAt} AT TIME ZONE 'Europe/London')::date`,
);
