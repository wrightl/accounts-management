import "server-only";
import { invoiceCountsInAccounts } from "@/lib/invoices/accounts-scope";
import { and, count, desc, eq, gte, inArray, lte, ne, sql, sum } from "drizzle-orm";
import { getDb } from "@/db";
import {
  bankAccounts,
  bankTransactions,
  clients,
  dividendDeclarations,
  dividendPayouts,
  expenses,
  invoices,
  payments,
  reconciliationMatches,
} from "@/db/schema";
import { clientDisplayNameSql } from "@/lib/clients/sql";
import { defaultReportPeriod as fyDefaultReportPeriod } from "@/lib/dates";
import { type ListPaging, fetchPage } from "@/lib/list-paging";
import { formatGBP } from "@/lib/money";
import { creditAdjustmentsByInvoice } from "@/lib/credit-notes/adjustments";
import {
  creditNotesByMonth,
  subtractByMonth,
  sumCreditNotesInPeriod,
} from "@/lib/credit-notes/period";
import { invoiceAmountDuePence } from "@/lib/invoices/balance";
import { todayIsoDate } from "@/lib/invoices/status";
import { getCompanySettings } from "@/lib/settings/queries";

async function sumOtherIncomePence(
  companyId: string,
  from: string,
  to: string,
): Promise<number> {
  const db = getDb();
  const [row] = await db
    .select({
      total: sql<number>`coalesce(sum(${bankTransactions.amountPence}), 0)`.mapWith(
        Number,
      ),
    })
    .from(reconciliationMatches)
    .innerJoin(
      bankTransactions,
      eq(reconciliationMatches.bankTransactionId, bankTransactions.id),
    )
    .innerJoin(
      bankAccounts,
      eq(bankTransactions.bankAccountId, bankAccounts.id),
    )
    .where(
      and(
        eq(bankAccounts.companyId, companyId),
        eq(reconciliationMatches.matchType, "other_income"),
        eq(reconciliationMatches.confirmed, true),
        gte(bankTransactions.bookedAt, from),
        lte(bankTransactions.bookedAt, to),
      ),
    );
  return row?.total ?? 0;
}

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
        invoiceCountsInAccounts,
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

  const credits = await sumCreditNotesInPeriod(companyId, from, to);
  const creditNotePence = credits.netPence;
  const incomePence = (income?.total ?? 0) - creditNotePence;
  const otherIncomePence = await sumOtherIncomePence(companyId, from, to);
  const expensePence = expenseTotal?.total ?? 0;
  const profitPence = incomePence + otherIncomePence - expensePence;
  return {
    incomePence,
    creditNotePence,
    otherIncomePence,
    expensePence,
    profitPence,
    incomeFormatted: formatGBP(incomePence),
    creditNoteFormatted: formatGBP(creditNotePence),
    otherIncomeFormatted: formatGBP(otherIncomePence),
    expenseFormatted: formatGBP(expensePence),
    profitFormatted: formatGBP(profitPence),
    basis: "accrual" as const,
    basisNote:
      "Accrual basis: invoiced income is net (ex-VAT) by issue date, less credit notes by their issue date. Other income is cash on the bank date (no VAT). Expenses are net of VAT by spend date. See VAT summary for output/input VAT.",
  };
}

/** Confirmed other-income credits grouped by calendar month (booked_at). */
export async function getOtherIncomeByMonth(
  companyId: string,
  from: string,
  to: string,
) {
  const db = getDb();
  const rows = await db
    .select({
      month: sql<string>`to_char(${bankTransactions.bookedAt}::date, 'YYYY-MM')`,
      totalPence: sql<number>`coalesce(sum(${bankTransactions.amountPence}), 0)`.mapWith(
        Number,
      ),
    })
    .from(reconciliationMatches)
    .innerJoin(
      bankTransactions,
      eq(reconciliationMatches.bankTransactionId, bankTransactions.id),
    )
    .innerJoin(
      bankAccounts,
      eq(bankTransactions.bankAccountId, bankAccounts.id),
    )
    .where(
      and(
        eq(bankAccounts.companyId, companyId),
        eq(reconciliationMatches.matchType, "other_income"),
        eq(reconciliationMatches.confirmed, true),
        gte(bankTransactions.bookedAt, from),
        lte(bankTransactions.bookedAt, to),
      ),
    )
    .groupBy(sql`to_char(${bankTransactions.bookedAt}::date, 'YYYY-MM')`)
    .orderBy(sql`to_char(${bankTransactions.bookedAt}::date, 'YYYY-MM')`);

  return rows.map((r) => ({
    month: r.month,
    totalPence: r.totalPence,
    totalFormatted: formatGBP(r.totalPence),
  }));
}

export type OtherIncomeRow = {
  bankTransactionId: string;
  bankAccountName: string;
  bookedAt: string;
  amountPence: number;
  amountFormatted: string;
  incomeCategory: string | null;
  note: string | null;
  counterparty: string | null;
};

