import "server-only";
import { and, desc, eq, gte, inArray, lte, ne, sql, sum } from "drizzle-orm";
import { getDb } from "@/db";
import {
  clients,
  dividendDeclarations,
  dividendPayouts,
  expenses,
  invoices,
  payments,
} from "@/db/schema";
import { clientDisplayNameSql } from "@/lib/clients/sql";
import { defaultReportPeriod as fyDefaultReportPeriod } from "@/lib/dates";
import { formatGBP } from "@/lib/money";
import { todayIsoDate } from "@/lib/invoices/status";
import { getOrCreateCompanySettings } from "@/lib/settings/queries";

export async function getProfitAndLoss(from: string, to: string) {
  const db = getDb();
  const [income] = await db
    .select({ total: sum(invoices.grossPence).mapWith(Number) })
    .from(invoices)
    .where(
      and(
        ne(invoices.status, "void"),
        ne(invoices.status, "draft"),
        gte(invoices.issueDate, from),
        lte(invoices.issueDate, to),
      ),
    );

  const [expenseTotal] = await db
    .select({ total: sum(expenses.amountPence).mapWith(Number) })
    .from(expenses)
    .where(
      and(
        ne(expenses.status, "pending"),
        gte(expenses.spentAt, from),
        lte(expenses.spentAt, to),
      ),
    );

  const incomePence = income?.total ?? 0;
  const expensePence = expenseTotal?.total ?? 0;
  return {
    incomePence,
    expensePence,
    profitPence: incomePence - expensePence,
    incomeFormatted: formatGBP(incomePence),
    expenseFormatted: formatGBP(expensePence),
    profitFormatted: formatGBP(incomePence - expensePence),
    basis: "accrual" as const,
    basisNote:
      "Accrual basis: income is invoiced (issue date, including unpaid) in the period. Expenses are by spend date. VAT is £0 until the company is VAT-registered.",
  };
}

export async function getAgedReceivables() {
  const db = getDb();
  const today = todayIsoDate();
  const rows = await db
    .select({
      id: invoices.id,
      number: invoices.number,
      status: invoices.status,
      dueDate: invoices.dueDate,
      grossPence: invoices.grossPence,
      clientName: clientDisplayNameSql.as("client_name"),
    })
    .from(invoices)
    .innerJoin(clients, eq(invoices.clientId, clients.id))
    .where(
      and(ne(invoices.status, "draft"), ne(invoices.status, "void"), ne(invoices.status, "paid")),
    );

  const buckets = { current: 0, d30: 0, d60: 0, d90: 0 };

  const paidMap = new Map<string, number>();
  if (rows.length > 0) {
    const paidByInvoice = await db
      .select({
        invoiceId: payments.invoiceId,
        total: sum(payments.amountPence).mapWith(Number),
      })
      .from(payments)
      .where(
        inArray(
          payments.invoiceId,
          rows.map((r) => r.id),
        ),
      )
      .groupBy(payments.invoiceId);
    for (const p of paidByInvoice) {
      paidMap.set(p.invoiceId, p.total ?? 0);
    }
  }

  for (const inv of rows) {
    const balance = Math.max(0, inv.grossPence - (paidMap.get(inv.id) ?? 0));
    if (balance === 0) continue;
    const due = inv.dueDate ?? today;
    const days = Math.max(
      0,
      Math.floor(
        (new Date(`${today}T12:00:00Z`).getTime() -
          new Date(`${due}T12:00:00Z`).getTime()) /
          (1000 * 60 * 60 * 24),
      ),
    );
    if (days <= 0) buckets.current += balance;
    else if (days <= 30) buckets.d30 += balance;
    else if (days <= 60) buckets.d60 += balance;
    else buckets.d90 += balance;
  }

  return {
    current: formatGBP(buckets.current),
    d30: formatGBP(buckets.d30),
    d60: formatGBP(buckets.d60),
    d90: formatGBP(buckets.d90),
    raw: buckets,
  };
}

export async function getIncomeByMonth(from: string, to: string) {
  const db = getDb();
  const rows = await db
    .select({
      month: sql<string>`to_char(${invoices.issueDate}, 'YYYY-MM')`,
      total: sum(invoices.grossPence).mapWith(Number),
    })
    .from(invoices)
    .where(
      and(
        ne(invoices.status, "void"),
        ne(invoices.status, "draft"),
        gte(invoices.issueDate, from),
        lte(invoices.issueDate, to),
      ),
    )
    .groupBy(sql`to_char(${invoices.issueDate}, 'YYYY-MM')`)
    .orderBy(sql`to_char(${invoices.issueDate}, 'YYYY-MM')`);

  return rows.map((r) => ({
    month: r.month,
    totalPence: r.total ?? 0,
    totalFormatted: formatGBP(r.total ?? 0),
  }));
}

