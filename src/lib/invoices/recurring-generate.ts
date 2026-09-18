import { and, desc, eq, isNull } from "drizzle-orm";
import { getDb, hasDatabaseClient } from "@/db";
import {
  clients,
  companies,
  invoiceLineItems,
  invoices,
  recurringInvoices,
} from "@/db/schema";
import { writeAudit } from "@/lib/audit";
import { invoiceTotals } from "@/lib/money";
import { allocateInvoiceNumber } from "@/lib/invoices/allocate";
import {
  computeNextRunOn,
  isRecurringExhausted,
  shouldDisableAfterGenerate,
  type RecurringLineTemplate,
  type RecurringOnGenerate,
} from "@/lib/invoices/recurring";
import { defaultDueDate, todayIsoDate } from "@/lib/invoices/status";
import { enqueueSendJob, processSendJob } from "@/lib/outbox";

export type RecurringGenerateResult =
  | { skipped: "no database"; generated?: undefined }
  | {
      skipped?: undefined;
      generated: number;
      sent: number;
      draftFallback: number;
    };

export type GenerateOneOptions = {
  /** Override "today" for tests / generate-now. */
  today?: string;
};

/**
 * Generate draft (or auto-send) invoices from enabled recurring templates
 * for today's day-of-month. Skips suspended companies.
 */
export async function generateRecurringInvoices(
  options: GenerateOneOptions = {},
): Promise<RecurringGenerateResult> {
  if (!hasDatabaseClient()) {
    return { skipped: "no database" };
  }

  const today = options.today ?? todayIsoDate();
  const day = Number(today.slice(8, 10));
  const db = getDb();

  const templates = await db
    .select({
      id: recurringInvoices.id,
      companyId: recurringInvoices.companyId,
      clientId: recurringInvoices.clientId,
      lineTemplate: recurringInvoices.lineTemplate,
      notes: recurringInvoices.notes,
      dayOfMonth: recurringInvoices.dayOfMonth,
      onGenerate: recurringInvoices.onGenerate,
      endsOn: recurringInvoices.endsOn,
      maxOccurrences: recurringInvoices.maxOccurrences,
      occurrenceCount: recurringInvoices.occurrenceCount,
      lastGeneratedAt: recurringInvoices.lastGeneratedAt,
      paymentTermsDays: companies.invoicePaymentTermsDays,
      clientEmail: clients.email,
    })
    .from(recurringInvoices)
    .innerJoin(companies, eq(companies.id, recurringInvoices.companyId))
    .innerJoin(clients, eq(clients.id, recurringInvoices.clientId))
    .where(
      and(
        eq(recurringInvoices.enabled, true),
        eq(recurringInvoices.dayOfMonth, day),
        isNull(companies.suspendedAt),
      ),
    );

  let generated = 0;
  let sent = 0;
  let draftFallback = 0;

  for (const tmpl of templates) {
    const result = await generateFromTemplateRow(tmpl, today);
    if (result === "generated") generated++;
    else if (result === "sent") {
      generated++;
      sent++;
    } else if (result === "draft_fallback") {
      generated++;
      draftFallback++;
    }
  }

  return { generated, sent, draftFallback };
}

type TemplateRow = {
  id: string;
  companyId: string;
  clientId: string;
  lineTemplate: unknown;
  notes: string | null;
  dayOfMonth: number;
  onGenerate: string;
  endsOn: string | null;
  maxOccurrences: number | null;
  occurrenceCount: number;
  lastGeneratedAt: Date | null;
  paymentTermsDays: number;
  clientEmail: string | null;
};

/**
 * Generate for a single template ("generate now").
 * Once per calendar month — returns an error if already generated this month.
 */
export async function generateRecurringInvoiceForTemplate(
  templateId: string,
  options: GenerateOneOptions = {},
): Promise<
  | { ok: true; invoiceId: string; sent: boolean; draftFallback: boolean }
  | { ok: false; error: string }
> {
  if (!hasDatabaseClient()) {
    return { ok: false, error: "Database not configured" };
  }

  const today = options.today ?? todayIsoDate();
  const db = getDb();

  const rows = await db
    .select({
      id: recurringInvoices.id,
      companyId: recurringInvoices.companyId,
      clientId: recurringInvoices.clientId,
      lineTemplate: recurringInvoices.lineTemplate,
      notes: recurringInvoices.notes,
      dayOfMonth: recurringInvoices.dayOfMonth,
      onGenerate: recurringInvoices.onGenerate,
      endsOn: recurringInvoices.endsOn,
      maxOccurrences: recurringInvoices.maxOccurrences,
      occurrenceCount: recurringInvoices.occurrenceCount,
      lastGeneratedAt: recurringInvoices.lastGeneratedAt,
      enabled: recurringInvoices.enabled,
      paymentTermsDays: companies.invoicePaymentTermsDays,
      clientEmail: clients.email,
      suspendedAt: companies.suspendedAt,
    })
    .from(recurringInvoices)
    .innerJoin(companies, eq(companies.id, recurringInvoices.companyId))
    .innerJoin(clients, eq(clients.id, recurringInvoices.clientId))
    .where(eq(recurringInvoices.id, templateId))
    .limit(1);

  const tmpl = rows[0];
  if (!tmpl) return { ok: false, error: "Recurring invoice not found" };
  if (tmpl.suspendedAt) {
    return { ok: false, error: "Company is suspended" };
  }
  if (!tmpl.enabled) {
    return { ok: false, error: "Template is paused" };
  }

  const outcome = await generateFromTemplateRow(tmpl, today);
  if (outcome === "skipped_month") {
    return {
      ok: false,
      error: "Already generated an invoice for this template this month",
    };
  }
  if (outcome === "skipped_exhausted") {
    return { ok: false, error: "Template has ended (date or occurrence limit)" };
  }
  if (outcome === "skipped_empty") {
    return { ok: false, error: "Template has no line items" };
  }
  if (outcome === "skipped") {
    return { ok: false, error: "Could not generate invoice" };
  }

  const latest = await db
    .select({ id: invoices.id })
    .from(invoices)
    .where(eq(invoices.recurringInvoiceId, templateId))
    .orderBy(desc(invoices.createdAt))
    .limit(1);

  const invoiceId = latest[0]?.id;
  if (!invoiceId) {
    return { ok: false, error: "Invoice was not created" };
  }

  return {
    ok: true,
    invoiceId,
    sent: outcome === "sent",
    draftFallback: outcome === "draft_fallback",
  };
}