export async function listOtherIncomeInPeriod(
  companyId: string,
  from: string,
  to: string,
): Promise<OtherIncomeRow[]> {
  const db = getDb();
  const rows = await db
    .select({
      bankTransactionId: bankTransactions.id,
      bankAccountName: bankAccounts.name,
      bookedAt: bankTransactions.bookedAt,
      amountPence: bankTransactions.amountPence,
      incomeCategory: reconciliationMatches.incomeCategory,
      note: reconciliationMatches.note,
      counterparty: bankTransactions.counterparty,
    })
    .from(reconciliationMatches)
    .innerJoin(
      bankTransactions,
      eq(reconciliationMatches.bankTransactionId, bankTransactions.id),
    )
    .innerJoin(
      bankAccounts,
      eq(bankTransactions.bankAccountId, bankAccounts.id),
    )
    .where(
      and(
        eq(bankAccounts.companyId, companyId),
        eq(reconciliationMatches.matchType, "other_income"),
        eq(reconciliationMatches.confirmed, true),
        gte(bankTransactions.bookedAt, from),
        lte(bankTransactions.bookedAt, to),
      ),
    )
    .orderBy(desc(bankTransactions.bookedAt));

  return rows.map((r) => ({
    bankTransactionId: r.bankTransactionId,
    bankAccountName: r.bankAccountName,
    bookedAt: r.bookedAt,
    amountPence: r.amountPence,
    amountFormatted: formatGBP(r.amountPence),
    incomeCategory: r.incomeCategory,
    note: r.note,
    counterparty: r.counterparty,
  }));
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

  const credits = await creditAdjustmentsByInvoice(
    db,
    rows.map((r) => r.id),
  );
  for (const inv of rows) {
    const balance = invoiceAmountDuePence({
      grossPence: inv.grossPence,
      paidPence: paidMap.get(inv.id) ?? 0,
      ...credits.get(inv.id),
    });
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
        invoiceCountsInAccounts,
        gte(invoices.issueDate, from),
        lte(invoices.issueDate, to),
      ),
    )
    .groupBy(sql`to_char(${invoices.issueDate}, 'YYYY-MM')`)
    .orderBy(sql`to_char(${invoices.issueDate}, 'YYYY-MM')`);

  const credits = await creditNotesByMonth(companyId, from, to);
  const series = subtractByMonth(
    rows.map((r) => ({ month: r.month, totalPence: r.total ?? 0 })),
    new Map([...credits].map(([month, c]) => [month, c.netPence])),
  );
  return series.map((r) => ({
    ...r,
    totalFormatted: formatGBP(r.totalPence),
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
        invoiceCountsInAccounts,
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

  const credits = await sumCreditNotesInPeriod(companyId, from, to);
  const creditNoteVatPence = credits.vatPence;
  const vatOnSalesPence = (sales?.total ?? 0) - creditNoteVatPence;
  const vatOnPurchasesPence = purchases?.total ?? 0;
  const netVatPence = vatOnSalesPence - vatOnPurchasesPence;

  const note = company.vatRegistered
    ? "Export for your accountant — this app does not submit to HMRC."
    : "Company is not marked VAT registered in Settings. Figures reflect any VAT stored on documents.";

  return {
    vatOnSalesPence,
    creditNoteVatPence,
    vatOnPurchasesPence,
    netVatPence,
    vatOnSalesFormatted: formatGBP(vatOnSalesPence),
    creditNoteVatFormatted: formatGBP(creditNoteVatPence),
    vatOnPurchasesFormatted: formatGBP(vatOnPurchasesPence),
    netVatFormatted: formatGBP(netVatPence),
    vatRegistered: company.vatRegistered,
    vatNumber: company.vatNumber,
    note,
    from,
    to,
  };
}

function dividendPeriodWhere(companyId: string, options?: { from?: string; to?: string }) {
  return and(
    eq(dividendDeclarations.companyId, companyId),
    options?.from ? gte(dividendDeclarations.declaredAt, options.from) : undefined,
    options?.to ? lte(dividendDeclarations.declaredAt, options.to) : undefined,
  );
}

/** Attach each declaration's payouts, by shareholder name. */
async function withPayouts<T extends { id: string; totalPence: number }>(
  companyId: string,
  declarations: T[],
) {
  if (declarations.length === 0) return [];
  // Payouts get their company from the declaration.
  const payouts = await getDb()
    .select({ payout: dividendPayouts })
    .from(dividendPayouts)
    .innerJoin(dividendDeclarations, eq(dividendPayouts.declarationId, dividendDeclarations.id))
    .where(
      and(
        eq(dividendDeclarations.companyId, companyId),
        inArray(
          dividendPayouts.declarationId,
          declarations.map((d) => d.id),
        ),
      ),
    )
    .then((rows) => rows.map((r) => r.payout));

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

export async function listDividendDeclarations(
  companyId: string,
  options?: {
    from?: string;
    to?: string;
  },
) {
  const declarations = await getDb()
    .select()
    .from(dividendDeclarations)
    .where(dividendPeriodWhere(companyId, options))
    .orderBy(desc(dividendDeclarations.declaredAt), desc(dividendDeclarations.id));
  return withPayouts(companyId, declarations);
}

/**
 * One page of dividend declarations in a period, newest first, with the
 * period's total across every page.
 */
export async function listDividendDeclarationPage(
  companyId: string,
  options: { from?: string; to?: string } & ListPaging,
) {
  const db = getDb();
  const where = dividendPeriodWhere(companyId, options);
  let periodTotalPence = 0;
  const page = await fetchPage(
    options,
    async () => {
      const [row] = await db
        .select({ n: count(), total: sum(dividendDeclarations.totalPence).mapWith(Number) })
        .from(dividendDeclarations)
        .where(where);
      periodTotalPence = row?.total ?? 0;
      return row?.n ?? 0;
    },
    ({ limit, offset }) =>
      db
        .select()
        .from(dividendDeclarations)
        .where(where)
        .orderBy(desc(dividendDeclarations.declaredAt), desc(dividendDeclarations.id))
        .limit(limit)
        .offset(offset),
  );
  return { ...page, rows: await withPayouts(companyId, page.rows), periodTotalPence };
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
