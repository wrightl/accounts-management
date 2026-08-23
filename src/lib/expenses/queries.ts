import "server-only";
import { alias } from "drizzle-orm/pg-core";
import { and, count, desc, eq, gte, lte, sql, sum } from "drizzle-orm";
import { getDb } from "@/db";
import {
  clients,
  expenseReceipts,
  expenses,
  users,
} from "@/db/schema";
import { clientDisplayNameSql } from "@/lib/clients/sql";
import { formatGBP } from "@/lib/money";
import type { ExpenseStatus } from "@/lib/expenses/categories";

export interface ExpenseFilters {
  from?: string;
  to?: string;
  category?: string;
  paidByUserId?: string;
  billable?: "true" | "false" | "";
  status?: string;
}

export async function listFounders() {
  const db = getDb();
  return db
    .select({ id: users.id, name: users.name, email: users.email, role: users.role })
    .from(users)
    .where(sql`${users.role} in ('admin', 'user')`)
    .orderBy(users.name);
}

export async function listExpenses(filters: ExpenseFilters = {}) {
  const db = getDb();
  const conditions = [];
  if (filters.from) conditions.push(gte(expenses.spentAt, filters.from));
  if (filters.to) conditions.push(lte(expenses.spentAt, filters.to));
  if (filters.category) conditions.push(eq(expenses.category, filters.category));
  if (filters.paidByUserId) {
    conditions.push(eq(expenses.paidByUserId, filters.paidByUserId));
  }
  if (filters.billable === "true") conditions.push(eq(expenses.billable, true));
  if (filters.billable === "false") conditions.push(eq(expenses.billable, false));
  if (filters.status) {
    conditions.push(eq(expenses.status, filters.status as ExpenseStatus));
  }

  const rows = await db
    .select({
      id: expenses.id,
      description: expenses.description,
      category: expenses.category,
      spentAt: expenses.spentAt,
      amountPence: expenses.amountPence,
      status: expenses.status,
      billable: expenses.billable,
      paidByName: users.name,
      clientName: clientDisplayNameSql.as("client_name"),
    })
    .from(expenses)
    .leftJoin(users, eq(expenses.paidByUserId, users.id))
    .leftJoin(clients, eq(expenses.billableClientId, clients.id))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(expenses.spentAt), desc(expenses.createdAt));

  return rows.map((r) => ({
    ...r,
    amountFormatted: formatGBP(r.amountPence),
  }));
}

export async function getExpenseDetail(id: string) {
  const db = getDb();
  const submitter = alias(users, "submitter");
  const rows = await db
    .select({
      expense: expenses,
      paidBy: users,
      client: clients,
      submitter,
    })
    .from(expenses)
    .leftJoin(users, eq(expenses.paidByUserId, users.id))
    .leftJoin(clients, eq(expenses.billableClientId, clients.id))
    .leftJoin(submitter, eq(expenses.submittedByUserId, submitter.id))
    .where(eq(expenses.id, id))
    .limit(1);

  if (!rows[0]) return null;

  const receipts = await db
    .select()
    .from(expenseReceipts)
    .where(eq(expenseReceipts.expenseId, id))
    .orderBy(desc(expenseReceipts.uploadedAt));

  const e = rows[0].expense;
  return {
    expense: {
      ...e,
      amountFormatted: formatGBP(e.amountPence),
    },
    paidBy: rows[0].paidBy,
    client: rows[0].client,
    submitter: rows[0].submitter,
    receipts,
  };
}

export async function getReimbursableSummary(paidByUserId?: string) {
  const db = getDb();
  const conditions = [eq(expenses.status, "reimbursable" as ExpenseStatus)];
  if (paidByUserId) {
    conditions.push(eq(expenses.paidByUserId, paidByUserId));
  }
  const [row] = await db
    .select({
      count: count(),
      total: sum(expenses.amountPence).mapWith(Number),
    })
    .from(expenses)
    .where(and(...conditions));

  return {
    count: row?.count ?? 0,
    totalPence: row?.total ?? 0,
    totalFormatted: formatGBP(row?.total ?? 0),
  };
}

export async function listReimbursableExpenses(payeeUserId: string) {
  const db = getDb();
  return db
    .select()
    .from(expenses)
    .where(
      and(
        eq(expenses.status, "reimbursable"),
        eq(expenses.paidByUserId, payeeUserId),
      ),
    )
    .orderBy(desc(expenses.spentAt));
}
