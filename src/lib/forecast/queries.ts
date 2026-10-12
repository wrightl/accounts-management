import "server-only";
import { and, eq, gt, gte, inArray, isNotNull, lte, ne, sum } from "drizzle-orm";
import { getDb } from "@/db";
import {
  bankAccounts,
  bankTransactions,
  clients,
  companies,
  dividendDeclarations,
  expenses,
  invoices,
  payments,
  recurringInvoices,
} from "@/db/schema";
import { listMilestonesReadyToBill } from "@/lib/close/checklist";
import { clientDisplayNameSql } from "@/lib/clients/sql";
import { creditAdjustmentsByInvoice } from "@/lib/credit-notes/adjustments";
import { todayIsoDate } from "@/lib/dates";
import {
  FORECAST_WEEKS,
  shiftDays,
  weekStart,
  type ForecastEvent,
} from "@/lib/forecast/engine";
import { invoiceAmountDuePence } from "@/lib/invoices/balance";
import { addDays, addMonths, ctPaymentDueDate, daysInclusive } from "@/lib/ledger/corporation-tax";
import { getReservesPosition } from "@/lib/ledger/queries";
import { invoiceTotals, type LineItem } from "@/lib/money";
import { getReimbursementBalances } from "@/lib/reimbursements/queries";
import { getVatSummary } from "@/lib/reports/queries";
import { vatDueDate, vatQuarterFor } from "@/lib/safe-to-pay/calc";
import { getCashAtBank } from "@/lib/safe-to-pay/queries";

/** Unpaid invoices, paid on their due date (overdue ones flagged). */
async function invoiceEvents(companyId: string, today: string): Promise<ForecastEvent[]> {
  const db = getDb();
  const open = await db
    .select({
      id: invoices.id,
      number: invoices.number,
      clientId: invoices.clientId,
      clientName: clientDisplayNameSql.as("client_name"),
      dueDate: invoices.dueDate,
      grossPence: invoices.grossPence,
    })
    .from(invoices)
    .innerJoin(clients, eq(invoices.clientId, clients.id))
    .where(and(eq(invoices.companyId, companyId), eq(invoices.status, "sent")));
  if (open.length === 0) return [];
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
  return open.flatMap((inv) => {
    const balance = invoiceAmountDuePence({
      grossPence: inv.grossPence,
      paidPence: paid.get(inv.id) ?? 0,
      ...credits.get(inv.id),
    });
    if (balance <= 0) return [];
    const date = inv.dueDate ?? today;
    return [
      {
        date,
        amountPence: balance,
        kind: "invoice" as const,
        label: `${inv.number} · ${inv.clientName}`,
        clientId: inv.clientId,
        overdue: date < today,
      },
    ];
  });
}

/** Each run of every live recurring invoice in the window, paid after the usual terms. */
async function recurringEvents(
  companyId: string,
  until: string,
  termsDays: number,
): Promise<ForecastEvent[]> {
  const rows = await getDb()
    .select({
      name: recurringInvoices.name,
      clientId: recurringInvoices.clientId,
      lines: recurringInvoices.lineTemplate,
      nextRunOn: recurringInvoices.nextRunOn,
      endsOn: recurringInvoices.endsOn,
      maxOccurrences: recurringInvoices.maxOccurrences,
      occurrenceCount: recurringInvoices.occurrenceCount,
    })
    .from(recurringInvoices)
    .where(
      and(
        eq(recurringInvoices.companyId, companyId),
        eq(recurringInvoices.enabled, true),
        isNotNull(recurringInvoices.nextRunOn),
      ),
    );
  return rows.flatMap((r) => {
    const gross = invoiceTotals((r.lines as LineItem[]) ?? []).grossPence;
    if (gross <= 0) return [];
    const remaining =
      r.maxOccurrences != null ? Math.max(0, r.maxOccurrences - r.occurrenceCount) : Infinity;
    const events: ForecastEvent[] = [];
    for (let run = r.nextRunOn!, n = 0; n < remaining; n++, run = addMonths(run, 1)) {
      if (r.endsOn && run > r.endsOn) break;
      const paidOn = addDays(run, termsDays);
      if (paidOn > until) break;
      events.push({
        date: paidOn,
        amountPence: gross,
        kind: "recurring",
        label: r.name,
        clientId: r.clientId,
      });
    }
    return events;
  });
}

/**
 * VAT payments falling in the window: last quarter's when not yet due, and
 * this quarter's projected from the VAT so far.
 */
async function vatEvents(
  companyId: string,
  firstQuarterEndMonth: number,
  today: string,
  until: string,
): Promise<ForecastEvent[]> {
  const current = vatQuarterFor(today, firstQuarterEndMonth);
  const previous = vatQuarterFor(addDays(current.start, -1), firstQuarterEndMonth);
  const events: ForecastEvent[] = [];
  const previousDue = vatDueDate(previous.end);
  if (previousDue >= today) {
    const vat = await getVatSummary(companyId, previous.start, previous.end);
    if (vat.netVatPence > 0) {
      events.push({ date: previousDue, amountPence: -vat.netVatPence, kind: "vat", label: "VAT return" });
    }
  }
  const currentDue = vatDueDate(current.end);
  if (currentDue <= until) {
    const vat = await getVatSummary(companyId, current.start, today);
    const projected = Math.round(
      (vat.netVatPence * daysInclusive(current.start, current.end)) /
        daysInclusive(current.start, today),
    );
    if (projected > 0) {
      events.push({
        date: currentDue,
        amountPence: -projected,
        kind: "vat",
        label: "VAT return (projected from this quarter so far)",
      });
    }
  }
  return events;
}

