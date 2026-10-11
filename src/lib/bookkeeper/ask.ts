import "server-only";
import { generateText, isStepCount, tool } from "ai";
import { z } from "zod";
import { and, desc, eq, gte, ilike, lte, ne, or, sql, sum } from "drizzle-orm";
import { getDb } from "@/db";
import { auditLog, bankAccounts, bankTransactions, companies, expenses } from "@/db/schema";
import { ASSISTANT_MODEL } from "@/lib/ai/models";
import { getTopClientsByRevenue } from "@/lib/dashboard/queries";
import { financialYearEndDate, financialYearStartDate, formatIsoDateUk, todayIsoDate } from "@/lib/dates";
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
import { getSafeToPay } from "@/lib/safe-to-pay/queries";
import { getTopSpending } from "@/lib/spending/queries";

/** Questions a company can ask per day. */
export const DAILY_QUESTION_LIMIT = 40;
export const QUESTION_MAX_LENGTH = 500;

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe("YYYY-MM-DD");
const period = z.object({ from: isoDate, to: isoDate });

function periodLabel(from: string, to: string): string {
  return `${formatIsoDateUk(from)} to ${formatIsoDateUk(to)}`;
}

/** Questions asked today (London calendar day), from the audit log. */
export async function questionsAskedToday(companyId: string): Promise<number> {
  const [row] = await getDb()
    .select({ n: sql<number>`count(*)`.mapWith(Number) })
    .from(auditLog)
    .where(
      and(
        eq(auditLog.companyId, companyId),
        eq(auditLog.action, "ai.ask"),
        sql`(${auditLog.createdAt} at time zone 'Europe/London')::date = ${todayIsoDate()}`,
      ),
    );
  return row?.n ?? 0;
}

/**
 * Read-only tools over the report queries, bound to one company. Each records
 * what it looked at, so the answer can say what it's based on.
 */