type GenerateOutcome =
  | "generated"
  | "sent"
  | "draft_fallback"
  | "skipped_month"
  | "skipped_exhausted"
  | "skipped_empty"
  | "skipped";

async function generateFromTemplateRow(
  tmpl: TemplateRow,
  today: string,
): Promise<GenerateOutcome> {
  if (
    isRecurringExhausted({
      today,
      endsOn: tmpl.endsOn,
      maxOccurrences: tmpl.maxOccurrences,
      occurrenceCount: tmpl.occurrenceCount,
    })
  ) {
    return "skipped_exhausted";
  }

  if (tmpl.lastGeneratedAt) {
    const last = todayIsoDate(tmpl.lastGeneratedAt).slice(0, 7);
    if (last === today.slice(0, 7)) return "skipped_month";
  }

  const lines = tmpl.lineTemplate as RecurringLineTemplate[];
  if (!Array.isArray(lines) || lines.length === 0) return "skipped_empty";

  const totals = invoiceTotals(
    lines.map((l) => ({
      quantity: l.quantity,
      unitPricePence: l.unitPricePence,
      vatRate: 0,
    })),
  );

  const dueDate = defaultDueDate(today, tmpl.paymentTermsDays ?? 14);
  const onGenerate = (
    tmpl.onGenerate === "send" ? "send" : "draft"
  ) as RecurringOnGenerate;

  const db = getDb();
  let invoiceId: string;

  try {
    invoiceId = await db.transaction(async (tx) => {
      const number = await allocateInvoiceNumber(tx, tmpl.companyId, today);
      const [inv] = await tx
        .insert(invoices)
        .values({
          companyId: tmpl.companyId,
          number,
          clientId: tmpl.clientId,
          status: "draft",
          issueDate: today,
          dueDate,
          notes: tmpl.notes,
          recurringInvoiceId: tmpl.id,
          ...totals,
        })
        .returning({ id: invoices.id });

      await tx.insert(invoiceLineItems).values(
        lines.map((l, i) => ({
          invoiceId: inv.id,
          description: l.description,
          quantity: l.quantity,
          unitPricePence: l.unitPricePence,
          vatRate: 0,
          position: i,
        })),
      );

      const generatedAt = new Date(`${today}T12:00:00Z`);
      const newCount = tmpl.occurrenceCount + 1;
      const nextRunOn = computeNextRunOn(tmpl.dayOfMonth, today, generatedAt);
      const disable = shouldDisableAfterGenerate({
        nextRunOn,
        endsOn: tmpl.endsOn,
        maxOccurrences: tmpl.maxOccurrences,
        occurrenceCount: newCount,
      });

      await tx
        .update(recurringInvoices)
        .set({
          lastGeneratedAt: generatedAt,
          occurrenceCount: newCount,
          nextRunOn,
          ...(disable ? { enabled: false } : {}),
        })
        .where(eq(recurringInvoices.id, tmpl.id));

      return inv.id;
    });
  } catch (e) {
    console.error(
      JSON.stringify({
        level: "error",
        msg: "recurring.generate.failed",
        templateId: tmpl.id,
        error: e instanceof Error ? e.message : String(e),
      }),
    );
    return "skipped";
  }

  await writeAudit({
    companyId: tmpl.companyId,
    actorUserId: null,
    action: "invoice.create",
    entityType: "invoice",
    entityId: invoiceId,
    meta: { source: "recurring", recurringInvoiceId: tmpl.id },
  });

  if (onGenerate === "send") {
    if (!tmpl.clientEmail?.trim()) {
      return "draft_fallback";
    }
    try {
      const jobId = await enqueueSendJob(
        "invoice_send",
        tmpl.companyId,
        invoiceId,
      );
      const delivered = await processSendJob(jobId);
      if (!delivered.ok) {
        console.warn(
          JSON.stringify({
            level: "warn",
            msg: "recurring.send.fallback_draft",
            invoiceId,
            error: delivered.error,
          }),
        );
        return "draft_fallback";
      }
      await writeAudit({
        companyId: tmpl.companyId,
        actorUserId: null,
        action: "invoice.send",
        entityType: "invoice",
        entityId: invoiceId,
        meta: {
          source: "recurring",
          recurringInvoiceId: tmpl.id,
          to: tmpl.clientEmail,
          jobId,
        },
      });
      return "sent";
    } catch (e) {
      console.warn(
        JSON.stringify({
          level: "warn",
          msg: "recurring.send.error",
          invoiceId,
          error: e instanceof Error ? e.message : String(e),
        }),
      );
      return "draft_fallback";
    }
  }

  return "generated";
}
