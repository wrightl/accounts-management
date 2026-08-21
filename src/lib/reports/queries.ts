import "server-only";
import { and, desc, eq, gte, lte, ne, sql, sum } from "drizzle-orm";
import { getDb } from "@/db";
import {
  clients,
  dividends,
  expenses,
  invoices,
  payments,
} from "@/db/schema";
import { formatGBP } from "@/lib/money";
import { todayIsoDate } from "@/lib/invoices/status";

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
    .where(and(gte(expenses.spentAt, from), lte(expenses.spentAt, to)));

  const incomePence = income?.total ?? 0;
  const expensePence = expenseTotal?.total ?? 0;
  return {
    incomePence,
    expensePence,
    profitPence: incomePence - expensePence,
    incomeFormatted: formatGBP(incomePence),
    expenseFormatted: formatGBP(expensePence),
    profitFormatted: formatGBP(incomePence - expensePence),
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
      clientName: clients.name,
    })
    .from(invoices)
    .innerJoin(clients, eq(invoices.clientId, clients.id))
    .where(
      and(ne(invoices.status, "draft"), ne(invoices.status, "void"), ne(invoices.status, "paid")),
    );

  const buckets = { current: 0, d30: 0, d60: 0, d90: 0 };

  for (const inv of rows) {
    const paid = await db
      .select({ total: sum(payments.amountPence).mapWith(Number) })
      .from(payments)
      .where(eq(payments.invoiceId, inv.id));
    const balance = Math.max(0, inv.grossPence - (paid[0]?.total ?? 0));
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

export async function getExpenseByCategory(from: string, to: string) {
  const db = getDb();
  const rows = await db
    .select({
      category: expenses.category,
      total: sum(expenses.amountPence).mapWith(Number),
    })
    .from(expenses)
    .where(and(gte(expenses.spentAt, from), lte(expenses.spentAt, to)))
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

export async function listDividends() {
  const db = getDb();
  const rows = await db.select().from(dividends).orderBy(desc(dividends.declaredAt));
  return rows.map((d) => ({
    ...d,
    amountFormatted: formatGBP(d.amountPence),
  }));
}

export function defaultReportPeriod(): { from: string; to: string } {
  const to = todayIsoDate();
  const year = Number(to.slice(0, 4));
  // FY ends March: if before April, FY started previous April 1
  const month = Number(to.slice(5, 7));
  const fyStartYear = month >= 4 ? year : year - 1;
  return { from: `${fyStartYear}-04-01`, to };
}
