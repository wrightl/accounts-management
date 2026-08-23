"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { expenseReceipts, expenses, reimbursementItems } from "@/db/schema";
import { requireActionPermission } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";
import { ensureLocalUser } from "@/lib/users";
import { poundsToPence } from "@/lib/money";
import { getStorage } from "@/lib/storage";
import { safeFilename } from "@/lib/files";
import { EXPENSE_CATEGORIES } from "@/lib/expenses/categories";
import type { ActionResult } from "@/actions/result";

const MAX_RECEIPT_BYTES = 8 * 1024 * 1024;
const ALLOWED_RECEIPT_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "application/pdf",
]);

function receiptMagicOk(bytes: Buffer, contentType: string): boolean {
  if (bytes.length < 12) return false;
  if (contentType === "application/pdf") {
    return bytes.subarray(0, 5).toString("latin1") === "%PDF-";
  }
  if (contentType === "image/jpeg") {
    return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  }
  if (contentType === "image/png") {
    return (
      bytes[0] === 0x89 &&
      bytes[1] === 0x50 &&
      bytes[2] === 0x4e &&
      bytes[3] === 0x47
    );
  }
  if (contentType === "image/gif") {
    return bytes.subarray(0, 4).toString("latin1") === "GIF8";
  }
  if (contentType === "image/webp") {
    return (
      bytes.subarray(0, 4).toString("latin1") === "RIFF" &&
      bytes.subarray(8, 12).toString("latin1") === "WEBP"
    );
  }
  return false;
}

const expenseSchema = z.object({
  description: z.string().trim().min(1).max(500),
  category: z
    .enum(EXPENSE_CATEGORIES)
    .optional()
    .or(z.literal(""))
    .transform((v) => (v === "" || !v ? "" : v)),
  spentAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal("")),
  amountPounds: z.string().trim().min(1),
  status: z.enum(["recorded", "reimbursable", "company_paid"]),
  billable: z
    .string()
    .optional()
    .transform((v) => v === "on" || v === "true"),
  billableClientId: z
    .string()
    .uuid()
    .optional()
    .or(z.literal(""))
    .transform((v) => (v === "" || !v ? null : v)),
  paidByUserId: z
    .string()
    .uuid()
    .optional()
    .or(z.literal(""))
    .transform((v) => (v === "" || !v ? null : v)),
});

function parseExpense(formData: FormData) {
  return expenseSchema.safeParse({
    description: formData.get("description"),
    category: formData.get("category") ?? "",
    spentAt: formData.get("spentAt") ?? "",
    amountPounds: formData.get("amountPounds"),
    status: formData.get("status") ?? "recorded",
    billable: formData.get("billable") ?? "",
    billableClientId: formData.get("billableClientId") ?? "",
    paidByUserId: formData.get("paidByUserId") ?? "",
  });
}

export async function createExpense(formData: FormData): Promise<ActionResult> {
  const authz = await requireActionPermission("accounts:write");
  if (!authz.ok) return authz;
  const session = authz.user;
  const localUserId = await ensureLocalUser(session);

  const parsed = parseExpense(formData);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  let amountPence: number;
  try {
    amountPence = poundsToPence(parsed.data.amountPounds);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Invalid amount" };
  }
  if (amountPence <= 0) return { ok: false, error: "Amount must be positive" };

  const db = getDb();
  const [row] = await db
    .insert(expenses)
    .values({
      description: parsed.data.description,
      category: parsed.data.category || null,
      spentAt: parsed.data.spentAt || null,
      amountPence,
      vatPence: 0,
      status: parsed.data.status,
      billable: parsed.data.billable,
      billableClientId: parsed.data.billable ? parsed.data.billableClientId : null,
      paidByUserId: parsed.data.paidByUserId ?? localUserId,
      createdByUserId: localUserId,
    })
    .returning({ id: expenses.id });

  await writeAudit({
    actorUserId: localUserId,
    action: "expense.create",
    entityType: "expense",
    entityId: row.id,
  });

  revalidatePath("/dashboard/expenses");
  revalidatePath("/dashboard/reimbursements");
  revalidatePath("/dashboard");
  return { ok: true, id: row.id };
}

