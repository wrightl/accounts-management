"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { expenseReceipts, expenses, reimbursementItems } from "@/db/schema";
import { writeAudit } from "@/lib/audit";
import { mutate, mutateWide } from "@/lib/mutate";
import { getStorage } from "@/lib/storage";
import { safeFilename } from "@/lib/files";
import {
  appendMileageDescription,
  DEFAULT_MILEAGE_RATE_PENCE,
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
import { getOrCreateCompanySettings } from "@/lib/settings/queries";
import { isReceiptOcrProvider } from "@/lib/expenses/receipt-parse";
import { listFounders } from "@/lib/expenses/queries";
import { getReceiptOcrSettings } from "@/lib/platform-settings";
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

export type ExpenseImportPreviewResult =
  | { ok: true; rows: ParsedExpenseImportRow[] }
  | { ok: false; error: string; fieldErrors?: Record<string, string> };

export type ReceiptExtractionResult =
  | { ok: true; extraction: ReceiptExtraction }
  | { ok: false; error: string; fieldErrors?: Record<string, string> };

export async function createExpense(formData: FormData): Promise<ActionResult> {
  const parsed = parseExpenseInput(expenseRawFromFormData(formData));
  if (!parsed.ok) {
    return {
      ok: false,
      error: parsed.error,
      fieldErrors: parsed.fieldErrors,
    };
  }

  const {
    amountPence,
    resolvedMileageMiles: mileageMiles,
    resolvedMileageRatePence: mileageRatePence,
  } = parsed.data;

  let description = parsed.data.description;
  if (mileageMiles != null && mileageRatePence != null) {
    description = appendMileageDescription(description, mileageMiles, mileageRatePence);
  }

  return mutate(
    "accounts:write",
    async ({ companyId, localUserId }) => {
      const company = await getOrCreateCompanySettings(companyId);
      const paidByDefault =
        parsed.data.status === "reimbursable"
          ? (parsed.data.paidByUserId ?? localUserId)
          : parsed.data.paidByUserId;
      const normalized = normalizeExpensePaymentFields({
        status: parsed.data.status,
        paidByUserId: paidByDefault,
      });
      if (!normalized.ok) {
        return {
          ok: false,
          error: normalized.error,
          fieldErrors: normalized.fieldErrors,
        };
      }

      // Mileage is always 0% VAT; otherwise use posted rate when registered.
      const vatRate = parsed.data.useMileage
        ? 0
        : resolveLineVatRate(company, parseVatRate(parsed.data.vatRate));
      const vatPence = vatFromInclusiveGross(amountPence, vatRate);

      const db = getDb();
      const [row] = await db
        .insert(expenses)
        .values({
          companyId,
          description,
          category: parsed.data.category || null,
          spentAt: parsed.data.spentAt || null,
          amountPence,
          vatRate,
          vatPence,
          status: normalized.status,
          billable: parsed.data.billable,
          billableClientId: parsed.data.billable ? parsed.data.billableClientId : null,
          paidByUserId: normalized.paidByUserId,
          mileageMiles,
          mileageRatePence,
          createdByUserId: localUserId,
        })
        .returning({ id: expenses.id });

      return { ok: true, id: row.id };
    },
    {
      audit: { action: "expense.create", entityType: "expense" },
      paths: ["/expenses", "/reimbursements", "/dashboard"],
    },
  );
}

export async function updateExpense(
  id: string,
  formData: FormData,
): Promise<ActionResult> {
  // Allow zero until we know whether this is a pending draft (checked inside mutate).
  const parsed = parseExpenseInput(expenseRawFromFormData(formData), {
    allowZeroAmount: true,
  });
  if (!parsed.ok) {
    return {
      ok: false,
      error: parsed.error,
      fieldErrors: parsed.fieldErrors,
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
      const vatRate = parsed.data.useMileage
        ? 0
        : resolveLineVatRate(company, parseVatRate(parsed.data.vatRate));
      const vatPence = vatFromInclusiveGross(amountPence, vatRate);

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

      return { ok: true, id };
    },
    {
      audit: { action: "expense.update", entityType: "expense", entityId: id },
      paths: ["/expenses", `/expenses/${id}`, "/reimbursements", "/dashboard"],
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

  if (parsed.data.amountPence <= 0) {
    return {
      ok: false,
      error: "Enter a positive amount before approving",
      fieldErrors: { amountPounds: "Enter a positive amount before approving" },
    };
  }

  return mutate(
    "accounts:write",
    async ({ companyId, localUserId }) => {
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

      const paidByDefault =
        targetStatus === "reimbursable"
          ? (parsed.data.paidByUserId ?? existing.submittedByUserId ?? localUserId)
          : parsed.data.paidByUserId;

      const normalized = normalizeExpensePaymentFields({
        status: targetStatus,
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
        parseVatRate(parsed.data.vatRate),
      );
      const vatPence = vatFromInclusiveGross(parsed.data.amountPence, vatRate);

      await db
        .update(expenses)
        .set({
          description: parsed.data.description,
          category: parsed.data.category || null,
          spentAt: parsed.data.spentAt || null,
          amountPence: parsed.data.amountPence,
          vatRate,
          vatPence,
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

      return { ok: true, id };
    },
    { paths: ["/expenses", `/expenses/${id}`, "/reimbursements", "/dashboard"] },
  );
}

export async function rejectExpense(id: string): Promise<ActionResult> {
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
      return { ok: true };
    },
    {
      audit: { action: "expense.reject", entityType: "expense", entityId: id },
      paths: ["/expenses", "/dashboard"],
    },
  );
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
    async ({ companyId, localUserId }) => {
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

      return { ok: true, id: row.id };
    },
    { paths: [`/expenses/${expenseId}`] },
  );
}

export async function extractReceiptFields(
  formData: FormData,
): Promise<ReceiptExtractionResult> {
  return mutateWide("accounts:write", async () => {
    const parsed = await parseReceiptFileAsync(formData);
    if (!parsed.ok) return parsed;

    const ocr = await getReceiptOcrSettings();
    const providerRaw = ocr.provider ?? "local";
    const provider: ReceiptOcrProvider = isReceiptOcrProvider(providerRaw)
      ? providerRaw
      : "local";

    try {
      const extraction = await extractReceiptFromBytes(
        parsed.data.bytes,
        parsed.data.contentType,
        provider,
        ocr.model,
      );
      return { ok: true, extraction };
    } catch (e) {
      return {
        ok: false,
        error: e instanceof Error ? e.message : "Could not read receipt",
      };
    }
  });
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

      return { ok: true, count: rows.length };
    },
    { paths: ["/expenses", "/reimbursements", "/dashboard"] },
  );
}
