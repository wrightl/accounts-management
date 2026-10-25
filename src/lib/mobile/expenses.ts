import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { getDb } from "@/db";
import { clients, expenseReceipts, expenses, users } from "@/db/schema";
import { clientDisplayName } from "@/lib/clients/display";
import { toMobileExpense } from "@/lib/mobile/expense-payload";
import { getPaymentSourceSuggestions } from "@/lib/expenses/payment-source-queries";
import type { PaymentSourceSuggestion } from "@/lib/expenses/payment-source";

type ReceiptRow = typeof expenseReceipts.$inferSelect;

/** Receipts for several expenses, grouped by expense id, in one query. */
export async function receiptsByExpense(
  expenseIds: string[],
): Promise<Map<string, ReceiptRow[]>> {
  const grouped = new Map<string, ReceiptRow[]>();
  if (expenseIds.length === 0) return grouped;
  const rows = await getDb()
    .select()
    .from(expenseReceipts)
    .where(inArray(expenseReceipts.expenseId, expenseIds));
  for (const row of rows) {
    const list = grouped.get(row.expenseId) ?? [];
    list.push(row);
    grouped.set(row.expenseId, list);
  }
  return grouped;
}

/** Payment source suggestions for the pending expenses among these rows. */
export async function pendingPaymentSources(
  companyId: string,
  rows: { id: string; status: string }[],
): Promise<Map<string, PaymentSourceSuggestion>> {
  const pending = rows.filter((r) => r.status === "pending").map((r) => r.id);
  return getPaymentSourceSuggestions(companyId, pending);
}

/** One expense in the mobile payload shape, or null when not in this company. */
export async function loadMobileExpense(companyId: string, id: string) {
  const paidBy = alias(users, "paid_by");
  const createdBy = alias(users, "created_by");
  const [row] = await getDb()
    .select({
      expense: expenses,
      paidByName: paidBy.name,
      paidByEmail: paidBy.email,
      createdByName: createdBy.name,
      createdByEmail: createdBy.email,
      client: { name: clients.name, companyName: clients.companyName },
    })
    .from(expenses)
    .leftJoin(paidBy, eq(expenses.paidByUserId, paidBy.id))
    .leftJoin(createdBy, eq(expenses.createdByUserId, createdBy.id))
    .leftJoin(clients, eq(expenses.clientId, clients.id))
    .where(and(eq(expenses.id, id), eq(expenses.companyId, companyId)))
    .limit(1);
  if (!row) return null;

  const receipts = (await receiptsByExpense([id])).get(id) ?? [];
  const paymentSources = await pendingPaymentSources(companyId, [row.expense]);
  return toMobileExpense({
    paymentSource: paymentSources.get(id) ?? null,
    ...row.expense,
    paidByName: row.paidByName || row.paidByEmail,
    createdByName: row.createdByName || row.createdByEmail,
    clientName: row.client ? clientDisplayName(row.client) : null,
    receipts: receipts.map((r) => ({
      id: r.id,
      filename: r.filename,
      sizeBytes: r.sizeBytes,
      uploadedAt: r.uploadedAt,
    })),
  });
}
