import "server-only";
import { and, desc, eq, ne, sum } from "drizzle-orm";
import { getDb } from "@/db";
import {
  expenses,
  reimbursementItems,
  reimbursements,
  users,
} from "@/db/schema";
import { formatGBP } from "@/lib/money";
import { findLocalUserId } from "@/lib/users";
import type { SessionUser } from "@/lib/auth";

export async function listReimbursements() {
  const db = getDb();
  const rows = await db
    .select({
      id: reimbursements.id,
      status: reimbursements.status,
      totalPence: reimbursements.totalPence,
      reference: reimbursements.reference,
      createdAt: reimbursements.createdAt,
      paidAt: reimbursements.paidAt,
      payeeName: users.name,
      payeeEmail: users.email,
      payeeUserId: reimbursements.payeeUserId,
    })
    .from(reimbursements)
    .innerJoin(users, eq(reimbursements.payeeUserId, users.id))
    .orderBy(desc(reimbursements.createdAt));

  return rows.map((r) => ({
    ...r,
    totalFormatted: formatGBP(r.totalPence),
  }));
}

export async function getReimbursementDetail(id: string) {
  const db = getDb();
  const [run] = await db
    .select({
      reimbursement: reimbursements,
      payee: users,
    })
    .from(reimbursements)
    .innerJoin(users, eq(reimbursements.payeeUserId, users.id))
    .where(eq(reimbursements.id, id))
    .limit(1);

  if (!run) return null;

  const items = await db
    .select({
      itemId: reimbursementItems.id,
      expense: expenses,
    })
    .from(reimbursementItems)
    .innerJoin(expenses, eq(reimbursementItems.expenseId, expenses.id))
    .where(eq(reimbursementItems.reimbursementId, id));

  return {
    ...run,
    totalFormatted: formatGBP(run.reimbursement.totalPence),
    items: items.map((i) => ({
      itemId: i.itemId,
      expense: {
        ...i.expense,
        amountFormatted: formatGBP(i.expense.amountPence),
      },
    })),
  };
}

/** Outstanding reimbursable totals per founder. */
export async function getReimbursementBalances() {
  const db = getDb();
  const rows = await db
    .select({
      payeeUserId: expenses.paidByUserId,
      total: sum(expenses.amountPence).mapWith(Number),
      name: users.name,
      email: users.email,
    })
    .from(expenses)
    .leftJoin(users, eq(expenses.paidByUserId, users.id))
    .where(eq(expenses.status, "reimbursable"))
    .groupBy(expenses.paidByUserId, users.name, users.email);

  return rows
    .filter((r) => r.payeeUserId)
    .map((r) => ({
      payeeUserId: r.payeeUserId!,
      name: r.name || r.email || "Unknown",
      totalPence: r.total ?? 0,
      totalFormatted: formatGBP(r.total ?? 0),
    }));
}

export async function getOwedSummary(session: SessionUser) {
  const localId = await findLocalUserId(session.userId);
  const balances = await getReimbursementBalances();
  const owedToMe = localId
    ? balances.find((b) => b.payeeUserId === localId)
    : undefined;
  const owedToOthers = balances.filter((b) => b.payeeUserId !== localId);
  const othersTotal = owedToOthers.reduce((a, b) => a + b.totalPence, 0);
  return {
    owedToMePence: owedToMe?.totalPence ?? 0,
    owedToMeFormatted: formatGBP(owedToMe?.totalPence ?? 0),
    owedToCofoundersPence: othersTotal,
    owedToCofoundersFormatted: formatGBP(othersTotal),
    balances,
  };
}

export async function getReimbursementExportRows(id: string) {
  const detail = await getReimbursementDetail(id);
  if (!detail) return null;
  return detail;
}

/** Linked reimbursement run for an expense, if any. */
export async function getReimbursementForExpense(expenseId: string) {
  const db = getDb();
  const [row] = await db
    .select({
      reimbursementId: reimbursements.id,
      status: reimbursements.status,
      paidAt: reimbursements.paidAt,
      reference: reimbursements.reference,
      totalPence: reimbursements.totalPence,
      payeeName: users.name,
      payeeEmail: users.email,
    })
    .from(reimbursementItems)
    .innerJoin(reimbursements, eq(reimbursementItems.reimbursementId, reimbursements.id))
    .innerJoin(users, eq(reimbursements.payeeUserId, users.id))
    .where(eq(reimbursementItems.expenseId, expenseId))
    .limit(1);

  if (!row) return null;
  return {
    ...row,
    totalFormatted: formatGBP(row.totalPence),
    payeeLabel: row.payeeName || row.payeeEmail,
  };
}

export async function getReimbursementEditData(id: string) {
  const detail = await getReimbursementDetail(id);
  if (!detail) return null;

  const db = getDb();
  const payeeUserId = detail.reimbursement.payeeUserId;

  const reimbursable = await db
    .select({
      id: expenses.id,
      description: expenses.description,
      amountPence: expenses.amountPence,
      spentAt: expenses.spentAt,
      paidByUserId: expenses.paidByUserId,
    })
    .from(expenses)
    .where(
      and(eq(expenses.status, "reimbursable"), eq(expenses.paidByUserId, payeeUserId)),
    );

  const linkedElsewhere = await db
    .select({ expenseId: reimbursementItems.expenseId })
    .from(reimbursementItems)
    .where(ne(reimbursementItems.reimbursementId, id));

  const blocked = new Set(linkedElsewhere.map((row) => row.expenseId));

  return {
    detail,
    payeeLabel: detail.payee.name || detail.payee.email,
    expenses: reimbursable.filter((expense) => !blocked.has(expense.id)),
    initialExpenseIds: detail.items.map((item) => item.expense.id),
    initialReference: detail.reimbursement.reference ?? "",
  };
}
