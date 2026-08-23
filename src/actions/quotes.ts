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
import { requireActionPermission } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";
import { ensureLocalUser } from "@/lib/users";
import { invoiceTotals, poundsToPence } from "@/lib/money";
import { allocateInvoiceNumber, allocateQuoteNumber } from "@/lib/invoices/allocate";
import { defaultDueDate, todayIsoDate } from "@/lib/invoices/status";
import { getQuoteDetail, getQuoteVersionSnapshot } from "@/lib/quotes/queries";
import { loadOrRenderQuotePdf } from "@/lib/quotes/pdf-cache";
import { getOrCreateCompanySettings } from "@/lib/settings/queries";
import { sendEmail } from "@/lib/email";
import { escapeHtml } from "@/lib/html";
import { canEditQuote, canRollbackQuote, formatQuoteReference } from "@/lib/quotes/status";
import { insertQuoteVersion, linesToSnapshot } from "@/lib/quotes/versions";
import type { ActionResult } from "@/actions/result";

const lineSchema = z.object({
  description: z.string().trim().min(1, "Description is required"),
  quantity: z.coerce.number().int().positive(),
  unitPricePounds: z.string().trim().min(1, "Unit price is required"),
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
  lines: z.array(lineSchema).min(1, "Add at least one line item"),
});

function isCompleteLine(line: unknown): boolean {
  if (!line || typeof line !== "object") return false;
  const row = line as Record<string, unknown>;
  const description = String(row.description ?? "").trim();
  const unitPricePounds = String(row.unitPricePounds ?? "").trim();
  return description.length > 0 && unitPricePounds.length > 0;
}

function parseLines(formData: FormData) {
  try {
    const raw = JSON.parse(String(formData.get("linesJson") ?? "[]"));
    if (!Array.isArray(raw)) return [];
    return raw.filter(isCompleteLine);
  } catch {
    return [];
  }
}

export async function createQuote(formData: FormData): Promise<ActionResult> {
  const authz = await requireActionPermission("accounts:write");
  if (!authz.ok) return authz;
  const session = authz.user;
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
  const db = getDb();
  const quoteId = await db.transaction(async (tx) => {
    const number = await allocateQuoteNumber(tx, parsed.data.issueDate);
    const [row] = await tx
      .insert(quotes)
      .values({
        number,
        clientId: parsed.data.clientId,
        status: "draft",
        version: 1,
        issueDate: parsed.data.issueDate,
        validUntil: parsed.data.validUntil,
        notes: parsed.data.notes,
        ...totals,
        createdByUserId: localUserId,
      })
      .returning({ id: quotes.id });

    await tx.insert(quoteLineItems).values(
      lineValues.map((l) => ({ ...l, quoteId: row.id })),
    );

    await insertQuoteVersion(tx, {
      quoteId: row.id,
      version: 1,
      snapshot: {
        clientId: parsed.data.clientId,
        issueDate: parsed.data.issueDate,
        validUntil: parsed.data.validUntil,
        notes: parsed.data.notes,
        ...totals,
        lines: linesToSnapshot(lineValues),
      },
      source: "create",
      createdByUserId: localUserId,
    });

    return row.id;
  });

  await writeAudit({
    actorUserId: localUserId,
    action: "quote.create",
    entityType: "quote",
    entityId: quoteId,
  });

  revalidatePath("/dashboard/quotes");
  return { ok: true, id: quoteId };
}

export async function updateQuote(id: string, formData: FormData): Promise<ActionResult> {
  const authz = await requireActionPermission("accounts:write");
  if (!authz.ok) return authz;
  const session = authz.user;
  const localUserId = await ensureLocalUser(session);

  const db = getDb();
  const [existing] = await db.select().from(quotes).where(eq(quotes.id, id)).limit(1);
  if (!existing) return { ok: false, error: "Quote not found" };
  if (!canEditQuote(existing.status)) {
    return { ok: false, error: "This quote cannot be edited" };
  }

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
  const nextVersion = existing.version + 1;

  await db.transaction(async (tx) => {
    await tx
      .update(quotes)
      .set({
        clientId: parsed.data.clientId,
        issueDate: parsed.data.issueDate,
        validUntil: parsed.data.validUntil,
        notes: parsed.data.notes,
        version: nextVersion,
        ...totals,
        pdfBlobPath: null,
      })
      .where(eq(quotes.id, id));

    await tx.delete(quoteLineItems).where(eq(quoteLineItems.quoteId, id));
    await tx.insert(quoteLineItems).values(lineValues.map((l) => ({ ...l, quoteId: id })));

    await insertQuoteVersion(tx, {
      quoteId: id,
      version: nextVersion,
      snapshot: {
        clientId: parsed.data.clientId,
        issueDate: parsed.data.issueDate,
        validUntil: parsed.data.validUntil,
        notes: parsed.data.notes,
        ...totals,
        lines: linesToSnapshot(lineValues),
      },
      source: "edit",
      createdByUserId: localUserId,
    });
  });

  await writeAudit({
    actorUserId: localUserId,
    action: "quote.update",
    entityType: "quote",
    entityId: id,
    meta: { version: nextVersion },
  });

  revalidatePath("/dashboard/quotes");
  revalidatePath(`/dashboard/quotes/${id}`);
  return { ok: true, id };
}

