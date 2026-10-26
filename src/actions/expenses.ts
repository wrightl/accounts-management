"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { expenseReceipts, expenses, reimbursementItems } from "@/db/schema";
import { writeAudit } from "@/lib/audit";
import { mutate, mutateWide } from "@/lib/mutate";
import { getStorage } from "@/lib/storage";
import {
  appendMileageDescription,
  DEFAULT_MILEAGE_RATE_PENCE,
} from "@/lib/expenses/mileage";
import {
  expenseImportHasErrors,
  parseExpenseImportCsv,
  type ParsedExpenseImportRow,
} from "@/lib/expenses/import-csv";
import { getOrCreateCompanySettings } from "@/lib/settings/queries";
import { withSterlingAmount } from "@/lib/expenses/convert";
import {
  isAllowedExpenseCurrency,
  UNSUPPORTED_CURRENCY_ERROR,
} from "@/lib/expenses/currency";
import { FORM_FIELD_ERROR_SUMMARY } from "@/lib/validation/field-errors";
import { getEmailExpensesFingerprint, listFounders } from "@/lib/expenses/queries";
import { requireActionPermission } from "@/lib/auth";
import {
  expenseRawFromFormData,
  normalizeExpensePaymentFields,
  parseExpenseImportCsvFile,
  parseExpenseInput,
} from "@/lib/expenses/schema";
import {
  parseVatRate,
  resolveLineVatRate,
  vatFromInclusiveGross,
} from "@/lib/vat";
import type { ActionResult } from "@/actions/result";
import { periodLockError } from "@/lib/period-lock";
import { checkPeriodOpen, getBooksLockedThrough } from "@/lib/period-lock-queries";
import { refreshExpenseBankSuggestion } from "@/lib/bank/expense-match";
import { resolveFxRate } from "@/lib/bank/fx";
import {
  bankDebitLinkError,
  ExpenseLinkError,
  isExpenseLinkedToBank,
  LINKED_EXPENSE_DELETE_ERROR,
  LINKED_EXPENSE_EDIT_ERROR,
  linkExpenseToBankTx,
} from "@/lib/bank/expense-link";
import { resolveExpenseProject } from "@/lib/expenses/project";
import { getExpenseRebill } from "@/lib/profitability/queries";
import { createExpenseRecord } from "@/lib/expenses/create";
import {
  readReceiptFields,
  type ReceiptExtractionResult,
} from "@/lib/expenses/receipt-extract";
import {
  approvePendingExpense,
  rejectPendingExpense,
  storeExpenseReceipt,
} from "@/lib/expenses/review";

export type ExpenseImportPreviewResult =
  | { ok: true; rows: ParsedExpenseImportRow[] }
  | { ok: false; error: string; fieldErrors?: Record<string, string> };

export type CreateExpenseResult = ActionResult & {
  /** Set when the expense saved but its bank transaction couldn't be linked. */
  bankLinkError?: string;
};

export async function createExpense(formData: FormData): Promise<CreateExpenseResult> {
  const parsed = parseExpenseInput(expenseRawFromFormData(formData));
  if (!parsed.ok) {
    return {
      ok: false,
      error: parsed.error,
      fieldErrors: parsed.fieldErrors,
    };
  }

  const rawTxId = formData.get("bankTransactionId");
  const bankTransactionId = typeof rawTxId === "string" && rawTxId ? rawTxId : null;
  if (bankTransactionId) {
    if (parsed.data.useMileage) {
      return { ok: false, error: "A mileage claim can't be created from a bank transaction" };
    }
    if (parsed.data.status === "reimbursable") {
      const message = "A bank payment was made by the company, so it can't be reimbursable";
      return { ok: false, error: message, fieldErrors: { status: message } };
    }
  }

  return mutateWide<CreateExpenseResult>(
    "accounts:write",
    async ({ companyId, localUserId }) => {
      if (bankTransactionId) {
        // Check first so a stale link doesn't leave an extra expense behind.
        const linkError = await bankDebitLinkError(companyId, bankTransactionId);
        if (linkError) return { ok: false, error: linkError };
      }
      const created = await createExpenseRecord({ companyId, localUserId }, parsed.data);
      if (!created.ok || !bankTransactionId || !created.id) return created;
      try {
        const { matchId } = await linkExpenseToBankTx(companyId, {
          expenseId: created.id,
          bankTransactionId,
        });
        await writeAudit({
          companyId,
          actorUserId: localUserId,
          action: "bank.link_expense",
          entityType: "reconciliation_match",
          entityId: matchId,
          meta: { expenseId: created.id, bankTransactionId },
        });
      } catch (e) {
        // Lost a race with another link; the expense stands and can be linked later.
        if (!(e instanceof ExpenseLinkError)) throw e;
        return { ...created, bankLinkError: e.message };
      }
      return created;
    },
    {
      audit: {
        action: "expense.create",
        entityType: "expense",
        meta: bankTransactionId ? { bankTransactionId } : undefined,
      },
      paths: ["/expenses", "/reimbursements", "/dashboard", "/transactions"],
    },
  );
}

