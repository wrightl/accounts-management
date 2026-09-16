"use server";

import { revalidatePath } from "next/cache";
import { and, eq} from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { invoiceLineItems, invoices } from "@/db/schema";
import { requireActionPermission } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";
import { ensureLocalUser } from "@/lib/users";
import { invoiceTotals, poundsToPence } from "@/lib/money";
import { allocateInvoiceNumber } from "@/lib/invoices/allocate";
import {
  canEditInvoice,
  canTransition,
  defaultDueDate,
  storedStatus,
  todayIsoDate,
  type InvoiceStatus,
} from "@/lib/invoices/status";
import { getInvoiceDetail } from "@/lib/invoices/queries";
import { enqueueSendJob, processSendJob } from "@/lib/outbox";
import type { ActionResult } from "@/actions/result";

const lineSchema = z.object({
  description: z.string().trim().min(1),
  quantity: z.coerce.number().int().positive(),
  unitPricePounds: z.string().trim().min(1),
});

const invoiceSchema = z.object({
  clientId: z.string().uuid(),
  issueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  dueDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .or(z.literal("")),
  notes: z
    .string()
    .optional()
    .or(z.literal(""))
    .transform((v) => (v === "" ? null : v ?? null)),
  lines: z.array(lineSchema).min(1, "Add at least one line item"),
});

function parseLinesFromForm(formData: FormData) {
  const raw = formData.get("linesJson");
  if (typeof raw !== "string") return [];
  try {
    return JSON.parse(raw) as unknown[];
  } catch {
    return [];
  }
}

function buildLineValues(lines: z.infer<typeof lineSchema>[]) {
  return lines.map((l, i) => {
    const unitPricePence = poundsToPence(l.unitPricePounds);
    return {
      description: l.description,
      quantity: l.quantity,
      unitPricePence,
      vatRate: 0,
      position: i,
    };
  });
}