export async function rollbackQuote(
  quoteId: string,
  targetVersion: number,
): Promise<ActionResult> {
  const authz = await requireActionPermission("accounts:write");
  if (!authz.ok) return authz;
  const session = authz.user;
  const localUserId = await ensureLocalUser(session);

  if (!Number.isInteger(targetVersion) || targetVersion < 1) {
    return { ok: false, error: "Invalid version" };
  }

  const db = getDb();
  const [existing] = await db.select().from(quotes).where(eq(quotes.id, quoteId)).limit(1);
  if (!existing) return { ok: false, error: "Quote not found" };
  if (!canRollbackQuote(existing.status)) {
    return { ok: false, error: "This quote cannot be rolled back" };
  }
  if (targetVersion === existing.version) {
    return { ok: false, error: "Already on this version" };
  }

  const snapshot = await getQuoteVersionSnapshot(quoteId, targetVersion);
  if (!snapshot) return { ok: false, error: "Version not found" };

  const nextVersion = existing.version + 1;
  const lineValues = snapshot.lines.map((l, i) => ({
    description: l.description,
    quantity: l.quantity,
    unitPricePence: l.unitPricePence,
    vatRate: l.vatRate,
    position: i,
  }));

  await db.transaction(async (tx) => {
    await tx
      .update(quotes)
      .set({
        clientId: snapshot.clientId,
        issueDate: snapshot.issueDate,
        validUntil: snapshot.validUntil,
        notes: snapshot.notes,
        netPence: snapshot.netPence,
        vatPence: snapshot.vatPence,
        grossPence: snapshot.grossPence,
        version: nextVersion,
        pdfBlobPath: null,
      })
      .where(eq(quotes.id, quoteId));

    await tx.delete(quoteLineItems).where(eq(quoteLineItems.quoteId, quoteId));
    await tx.insert(quoteLineItems).values(lineValues.map((l) => ({ ...l, quoteId })));

    await insertQuoteVersion(tx, {
      quoteId,
      version: nextVersion,
      snapshot,
      source: "rollback",
      createdByUserId: localUserId,
      rolledBackFromVersion: targetVersion,
    });
  });

  await writeAudit({
    actorUserId: localUserId,
    action: "quote.rollback",
    entityType: "quote",
    entityId: quoteId,
    meta: { fromVersion: targetVersion, toVersion: nextVersion },
  });

  revalidatePath("/dashboard/quotes");
  revalidatePath(`/dashboard/quotes/${quoteId}`);
  return { ok: true, id: quoteId };
}

export async function convertQuoteToInvoice(quoteId: string): Promise<ActionResult> {
  const authz = await requireActionPermission("accounts:write");
  if (!authz.ok) return authz;
  const session = authz.user;
  const localUserId = await ensureLocalUser(session);

  const detail = await getQuoteDetail(quoteId);
  if (!detail) return { ok: false, error: "Quote not found" };
  if (detail.quote.status === "converted") {
    return { ok: false, error: "Quote already converted" };
  }
  if (detail.quote.status === "declined") {
    return { ok: false, error: "Cannot convert a declined quote" };
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

const sendQuoteSchema = z.object({
  to: z.string().trim().email("Enter a valid email address"),
  message: z.string().trim().min(1, "Message is required"),
});

function messageToHtml(message: string): string {
  return escapeHtml(message).replace(/\n/g, "<br/>");
}

export async function sendQuote(quoteId: string, formData: FormData): Promise<ActionResult> {
  const authz = await requireActionPermission("accounts:write");
  if (!authz.ok) return authz;
  const session = authz.user;
  const localUserId = await ensureLocalUser(session);

  const parsed = sendQuoteSchema.safeParse({
    to: formData.get("to"),
    message: formData.get("message"),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const detail = await getQuoteDetail(quoteId);
  if (!detail) return { ok: false, error: "Quote not found" };
  if (detail.quote.status === "converted") {
    return { ok: false, error: "Cannot send a converted quote" };
  }
  if (detail.quote.status === "declined") {
    return { ok: false, error: "Cannot send a declined quote" };
  }

  const company = await getOrCreateCompanySettings();
  const { bytes, filename } = await loadOrRenderQuotePdf(quoteId);

  await sendEmail({
    to: parsed.data.to,
    subject: `Quote ${formatQuoteReference(detail.quote.number, detail.quote.version)} from ${company.name}`,
    html: messageToHtml(parsed.data.message),
    text: parsed.data.message,
    attachments: [
      {
        filename,
        content: Buffer.from(bytes),
        contentType: "application/pdf",
      },
    ],
  });

  const db = getDb();
  const now = new Date();
  await db
    .update(quotes)
    .set({
      status: detail.quote.status === "draft" ? "sent" : detail.quote.status,
      sentAt: now,
    })
    .where(eq(quotes.id, quoteId));

  await writeAudit({
    actorUserId: localUserId,
    action: "quote.send",
    entityType: "quote",
    entityId: quoteId,
    meta: { to: parsed.data.to },
  });

  revalidatePath("/dashboard/quotes");
  revalidatePath(`/dashboard/quotes/${quoteId}`);
  return { ok: true, id: quoteId };
}