export async function getExpenseByMonth(from: string, to: string) {
  const db = getDb();
  const rows = await db
    .select({
      month: sql<string>`to_char(${expenses.spentAt}, 'YYYY-MM')`,
      total: sum(expenses.amountPence).mapWith(Number),
    })
    .from(expenses)
    .where(
      and(
        ne(expenses.status, "pending"),
        gte(expenses.spentAt, from),
        lte(expenses.spentAt, to),
      ),
    )
    .groupBy(sql`to_char(${expenses.spentAt}, 'YYYY-MM')`)
    .orderBy(sql`to_char(${expenses.spentAt}, 'YYYY-MM')`);

  return rows.map((r) => ({
    month: r.month,
    totalPence: r.total ?? 0,
    totalFormatted: formatGBP(r.total ?? 0),
  }));
}

export async function getExpenseByCategory(from: string, to: string) {
  const db = getDb();
  const rows = await db
    .select({
      category: expenses.category,
      total: sum(expenses.amountPence).mapWith(Number),
    })
    .from(expenses)
    .where(
      and(
        ne(expenses.status, "pending"),
        gte(expenses.spentAt, from),
        lte(expenses.spentAt, to),
      ),
    )
    .groupBy(expenses.category)
    .orderBy(desc(sum(expenses.amountPence)));

  return rows.map((r) => ({
    category: r.category ?? "Uncategorised",
    totalPence: r.total ?? 0,
    totalFormatted: formatGBP(r.total ?? 0),
  }));
}

export async function getVatSummary(from: string, to: string) {
  // Not VAT registered — always 0 for now.
  return {
    vatOnSalesPence: 0,
    vatOnPurchasesPence: 0,
    netVatPence: 0,
    vatOnSalesFormatted: formatGBP(0),
    vatOnPurchasesFormatted: formatGBP(0),
    note: "Not VAT registered — VAT summary is £0.00 until MTD is enabled.",
    from,
    to,
  };
}

export async function listDividendDeclarations(options?: {
  from?: string;
  to?: string;
}) {
  const db = getDb();
  const conditions = [];
  if (options?.from) {
    conditions.push(gte(dividendDeclarations.declaredAt, options.from));
  }
  if (options?.to) {
    conditions.push(lte(dividendDeclarations.declaredAt, options.to));
  }

  const declarations = await db
    .select()
    .from(dividendDeclarations)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(dividendDeclarations.declaredAt));

  if (declarations.length === 0) return [];

  const ids = declarations.map((d) => d.id);
  const payouts = await db
    .select()
    .from(dividendPayouts)
    .where(inArray(dividendPayouts.declarationId, ids));

  const byDecl = new Map<string, typeof payouts>();
  for (const p of payouts) {
    const list = byDecl.get(p.declarationId) ?? [];
    list.push(p);
    byDecl.set(p.declarationId, list);
  }

  return declarations.map((d) => {
    const lines = (byDecl.get(d.id) ?? []).sort((a, b) =>
      a.shareholderName.localeCompare(b.shareholderName),
    );
    return {
      ...d,
      totalFormatted: formatGBP(d.totalPence),
      payouts: lines.map((p) => ({
        ...p,
        amountFormatted: formatGBP(p.amountPence),
      })),
    };
  });
}

/** @deprecated Prefer listDividendDeclarations — flat payout list for pack-style exports. */
export async function listDividends(options?: { from?: string; to?: string }) {
  const decls = await listDividendDeclarations(options);
  return decls.flatMap((d) =>
    d.payouts.map((p) => ({
      id: p.id,
      declaredAt: d.declaredAt,
      shareholderName: p.shareholderName,
      amountPence: p.amountPence,
      notes: d.notes,
      createdAt: p.createdAt,
      amountFormatted: p.amountFormatted,
    })),
  );
}

export async function defaultReportPeriod(): Promise<{ from: string; to: string }> {
  const settings = await getOrCreateCompanySettings();
  return fyDefaultReportPeriod(settings.financialYearEndMonth);
}