export async function updateExpense(
  id: string,
  formData: FormData,
): Promise<ActionResult> {
  // Allow zero until we know whether this is a pending draft (checked inside mutate).
  const input = parseExpenseInput(expenseRawFromFormData(formData), {
    allowZeroAmount: true,
  });
  if (!input.ok) {
    return {
      ok: false,
      error: input.error,
      fieldErrors: input.fieldErrors,
    };
  }

  return mutate(
    "accounts:write",
    async ({ companyId }) => {
      const db = getDb();
      const [existing] = await db
        .select()
        .from(expenses)
        .where(and(eq(expenses.id, id), eq(expenses.companyId, companyId)))
        .limit(1);
      if (!existing) return { ok: false, error: "Expense not found" };
      if (existing.status === "reimbursed") {
        return { ok: false, error: "Cannot edit a reimbursed expense" };
      }

      const currency = input.data.foreignCurrency;
      if (currency && !isAllowedExpenseCurrency(currency, existing.detectedCurrency)) {
        return {
          ok: false,
          error: FORM_FIELD_ERROR_SUMMARY,
          fieldErrors: { currency: UNSUPPORTED_CURRENCY_ERROR },
        };
      }
      const parsed = await withSterlingAmount(input.data, {
        required: existing.status !== "pending",
      });
      if (!parsed.ok) return parsed;

      if (
        existing.status !== "pending" &&
        parsed.data.amountPence <= 0
      ) {
        return {
          ok: false,
          error: "Amount must be positive",
          fieldErrors: { amountPounds: "Amount must be positive" },
        };
      }

      const amountPence = parsed.data.amountPence;
      const mileageMiles = parsed.data.useMileage
        ? parsed.data.resolvedMileageMiles
        : null;
      const mileageRatePence = parsed.data.useMileage
        ? parsed.data.resolvedMileageRatePence
        : null;

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

      // A bank-linked expense must keep agreeing with the payment that settled it.
      if (
        (existing.amountPence !== amountPence ||
          existing.spentAt !== (parsed.data.spentAt || null) ||
          existing.status !== status) &&
        (await isExpenseLinkedToBank(id))
      ) {
        return { ok: false, error: LINKED_EXPENSE_EDIT_ERROR };
      }

      const normalized = normalizeExpensePaymentFields({
        status: status === "pending" ? "recorded" : status,
        paidByUserId: parsed.data.paidByUserId,
      });
      if (existing.status !== "pending" && !normalized.ok) {
        return {
          ok: false,
          error: normalized.error,
          fieldErrors: normalized.fieldErrors,
        };
      }

      const company = await getOrCreateCompanySettings(companyId);
      // Pending submissions aren't in the books yet, so they stay editable.
      if (existing.status !== "pending") {
        const locked = periodLockError(
          company.booksLockedThrough,
          existing.spentAt,
          parsed.data.spentAt || null,
        );
        if (locked) return { ok: false, error: locked };
      }
      const vatRate = parsed.data.useMileage
        ? 0
        : resolveLineVatRate(company, parseVatRate(parsed.data.vatRate));
      const vatPence = vatFromInclusiveGross(amountPence, vatRate);

      const project = await resolveExpenseProject(companyId, parsed.data);
      if (!project.ok) return project;
      const rebill = await getExpenseRebill(companyId, id);
      if (
        rebill &&
        (!parsed.data.billable ||
          project.clientId !== existing.clientId ||
          amountPence !== existing.amountPence ||
          vatPence !== existing.vatPence)
      ) {
        return {
          ok: false,
          error: `This expense is recharged on invoice ${rebill.number}. Remove it from that invoice before changing the amount, client or rebillable setting.`,
        };
      }

      await db
        .update(expenses)
        .set({
          description,
          category: parsed.data.category || null,
          spentAt: parsed.data.spentAt || null,
          amountPence,
          vatRate,
          vatPence,
          status,
          billable: parsed.data.billable,
          clientId: project.clientId,
          orderId: project.orderId,
          paidByUserId:
            existing.status === "pending"
              ? existing.paidByUserId
              : normalized.ok
                ? normalized.paidByUserId
                : existing.paidByUserId,
          mileageMiles,
          mileageRatePence,
          detectedCurrency: parsed.data.foreignCurrency,
          originalAmountMinor: parsed.data.originalAmountMinor,
        })
        .where(and(eq(expenses.id, id), eq(expenses.companyId, companyId)));

      const matchFieldsChanged =
        existing.detectedCurrency !== parsed.data.foreignCurrency ||
        existing.originalAmountMinor !== parsed.data.originalAmountMinor ||
        existing.amountPence !== amountPence ||
        existing.spentAt !== (parsed.data.spentAt || null) ||
        existing.description !== description ||
        existing.status !== status;

      if (matchFieldsChanged || status === "reimbursable") {
        await refreshExpenseBankSuggestion(companyId, id);
      }

      return { ok: true, id };
    },
    {
      audit: { action: "expense.update", entityType: "expense", entityId: id },
      paths: ["/expenses", `/expenses/${id}`, "/reimbursements", "/dashboard", "/transactions"],
    },
  );
}