export async function createInvoice(formData: FormData): Promise<ActionResult> {
  const authz = await requireActionPermission("accounts:write");
  if (!authz.ok) return authz;
  if (!authz.user.companyId) {
    return { ok: false, error: "Complete onboarding before using the dashboard." };
  }
  const companyId = authz.user.companyId;

  const session = authz.user;
  const localUserId = await ensureLocalUser(session);

  const parsed = invoiceSchema.safeParse({
    clientId: formData.get("clientId"),
    issueDate: formData.get("issueDate") || todayIsoDate(),
    dueDate: formData.get("dueDate") ?? "",
    notes: formData.get("notes") ?? "",
    lines: parseLinesFromForm(formData),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const issueDate = parsed.data.issueDate;
  const dueDate =
    parsed.data.dueDate && parsed.data.dueDate.length > 0
      ? parsed.data.dueDate
      : defaultDueDate(issueDate);

  let lineValues;
  try {
    lineValues = buildLineValues(parsed.data.lines);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Invalid amount" };
  }
  const totals = invoiceTotals(lineValues);

  const db = getDb();
  const invoiceId = await db.transaction(async (tx) => {
    const number = await allocateInvoiceNumber(tx, companyId, issueDate);
    const [inv] = await tx
      .insert(invoices)
      .values({
        companyId,
        number,
        clientId: parsed.data.clientId,
        status: "draft",
        issueDate,
        dueDate,
        notes: parsed.data.notes,
        netPence: totals.netPence,
        vatPence: totals.vatPence,
        grossPence: totals.grossPence,
        createdByUserId: localUserId,
      })
      .returning({ id: invoices.id });

    await tx.insert(invoiceLineItems).values(
      lineValues.map((l) => ({ ...l, invoiceId: inv.id })),
    );
    return inv.id;
  });

  await writeAudit({
    companyId,
    actorUserId: localUserId,
    action: "invoice.create",
    entityType: "invoice",
    entityId: invoiceId,
  });

  revalidatePath("/invoices");
  revalidatePath("/dashboard");
  return { ok: true, id: invoiceId };
}

export async function updateInvoice(
  id: string,
  formData: FormData,
): Promise<ActionResult> {
  const authz = await requireActionPermission("accounts:write");
  if (!authz.ok) return authz;
  if (!authz.user.companyId) {
    return { ok: false, error: "Complete onboarding before using the dashboard." };
  }
  const companyId = authz.user.companyId;

  const session = authz.user;
  const localUserId = await ensureLocalUser(session);

  const db = getDb();
  const [existing] = await db
    .select()
    .from(invoices)
    .where(and(eq(invoices.id, id), eq(invoices.companyId, companyId)))
    .limit(1);
  if (!existing) return { ok: false, error: "Invoice not found" };
  if (!canEditInvoice(existing.status as InvoiceStatus)) {
    return { ok: false, error: "Only draft invoices can be edited" };
  }

  const parsed = invoiceSchema.safeParse({
    clientId: formData.get("clientId"),
    issueDate: formData.get("issueDate") || todayIsoDate(),
    dueDate: formData.get("dueDate") ?? "",
    notes: formData.get("notes") ?? "",
    lines: parseLinesFromForm(formData),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const issueDate = parsed.data.issueDate;
  const dueDate =
    parsed.data.dueDate && parsed.data.dueDate.length > 0
      ? parsed.data.dueDate
      : defaultDueDate(issueDate);

  let lineValues;
  try {
    lineValues = buildLineValues(parsed.data.lines);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Invalid amount" };
  }
  const totals = invoiceTotals(lineValues);

  await db.transaction(async (tx) => {
    await tx
      .update(invoices)
      .set({
        clientId: parsed.data.clientId,
        issueDate,
        dueDate,
        notes: parsed.data.notes,
        netPence: totals.netPence,
        vatPence: totals.vatPence,
        grossPence: totals.grossPence,
        pdfBlobPath: null,
      })
      .where(and(eq(invoices.id, id), eq(invoices.companyId, companyId)));

    await tx.delete(invoiceLineItems).where(eq(invoiceLineItems.invoiceId, id));
    await tx.insert(invoiceLineItems).values(
      lineValues.map((l) => ({ ...l, invoiceId: id })),
    );
  });

  await writeAudit({
    companyId,
    actorUserId: localUserId,
    action: "invoice.update",
    entityType: "invoice",
    entityId: id,
  });

  revalidatePath("/invoices");
  revalidatePath(`/invoices/${id}`);
  revalidatePath("/dashboard");
  return { ok: true, id };
}

export async function voidInvoice(id: string): Promise<ActionResult> {
  const authz = await requireActionPermission("accounts:write");
  if (!authz.ok) return authz;
  if (!authz.user.companyId) {
    return { ok: false, error: "Complete onboarding before using the dashboard." };
  }
  const companyId = authz.user.companyId;

  const session = authz.user;
  const localUserId = await ensureLocalUser(session);

  const db = getDb();
  const [existing] = await db
    .select()
    .from(invoices)
    .where(and(eq(invoices.id, id), eq(invoices.companyId, companyId)))
    .limit(1);
  if (!existing) return { ok: false, error: "Invoice not found" };

  const from = storedStatus(existing.status);
  if (!canTransition(from, "void")) {
    return { ok: false, error: `Cannot void an invoice in status "${from}"` };
  }

  await db
    .update(invoices)
    .set({ status: "void" })
    .where(and(eq(invoices.id, id), eq(invoices.companyId, companyId)));

  await writeAudit({
    companyId,
    actorUserId: localUserId,
    action: "invoice.void",
    entityType: "invoice",
    entityId: id,
  });

  revalidatePath("/invoices");
  revalidatePath(`/invoices/${id}`);
  revalidatePath("/dashboard");
  return { ok: true, id };
}

export async function sendInvoice(id: string): Promise<ActionResult> {
  const authz = await requireActionPermission("accounts:write");
  if (!authz.ok) return authz;
  if (!authz.user.companyId) {
    return { ok: false, error: "Complete onboarding before using the dashboard." };
  }
  const companyId = authz.user.companyId;

  const session = authz.user;
  const localUserId = await ensureLocalUser(session);

  const detail = await getInvoiceDetail(companyId, id);
  if (!detail) return { ok: false, error: "Invoice not found" };

  const from = storedStatus(detail.invoice.status);
  if (from !== "draft" && from !== "sent") {
    return { ok: false, error: `Cannot send an invoice in status "${from}"` };
  }
  if (!detail.client.email) {
    return { ok: false, error: "Client has no email address" };
  }

  const jobId = await enqueueSendJob("invoice_send", companyId, id);
  const delivered = await processSendJob(jobId);
  if (!delivered.ok) {
    return {
      ok: false,
      error: delivered.error ?? "Failed to send invoice. It will retry automatically.",
    };
  }

  await writeAudit({
    companyId,
    actorUserId: localUserId,
    action: "invoice.send",
    entityType: "invoice",
    entityId: id,
    meta: { to: detail.client.email, jobId },
  });

  revalidatePath("/invoices");
  revalidatePath(`/invoices/${id}`);
  revalidatePath("/dashboard");
  return { ok: true, id };
}

const updateStatusSchema = z.object({
  status: z.enum(["draft", "sent", "paid", "void"]),
});

export async function updateInvoiceStatus(
  id: string,
  status: string,
): Promise<ActionResult> {
  const authz = await requireActionPermission("accounts:write");
  if (!authz.ok) return authz;
  if (!authz.user.companyId) {
    return { ok: false, error: "Complete onboarding before using the dashboard." };
  }
  const companyId = authz.user.companyId;

  const localUserId = await ensureLocalUser(authz.user);

  const parsed = updateStatusSchema.safeParse({ status });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid status" };
  }

  const detail = await getInvoiceDetail(companyId, id);
  if (!detail) return { ok: false, error: "Invoice not found" };

  const current = detail.invoice.status as InvoiceStatus;
  const target = parsed.data.status;

  if (!canTransition(current, target)) {
    return {
      ok: false,
      error: `Cannot change status from ${current} to ${target}`,
    };
  }

  const db = getDb();
  const [existing] = await db
    .select()
    .from(invoices)
    .where(and(eq(invoices.id, id), eq(invoices.companyId, companyId)))
    .limit(1);
  if (!existing) return { ok: false, error: "Invoice not found" };

  const now = new Date();
  await db
    .update(invoices)
    .set({
      status: target,
      sentAt: target === "sent" ? (existing.sentAt ?? now) : existing.sentAt,
      paidAt: target === "paid" ? now : existing.paidAt,
    })
    .where(and(eq(invoices.id, id), eq(invoices.companyId, companyId)));

  await writeAudit({
    companyId,
    actorUserId: localUserId,
    action: "invoice.status",
    entityType: "invoice",
    entityId: id,
    meta: { from: storedStatus(current), to: target },
  });

  revalidatePath("/invoices");
  revalidatePath(`/invoices/${id}`);
  revalidatePath("/dashboard");
  return { ok: true, id };
}