/**
 * Regular weekly spending: recorded expenses over the last 12 weeks. Without
 * expenses, money out of the bank over the same weeks.
 */
async function weeklySpend(companyId: string, today: string) {
  const db = getDb();
  const from = addDays(today, -84);
  const [exp] = await db
    .select({ total: sum(expenses.amountPence).mapWith(Number) })
    .from(expenses)
    .where(
      and(
        eq(expenses.companyId, companyId),
        ne(expenses.status, "pending"),
        gt(expenses.spentAt, from),
        lte(expenses.spentAt, today),
      ),
    );
  if (exp?.total) return { pence: Math.round(exp.total / 12), basis: "expenses" as const };
  const [bank] = await db
    .select({ total: sum(bankTransactions.amountPence).mapWith(Number) })
    .from(bankTransactions)
    .innerJoin(bankAccounts, eq(bankTransactions.bankAccountId, bankAccounts.id))
    .where(
      and(
        eq(bankAccounts.companyId, companyId),
        lte(bankTransactions.amountPence, 0),
        gt(bankTransactions.bookedAt, from),
        lte(bankTransactions.bookedAt, today),
      ),
    );
  if (bank?.total) return { pence: Math.round(-bank.total / 12), basis: "bank" as const };
  return { pence: 0, basis: "none" as const };
}

/** Everything the forecast needs, gathered once on the server. */
export async function getForecastInputs(companyId: string, today: string = todayIsoDate()) {
  const db = getDb();
  const [company] = await db
    .select({
      entityType: companies.entityType,
      vatRegistered: companies.vatRegistered,
      vatQuarterEndMonth: companies.vatQuarterEndMonth,
      termsDays: companies.invoicePaymentTermsDays,
    })
    .from(companies)
    .where(eq(companies.id, companyId))
    .limit(1);
  if (!company) throw new Error("Company not found");

  const firstWeekStart = weekStart(today);
  const until = shiftDays(firstWeekStart, FORECAST_WEEKS * 7 - 1);
  const isLtd = company.entityType === "limited_company";

  const [cash, invoiceIn, milestones, recurring, vat, reimbursements, spend, reserves, dividends] =
    await Promise.all([
      getCashAtBank(companyId),
      invoiceEvents(companyId, today),
      listMilestonesReadyToBill(companyId, today, FORECAST_WEEKS * 7),
      recurringEvents(companyId, until, company.termsDays),
      company.vatRegistered
        ? vatEvents(companyId, company.vatQuarterEndMonth, today, until)
        : Promise.resolve([]),
      getReimbursementBalances(companyId),
      weeklySpend(companyId, today),
      isLtd ? getReservesPosition(companyId, today) : Promise.resolve(null),
      isLtd
        ? db
            .select({ date: dividendDeclarations.declaredAt, total: dividendDeclarations.totalPence })
            .from(dividendDeclarations)
            .where(
              and(
                eq(dividendDeclarations.companyId, companyId),
                gte(dividendDeclarations.declaredAt, today),
                lte(dividendDeclarations.declaredAt, until),
              ),
            )
        : Promise.resolve([]),
    ]);

  const events: ForecastEvent[] = [...invoiceIn, ...recurring, ...vat];
  for (const m of milestones) {
    // Billed on its due date (or now if late), paid after the usual terms.
    const billed = m.dueDate < today ? today : m.dueDate;
    events.push({
      date: addDays(billed, company.termsDays),
      amountPence: m.amountPence,
      kind: "milestone",
      label: `${m.orderNumber} · ${m.label}`,
      clientId: m.clientId,
    });
  }
  const owed = reimbursements.reduce((t, r) => t + r.totalPence, 0);
  if (owed > 0) {
    events.push({ date: today, amountPence: -owed, kind: "reimbursements", label: "Reimbursements owed" });
  }
  for (const d of dividends) {
    events.push({ date: d.date, amountPence: -d.total, kind: "dividend", label: "Dividend declared" });
  }
  if (reserves && reserves.years.length > 1) {
    const lastYear = reserves.years[reserves.years.length - 2]!;
    const due = ctPaymentDueDate(lastYear.end);
    if (due >= today && due <= until && lastYear.tax.taxPence > 0) {
      events.push({
        date: due,
        amountPence: -lastYear.tax.taxPence,
        kind: "corporation_tax",
        label: "Corporation tax (estimate)",
      });
    }
  }

  const clientIds = new Set(events.flatMap((e) => (e.clientId && e.amountPence > 0 ? [e.clientId] : [])));
  const clientRows = clientIds.size
    ? await db
        .select({ id: clients.id, name: clientDisplayNameSql.as("client_name") })
        .from(clients)
        .where(inArray(clients.id, [...clientIds]))
    : [];

  return {
    today,
    firstWeekStart,
    until,
    cash,
    events: events.filter((e) => e.date <= until),
    weeklySpendPence: spend.pence,
    spendBasis: spend.basis,
    clients: clientRows.sort((a, b) => a.name.localeCompare(b.name)),
  };
}

export type ForecastInputs = Awaited<ReturnType<typeof getForecastInputs>>;