export async function approveExpense(
  id: string,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = parseExpenseInput(expenseRawFromFormData(formData));
  if (!parsed.ok) {
    return {
      ok: false,
      error: parsed.error,
      fieldErrors: parsed.fieldErrors,
    };
  }

  if (parsed.data.useMileage) {
    return {
      ok: false,
      error: "Mileage expenses cannot be approved from email submissions",
    };
  }

  const targetStatus = parsed.data.status;
  if (
    targetStatus !== "recorded" &&
    targetStatus !== "reimbursable" &&
    targetStatus !== "company_paid"
  ) {
    return {
      ok: false,
      error: "Select a status to approve into",
      fieldErrors: { status: "Select a status to approve into" },
    };
  }

  return mutate(
    "accounts:write",
    async (ctx) => {
      const project = await resolveExpenseProject(ctx.companyId, parsed.data);
      if (!project.ok) return project;
      return approvePendingExpense(ctx, id, {
        status: targetStatus,
        paidByUserId: parsed.data.paidByUserId,
        fields: {
          description: parsed.data.description,
          category: parsed.data.category || null,
          spentAt: parsed.data.spentAt || null,
          amountPence: parsed.data.amountPence,
          foreignCurrency: parsed.data.foreignCurrency,
          originalAmountMinor: parsed.data.originalAmountMinor,
          vatRate: parseVatRate(parsed.data.vatRate),
          billable: parsed.data.billable,
          clientId: project.clientId,
          orderId: project.orderId,
        },
      });
    },
    { paths: ["/expenses", `/expenses/${id}`, "/reimbursements", "/dashboard", "/transactions"] },
  );
}

export async function rejectExpense(id: string): Promise<ActionResult> {
  return mutate("accounts:write", (ctx) => rejectPendingExpense(ctx, id), {
    paths: ["/expenses", "/dashboard"],
  });
}

