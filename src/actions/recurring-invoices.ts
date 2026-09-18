"use server";

import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { clients, recurringInvoices } from "@/db/schema";
import { mutate } from "@/lib/mutate";
import type { ActionResult } from "@/actions/result";
import { poundsToPence } from "@/lib/money";
import {
  computeNextRunOn,
  type RecurringLineTemplate,
} from "@/lib/invoices/recurring";
import { todayIsoDate } from "@/lib/invoices/status";
import {
  countGeneratedInvoices,
} from "@/lib/invoices/recurring-queries";
import { generateRecurringInvoiceForTemplate } from "@/lib/invoices/recurring-generate";
import { getOrCreateCompanySettings } from "@/lib/settings/queries";
import { parseVatRate, resolveLineVatRate } from "@/lib/vat";
import { revalidatePath } from "next/cache";

const lineSchema = z.object({
  description: z.string().trim().min(1).max(500),
  quantity: z.coerce.number().positive().max(1_000_000),
  unitPricePounds: z.string().trim().min(1),
  vatRate: z.coerce.number().int().min(0).max(100).optional(),
});

const templateSchema = z.object({
  name: z.string().trim().min(1).max(200),
  clientId: z.string().uuid(),
  notes: z.string().max(5000).optional().nullable(),
  dayOfMonth: z.coerce.number().int().min(1).max(28),
  onGenerate: z.enum(["draft", "send"]),
  endsOn: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .or(z.literal("")),
  maxOccurrences: z
    .union([z.coerce.number().int().min(1).max(1200), z.literal(""), z.nan()])
    .optional(),
  enabled: z.enum(["true", "false"]).optional(),
  lines: z.array(lineSchema).min(1, "Add at least one line item"),
});

function parseLinesFromForm(formData: FormData) {
  const raw = formData.get("linesJson");
  if (typeof raw !== "string") return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed;
  } catch {
    return [];
  }
}

function buildLineTemplate(
  lines: z.infer<typeof lineSchema>[],
  company: { vatRegistered: boolean },
): RecurringLineTemplate[] {
  return lines.map((l) => ({
    description: l.description,
    quantity: l.quantity,
    unitPricePence: poundsToPence(l.unitPricePounds),
    vatRate: resolveLineVatRate(company, parseVatRate(l.vatRate)),
  }));
}

function parseMaxOccurrences(
  value: z.infer<typeof templateSchema>["maxOccurrences"],
): number | null {
  if (value === "" || value === undefined || Number.isNaN(value as number)) {
    return null;
  }
  return value as number;
}

function parseEndsOn(value: string | undefined | null): string | null {
  if (!value || value.length === 0) return null;
  return value;
}

export async function createRecurringInvoice(
  formData: FormData,
): Promise<ActionResult> {
  const parsed = templateSchema.safeParse({
    name: formData.get("name"),
    clientId: formData.get("clientId"),
    notes: formData.get("notes") ?? "",
    dayOfMonth: formData.get("dayOfMonth") ?? "1",
    onGenerate: formData.get("onGenerate") ?? "draft",
    endsOn: formData.get("endsOn") ?? "",
    maxOccurrences: formData.get("maxOccurrences") ?? "",
    enabled: formData.get("enabled") ?? "true",
    lines: parseLinesFromForm(formData),
  });
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input",
    };
  }

  const today = todayIsoDate();
  const endsOn = parseEndsOn(parsed.data.endsOn);
  if (endsOn && endsOn < today) {
    return { ok: false, error: "End date must be today or later" };
  }

  const maxOccurrences = parseMaxOccurrences(parsed.data.maxOccurrences);
  const enabled = parsed.data.enabled !== "false";
  const nextRunOn = computeNextRunOn(parsed.data.dayOfMonth, today, null);

  return mutate(
    "accounts:write",
    async ({ companyId }) => {
      const company = await getOrCreateCompanySettings(companyId);
      let lineTemplate: RecurringLineTemplate[];
      try {
        lineTemplate = buildLineTemplate(parsed.data.lines, company);
      } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : "Invalid amount" };
      }

      const db = getDb();
      const [client] = await db
        .select({ id: clients.id })
        .from(clients)
        .where(
          and(eq(clients.id, parsed.data.clientId), eq(clients.companyId, companyId)),
        )
        .limit(1);
      if (!client) return { ok: false, error: "Client not found" };

      const [row] = await db
        .insert(recurringInvoices)
        .values({
          companyId,
          clientId: parsed.data.clientId,
          name: parsed.data.name,
          lineTemplate,
          notes: parsed.data.notes || null,
          dayOfMonth: parsed.data.dayOfMonth,
          onGenerate: parsed.data.onGenerate,
          endsOn,
          maxOccurrences,
          occurrenceCount: 0,
          nextRunOn,
          enabled,
        })
        .returning({ id: recurringInvoices.id });

      return { ok: true, id: row.id };
    },
    {
      audit: { action: "recurring.create", entityType: "recurring_invoice" },
      paths: ["/recurring-invoices", "/invoices"],
    },
  );
}

