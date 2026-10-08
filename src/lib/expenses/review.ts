import "server-only";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { expenseReceipts, expenses } from "@/db/schema";
import { writeAudit } from "@/lib/audit";
import { refreshExpenseBankSuggestion } from "@/lib/bank/expense-match";
import { safeFilename } from "@/lib/files";
import { parseReceiptFileAsync } from "@/lib/expenses/receipt-file";
import { normalizeExpensePaymentFields } from "@/lib/expenses/schema";
import { getOrCreateCompanySettings } from "@/lib/settings/queries";
import { getStorage } from "@/lib/storage";
import { resolveLineVatRate, vatFromInclusiveGross } from "@/lib/vat";
import type { ActionResult } from "@/actions/result";

/**
 * Expense review operations shared by web server actions and the mobile API,
 * so both enforce the same rules. Callers handle authz (mutate /
 * requireMobileAuth) and pass the resolved tenant + actor.
 */
export type ReviewContext = { companyId: string; localUserId: string };

export type ApproveStatus = "recorded" | "reimbursable" | "company_paid";

export type ApproveExpenseInput = {
  status: ApproveStatus;
  paidByUserId?: string | null;
  /** Edited fields from the web review form; omitted = keep stored values. */
  fields?: {
    description: string;
    category: string | null;
    spentAt: string | null;
    amountPence: number;
    vatRate: number;
    billable: boolean;
    billableClientId: string | null;
  };
};

export async function approvePendingExpense(
  ctx: ReviewContext,
  id: string,
  input: ApproveExpenseInput,
): Promise<ActionResult> {
  const { companyId, localUserId } = ctx;
  const db = getDb();
  const [existing] = await db
    .select()
    .from(expenses)
    .where(and(eq(expenses.id, id), eq(expenses.companyId, companyId)))
    .limit(1);
  if (!existing) return { ok: false, error: "Expense not found" };
  if (existing.status !== "pending") {
    return { ok: false, error: "Only pending expenses can be approved" };
  }

  const amountPence = input.fields?.amountPence ?? existing.amountPence;
  if (amountPence <= 0) {
    return {
      ok: false,
      error: "Enter a positive amount before approving",
      fieldErrors: { amountPounds: "Enter a positive amount before approving" },
    };
  }

  const paidByDefault =
    input.status === "reimbursable"
      ? (input.paidByUserId ?? existing.submittedByUserId ?? localUserId)
      : (input.paidByUserId ?? null);
  const normalized = normalizeExpensePaymentFields({
    status: input.status,
    paidByUserId: paidByDefault,
  });
  if (!normalized.ok) {
    return {
      ok: false,
      error: normalized.error,
      fieldErrors: normalized.fieldErrors,
    };
  }

  const company = await getOrCreateCompanySettings(companyId);
  const vatRate = resolveLineVatRate(
    company,
    input.fields?.vatRate ?? existing.vatRate,
  );
  const vatPence = vatFromInclusiveGross(amountPence, vatRate);

  await db
    .update(expenses)
    .set({
      ...(input.fields
        ? {
            description: input.fields.description,
            category: input.fields.category || null,
            spentAt: input.fields.spentAt || null,
            billable: input.fields.billable,
            billableClientId: input.fields.billable
              ? input.fields.billableClientId
              : null,
            mileageMiles: null,
            mileageRatePence: null,
          }
        : {}),
      amountPence,
      vatRate,
      vatPence,
      status: normalized.status,
      paidByUserId: normalized.paidByUserId,
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

  await refreshExpenseBankSuggestion(companyId, id);

  return { ok: true, id };
}

/** Reject = discard: delete a pending expense and its receipt files. */
export async function rejectPendingExpense(
  ctx: ReviewContext,
  id: string,
): Promise<ActionResult> {
  const { companyId, localUserId } = ctx;
  const db = getDb();
  const [existing] = await db
    .select()
    .from(expenses)
    .where(and(eq(expenses.id, id), eq(expenses.companyId, companyId)))
    .limit(1);
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

  await db
    .delete(expenses)
    .where(and(eq(expenses.id, id), eq(expenses.companyId, companyId)));

  await writeAudit({
    companyId,
    actorUserId: localUserId,
    action: "expense.reject",
    entityType: "expense",
    entityId: id,
  });

  return { ok: true, id };
}

/** Validate (size, sniffed type) and store a receipt against an expense. */
export async function storeExpenseReceipt(
  ctx: ReviewContext,
  expenseId: string,
  formData: FormData,
  fieldName = "receipt",
): Promise<ActionResult> {
  const { companyId, localUserId } = ctx;
  const db = getDb();
  const [expense] = await db
    .select({ id: expenses.id })
    .from(expenses)
    .where(and(eq(expenses.id, expenseId), eq(expenses.companyId, companyId)))
    .limit(1);
  if (!expense) return { ok: false, error: "Expense not found" };

  const parsed = await parseReceiptFileAsync(formData, fieldName);
  if (!parsed.ok) return parsed;
  const { file, bytes, contentType } = parsed.data;

  const stored = await getStorage().put(
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

  return { ok: true, id: row.id };
}