export async function deleteExpense(id: string): Promise<ActionResult> {
  return mutate(
    "accounts:write",
    async ({ companyId }) => {
      const db = getDb();
      const [existing] = await db
        .select()
        .from(expenses)
        .where(and(eq(expenses.id, id), eq(expenses.companyId, companyId)))
        .limit(1);
      if (!existing) return { ok: false, error: "Expense not found" };
      if (existing.status === "reimbursed") {
        return { ok: false, error: "Cannot delete a reimbursed expense" };
      }
      const rebill = await getExpenseRebill(companyId, id);
      if (rebill) {
        return {
          ok: false,
          error: `This expense is recharged on invoice ${rebill.number}. Remove it from that invoice first.`,
        };
      }
      if (await isExpenseLinkedToBank(id)) {
        return { ok: false, error: LINKED_EXPENSE_DELETE_ERROR };
      }
      if (existing.status !== "pending") {
        const locked = await checkPeriodOpen(companyId, existing.spentAt);
        if (locked) return { ok: false, error: locked };
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
      return { ok: true };
    },
    {
      audit: { action: "expense.delete", entityType: "expense", entityId: id },
      paths: ["/expenses", "/dashboard"],
    },
  );
}

export async function uploadReceipt(
  expenseId: string,
  formData: FormData,
): Promise<ActionResult> {
  return mutate(
    "accounts:write",
    (ctx) => storeExpenseReceipt(ctx, expenseId, formData),
    { paths: [`/expenses/${expenseId}`] },
  );
}

export async function extractReceiptFields(
  formData: FormData,
): Promise<ReceiptExtractionResult> {
  return mutateWide("accounts:write", () => readReceiptFields(formData));
}

export async function deleteReceipt(receiptId: string): Promise<ActionResult> {
  return mutate(
    "accounts:write",
    async ({ companyId }) => {
      const db = getDb();
      const [row] = await db
        .select({ receipt: expenseReceipts })
        .from(expenseReceipts)
        .innerJoin(expenses, eq(expenseReceipts.expenseId, expenses.id))
        .where(and(eq(expenseReceipts.id, receiptId), eq(expenses.companyId, companyId)))
        .limit(1);
      if (!row) return { ok: false, error: "Receipt not found" };
      const { receipt } = row;

      try {
        await getStorage().delete(receipt.blobPath);
      } catch {
        /* ignore */
      }
      await db.delete(expenseReceipts).where(eq(expenseReceipts.id, receipt.id));

      revalidatePath(`/expenses/${receipt.expenseId}`);
      return { ok: true };
    },
    {
      audit: {
        action: "expense.receipt_delete",
        entityType: "expense_receipt",
        entityId: receiptId,
      },
    },
  );
}

export async function previewExpenseImport(
  formData: FormData,
): Promise<ExpenseImportPreviewResult> {
  const fileParsed = parseExpenseImportCsvFile(formData);
  if (!fileParsed.ok) {
    return {
      ok: false,
      error: fileParsed.error,
      fieldErrors: fileParsed.fieldErrors,
    };
  }

  return mutateWide("accounts:write", async ({ companyId }) => {
    const [founders, settings] = await Promise.all([
      listFounders(companyId),
      getOrCreateCompanySettings(companyId),
    ]);
    const text = await fileParsed.data.file.text();
    const rows = parseExpenseImportCsv(
      text,
      founders,
      settings.defaultMileageRatePence ?? DEFAULT_MILEAGE_RATE_PENCE,
    );
    if (rows.length === 0) {
      return {
        ok: false,
        error: "No data rows found in CSV",
        fieldErrors: { csv: "No data rows found in CSV" },
      };
    }
    return { ok: true, rows };
  });
}

export async function commitExpenseImport(
  rowsJson: string,
): Promise<ActionResult & { count?: number }> {
  let rows: ParsedExpenseImportRow[];
  try {
    rows = JSON.parse(rowsJson) as ParsedExpenseImportRow[];
  } catch {
    return {
      ok: false,
      error: "Invalid import payload",
      fieldErrors: { commit: "Invalid import payload" },
    };
  }
  if (!Array.isArray(rows) || rows.length === 0) {
    return {
      ok: false,
      error: "No rows to import",
      fieldErrors: { commit: "No rows to import" },
    };
  }
  if (expenseImportHasErrors(rows)) {
    return {
      ok: false,
      error: "Fix validation errors before importing",
      fieldErrors: { commit: "Fix validation errors before importing" },
    };
  }

  return mutateWide(
    "accounts:write",
    async ({ companyId, localUserId }) => {
      const lockedThrough = await getBooksLockedThrough(companyId);
      for (const row of rows) {
        const locked = periodLockError(lockedThrough, row.spentAt);
        if (locked) {
          const error = `Row ${row.rowNumber}: ${locked}`;
          return { ok: false, error, fieldErrors: { commit: error } };
        }
      }
      const db = getDb();
      const insertedIds: string[] = [];
      await db.transaction(async (tx) => {
        for (const row of rows) {
          const [created] = await tx
            .insert(expenses)
            .values({
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
            })
            .returning({ id: expenses.id });
          insertedIds.push(created.id);
        }
      });

      for (const id of insertedIds) {
        await refreshExpenseBankSuggestion(companyId, id);
      }

      await writeAudit({
        companyId,
        actorUserId: localUserId,
        action: "expense.import",
        entityType: "expense",
        entityId: localUserId,
        meta: { count: rows.length },
      });

      return { ok: true, count: rows.length };
    },
    { paths: ["/expenses", "/reimbursements", "/dashboard", "/transactions"] },
  );
}

/** Change marker the expenses list polls to pick up new email submissions. */
export async function fetchEmailExpensesFingerprint(): Promise<
  { ok: true; fingerprint: string } | { ok: false; error: string }
> {
  const authz = await requireActionPermission("accounts:read");
  if (!authz.ok) return authz;
  if (!authz.user.companyId) {
    return { ok: false, error: "Complete onboarding first." };
  }
  return {
    ok: true,
    fingerprint: await getEmailExpensesFingerprint(authz.user.companyId),
  };
}

/** Bank of England rate (foreign units per £1) the expense form converts with. */
export async function fetchExpenseExchangeRate(
  currency: string,
  onDate: string,
): Promise<
  { ok: true; foreignPerGbp: number; observationDate: string } | { ok: false; error: string }
> {
  const authz = await requireActionPermission("accounts:read");
  if (!authz.ok) return authz;
  const date = /^\d{4}-\d{2}-\d{2}$/.test(onDate)
    ? onDate
    : new Date().toISOString().slice(0, 10);
  const rate = await resolveFxRate(currency, date).catch(() => null);
  if (!rate) return { ok: false, error: `No ${currency} exchange rate available` };
  return { ok: true, foreignPerGbp: rate.foreignPerGbp, observationDate: rate.observationDate };
}