export async function updateRecurringInvoice(
  id: string,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = templateSchema.safeParse({
    name: formData.get("name"),
    clientId: formData.get("clientId"),
    notes: formData.get("notes") ?? "",
    dayOfMonth: formData.get("dayOfMonth") ?? "1",
    onGenerate: formData.get("onGenerate") ?? "draft",
    endsOn: formData.get("endsOn") ?? "",
    maxOccurrences: formData.get("maxOccurrences") ?? "",
    enabled: formData.get("enabled") ?? "true",
    lines: parseLinesFromForm(formData),
  });
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input",
    };
  }

  const endsOn = parseEndsOn(parsed.data.endsOn);
  const maxOccurrences = parseMaxOccurrences(parsed.data.maxOccurrences);
  const enabled = parsed.data.enabled !== "false";

  return mutate(
    "accounts:write",
    async ({ companyId }) => {
      const company = await getOrCreateCompanySettings(companyId);
      let lineTemplate: RecurringLineTemplate[];
      try {
        lineTemplate = buildLineTemplate(parsed.data.lines, company);
      } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : "Invalid amount" };
      }

      const db = getDb();
      const [existing] = await db
        .select()
        .from(recurringInvoices)
        .where(
          and(
            eq(recurringInvoices.id, id),
            eq(recurringInvoices.companyId, companyId),
          ),
        )
        .limit(1);
      if (!existing) return { ok: false, error: "Recurring invoice not found" };

      const [client] = await db
        .select({ id: clients.id })
        .from(clients)
        .where(
          and(eq(clients.id, parsed.data.clientId), eq(clients.companyId, companyId)),
        )
        .limit(1);
      if (!client) return { ok: false, error: "Client not found" };

      const nextRunOn = computeNextRunOn(
        parsed.data.dayOfMonth,
        todayIsoDate(),
        existing.lastGeneratedAt,
      );

      await db
        .update(recurringInvoices)
        .set({
          clientId: parsed.data.clientId,
          name: parsed.data.name,
          lineTemplate,
          notes: parsed.data.notes || null,
          dayOfMonth: parsed.data.dayOfMonth,
          onGenerate: parsed.data.onGenerate,
          endsOn,
          maxOccurrences,
          nextRunOn,
          enabled,
        })
        .where(
          and(
            eq(recurringInvoices.id, id),
            eq(recurringInvoices.companyId, companyId),
          ),
        );

      return { ok: true, id };
    },
    {
      audit: {
        action: "recurring.update",
        entityType: "recurring_invoice",
        entityId: id,
      },
      paths: ["/recurring-invoices", `/recurring-invoices/${id}`, "/invoices"],
    },
  );
}

export async function setRecurringInvoiceEnabled(
  id: string,
  enabled: boolean,
): Promise<ActionResult> {
  return mutate(
    "accounts:write",
    async ({ companyId }) => {
      const db = getDb();
      const [existing] = await db
        .select({
          id: recurringInvoices.id,
          lastGeneratedAt: recurringInvoices.lastGeneratedAt,
          dayOfMonth: recurringInvoices.dayOfMonth,
        })
        .from(recurringInvoices)
        .where(
          and(
            eq(recurringInvoices.id, id),
            eq(recurringInvoices.companyId, companyId),
          ),
        )
        .limit(1);
      if (!existing) return { ok: false, error: "Recurring invoice not found" };

      const nextRunOn = computeNextRunOn(
        existing.dayOfMonth,
        todayIsoDate(),
        existing.lastGeneratedAt,
      );

      await db
        .update(recurringInvoices)
        .set({ enabled, nextRunOn })
        .where(
          and(
            eq(recurringInvoices.id, id),
            eq(recurringInvoices.companyId, companyId),
          ),
        );

      return { ok: true, id };
    },
    {
      audit: {
        action: enabled ? "recurring.resume" : "recurring.pause",
        entityType: "recurring_invoice",
        entityId: id,
      },
      paths: ["/recurring-invoices", `/recurring-invoices/${id}`],
    },
  );
}

export async function deleteRecurringInvoice(id: string): Promise<ActionResult> {
  return mutate(
    "accounts:write",
    async ({ companyId }) => {
      const db = getDb();
      const [existing] = await db
        .select({ id: recurringInvoices.id })
        .from(recurringInvoices)
        .where(
          and(
            eq(recurringInvoices.id, id),
            eq(recurringInvoices.companyId, companyId),
          ),
        )
        .limit(1);
      if (!existing) return { ok: false, error: "Recurring invoice not found" };

      const generated = await countGeneratedInvoices(companyId, id);
      if (generated > 0) {
        await db
          .update(recurringInvoices)
          .set({ enabled: false })
          .where(
            and(
              eq(recurringInvoices.id, id),
              eq(recurringInvoices.companyId, companyId),
            ),
          );
        revalidatePath("/recurring-invoices");
        revalidatePath(`/recurring-invoices/${id}`);
        return {
          ok: false,
          error:
            "Cannot delete a template with generated invoices. It has been paused instead.",
        };
      }

      await db
        .delete(recurringInvoices)
        .where(
          and(
            eq(recurringInvoices.id, id),
            eq(recurringInvoices.companyId, companyId),
          ),
        );

      return { ok: true, id };
    },
    {
      audit: {
        action: "recurring.delete",
        entityType: "recurring_invoice",
        entityId: id,
      },
      paths: ["/recurring-invoices"],
    },
  );
}

export async function generateRecurringInvoiceNow(
  id: string,
): Promise<ActionResult> {
  return mutate(
    "accounts:write",
    async ({ companyId }) => {
      const db = getDb();
      const [existing] = await db
        .select({ id: recurringInvoices.id })
        .from(recurringInvoices)
        .where(
          and(
            eq(recurringInvoices.id, id),
            eq(recurringInvoices.companyId, companyId),
          ),
        )
        .limit(1);
      if (!existing) return { ok: false, error: "Recurring invoice not found" };

      const result = await generateRecurringInvoiceForTemplate(id);
      if (!result.ok) return result;

      revalidatePath(`/invoices/${result.invoiceId}`);
      return { ok: true, id: result.invoiceId };
    },
    {
      audit: {
        action: "recurring.generate_now",
        entityType: "recurring_invoice",
        entityId: id,
      },
      paths: ["/recurring-invoices", `/recurring-invoices/${id}`, "/invoices", "/dashboard"],
    },
  );
}