export async function updateExpense(
  id: string,
  formData: FormData,
): Promise<ActionResult> {
  const authz = await requireActionPermission("accounts:write");
  if (!authz.ok) return authz;
  const session = authz.user;
  const localUserId = await ensureLocalUser(session);

  const db = getDb();
  const [existing] = await db.select().from(expenses).where(eq(expenses.id, id)).limit(1);
  if (!existing) return { ok: false, error: "Expense not found" };
  if (existing.status === "reimbursed") {
    return { ok: false, error: "Cannot edit a reimbursed expense" };
  }

  const parsed = parseExpense(formData);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  let amountPence: number;
  try {
    amountPence = poundsToPence(parsed.data.amountPounds);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Invalid amount" };
  }

  // Don't allow setting status to reimbursed via form — that happens via reimbursement runs.
  const status =
    parsed.data.status === "reimbursable" ||
    parsed.data.status === "recorded" ||
    parsed.data.status === "company_paid"
      ? parsed.data.status
      : existing.status;

  await db
    .update(expenses)
    .set({
      description: parsed.data.description,
      category: parsed.data.category || null,
      spentAt: parsed.data.spentAt || null,
      amountPence,
      status,
      billable: parsed.data.billable,
      billableClientId: parsed.data.billable ? parsed.data.billableClientId : null,
      paidByUserId: parsed.data.paidByUserId,
    })
    .where(eq(expenses.id, id));

  await writeAudit({
    actorUserId: localUserId,
    action: "expense.update",
    entityType: "expense",
    entityId: id,
  });

  revalidatePath("/dashboard/expenses");
  revalidatePath(`/dashboard/expenses/${id}`);
  revalidatePath("/dashboard/reimbursements");
  revalidatePath("/dashboard");
  return { ok: true, id };
}

export async function deleteExpense(id: string): Promise<ActionResult> {
  const authz = await requireActionPermission("accounts:write");
  if (!authz.ok) return authz;
  const session = authz.user;
  const localUserId = await ensureLocalUser(session);

  const db = getDb();
  const [existing] = await db.select().from(expenses).where(eq(expenses.id, id)).limit(1);
  if (!existing) return { ok: false, error: "Expense not found" };
  if (existing.status === "reimbursed") {
    return { ok: false, error: "Cannot delete a reimbursed expense" };
  }

  const linked = await db
    .select({ id: reimbursementItems.id })
    .from(reimbursementItems)
    .where(eq(reimbursementItems.expenseId, id))
    .limit(1);
  if (linked[0]) {
    return { ok: false, error: "Expense is part of a reimbursement run" };
  }

  const receipts = await db
    .select()
    .from(expenseReceipts)
    .where(eq(expenseReceipts.expenseId, id));
  const storage = getStorage();
  for (const r of receipts) {
    try {
      await storage.delete(r.blobPath);
    } catch {
      /* ignore missing blob */
    }
  }

  await db.delete(expenses).where(eq(expenses.id, id));

  await writeAudit({
    actorUserId: localUserId,
    action: "expense.delete",
    entityType: "expense",
    entityId: id,
  });

  revalidatePath("/dashboard/expenses");
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function uploadReceipt(
  expenseId: string,
  formData: FormData,
): Promise<ActionResult> {
  const authz = await requireActionPermission("accounts:write");
  if (!authz.ok) return authz;
  const session = authz.user;
  const localUserId = await ensureLocalUser(session);

  const db = getDb();
  const [expense] = await db
    .select()
    .from(expenses)
    .where(eq(expenses.id, expenseId))
    .limit(1);
  if (!expense) return { ok: false, error: "Expense not found" };

  const file = formData.get("receipt");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "Choose a receipt file" };
  }
  if (file.size > MAX_RECEIPT_BYTES) {
    return { ok: false, error: "Receipt must be under 8 MB" };
  }
  const contentType = file.type || "application/octet-stream";
  if (!ALLOWED_RECEIPT_TYPES.has(contentType)) {
    return { ok: false, error: "Receipt must be an image or PDF" };
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  if (!receiptMagicOk(bytes, contentType)) {
    return { ok: false, error: "Receipt file contents do not match the declared type" };
  }
  const storage = getStorage();
  const stored = await storage.put(
    `receipts/${expenseId}/${Date.now()}-${safeFilename(file.name)}`,
    bytes,
    contentType,
  );

  const [row] = await db
    .insert(expenseReceipts)
    .values({
      expenseId,
      blobPath: stored.path,
      filename: safeFilename(file.name),
      contentType,
      sizeBytes: stored.size,
    })
    .returning({ id: expenseReceipts.id });

  await writeAudit({
    actorUserId: localUserId,
    action: "expense.receipt_upload",
    entityType: "expense_receipt",
    entityId: row.id,
    meta: { expenseId, filename: file.name },
  });

  revalidatePath(`/dashboard/expenses/${expenseId}`);
  return { ok: true, id: row.id };
}

export async function deleteReceipt(receiptId: string): Promise<ActionResult> {
  const authz = await requireActionPermission("accounts:write");
  if (!authz.ok) return authz;
  const session = authz.user;
  const localUserId = await ensureLocalUser(session);

  const db = getDb();
  const [receipt] = await db
    .select()
    .from(expenseReceipts)
    .where(eq(expenseReceipts.id, receiptId))
    .limit(1);
  if (!receipt) return { ok: false, error: "Receipt not found" };

  try {
    await getStorage().delete(receipt.blobPath);
  } catch {
    /* ignore */
  }
  await db.delete(expenseReceipts).where(eq(expenseReceipts.id, receiptId));

  await writeAudit({
    actorUserId: localUserId,
    action: "expense.receipt_delete",
    entityType: "expense_receipt",
    entityId: receiptId,
  });

  revalidatePath(`/dashboard/expenses/${receipt.expenseId}`);
  return { ok: true };
}
