import "server-only";
import { and, count, desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { clients, invoices, recurringInvoices } from "@/db/schema";
import { clientDisplayNameSql } from "@/lib/clients/sql";
import { formatGBP } from "@/lib/money";
import {
  effectiveStatus,
  todayIsoDate,
  type InvoiceStatus,
} from "@/lib/invoices/status";
import type { RecurringLineTemplate } from "@/lib/invoices/recurring";

export async function listRecurringInvoices(companyId: string) {
  const db = getDb();
  const rows = await db
    .select({
      id: recurringInvoices.id,
      name: recurringInvoices.name,
      clientId: recurringInvoices.clientId,
      clientName: clientDisplayNameSql.as("client_name"),
      dayOfMonth: recurringInvoices.dayOfMonth,
      onGenerate: recurringInvoices.onGenerate,
      endsOn: recurringInvoices.endsOn,
      maxOccurrences: recurringInvoices.maxOccurrences,
      occurrenceCount: recurringInvoices.occurrenceCount,
      nextRunOn: recurringInvoices.nextRunOn,
      enabled: recurringInvoices.enabled,
      lastGeneratedAt: recurringInvoices.lastGeneratedAt,
      lineTemplate: recurringInvoices.lineTemplate,
      createdAt: recurringInvoices.createdAt,
    })
    .from(recurringInvoices)
    .innerJoin(clients, eq(recurringInvoices.clientId, clients.id))
    .where(eq(recurringInvoices.companyId, companyId))
    .orderBy(desc(recurringInvoices.createdAt));

  return rows.map((r) => {
    const lines = (r.lineTemplate as RecurringLineTemplate[]) ?? [];
    const grossPence = lines.reduce(
      (acc, l) => acc + Math.round(l.quantity * l.unitPricePence),
      0,
    );
    return {
      id: r.id,
      name: r.name,
      clientId: r.clientId,
      clientName: r.clientName,
      dayOfMonth: r.dayOfMonth,
      onGenerate: r.onGenerate as "draft" | "send",
      endsOn: r.endsOn,
      maxOccurrences: r.maxOccurrences,
      occurrenceCount: r.occurrenceCount,
      nextRunOn: r.nextRunOn,
      enabled: r.enabled,
      lastGeneratedAt: r.lastGeneratedAt,
      createdAt: r.createdAt,
      grossPence,
      grossFormatted: formatGBP(grossPence),
    };
  });
}

export async function getRecurringInvoiceDetail(
  companyId: string,
  id: string,
) {
  const db = getDb();
  const rows = await db
    .select({
      template: recurringInvoices,
      client: clients,
    })
    .from(recurringInvoices)
    .innerJoin(clients, eq(recurringInvoices.clientId, clients.id))
    .where(
      and(
        eq(recurringInvoices.id, id),
        eq(recurringInvoices.companyId, companyId),
      ),
    )
    .limit(1);

  if (!rows[0]) return null;

  const generated = await db
    .select({
      id: invoices.id,
      number: invoices.number,
      status: invoices.status,
      issueDate: invoices.issueDate,
      dueDate: invoices.dueDate,
      grossPence: invoices.grossPence,
      createdAt: invoices.createdAt,
    })
    .from(invoices)
    .where(
      and(
        eq(invoices.recurringInvoiceId, id),
        eq(invoices.companyId, companyId),
      ),
    )
    .orderBy(desc(invoices.createdAt));

  const today = todayIsoDate();
  const lines =
    (rows[0].template.lineTemplate as RecurringLineTemplate[]) ?? [];
  const grossPence = lines.reduce(
    (acc, l) => acc + Math.round(l.quantity * l.unitPricePence),
    0,
  );

  return {
    template: {
      ...rows[0].template,
      onGenerate: rows[0].template.onGenerate as "draft" | "send",
      lineTemplate: lines,
      grossPence,
      grossFormatted: formatGBP(grossPence),
    },
    client: rows[0].client,
    generatedInvoices: generated.map((inv) => ({
      ...inv,
      status: effectiveStatus(inv.status as InvoiceStatus, inv.dueDate, today),
      grossFormatted: formatGBP(inv.grossPence),
    })),
  };
}

export async function countGeneratedInvoices(
  companyId: string,
  recurringInvoiceId: string,
): Promise<number> {
  const db = getDb();
  const [row] = await db
    .select({ n: count() })
    .from(invoices)
    .where(
      and(
        eq(invoices.companyId, companyId),
        eq(invoices.recurringInvoiceId, recurringInvoiceId),
      ),
    );
  return Number(row?.n ?? 0);
}

/** Resolve recurring template name for an invoice (invoice detail link). */
export async function getRecurringTemplateForInvoice(
  companyId: string,
  recurringInvoiceId: string | null | undefined,
): Promise<{ id: string; name: string } | null> {
  if (!recurringInvoiceId) return null;
  const db = getDb();
  const [row] = await db
    .select({
      id: recurringInvoices.id,
      name: recurringInvoices.name,
    })
    .from(recurringInvoices)
    .where(
      and(
        eq(recurringInvoices.id, recurringInvoiceId),
        eq(recurringInvoices.companyId, companyId),
      ),
    )
    .limit(1);
  return row ?? null;
}
