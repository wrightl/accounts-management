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
import { getCompanySettings } from "@/lib/settings/queries";

export async function getProfitAndLoss(
  companyId: string,
  from: string,
  to: string,
) {
  const db = getDb();
  const [income] = await db
    .select({ total: sum(invoices.netPence).mapWith(Number) })
    .from(invoices)
    .where(
      and(
        eq(invoices.companyId, companyId),
        ne(invoices.status, "void"),
        ne(invoices.status, "draft"),
        gte(invoices.issueDate, from),
        lte(invoices.issueDate, to),
      ),
    );

  const [expenseTotal] = await db
    .select({
      total: sql<number>`coalesce(sum(${expenses.amountPence} - ${expenses.vatPence}), 0)`.mapWith(
        Number,
      ),
    })
    .from(expenses)
    .where(
      and(
        eq(expenses.companyId, companyId),
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
      "Accrual basis: income is invoiced net (ex-VAT) by issue date. Expenses are net of VAT by spend date. See VAT summary for output/input VAT.",
  };
}

export async function getAgedReceivables(companyId: string) {
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
      and(
        eq(invoices.companyId, companyId),
        ne(invoices.status, "draft"),
        ne(invoices.status, "void"),
        ne(invoices.status, "paid"),
      ),
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

export async function getIncomeByMonth(
  companyId: string,
  from: string,
  to: string,
) {
  const db = getDb();
  const rows = await db
    .select({
      month: sql<string>`to_char(${invoices.issueDate}, 'YYYY-MM')`,
      total: sum(invoices.netPence).mapWith(Number),
    })
    .from(invoices)
    .where(
      and(
        eq(invoices.companyId, companyId),
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

export async function getExpenseByMonth(
  companyId: string,
  from: string,
  to: string,
) {
  const db = getDb();
  const rows = await db
    .select({
      month: sql<string>`to_char(${expenses.spentAt}, 'YYYY-MM')`,
      total: sum(expenses.amountPence).mapWith(Number),
    })
    .from(expenses)
    .where(
      and(
        eq(expenses.companyId, companyId),
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

export async function getExpenseByCategory(
  companyId: string,
  from: string,
  to: string,
) {
  const db = getDb();
  const rows = await db
    .select({
      category: expenses.category,
      total: sql<number>`coalesce(sum(${expenses.amountPence} - ${expenses.vatPence}), 0)`.mapWith(
        Number,
      ),
    })
    .from(expenses)
    .where(
      and(
        eq(expenses.companyId, companyId),
        ne(expenses.status, "pending"),
        gte(expenses.spentAt, from),
        lte(expenses.spentAt, to),
      ),
    )
    .groupBy(expenses.category)
    .orderBy(desc(sql`sum(${expenses.amountPence} - ${expenses.vatPence})`));

  return rows.map((r) => ({
    category: r.category ?? "Uncategorised",
    totalPence: r.total ?? 0,
    totalFormatted: formatGBP(r.total ?? 0),
  }));
}

export async function getVatSummary(
  companyId: string,
  from: string,
  to: string,
) {
  const db = getDb();
  const company = await getCompanySettings(companyId);

  const [sales] = await db
    .select({ total: sum(invoices.vatPence).mapWith(Number) })
    .from(invoices)
    .where(
      and(
        eq(invoices.companyId, companyId),
        ne(invoices.status, "void"),
        ne(invoices.status, "draft"),
        gte(invoices.issueDate, from),
        lte(invoices.issueDate, to),
      ),
    );

  const [purchases] = await db
    .select({ total: sum(expenses.vatPence).mapWith(Number) })
    .from(expenses)
    .where(
      and(
        eq(expenses.companyId, companyId),
        ne(expenses.status, "pending"),
        gte(expenses.spentAt, from),
        lte(expenses.spentAt, to),
      ),
    );

  const vatOnSalesPence = sales?.total ?? 0;
  const vatOnPurchasesPence = purchases?.total ?? 0;
  const netVatPence = vatOnSalesPence - vatOnPurchasesPence;

  const note = company.vatRegistered
    ? "Export for your accountant — this app does not submit to HMRC."
    : "Company is not marked VAT registered in Settings. Figures reflect any VAT stored on documents.";

  return {
    vatOnSalesPence,
    vatOnPurchasesPence,
    netVatPence,
    vatOnSalesFormatted: formatGBP(vatOnSalesPence),
    vatOnPurchasesFormatted: formatGBP(vatOnPurchasesPence),
    netVatFormatted: formatGBP(netVatPence),
    vatRegistered: company.vatRegistered,
    vatNumber: company.vatNumber,
    note,
    from,
    to,
  };
}

export async function listDividendDeclarations(
  companyId: string,
  options?: {
    from?: string;
    to?: string;
  },
) {
  const db = getDb();
  const conditions = [eq(dividendDeclarations.companyId, companyId)];
  if (options?.from) {
    conditions.push(gte(dividendDeclarations.declaredAt, options.from));
  }
  if (options?.to) {
    conditions.push(lte(dividendDeclarations.declaredAt, options.to));
  }

  const declarations = await db
    .select()
    .from(dividendDeclarations)
    .where(and(...conditions))
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
export async function listDividends(
  companyId: string,
  options?: { from?: string; to?: string },
) {
  const decls = await listDividendDeclarations(companyId, options);
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

export async function defaultReportPeriod(
  companyId: string,
): Promise<{ from: string; to: string }> {
  const settings = await getCompanySettings(companyId);
  return fyDefaultReportPeriod(settings.financialYearEndMonth);
}
