import "server-only";
import { z } from "zod";
import { and, desc, eq, gte, ilike, lte, or, sql, sum } from "drizzle-orm";
import { getDb } from "@/db";
import { bankAccounts, bankTransactions, companies, expenses } from "@/db/schema";
import { expenseInPack } from "@/lib/accountant/record-scope";
import { listClients } from "@/lib/clients/queries";
import { getTopClientsByRevenue } from "@/lib/dashboard/queries";
import { financialYearEndDate, financialYearStartDate, todayIsoDate } from "@/lib/dates";
import { getDeadlines } from "@/lib/deadlines/queries";
import { buildForecast } from "@/lib/forecast/engine";
import { getForecastInputs } from "@/lib/forecast/queries";
import { getInvoiceDetail, listInvoices } from "@/lib/invoices/queries";
import { getDirectorLoanAccounts, getReservesPosition } from "@/lib/ledger/queries";
import { formatGBP } from "@/lib/money";
import {
  getAgedReceivables,
  getExpenseByCategory,
  getIncomeByMonth,
  getProfitAndLoss,
  getVatSummary,
} from "@/lib/reports/queries";
import { listClientProfitability, listOrderProfitability } from "@/lib/profitability/queries";
import { listQueries } from "@/lib/queries/queries";
import { QUERY_STATUSES } from "@/lib/queries/status";
import { getSafeToPay } from "@/lib/safe-to-pay/queries";
import { getTopSpending } from "@/lib/spending/queries";
import { can, type Role } from "@/lib/roles";
import { defineTool, isoDate, period, periodLabel, type AssistantTool } from "./define";

/**
 * Every assistant tool, in the order the model sees them. Each one is tagged
 * with the permission of the screen that shows the same figures, so an
 * assistant never reads more than the person could open in the app.
 */