function buildTools(companyId: string, isLtd: boolean, sources: string[]) {
  const tools = {
    profit_and_loss: tool({
      description: "Income, expenses and profit (accrual basis, net of VAT) for a period.",
      inputSchema: period,
      execute: async ({ from, to }) => {
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
    expenses_by_category: tool({
      description: "Recorded expenses grouped by expense category for a period.",
      inputSchema: period,
      execute: async ({ from, to }) => {
        sources.push(`Expenses by category, ${periodLabel(from, to)}`);
        return getExpenseByCategory(companyId, from, to);
      },
    }),
    bank_spending: tool({
      description:
        "Money out of the bank for a period, grouped by bank spending category or by merchant (payee).",
      inputSchema: period.extend({ groupBy: z.enum(["category", "merchant"]) }),
      execute: async ({ from, to, groupBy }) => {
        sources.push(`Bank spending by ${groupBy}, ${periodLabel(from, to)}`);
        const rows = await getTopSpending(companyId, { from, to, groupBy, limit: 25 });
        return rows.map((r) => ({ label: r.label, total: r.totalFormatted, share: `${r.sharePercent}%` }));
      },
    }),
    search_expenses: tool({
      description:
        "Find recorded expenses in a period whose description or category contains some text, with the total.",
      inputSchema: period.extend({ text: z.string().min(2).max(80) }),
      execute: async ({ from, to, text }) => {
        sources.push(`Expenses matching "${text}", ${periodLabel(from, to)}`);
        const where = and(
          eq(expenses.companyId, companyId),
          ne(expenses.status, "pending"),
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
    search_bank_payments: tool({
      description:
        "Find bank transactions in a period whose payee or reference contains some text. Returns money out and money in separately.",
      inputSchema: period.extend({ text: z.string().min(2).max(80) }),
      execute: async ({ from, to, text }) => {
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
    income_by_month: tool({
      description: "Invoiced income (net of VAT) by month for a period.",
      inputSchema: period,
      execute: async ({ from, to }) => {
        sources.push(`Income by month, ${periodLabel(from, to)}`);
        return getIncomeByMonth(companyId, from, to);
      },
    }),
    top_clients: tool({
      description: "Clients ranked by invoiced revenue for a period.",
      inputSchema: period,
      execute: async ({ from, to }) => {
        sources.push(`Top clients, ${periodLabel(from, to)}`);
        return getTopClientsByRevenue(companyId, from, to, 10);
      },
    }),
    vat_summary: tool({
      description: "VAT on sales, VAT on purchases and net VAT for a period.",
      inputSchema: period,
      execute: async ({ from, to }) => {
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
    client_profitability: tool({
      description:
        "Margin per client for a period: invoiced revenue less credit notes, against expenses tagged to the client.",
      inputSchema: period,
      execute: async ({ from, to }) => {
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
    order_profitability: tool({
      description:
        "Margin per order (project) to date and projected once fully invoiced, with costs tagged to each order.",
      inputSchema: z.object({}),
      execute: async () => {
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
    money_owed_by_clients: tool({
      description: "Unpaid invoices today, by how overdue they are.",
      inputSchema: z.object({}),
      execute: async () => {
        sources.push("Aged receivables today");
        return getAgedReceivables(companyId);
      },
    }),
  };
  if (!isLtd) return tools;
  return {
    ...tools,
    reserves_and_corporation_tax: tool({
      description:
        "Retained earnings by year, profit available to distribute as dividends, and the corporation tax estimate.",
      inputSchema: z.object({}),
      execute: async () => {
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
    safe_to_pay_yourself: tool({
      description: "How much the company could safely pay out in dividends today, and the workings.",
      inputSchema: z.object({}),
      execute: async () => {
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
    directors_loans: tool({
      description: "Each director's loan account balance (positive: company owes them).",
      inputSchema: z.object({}),
      execute: async () => {
        sources.push("Director's loans");
        const d = await getDirectorLoanAccounts(companyId);
        return d.directors.map((x) => ({
          director: x.name,
          balance: formatGBP(x.balancePence),
          warnings: x.warnings.map((w) => w.kind),
        }));
      },
    }),
  };
}

export type AnswerResult =
  | { ok: true; answer: string; sources: string[] }
  | { ok: false; error: string };

/**
 * Answer a plain-English question from the company's own figures. The model
 * can only read through the tools above; it can't change anything.
 */
export async function answerQuestion(companyId: string, question: string): Promise<AnswerResult> {
  const [company] = await getDb()
    .select({
      name: companies.name,
      entityType: companies.entityType,
      fyEndMonth: companies.financialYearEndMonth,
      vatRegistered: companies.vatRegistered,
    })
    .from(companies)
    .where(eq(companies.id, companyId))
    .limit(1);
  if (!company) return { ok: false, error: "Company not found" };

  const today = todayIsoDate();
  const isLtd = company.entityType === "limited_company";
  const sources: string[] = [];
  const { text } = await generateText({
    model: ASSISTANT_MODEL,
    tools: buildTools(companyId, isLtd, sources),
    stopWhen: isStepCount(6),
    instructions: `You are the bookkeeping assistant in Alfa, an accounting app for UK small businesses.
Answer questions about ${company.name}'s own figures, using only the tools. Never make up or estimate a number the tools didn't return.
Today is ${today}. The current financial year runs ${financialYearStartDate(company.fyEndMonth, today)} to ${financialYearEndDate(company.fyEndMonth, today)}.
The company is ${isLtd ? "a limited company" : "a sole trader"}${company.vatRegistered ? " and VAT registered" : ""}.
Calendar quarters: Q1 is January to March, and so on, unless the user says financial quarter. Say which dates you used.
Write in plain UK English, 1 to 4 short sentences, with the figure first. Use £ amounts as the tools give them.
If the data can't answer the question, say so and suggest where in the app to look. Don't give tax or legal advice beyond the figures.`,
    prompt: question,
  });

  const answer = text.trim();
  if (!answer) return { ok: false, error: "No answer came back. Try rephrasing the question." };
  return { ok: true, answer, sources: [...new Set(sources)] };
}

