import "server-only";
import { and, asc, desc, eq, gt, gte, inArray, isNotNull, lte, ne, sum } from "drizzle-orm";
import { getDb } from "@/db";
import {
  bankAccounts,
  bankTransactions,
  companies,
  expenses,
  invoices,
  payments,
  recurringInvoices,
} from "@/db/schema";
import { parseStatementBalancePence } from "@/lib/bank/summary";
import { listMilestonesReadyToBill } from "@/lib/close/checklist";
import { creditAdjustmentsByInvoice } from "@/lib/credit-notes/adjustments";
import { formatIsoDateUk, todayIsoDate } from "@/lib/dates";
import { splitDividendPence } from "@/lib/dividends/split";
import { invoiceAmountDuePence } from "@/lib/invoices/balance";
import { addDays, ctPaymentDueDate } from "@/lib/ledger/corporation-tax";
import { getReservesPosition } from "@/lib/ledger/queries";
import { invoiceTotals, type LineItem } from "@/lib/money";
import { getReimbursementBalances } from "@/lib/reimbursements/queries";
import { getVatSummary } from "@/lib/reports/queries";
import {
  LOOKAHEAD_DAYS,
  computeSafeToPay,
  vatDueDate,
  vatQuarterFor,
} from "@/lib/safe-to-pay/calc";
import { getActiveShareholdersForSplit } from "@/lib/shareholders/queries";

export type CashAtBank =
  | { known: true; cashPence: number; asOf: string; source: "statement" | "opening" }
  | { known: false };

/**
 * Cash at bank: the balance on each account's latest statement row. Without
 * statement balances, opening cash plus every transaction since.
 */
export async function getCashAtBank(companyId: string): Promise<CashAtBank> {
  const db = getDb();
  const accounts = await db
    .select({ id: bankAccounts.id })
    .from(bankAccounts)
    .where(eq(bankAccounts.companyId, companyId));

  const latest = await Promise.all(
    accounts.map(async (a) => {
      const [row] = await db
        .select({ raw: bankTransactions.raw, bookedAt: bankTransactions.bookedAt })
        .from(bankTransactions)
        .where(eq(bankTransactions.bankAccountId, a.id))
        .orderBy(desc(bankTransactions.bookedAt), desc(bankTransactions.createdAt))
        .limit(1);
      return row ? { balance: parseStatementBalancePence(row.raw), bookedAt: row.bookedAt } : null;
    }),
  );
  const withRows = latest.filter((r): r is NonNullable<typeof r> => r != null);
  if (withRows.length > 0 && withRows.every((r) => r.balance != null)) {
    return {
      known: true,
      cashPence: withRows.reduce((t, r) => t + r.balance!, 0),
      asOf: withRows.map((r) => r.bookedAt).sort()[0]!,
      source: "statement",
    };
  }

  const [company] = await db
    .select({ pence: companies.openingCashPence, asAt: companies.openingCashAsAt })
    .from(companies)
    .where(eq(companies.id, companyId))
    .limit(1);
  if (company?.pence == null || !company.asAt) return { known: false };
  const [moved] = accounts.length
    ? await db
        .select({ total: sum(bankTransactions.amountPence).mapWith(Number) })
        .from(bankTransactions)
        .where(
          and(
            inArray(
              bankTransactions.bankAccountId,
              accounts.map((a) => a.id),
            ),
            gt(bankTransactions.bookedAt, company.asAt),
          ),
        )
    : [{ total: 0 }];
  const newest = withRows.map((r) => r.bookedAt).sort().at(-1);
  return {
    known: true,
    cashPence: company.pence + (moved?.total ?? 0),
    asOf: newest && newest > company.asAt ? newest : company.asAt,
    source: "opening",
  };
}

/** VAT for the quarter so far, plus last quarter's until its payment deadline. */
async function getVatOwed(companyId: string, firstQuarterEndMonth: number, today: string) {
  const current = vatQuarterFor(today, firstQuarterEndMonth);
  const previous = vatQuarterFor(addDays(current.start, -1), firstQuarterEndMonth);
  const previousDue = vatDueDate(previous.end);
  const [now, last] = await Promise.all([
    getVatSummary(companyId, current.start, today),
    today <= previousDue
      ? getVatSummary(companyId, previous.start, previous.end)
      : Promise.resolve(null),
  ]);
  const parts = [
    { label: `This quarter to date (ends ${formatIsoDateUk(current.end)})`, pence: now.netVatPence },
    ...(last ? [{ label: `Last quarter, due ${formatIsoDateUk(previousDue)}`, pence: last.netVatPence }] : []),
  ];
  return { pence: Math.max(0, parts.reduce((t, p) => t + p.pence, 0)), parts };
}

/** Average monthly spending (gross) over the last three months. */
async function averageMonthlySpendPence(companyId: string, today: string) {
  const [row] = await getDb()
    .select({ total: sum(expenses.amountPence).mapWith(Number) })
    .from(expenses)
    .where(
      and(
        eq(expenses.companyId, companyId),
        ne(expenses.status, "pending"),
        gt(expenses.spentAt, addDays(today, -90)),
        lte(expenses.spentAt, today),
      ),
    );
  return Math.round((row?.total ?? 0) / 3);
}

