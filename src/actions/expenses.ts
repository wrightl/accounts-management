"use server";

import { revalidatePath } from "next/cache";
import { and, eq} from "drizzle-orm";
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
import {
  appendMileageDescription,
  DEFAULT_MILEAGE_RATE_PENCE,
  mileageAmountPence,
} from "@/lib/expenses/mileage";
import {
  expenseImportHasErrors,
  parseExpenseImportCsv,
  type ParsedExpenseImportRow,
} from "@/lib/expenses/import-csv";
import { parseReceiptFileAsync } from "@/lib/expenses/receipt-file";
import {
  extractReceiptFromBytes,
  type ReceiptOcrProvider,
} from "@/lib/expenses/receipt-ocr";
import type { ReceiptExtraction } from "@/lib/expenses/receipt-parse";
import { isReceiptOcrProvider } from "@/lib/expenses/receipt-parse";
import { listFounders } from "@/lib/expenses/queries";
import { getOrCreateCompanySettings } from "@/lib/settings/queries";
import type { ActionResult } from "@/actions/result";

export type ExpenseImportPreviewResult =
  | { ok: true; rows: ParsedExpenseImportRow[] }
  | { ok: false; error: string };

export type ReceiptExtractionResult =
  | { ok: true; extraction: ReceiptExtraction }
  | { ok: false; error: string };

const expenseSchema = z.object({
  description: z.string().trim().min(1).max(500),
  category: z
    .enum(EXPENSE_CATEGORIES)
    .optional()
    .or(z.literal(""))
    .transform((v) => (v === "" || !v ? "" : v)),
  spentAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal("")),
  amountPounds: z.string().trim().optional().or(z.literal("")).default(""),
  status: z
    .string()
    .refine(
      (v): v is "recorded" | "reimbursable" | "company_paid" =>
        v === "recorded" || v === "reimbursable" || v === "company_paid",
      { message: "Select a status" },
    ),
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
  useMileage: z
    .string()
    .optional()
    .transform((v) => v === "on" || v === "true"),
  mileageMiles: z
    .string()
    .optional()
    .or(z.literal(""))
    .transform((v) => (v === "" || !v ? null : Number(v))),
  mileageRatePence: z
    .string()
    .optional()
    .or(z.literal(""))
    .transform((v) => (v === "" || !v ? null : Number(v))),
});

function resolveExpenseAmount(data: {
  amountPounds: string;
  useMileage: boolean;
  mileageMiles: number | null;
  mileageRatePence: number | null;
  allowZero?: boolean;
}):
  | { ok: true; amountPence: number; mileageMiles: number | null; mileageRatePence: number | null }
  | { ok: false; error: string } {
  if (data.useMileage) {
    if (data.mileageMiles == null || !Number.isFinite(data.mileageMiles) || data.mileageMiles <= 0) {
      return { ok: false, error: "Enter a positive number of miles" };
    }
    const rate = data.mileageRatePence ?? DEFAULT_MILEAGE_RATE_PENCE;
    if (!Number.isFinite(rate) || rate <= 0) {
      return { ok: false, error: "Enter a positive mileage rate" };
    }
    try {
      return {
        ok: true,
        amountPence: mileageAmountPence(data.mileageMiles, rate),
        mileageMiles: Math.round(data.mileageMiles),
        mileageRatePence: Math.round(rate),
      };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "Invalid mileage" };
    }
  }

  try {
    const amountPence = poundsToPence(data.amountPounds);
    if (amountPence <= 0 && !data.allowZero) {
      return { ok: false, error: "Amount must be positive" };
    }
    return { ok: true, amountPence, mileageMiles: null, mileageRatePence: null };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Invalid amount" };
  }
}

function parseExpense(formData: FormData) {
  return expenseSchema.safeParse({
    description: formData.get("description"),
    category: formData.get("category") ?? "",
    spentAt: formData.get("spentAt") ?? "",
    amountPounds: formData.get("amountPounds"),
    status: formData.get("status") ?? "",
    billable: formData.get("billable") ?? "",
    billableClientId: formData.get("billableClientId") ?? "",
    paidByUserId: formData.get("paidByUserId") ?? "",
    useMileage: formData.get("useMileage") ?? "",
    mileageMiles: formData.get("mileageMiles") ?? "",
    mileageRatePence: formData.get("mileageRatePence") ?? "",
  });
}

function normalizeExpensePaymentFields(data: {
  status: "recorded" | "reimbursable" | "company_paid";
  paidByUserId: string | null;
}): { ok: true; status: typeof data.status; paidByUserId: string | null } | { ok: false; error: string } {
  if (data.status === "company_paid") {
    return { ok: true, status: data.status, paidByUserId: null };
  }
  if (data.status === "reimbursable" && !data.paidByUserId) {
    return { ok: false, error: "Select who paid for reimbursable expenses" };
  }
  return { ok: true, status: data.status, paidByUserId: data.paidByUserId };
}