export const ASSISTANT_TOOLS: readonly AssistantTool[] = [
  defineTool({
    name: "profit_and_loss",
    description: "Income, expenses and profit (accrual basis, net of VAT) for a period.",
    permission: "filing:read",
    href: "/reports",
    inputSchema: period,
    execute: async ({ companyId, sources }, { from, to }) => {
      sources.push(`Profit and loss, ${periodLabel(from, to)}`);
      const p = await getProfitAndLoss(companyId, from, to);
      return {
        invoicedIncome: p.incomeFormatted,
        creditNotes: p.creditNoteFormatted,
        otherIncome: p.otherIncomeFormatted,
        expenses: p.expenseFormatted,
        profit: p.profitFormatted,
        basis: p.basisNote,
      };
    },
  }),
  defineTool({
    name: "expenses_by_category",
    description: "Recorded expenses grouped by expense category for a period.",
    permission: "filing:read",
    href: "/reports",
    inputSchema: period,
    execute: async ({ companyId, sources }, { from, to }) => {
      sources.push(`Expenses by category, ${periodLabel(from, to)}`);
      return getExpenseByCategory(companyId, from, to);
    },
  }),
  defineTool({
    name: "bank_spending",
    description:
      "Money out of the bank for a period, grouped by bank spending category or by merchant (payee).",
    permission: "accounts:read",
    href: "/spending",
    inputSchema: period.extend({ groupBy: z.enum(["category", "merchant"]) }),
    execute: async ({ companyId, sources }, { from, to, groupBy }) => {
      sources.push(`Bank spending by ${groupBy}, ${periodLabel(from, to)}`);
      const rows = await getTopSpending(companyId, { from, to, groupBy, limit: 25 });
      return rows.map((r) => ({ label: r.label, total: r.totalFormatted, share: `${r.sharePercent}%` }));
    },
  }),
  defineTool({
    name: "search_expenses",
    description:
      "Find recorded expenses in a period whose description or category contains some text, with the total.",
    permission: "records:read",
    href: "/expenses",
    inputSchema: period.extend({ text: z.string().min(2).max(80) }),
    execute: async ({ companyId, sources }, { from, to, text }) => {
      sources.push(`Expenses matching "${text}", ${periodLabel(from, to)}`);
      const where = and(
        eq(expenses.companyId, companyId),
        expenseInPack,
        gte(expenses.spentAt, from),
        lte(expenses.spentAt, to),
        or(ilike(expenses.description, `%${text}%`), ilike(expenses.category, `%${text}%`)),
      );
      const db = getDb();
      const [total] = await db
        .select({ gross: sum(expenses.amountPence).mapWith(Number), count: sql<number>`count(*)`.mapWith(Number) })
        .from(expenses)
        .where(where);
      const rows = await db
        .select({
          date: expenses.spentAt,
          description: expenses.description,
          category: expenses.category,
          amountPence: expenses.amountPence,
        })
        .from(expenses)
        .where(where)
        .orderBy(desc(expenses.amountPence))
        .limit(20);
      return {
        count: total?.count ?? 0,
        totalIncludingVat: formatGBP(total?.gross ?? 0),
        largest: rows.map((r) => ({
          date: r.date,
          description: r.description,
          category: r.category,
          amount: formatGBP(r.amountPence),
        })),
      };
    },
  }),
  defineTool({
    name: "search_bank_payments",
    description:
      "Find bank transactions in a period whose payee or reference contains some text. Returns money out and money in separately.",
    permission: "records:read",
    href: "/transactions",
    inputSchema: period.extend({ text: z.string().min(2).max(80) }),
    execute: async ({ companyId, sources }, { from, to, text }) => {
      sources.push(`Bank transactions matching "${text}", ${periodLabel(from, to)}`);
      const [row] = await getDb()
        .select({
          out: sql<number>`coalesce(sum(case when ${bankTransactions.amountPence} < 0 then -${bankTransactions.amountPence} else 0 end), 0)`.mapWith(Number),
          in: sql<number>`coalesce(sum(case when ${bankTransactions.amountPence} > 0 then ${bankTransactions.amountPence} else 0 end), 0)`.mapWith(Number),
          count: sql<number>`count(*)`.mapWith(Number),
        })
        .from(bankTransactions)
        .innerJoin(bankAccounts, eq(bankTransactions.bankAccountId, bankAccounts.id))
        .where(
          and(
            eq(bankAccounts.companyId, companyId),
            gte(bankTransactions.bookedAt, from),
            lte(bankTransactions.bookedAt, to),
            or(
              ilike(bankTransactions.counterparty, `%${text}%`),
              ilike(bankTransactions.reference, `%${text}%`),
              ilike(bankTransactions.description, `%${text}%`),
            ),
          ),
        );
      return {
        count: row?.count ?? 0,
        moneyOut: formatGBP(row?.out ?? 0),
        moneyIn: formatGBP(row?.in ?? 0),
      };
    },
  }),
  defineTool({
    name: "income_by_month",
    description: "Invoiced income (net of VAT) by month for a period.",
    permission: "filing:read",
    href: "/reports",
    inputSchema: period,
    execute: async ({ companyId, sources }, { from, to }) => {
      sources.push(`Income by month, ${periodLabel(from, to)}`);
      return getIncomeByMonth(companyId, from, to);
    },
  }),
  defineTool({
    name: "top_clients",
    description: "Clients ranked by invoiced revenue for a period.",
    permission: "reports:read",
    href: "/dashboard",
    inputSchema: period,
    execute: async ({ companyId, sources }, { from, to }) => {
      sources.push(`Top clients, ${periodLabel(from, to)}`);
      return getTopClientsByRevenue(companyId, from, to, 10);
    },
  }),
  defineTool({
    name: "vat_summary",
    description: "VAT on sales, VAT on purchases and net VAT for a period.",
    permission: "filing:read",
    href: "/reports",
    inputSchema: period,
    execute: async ({ companyId, sources }, { from, to }) => {
      sources.push(`VAT summary, ${periodLabel(from, to)}`);
      const v = await getVatSummary(companyId, from, to);
      return {
        vatOnSales: v.vatOnSalesFormatted,
        vatOnPurchases: v.vatOnPurchasesFormatted,
        netVat: v.netVatFormatted,
        vatRegistered: v.vatRegistered,
      };
    },
  }),
  defineTool({
    name: "client_profitability",
    description:
      "Margin per client for a period: invoiced revenue less credit notes, against expenses tagged to the client.",
    permission: "reports:read",
    href: "/profitability",
    inputSchema: period,
    execute: async ({ companyId, sources }, { from, to }) => {
      sources.push(`Profitability by client, ${periodLabel(from, to)}`);
      const rows = await listClientProfitability(companyId, { from, to });
      return rows.slice(0, 25).map((c) => ({
        client: c.clientName,
        revenue: formatGBP(c.revenuePence),
        costs: formatGBP(c.costPence),
        margin: formatGBP(c.marginPence),
        marginPercent: c.marginPercent,
        rebillableNotInvoiced: formatGBP(c.unbilledRebillablePence),
      }));
    },
  }),
  defineTool({
    name: "order_profitability",
    description:
      "Margin per order (project) to date and projected once fully invoiced, with costs tagged to each order.",
    permission: "reports:read",
    href: "/profitability",
    inputSchema: z.object({}),
    execute: async ({ companyId, sources }) => {
      sources.push("Profitability by order");
      const rows = await listOrderProfitability(companyId);
      return rows.slice(0, 30).map((o) => ({
        order: o.number,
        client: o.clientName,
        status: o.status,
        quoted: formatGBP(o.quotedPence),
        revenueSoFar: formatGBP(o.current.revenuePence),
        costs: formatGBP(o.current.costPence),
        margin: formatGBP(o.current.marginPence),
        marginPercent: o.current.marginPercent,
        projectedMargin: formatGBP(o.projected.marginPence),
      }));
    },
  }),
  defineTool({
    name: "money_owed_by_clients",
    description: "Unpaid invoices today, by how overdue they are.",
    permission: "filing:read",
    href: "/reports",
    inputSchema: z.object({}),
    execute: async ({ companyId, sources }) => {
      sources.push("Aged receivables today");
      return getAgedReceivables(companyId);
    },
  }),
  defineTool({
    name: "reserves_and_corporation_tax",
    description:
      "Retained earnings by year, profit available to distribute as dividends, and the corporation tax estimate.",
    permission: "filing:read",
    href: "/reserves",
    ltdOnly: true,
    inputSchema: z.object({}),
    execute: async ({ companyId, sources }) => {
      sources.push("Tax & reserves");
      const r = await getReservesPosition(companyId);
      return {
        availableToDistribute: formatGBP(r.availablePence),
        years: r.years.map((y) => ({
          yearEnd: y.end,
          soFar: y.current,
          profit: formatGBP(y.profitPence),
          corporationTax: formatGBP(y.tax.taxPence),
          dividends: formatGBP(y.dividendsPence),
          closingReserves: formatGBP(y.closingReservesPence),
        })),
      };
    },
  }),
  defineTool({
    name: "safe_to_pay_yourself",
    description: "How much the company could safely pay out in dividends today, and the workings.",
    permission: "reports:read",
    href: "/safe-to-pay",
    ltdOnly: true,
    inputSchema: z.object({}),
    execute: async ({ companyId, sources }) => {
      sources.push("Safe to pay yourself");
      const s = await getSafeToPay(companyId);
      return {
        safeToPayToday: formatGBP(s.result.safeNowPence),
        inThirtyDays: formatGBP(s.result.safeLaterPence),
        limitedBy: s.result.limitedBy,
        cashAtBank: s.cash.known ? formatGBP(s.cash.cashPence) : "unknown",
        vatOwed: formatGBP(s.result.vatOwedPence),
        corporationTax: formatGBP(s.result.corporationTaxPence),
      };
    },
  }),
  defineTool({
    name: "directors_loans",
    description: "Each director's loan account balance (positive: company owes them).",
    permission: "filing:read",
    href: "/directors-loans",
    ltdOnly: true,
    inputSchema: z.object({}),
    execute: async ({ companyId, sources }) => {
      sources.push("Director's loans");
      const d = await getDirectorLoanAccounts(companyId);
      return d.directors.map((x) => ({
        director: x.name,
        balance: formatGBP(x.balancePence),
        warnings: x.warnings.map((w) => w.kind),
      }));
    },
  }),
  defineTool({
    name: "company_overview",
    description:
      "The company's name, whether it's a limited company or sole trader, VAT registration, the current financial year and the date the books are locked up to.",
    permission: "workspace:read",
    href: "/settings",
    inputSchema: z.object({}),
    execute: async ({ companyId, sources }) => {
      sources.push("Company details");
      const [c] = await getDb()
        .select({
          name: companies.name,
          entityType: companies.entityType,
          vatRegistered: companies.vatRegistered,
          fyEndMonth: companies.financialYearEndMonth,
          booksLockedThrough: companies.booksLockedThrough,
        })
        .from(companies)
        .where(eq(companies.id, companyId))
        .limit(1);
      if (!c) return { error: "Company not found" };
      const today = todayIsoDate();
      return {
        name: c.name,
        kind: c.entityType === "limited_company" ? "Limited company" : "Sole trader",
        vatRegistered: c.vatRegistered,
        financialYear: {
          from: financialYearStartDate(c.fyEndMonth, today),
          to: financialYearEndDate(c.fyEndMonth, today),
        },
        booksLockedThrough: c.booksLockedThrough,
        today,
      };
    },
  }),
  defineTool({
    name: "search_invoices",
    description:
      "Find invoices by client name or invoice number, status and issue date. Returns up to 25, newest first, with the total of all matches.",
    permission: "records:read",
    href: "/invoices",
    inputSchema: z.object({
      text: z.string().min(1).max(80).optional().describe("Part of a client name or invoice number"),
      status: z.enum(["draft", "sent", "overdue", "paid", "void"]).optional(),
      from: isoDate.optional().describe("Issued on or after"),
      to: isoDate.optional().describe("Issued on or before"),
    }),
    execute: async ({ companyId, recordScope, sources }, { text, status, from, to }) => {
      sources.push("Invoices");
      const needle = text?.toLowerCase();
      const matches = (await listInvoices(companyId, recordScope))
        .filter(
          (i) =>
            (!needle ||
              i.number.toLowerCase().includes(needle) ||
              i.clientName.toLowerCase().includes(needle)) &&
            (!status || i.status === status) &&
            (!from || (i.issueDate != null && i.issueDate >= from)) &&
            (!to || (i.issueDate != null && i.issueDate <= to)),
        )
        // Drafts have no issue date yet; they're the newest.
        .sort((a, b) => (b.issueDate ?? "9999").localeCompare(a.issueDate ?? "9999"));
      return {
        count: matches.length,
        totalIncludingVat: formatGBP(matches.reduce((t, i) => t + i.grossPence, 0)),
        invoices: matches.slice(0, 25).map((i) => ({
          number: i.number,
          client: i.clientName,
          status: i.status,
          issued: i.issueDate,
          due: i.dueDate,
          total: i.grossFormatted,
          paidOn: i.paidAt ? i.paidAt.toISOString().slice(0, 10) : null,
        })),
      };
    },
  }),
  defineTool({
    name: "get_invoice",
    description: "One invoice in full by its number: lines, payments, credit notes and what's still owed.",
    permission: "records:read",
    href: "/invoices",
    inputSchema: z.object({ number: z.string().min(1).max(40) }),
    execute: async ({ companyId, recordScope, sources }, { number }) => {
      const wanted = number.trim().toLowerCase();
      const match = (await listInvoices(companyId, recordScope)).find(
        (i) => i.number.toLowerCase() === wanted,
      );
      const detail = match ? await getInvoiceDetail(companyId, match.id, recordScope) : null;
      if (!detail) return { error: `No invoice numbered ${number}.` };
      sources.push(`Invoice ${detail.invoice.number}`);
      return {
        number: detail.invoice.number,
        client: detail.client.companyName || detail.client.name,
        status: detail.invoice.status,
        issued: detail.invoice.issueDate,
        due: detail.invoice.dueDate,
        net: detail.invoice.netFormatted,
        total: detail.invoice.grossFormatted,
        lines: detail.lines.map((l) => ({
          description: l.description,
          quantity: l.quantity,
          unitPrice: formatGBP(l.unitPricePence),
          vatRate: `${l.vatRate}%`,
          discount: l.discountPercent ? `${l.discountPercent}%` : null,
        })),
        payments: detail.payments.map((p) => ({
          date: p.receivedAt.toISOString().slice(0, 10),
          amount: p.amountFormatted,
          method: p.method,
        })),
        creditNotes: detail.creditNotes.map((c) => ({
          number: c.number,
          status: c.status,
          amount: c.grossFormatted,
        })),
        paid: detail.paidFormatted,
        credited: detail.creditedFormatted,
        stillOwed: detail.balanceFormatted,
        openInAlfa: `/invoices/${detail.invoice.id}`,
      };
    },
  }),
  defineTool({
    name: "list_clients",
    description: "The company's clients, with contact email.",
    permission: "accounts:read",
    href: "/clients",
    inputSchema: z.object({}),
    execute: async ({ companyId, sources }) => {
      sources.push("Clients");
      const rows = await listClients(companyId);
      return {
        count: rows.length,
        clients: rows.slice(0, 100).map((c) => ({
          name: c.companyName || c.name,
          contact: c.companyName ? c.name : null,
          email: c.email,
        })),
      };
    },
  }),
  defineTool({
    name: "upcoming_deadlines",
    description:
      "Filing and payment deadlines (VAT returns, accounts, corporation tax, confirmation statement, self assessment) that are overdue or due in the next few months, and whether each is done.",
    permission: "filing:read",
    href: "/deadlines",
    inputSchema: z.object({}),
    execute: async ({ companyId, sources }) => {
      sources.push("Deadlines");
      const { deadlines } = await getDeadlines(companyId);
      return deadlines
        .filter((d) => d.status !== "done" || d.daysLeft >= 0)
        .map((d) => ({
          what: d.label,
          period: d.period,
          due: d.dueDate,
          status: d.status,
          daysLeft: d.daysLeft,
          detail: d.detail,
        }));
    },
  }),
  defineTool({
    name: "cash_forecast",
    description:
      "Cash at the end of each of the next 13 weeks, from money owed, known bills and usual spending. Includes the lowest point.",
    permission: "reports:read",
    href: "/forecast",
    inputSchema: z.object({}),
    execute: async ({ companyId, sources }) => {
      sources.push("Cash forecast, next 13 weeks");
      const inputs = await getForecastInputs(companyId);
      const f = buildForecast({
        openingCashPence: inputs.cash.known ? inputs.cash.cashPence : 0,
        firstWeekStart: inputs.firstWeekStart,
        events: inputs.events,
        weeklySpendPence: inputs.weeklySpendPence,
        lowCashPence: 0,
      });
      return {
        startingCash: inputs.cash.known ? formatGBP(inputs.cash.cashPence) : "unknown (starts from £0)",
        usualWeeklySpending: formatGBP(f.weeklySpendPence),
        lowestPoint: { weekStarting: f.lowest.start, balance: formatGBP(f.lowest.closingPence) },
        firstWeekBelowZero: f.firstNegative?.start ?? null,
        weeks: f.weeks.map((w) => ({
          weekStarting: w.start,
          moneyIn: formatGBP(w.inPence),
          moneyOut: formatGBP(w.outPence),
          endBalance: formatGBP(w.closingPence),
          items: w.events.map((e) => `${e.label}: ${formatGBP(e.amountPence)}`),
        })),
      };
    },
  }),
  defineTool({
    name: "accountant_queries",
    description: "Questions the accountant has raised about the books, with their status.",
    permission: "queries:read",
    href: "/queries",
    inputSchema: z.object({ status: z.enum(QUERY_STATUSES).optional() }),
    execute: async ({ companyId, sources }, { status }) => {
      sources.push("Accountant queries");
      const rows = await listQueries(companyId, status);
      return rows.slice(0, 50).map((q) => ({
        subject: q.subject,
        status: q.status,
        about: q.recordLabel,
        raisedBy: q.raisedByName ?? q.raisedByEmail,
        updated: q.updatedAt.toISOString().slice(0, 10),
      }));
    },
  }),
];

/** The tools this role may use for a company of this kind. */
export function assistantToolsFor(params: {
  role: Role | null | undefined;
  isLtd: boolean;
}): AssistantTool[] {
  return ASSISTANT_TOOLS.filter(
    (t) => can(params.role, t.permission) && (params.isLtd || !t.ltdOnly),
  );
}