/** Invoices falling due in the window that are still unpaid. */
async function invoicesDueSoonPence(companyId: string, today: string, until: string) {
  const db = getDb();
  const open = await db
    .select({ id: invoices.id, grossPence: invoices.grossPence })
    .from(invoices)
    .where(
      and(
        eq(invoices.companyId, companyId),
        eq(invoices.status, "sent"),
        isNotNull(invoices.dueDate),
        gte(invoices.dueDate, today),
        lte(invoices.dueDate, until),
      ),
    );
  if (open.length === 0) return 0;
  const ids = open.map((i) => i.id);
  const [paidRows, credits] = await Promise.all([
    db
      .select({ invoiceId: payments.invoiceId, total: sum(payments.amountPence).mapWith(Number) })
      .from(payments)
      .where(inArray(payments.invoiceId, ids))
      .groupBy(payments.invoiceId),
    creditAdjustmentsByInvoice(db, ids),
  ]);
  const paid = new Map(paidRows.map((r) => [r.invoiceId, r.total ?? 0]));
  return open.reduce(
    (t, inv) =>
      t +
      invoiceAmountDuePence({
        grossPence: inv.grossPence,
        paidPence: paid.get(inv.id) ?? 0,
        ...credits.get(inv.id),
      }),
    0,
  );
}

/** Recurring invoices that will be raised in the window (one run each). */
async function recurringDueSoonPence(companyId: string, today: string, until: string) {
  const rows = await getDb()
    .select({ lines: recurringInvoices.lineTemplate, endsOn: recurringInvoices.endsOn, nextRunOn: recurringInvoices.nextRunOn })
    .from(recurringInvoices)
    .where(
      and(
        eq(recurringInvoices.companyId, companyId),
        eq(recurringInvoices.enabled, true),
        gte(recurringInvoices.nextRunOn, today),
        lte(recurringInvoices.nextRunOn, until),
      ),
    )
    .orderBy(asc(recurringInvoices.nextRunOn));
  return rows
    .filter((r) => !r.endsOn || (r.nextRunOn && r.nextRunOn <= r.endsOn))
    .reduce((t, r) => t + invoiceTotals((r.lines as LineItem[]) ?? []).grossPence, 0);
}

/** Everything behind the "safe to pay yourself" figure. */
export async function getSafeToPay(companyId: string, today: string = todayIsoDate()) {
  const db = getDb();
  const [company] = await db
    .select({
      vatRegistered: companies.vatRegistered,
      vatQuarterEndMonth: companies.vatQuarterEndMonth,
      bufferMonths: companies.safeToPayBufferMonths,
    })
    .from(companies)
    .where(eq(companies.id, companyId))
    .limit(1);
  if (!company) throw new Error("Company not found");
  const until = addDays(today, LOOKAHEAD_DAYS);

  const [cash, vat, reserves, reimbursements, monthlySpend, invoicesDue, milestones, recurring, register] =
    await Promise.all([
      getCashAtBank(companyId),
      company.vatRegistered
        ? getVatOwed(companyId, company.vatQuarterEndMonth, today)
        : Promise.resolve({ pence: 0, parts: [] }),
      getReservesPosition(companyId, today),
      getReimbursementBalances(companyId),
      averageMonthlySpendPence(companyId, today),
      invoicesDueSoonPence(companyId, today, until),
      listMilestonesReadyToBill(companyId, today, LOOKAHEAD_DAYS),
      recurringDueSoonPence(companyId, today, until),
      getActiveShareholdersForSplit(companyId),
    ]);

  // This year's tax so far, plus last year's until it falls due.
  const lastYear = reserves.years.length > 1 ? reserves.years[reserves.years.length - 2]! : null;
  const lastYearTaxDue = lastYear ? ctPaymentDueDate(lastYear.end) : null;
  const taxParts = [
    { label: "This year so far", pence: reserves.currentYear.tax.taxPence },
    ...(lastYear && lastYearTaxDue && today <= lastYearTaxDue && lastYear.tax.taxPence > 0
      ? [{ label: `Last year, due ${formatIsoDateUk(lastYearTaxDue)}`, pence: lastYear.tax.taxPence }]
      : []),
  ];
  const milestonesPence = milestones.reduce((t, m) => t + m.amountPence, 0);
  const expectedParts = [
    { label: "Invoices falling due", pence: invoicesDue },
    { label: "Milestones to bill", pence: milestonesPence },
    { label: "Recurring invoices", pence: recurring },
  ];

  const result = computeSafeToPay({
    cashPence: cash.known ? cash.cashPence : 0,
    vatOwedPence: vat.pence,
    corporationTaxPence: taxParts.reduce((t, p) => t + p.pence, 0),
    billsDuePence: reimbursements.reduce((t, r) => t + r.totalPence, 0),
    bufferPence: monthlySpend * company.bufferMonths,
    reservesPence: reserves.availablePence,
    expectedInPence: expectedParts.reduce((t, p) => t + p.pence, 0),
  });

  let split: Array<{ id: string; name: string; amountPence: number }> = [];
  if (register.balanced && register.totalShares && result.safeNowPence > 0) {
    split = splitDividendPence(result.safeNowPence, register.shareholders, register.totalShares);
  }

  return {
    today,
    until,
    cash,
    result,
    vatParts: vat.parts,
    vatRegistered: company.vatRegistered,
    vatQuarterEndMonth: company.vatQuarterEndMonth,
    taxParts,
    expectedParts,
    monthlySpendPence: monthlySpend,
    bufferMonths: company.bufferMonths,
    hasOpeningBalances: reserves.hasOpeningBalances,
    split,
  };
}