export async function createExpense(formData: FormData): Promise<ActionResult> {
  const authz = await requireActionPermission("accounts:write");
  if (!authz.ok) return authz;
  if (!authz.user.companyId) {
    return { ok: false, error: "Complete onboarding before using the dashboard." };
  }
  const companyId = authz.user.companyId;

  const session = authz.user;
  const localUserId = await ensureLocalUser(session);

  const parsed = parseExpense(formData);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  let amountPence: number;
  let mileageMiles: number | null;
  let mileageRatePence: number | null;
  const amountResult = resolveExpenseAmount({
    amountPounds: parsed.data.amountPounds,
    useMileage: parsed.data.useMileage,
    mileageMiles: parsed.data.mileageMiles,
    mileageRatePence: parsed.data.mileageRatePence,
  });
  if (!amountResult.ok) return { ok: false, error: amountResult.error };
  amountPence = amountResult.amountPence;
  mileageMiles = amountResult.mileageMiles;
  mileageRatePence = amountResult.mileageRatePence;

  let description = parsed.data.description;
  if (mileageMiles != null && mileageRatePence != null) {
    description = appendMileageDescription(description, mileageMiles, mileageRatePence);
  }

  const paidByDefault =
    parsed.data.status === "reimbursable"
      ? (parsed.data.paidByUserId ?? localUserId)
      : parsed.data.paidByUserId;
  const normalized = normalizeExpensePaymentFields({
    status: parsed.data.status,
    paidByUserId: paidByDefault,
  });
  if (!normalized.ok) return { ok: false, error: normalized.error };

  const db = getDb();
  const [row] = await db
    .insert(expenses)
    .values({
      companyId,
        description,
      category: parsed.data.category || null,
      spentAt: parsed.data.spentAt || null,
      amountPence,
      vatPence: 0,
      status: normalized.status,
      billable: parsed.data.billable,
      billableClientId: parsed.data.billable ? parsed.data.billableClientId : null,
      paidByUserId: normalized.paidByUserId,
      mileageMiles,
      mileageRatePence,
      createdByUserId: localUserId,
    })
    .returning({ id: expenses.id });

  await writeAudit({
    companyId,
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
  if (!authz.user.companyId) {
    return { ok: false, error: "Complete onboarding before using the dashboard." };
  }
  const companyId = authz.user.companyId;

  const session = authz.user;
  const localUserId = await ensureLocalUser(session);

  const db = getDb();
  const [existing] = await db.select().from(expenses).where(and(eq(expenses.id, id), eq(expenses.companyId, companyId))).limit(1);
  if (!existing) return { ok: false, error: "Expense not found" };
  if (existing.status === "reimbursed") {
    return { ok: false, error: "Cannot edit a reimbursed expense" };
  }

  const parsed = parseExpense(formData);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const amountResult = resolveExpenseAmount({
    amountPounds: parsed.data.amountPounds,
    useMileage: parsed.data.useMileage,
    mileageMiles: parsed.data.mileageMiles,
    mileageRatePence: parsed.data.mileageRatePence,
    allowZero: existing.status === "pending",
  });
  if (!amountResult.ok) return { ok: false, error: amountResult.error };
  const amountPence = amountResult.amountPence;
  const mileageMiles = parsed.data.useMileage ? amountResult.mileageMiles : null;
  const mileageRatePence = parsed.data.useMileage ? amountResult.mileageRatePence : null;

  let description = parsed.data.description;
  if (mileageMiles != null && mileageRatePence != null) {
    description = appendMileageDescription(description, mileageMiles, mileageRatePence);
  }

  // Pending expenses stay pending until explicitly approved.
  const status =
    existing.status === "pending"
      ? "pending"
      : parsed.data.status === "reimbursable" ||
          parsed.data.status === "recorded" ||
          parsed.data.status === "company_paid"
        ? parsed.data.status
        : existing.status;

  const normalized = normalizeExpensePaymentFields({
    status: status === "pending" ? "recorded" : status,
    paidByUserId: parsed.data.paidByUserId,
  });
  if (existing.status !== "pending" && !normalized.ok) {
    return { ok: false, error: normalized.error };
  }

  await db
    .update(expenses)
    .set({
      description,
      category: parsed.data.category || null,
      spentAt: parsed.data.spentAt || null,
      amountPence,
      status,
      billable: parsed.data.billable,
      billableClientId: parsed.data.billable ? parsed.data.billableClientId : null,
      paidByUserId:
        existing.status === "pending"
          ? existing.paidByUserId
          : normalized.ok
            ? normalized.paidByUserId
            : existing.paidByUserId,
      mileageMiles,
      mileageRatePence,
    })
    .where(and(eq(expenses.id, id), eq(expenses.companyId, companyId)));

  await writeAudit({
    companyId,
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

export async function approveExpense(
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
  const [existing] = await db.select().from(expenses).where(and(eq(expenses.id, id), eq(expenses.companyId, companyId))).limit(1);
  if (!existing) return { ok: false, error: "Expense not found" };
  if (existing.status !== "pending") {
    return { ok: false, error: "Only pending expenses can be approved" };
  }

  const parsed = parseExpense(formData);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  if (parsed.data.useMileage) {
    return { ok: false, error: "Mileage expenses cannot be approved from email submissions" };
  }

  const targetStatus = parsed.data.status;
  if (
    targetStatus !== "recorded" &&
    targetStatus !== "reimbursable" &&
    targetStatus !== "company_paid"
  ) {
    return { ok: false, error: "Select a status to approve into" };
  }

  const amountResult = resolveExpenseAmount({
    amountPounds: parsed.data.amountPounds,
    useMileage: false,
    mileageMiles: null,
    mileageRatePence: null,
  });
  if (!amountResult.ok) return { ok: false, error: amountResult.error };
  if (amountResult.amountPence <= 0) {
    return { ok: false, error: "Enter a positive amount before approving" };
  }

  const paidByDefault =
    targetStatus === "reimbursable"
      ? (parsed.data.paidByUserId ?? existing.submittedByUserId ?? localUserId)
      : parsed.data.paidByUserId;

  const normalized = normalizeExpensePaymentFields({
    status: targetStatus,
    paidByUserId: paidByDefault,
  });
  if (!normalized.ok) return { ok: false, error: normalized.error };

  await db
    .update(expenses)
    .set({
      description: parsed.data.description,
      category: parsed.data.category || null,
      spentAt: parsed.data.spentAt || null,
      amountPence: amountResult.amountPence,
      status: normalized.status,
      billable: parsed.data.billable,
      billableClientId: parsed.data.billable ? parsed.data.billableClientId : null,
      paidByUserId: normalized.paidByUserId,
      mileageMiles: null,
      mileageRatePence: null,
    })
    .where(and(eq(expenses.id, id), eq(expenses.companyId, companyId)));

  await writeAudit({
    companyId,
    actorUserId: localUserId,
    action: "expense.approve",
    entityType: "expense",
    entityId: id,
    meta: { status: normalized.status },
  });

  revalidatePath("/dashboard/expenses");
  revalidatePath(`/dashboard/expenses/${id}`);
  revalidatePath("/dashboard/reimbursements");
  revalidatePath("/dashboard");
  return { ok: true, id };
}

export async function rejectExpense(id: string): Promise<ActionResult> {
  const authz = await requireActionPermission("accounts:write");
  if (!authz.ok) return authz;
  if (!authz.user.companyId) {
    return { ok: false, error: "Complete onboarding before using the dashboard." };
  }
  const companyId = authz.user.companyId;

  const session = authz.user;
  const localUserId = await ensureLocalUser(session);

  const db = getDb();
  const [existing] = await db.select().from(expenses).where(and(eq(expenses.id, id), eq(expenses.companyId, companyId))).limit(1);
  if (!existing) return { ok: false, error: "Expense not found" };
  if (existing.status !== "pending") {
    return { ok: false, error: "Only pending expenses can be rejected" };
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

  await db.delete(expenses).where(and(eq(expenses.id, id), eq(expenses.companyId, companyId)));

  await writeAudit({
    companyId,
    actorUserId: localUserId,
    action: "expense.reject",
    entityType: "expense",
    entityId: id,
  });

  revalidatePath("/dashboard/expenses");
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function deleteExpense(id: string): Promise<ActionResult> {
  const authz = await requireActionPermission("accounts:write");
  if (!authz.ok) return authz;
  if (!authz.user.companyId) {
    return { ok: false, error: "Complete onboarding before using the dashboard." };
  }
  const companyId = authz.user.companyId;

  const session = authz.user;
  const localUserId = await ensureLocalUser(session);

  const db = getDb();
  const [existing] = await db.select().from(expenses).where(and(eq(expenses.id, id), eq(expenses.companyId, companyId))).limit(1);
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

  await db.delete(expenses).where(and(eq(expenses.id, id), eq(expenses.companyId, companyId)));

  await writeAudit({
    companyId,
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
  if (!authz.user.companyId) {
    return { ok: false, error: "Complete onboarding before using the dashboard." };
  }
  const companyId = authz.user.companyId;

  const session = authz.user;
  const localUserId = await ensureLocalUser(session);

  const db = getDb();
  const [expense] = await db
    .select()
    .from(expenses)
    .where(and(eq(expenses.id, expenseId), eq(expenses.companyId, companyId)))
    .limit(1);
  if (!expense) return { ok: false, error: "Expense not found" };

  const parsed = await parseReceiptFileAsync(formData);
  if (!parsed.ok) return parsed;
  const { file, bytes, contentType } = parsed.data;

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
    companyId,
    actorUserId: localUserId,
    action: "expense.receipt_upload",
    entityType: "expense_receipt",
    entityId: row.id,
    meta: { expenseId, filename: file.name },
  });

  revalidatePath(`/dashboard/expenses/${expenseId}`);
  return { ok: true, id: row.id };
}

export async function extractReceiptFields(
  formData: FormData,
): Promise<ReceiptExtractionResult> {
  const authz = await requireActionPermission("accounts:write");
  if (!authz.ok) return authz;
  if (!authz.user.companyId) {
    return { ok: false, error: "Complete onboarding before using the dashboard." };
  }
  const companyId = authz.user.companyId;


  const parsed = await parseReceiptFileAsync(formData);
  if (!parsed.ok) return parsed;

  const settings = await getOrCreateCompanySettings(companyId);
  const providerRaw = settings.receiptOcrProvider ?? "local";
  const provider: ReceiptOcrProvider = isReceiptOcrProvider(providerRaw)
    ? providerRaw
    : "local";

  try {
    const extraction = await extractReceiptFromBytes(
      parsed.data.bytes,
      parsed.data.contentType,
      provider,
      settings.receiptOcrModel,
    );
    return { ok: true, extraction };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Could not read receipt",
    };
  }
}

export async function deleteReceipt(receiptId: string): Promise<ActionResult> {
  const authz = await requireActionPermission("accounts:write");
  if (!authz.ok) return authz;
  if (!authz.user.companyId) {
    return { ok: false, error: "Complete onboarding before using the dashboard." };
  }
  const companyId = authz.user.companyId;

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
    companyId,
    actorUserId: localUserId,
    action: "expense.receipt_delete",
    entityType: "expense_receipt",
    entityId: receiptId,
  });

  revalidatePath(`/dashboard/expenses/${receipt.expenseId}`);
  return { ok: true };
}

export async function previewExpenseImport(
  formData: FormData,
): Promise<ExpenseImportPreviewResult> {
  const authz = await requireActionPermission("accounts:write");
  if (!authz.ok) return authz;
  if (!authz.user.companyId) {
    return { ok: false, error: "Complete onboarding before using the dashboard." };
  }
  const companyId = authz.user.companyId;


  const file = formData.get("csv");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "Choose a CSV file" };
  }
  if (file.size > 2 * 1024 * 1024) {
    return { ok: false, error: "CSV must be under 2 MB" };
  }

  const [founders, settings] = await Promise.all([
    listFounders(companyId),
    getOrCreateCompanySettings(companyId),
  ]);
  const text = await file.text();
  const rows = parseExpenseImportCsv(
    text,
    founders,
    settings.defaultMileageRatePence ?? DEFAULT_MILEAGE_RATE_PENCE,
  );
  if (rows.length === 0) {
    return { ok: false, error: "No data rows found in CSV" };
  }
  return { ok: true, rows };
}

export async function commitExpenseImport(
  rowsJson: string,
): Promise<ActionResult & { count?: number }> {
  const authz = await requireActionPermission("accounts:write");
  if (!authz.ok) return authz;
  if (!authz.user.companyId) {
    return { ok: false, error: "Complete onboarding before using the dashboard." };
  }
  const companyId = authz.user.companyId;

  const session = authz.user;
  const localUserId = await ensureLocalUser(session);

  let rows: ParsedExpenseImportRow[];
  try {
    rows = JSON.parse(rowsJson) as ParsedExpenseImportRow[];
  } catch {
    return { ok: false, error: "Invalid import payload" };
  }
  if (!Array.isArray(rows) || rows.length === 0) {
    return { ok: false, error: "No rows to import" };
  }
  if (expenseImportHasErrors(rows)) {
    return { ok: false, error: "Fix validation errors before importing" };
  }

  const db = getDb();
  await db.transaction(async (tx) => {
    for (const row of rows) {
      await tx.insert(expenses).values({
        companyId,
        description: row.description,
        category: row.category,
        spentAt: row.spentAt,
        amountPence: row.amountPence,
        vatPence: 0,
        status: row.status,
        billable: false,
        paidByUserId: row.status === "company_paid" ? null : row.paidByUserId,
        mileageMiles: row.mileageMiles,
        mileageRatePence: row.mileageRatePence,
        createdByUserId: localUserId,
      });
    }
  });

  await writeAudit({
    companyId,
    actorUserId: localUserId,
    action: "expense.import",
    entityType: "expense",
    entityId: localUserId,
    meta: { count: rows.length },
  });

  revalidatePath("/dashboard/expenses");
  revalidatePath("/dashboard/reimbursements");
  revalidatePath("/dashboard");
  return { ok: true, count: rows.length };
}
