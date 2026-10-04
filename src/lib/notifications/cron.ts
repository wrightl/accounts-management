import "server-only";
import { and, eq, inArray, isNotNull, isNull, lt, sql } from "drizzle-orm";
import { getDb } from "@/db";
import {
  companies,
  invoices,
  quotes,
  recurringInvoices,
} from "@/db/schema";
import { notify } from "./create";
import { formatNotifyDate, todayKey } from "./queries";

function addDaysIso(days: number, from = new Date()): string {
  const d = new Date(
    Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()),
  );
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Daily notification scanners: quote expiry windows, expired quotes,
 * overdue invoices, and recurring invoices due in 3 days.
 */
export async function runNotificationScanners(): Promise<{
  quoteExpiring3d: number;
  quoteExpiring1d: number;
  quoteExpired: number;
  invoiceOverdue: number;
  recurringDue3d: number;
}> {
  const [quoteExpiring3d, quoteExpiring1d, quoteExpired, invoiceOverdue, recurringDue3d] =
    await Promise.all([
      scanQuoteExpiring(3, "quote.expiring.3d"),
      scanQuoteExpiring(1, "quote.expiring.1d"),
      scanQuotesExpired(),
      scanOverdueInvoices(),
      scanRecurringDueIn3Days(),
    ]);

  return {
    quoteExpiring3d,
    quoteExpiring1d,
    quoteExpired,
    invoiceOverdue,
    recurringDue3d,
  };
}

async function scanQuoteExpiring(
  days: number,
  type: "quote.expiring.3d" | "quote.expiring.1d",
): Promise<number> {
  const db = getDb();
  const target = addDaysIso(days);
  const today = addDaysIso(0);
  const rows = await db
    .select({
      id: quotes.id,
      companyId: quotes.companyId,
      number: quotes.number,
      validUntil: quotes.validUntil,
    })
    .from(quotes)
    .innerJoin(companies, eq(companies.id, quotes.companyId))
    .where(
      and(
        inArray(quotes.status, ["sent", "draft"]),
        eq(quotes.validUntil, target),
        isNull(companies.suspendedAt),
        // Only open quotes that haven't already expired
        sql`${quotes.validUntil} >= ${today}`,
      ),
    );

  let created = 0;
  for (const q of rows) {
    if (!q.validUntil) continue;
    const result = await notify({
      companyId: q.companyId,
      type,
      title:
        days === 1
          ? `Quote ${q.number} expires tomorrow`
          : `Quote ${q.number} expires in ${days} days`,
      body: `Valid until ${formatNotifyDate(q.validUntil)}.`,
      href: `/quotes/${q.id}`,
      entityType: "quote",
      entityId: q.id,
      dedupeKey: `${type}:${q.id}:${q.validUntil}`,
    });
    created += result.created;
  }
  return created;
}

async function scanQuotesExpired(): Promise<number> {
  const db = getDb();
  const today = addDaysIso(0);
  const rows = await db
    .select({
      id: quotes.id,
      companyId: quotes.companyId,
      number: quotes.number,
      validUntil: quotes.validUntil,
    })
    .from(quotes)
    .innerJoin(companies, eq(companies.id, quotes.companyId))
    .where(
      and(
        inArray(quotes.status, ["sent", "draft"]),
        isNotNull(quotes.validUntil),
        lt(quotes.validUntil, today),
        isNull(companies.suspendedAt),
      ),
    );

  let created = 0;
  for (const q of rows) {
    if (!q.validUntil) continue;
    const result = await notify({
      companyId: q.companyId,
      type: "quote.expired",
      title: `Quote ${q.number} has expired`,
      body: `Expired on ${formatNotifyDate(q.validUntil)}.`,
      href: `/quotes/${q.id}`,
      entityType: "quote",
      entityId: q.id,
      dedupeKey: `quote.expired:${q.id}:${q.validUntil}`,
    });
    created += result.created;
  }
  return created;
}

async function scanOverdueInvoices(): Promise<number> {
  const db = getDb();
  const today = addDaysIso(0);
  const rows = await db
    .select({
      id: invoices.id,
      companyId: invoices.companyId,
      number: invoices.number,
      dueDate: invoices.dueDate,
    })
    .from(invoices)
    .innerJoin(companies, eq(companies.id, invoices.companyId))
    .where(
      and(
        eq(invoices.status, "sent"),
        lt(invoices.dueDate, today),
        isNull(companies.suspendedAt),
      ),
    );

  const day = todayKey();
  let created = 0;
  for (const inv of rows) {
    if (!inv.dueDate) continue;
    const result = await notify({
      companyId: inv.companyId,
      type: "invoice.overdue",
      title: `Invoice ${inv.number} is overdue`,
      body: `Due ${formatNotifyDate(inv.dueDate)}.`,
      href: `/invoices/${inv.id}`,
      entityType: "invoice",
      entityId: inv.id,
      // One notice per invoice per calendar day while still overdue
      dedupeKey: `invoice.overdue:${inv.id}:${day}`,
    });
    created += result.created;
  }
  return created;
}

async function scanRecurringDueIn3Days(): Promise<number> {
  const db = getDb();
  const target = addDaysIso(3);
  const rows = await db
    .select({
      id: recurringInvoices.id,
      companyId: recurringInvoices.companyId,
      name: recurringInvoices.name,
      nextRunOn: recurringInvoices.nextRunOn,
    })
    .from(recurringInvoices)
    .innerJoin(companies, eq(companies.id, recurringInvoices.companyId))
    .where(
      and(
        eq(recurringInvoices.enabled, true),
        eq(recurringInvoices.nextRunOn, target),
        isNull(companies.suspendedAt),
      ),
    );

  let created = 0;
  for (const tmpl of rows) {
    if (!tmpl.nextRunOn) continue;
    const label = tmpl.name?.trim() || "Recurring invoice";
    const result = await notify({
      companyId: tmpl.companyId,
      type: "recurring.due.3d",
      title: `${label} due in 3 days`,
      body: `Scheduled for ${formatNotifyDate(tmpl.nextRunOn)}.`,
      href: `/recurring-invoices/${tmpl.id}`,
      entityType: "recurring_invoice",
      entityId: tmpl.id,
      dedupeKey: `recurring.due.3d:${tmpl.id}:${tmpl.nextRunOn}`,
    });
    created += result.created;
  }
  return created;
}
