import "server-only";
import { alias } from "drizzle-orm/pg-core";
import { and, asc, count, desc, eq, gte, ilike, lte, or, sql, sum, type AnyColumn, type SQL } from "drizzle-orm";
import { getDb } from "@/db";
import {
  clients,
  expenseReceipts,
  expenses,
  reconciliationMatches,
  users,
} from "@/db/schema";
import { clientDisplayNameSql } from "@/lib/clients/sql";
import { formatExpenseAmount, formatGBP } from "@/lib/money";
import type { ExpenseStatus } from "@/lib/expenses/categories";
import type { ExpenseSortColumn } from "@/lib/expenses/list-sort";
import type { TableSort } from "@/lib/table-sort";
import { bankSearchPattern } from "@/lib/bank/list-params";

export interface ExpenseFilters {
  /** Matches description or client name. */
  q?: string;
  from?: string;
  to?: string;
  category?: string;
  paidByUserId?: string;
  billable?: "true" | "false" | "";
  status?: string;
  sort?: TableSort<ExpenseSortColumn>;
}

export async function listFounders(companyId: string) {
  const db = getDb();
  return db
    .select({ id: users.id, name: users.name, email: users.email, role: users.role })
    .from(users)
    .where(
      and(
        eq(users.companyId, companyId),
        sql`${users.role} in ('admin', 'user')`,
      ),
    )
    .orderBy(users.name);
}

/**
 * ORDER BY for the expenses table. Newest-first breaks ties, then id. Status
 * sorts in workflow order (pending review first), not alphabetically.
 */
function expenseListOrderBy(
  sort: TableSort<ExpenseSortColumn> = { sort: "date", dir: "desc" },
  joined: { paidBy: AnyColumn; createdBy: SQL },
): SQL[] {
  const by = (expr: SQL | AnyColumn) =>
    sort.dir === "asc" ? sql`${expr} asc nulls last` : sql`${expr} desc nulls last`;
  const tiebreak = [desc(expenses.spentAt), desc(expenses.createdAt), desc(expenses.id)];
  switch (sort.sort) {
    case "description":
      return [by(sql`lower(${expenses.description})`), ...tiebreak];
    case "category":
      return [by(expenses.category), ...tiebreak];
    case "paidBy":
      return [by(sql`lower(${joined.paidBy})`), ...tiebreak];
    case "createdBy":
      return [by(sql`lower(${joined.createdBy})`), ...tiebreak];
    case "status":
      // Explicit order: 'pending' was appended to the enum, so its own order is wrong.
      return [
        by(sql`case ${expenses.status}
          when 'pending' then 0 when 'recorded' then 1 when 'reimbursable' then 2
          when 'reimbursed' then 3 when 'company_paid' then 4 end`),
        ...tiebreak,
      ];
    case "amount":
      return [by(expenses.amountPence), ...tiebreak];
    case "date":
      // Undated expenses keep their current place at the top of newest-first.
      return sort.dir === "asc"
        ? [asc(expenses.spentAt), asc(expenses.createdAt), asc(expenses.id)]
        : tiebreak;
  }
}

export async function listExpenses(companyId: string, filters: ExpenseFilters = {}) {
  const db = getDb();
  const paidBy = alias(users, "paid_by");
  const createdBy = alias(users, "created_by");
  const submittedBy = alias(users, "submitted_by");
  const conditions = [eq(expenses.companyId, companyId)];
  const pattern = filters.q ? bankSearchPattern(filters.q) : null;
  if (pattern) {
    const search = or(ilike(expenses.description, pattern), ilike(clientDisplayNameSql, pattern));
    if (search) conditions.push(search);
  }
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
      detectedCurrency: expenses.detectedCurrency,
      originalAmountMinor: expenses.originalAmountMinor,
      status: expenses.status,
      billable: expenses.billable,
      source: expenses.source,
      createdAt: expenses.createdAt,
      paidByName: paidBy.name,
      createdByName: createdBy.name,
      createdByEmail: createdBy.email,
      submittedByName: submittedBy.name,
      submittedByEmail: submittedBy.email,
      clientName: clientDisplayNameSql.as("client_name"),
      bankLinked: sql<boolean>`exists (
        select 1 from ${reconciliationMatches}
        where ${reconciliationMatches.expenseId} = ${expenses.id}
          and ${reconciliationMatches.confirmed}
      )`.mapWith(Boolean),
    })
    .from(expenses)
    .leftJoin(paidBy, eq(expenses.paidByUserId, paidBy.id))
    .leftJoin(createdBy, eq(expenses.createdByUserId, createdBy.id))
    .leftJoin(submittedBy, eq(expenses.submittedByUserId, submittedBy.id))
    .leftJoin(clients, eq(expenses.clientId, clients.id))
    .where(and(...conditions))
    .orderBy(
      ...expenseListOrderBy(filters.sort, {
        paidBy: paidBy.name,
        createdBy: sql`coalesce(${createdBy.name}, ${createdBy.email}, ${submittedBy.name}, ${submittedBy.email})`,
      }),
    );

  return rows.map((r) => {
    const createdByDisplay =
      r.createdByName ||
      r.createdByEmail ||
      r.submittedByName ||
      r.submittedByEmail ||
      null;
    return {
      id: r.id,
      description: r.description,
      category: r.category,
      spentAt: r.spentAt,
      amountPence: r.amountPence,
      detectedCurrency: r.detectedCurrency,
      originalAmountMinor: r.originalAmountMinor,
      status: r.status,
      billable: r.billable,
      source: r.source,
      createdAt: r.createdAt,
      paidByName: r.paidByName,
      createdByName: createdByDisplay,
      clientName: r.clientName,
      /** Confirmed against a bank transaction. */
      bankLinked: r.bankLinked,
      amountFormatted: formatExpenseAmount(r),
    };
  });
}

export async function getExpenseDetail(companyId: string, id: string) {
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
    .leftJoin(clients, eq(expenses.clientId, clients.id))
    .leftJoin(submitter, eq(expenses.submittedByUserId, submitter.id))
    .where(and(eq(expenses.id, id), eq(expenses.companyId, companyId)))
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
      amountFormatted: formatExpenseAmount(e),
    },
    paidBy: rows[0].paidBy,
    client: rows[0].client,
    submitter: rows[0].submitter,
    receipts,
  };
}

export async function getReimbursableSummary(
  companyId: string,
  paidByUserId?: string,
) {
  const db = getDb();
  const conditions = [
    eq(expenses.companyId, companyId),
    eq(expenses.status, "reimbursable" as ExpenseStatus),
  ];
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

export async function listReimbursableExpenses(
  companyId: string,
  payeeUserId?: string,
) {
  const db = getDb();
  const conditions = [
    eq(expenses.companyId, companyId),
    eq(expenses.status, "reimbursable" as ExpenseStatus),
  ];
  if (payeeUserId) {
    conditions.push(eq(expenses.paidByUserId, payeeUserId));
  }
  return db
    .select()
    .from(expenses)
    .where(and(...conditions))
    .orderBy(desc(expenses.spentAt));
}

/**
 * Cheap change marker for expenses that arrived by email. The expenses list
 * polls this and refreshes when it changes, so new email submissions appear
 * without a manual reload.
 */
export async function getEmailExpensesFingerprint(companyId: string): Promise<string> {
  const db = getDb();
  const [row] = await db
    .select({
      total: count(),
      latest: sql<string | null>`max(${expenses.createdAt})::text`,
    })
    .from(expenses)
    .where(and(eq(expenses.companyId, companyId), eq(expenses.source, "email")));
  return `${row?.total ?? 0}:${row?.latest ?? ""}`;
}
