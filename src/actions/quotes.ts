"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import {
  invoiceLineItems,
  invoices,
  quoteLineItems,
  quotes,
} from "@/db/schema";
import { requirePermission } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";
import { ensureLocalUser } from "@/lib/users";
import { invoiceTotals, poundsToPence } from "@/lib/money";
import { allocateInvoiceNumber } from "@/lib/invoices/allocate";
import { defaultDueDate, todayIsoDate } from "@/lib/invoices/status";
import { getQuoteDetail, nextQuoteNumber } from "@/lib/quotes/queries";
import type { ActionResult } from "@/actions/clients";

const lineSchema = z.object({
  description: z.string().trim().min(1),
  quantity: z.coerce.number().int().positive(),
  unitPricePounds: z.string().trim().min(1),
});

const quoteSchema = z.object({
  clientId: z.string().uuid(),
  issueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  validUntil: z
    .string()
    .optional()
    .or(z.literal(""))
    .transform((v) => (v === "" || !v ? null : v)),
  notes: z
    .string()
    .optional()
    .or(z.literal(""))
    .transform((v) => (v === "" || !v ? null : v)),
  lines: z.array(lineSchema).min(1),
});

function parseLines(formData: FormData) {
  try {
    return JSON.parse(String(formData.get("linesJson") ?? "[]"));
  } catch {
    return [];
  }
}

export async function createQuote(formData: FormData): Promise<ActionResult> {
  const session = await requirePermission("accounts:write");
  const localUserId = await ensureLocalUser(session);

  const parsed = quoteSchema.safeParse({
    clientId: formData.get("clientId"),
    issueDate: formData.get("issueDate") || todayIsoDate(),
    validUntil: formData.get("validUntil") ?? "",
    notes: formData.get("notes") ?? "",
    lines: parseLines(formData),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  let lineValues;
  try {
    lineValues = parsed.data.lines.map((l, i) => ({
      description: l.description,
      quantity: l.quantity,
      unitPricePence: poundsToPence(l.unitPricePounds),
      vatRate: 0,
      position: i,
    }));
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Invalid amount" };
  }
  const totals = invoiceTotals(lineValues);
  const number = await nextQuoteNumber();

  const db = getDb();
  const [row] = await db
    .insert(quotes)
    .values({
      number,
      clientId: parsed.data.clientId,
      status: "draft",
      issueDate: parsed.data.issueDate,
      validUntil: parsed.data.validUntil,
      notes: parsed.data.notes,
      ...totals,
      createdByUserId: localUserId,
    })
    .returning({ id: quotes.id });

  await db.insert(quoteLineItems).values(
    lineValues.map((l) => ({ ...l, quoteId: row.id })),
  );

  await writeAudit({
    actorUserId: localUserId,
    action: "quote.create",
    entityType: "quote",
    entityId: row.id,
  });

  revalidatePath("/dashboard/quotes");
  return { ok: true, id: row.id };
}

export async function convertQuoteToInvoice(quoteId: string): Promise<ActionResult> {
  const session = await requirePermission("accounts:write");
  const localUserId = await ensureLocalUser(session);

  const detail = await getQuoteDetail(quoteId);
  if (!detail) return { ok: false, error: "Quote not found" };
  if (detail.quote.status === "converted") {
    return { ok: false, error: "Quote already converted" };
  }

  const issueDate = todayIsoDate();
  const db = getDb();

  const invoiceId = await db.transaction(async (tx) => {
    const number = await allocateInvoiceNumber(tx, issueDate);
    const [inv] = await tx
      .insert(invoices)
      .values({
        number,
        clientId: detail.quote.clientId,
        status: "draft",
        issueDate,
        dueDate: defaultDueDate(issueDate),
        notes: detail.quote.notes,
        netPence: detail.quote.netPence,
        vatPence: detail.quote.vatPence,
        grossPence: detail.quote.grossPence,
        createdByUserId: localUserId,
      })
      .returning({ id: invoices.id });

    await tx.insert(invoiceLineItems).values(
      detail.lines.map((l) => ({
        invoiceId: inv.id,
        description: l.description,
        quantity: l.quantity,
        unitPricePence: l.unitPricePence,
        vatRate: l.vatRate,
        position: l.position,
      })),
    );

    await tx
      .update(quotes)
      .set({ status: "converted", convertedInvoiceId: inv.id })
      .where(eq(quotes.id, quoteId));

    return inv.id;
  });

  await writeAudit({
    actorUserId: localUserId,
    action: "quote.convert",
    entityType: "quote",
    entityId: quoteId,
    meta: { invoiceId },
  });

  revalidatePath("/dashboard/quotes");
  revalidatePath("/dashboard/invoices");
  return { ok: true, id: invoiceId };
}
