import "server-only";
import { and, eq, gte, isNull, lt, ne, or, sql, ilike } from "drizzle-orm";
import { getDb } from "@/db";
import {
  bankAccounts,
  bankTransactions,
  clients,
  expenses,
  invoices,
} from "@/db/schema";
import { todayIsoDate } from "@/lib/dates";
import { addMonths } from "@/lib/ledger/corporation-tax";
import type { MenuFeature } from "./features";

export interface MenuSuggestion {
  /** Stable id, remembered when dismissed. */
  id: string;
  title: string;
  /** Why we are suggesting it, in terms of the person's own data. */
  reason: string;
  features: MenuFeature[];
}

/** Invoiced the same client in this many different months: suggest Recurring. */
const RECURRING_MONTHS = 3;

async function recurringSuggestion(
  companyId: string,
  today: string,
): Promise<MenuSuggestion | null> {
  const since = addMonths(today, -6);
  const months = sql<number>`count(distinct date_trunc('month', ${invoices.issueDate}))::int`;
  const [row] = await getDb()
    .select({ clientName: clients.name, months })
    .from(invoices)
    .innerJoin(clients, eq(clients.id, invoices.clientId))
    .where(
      and(
        eq(invoices.companyId, companyId),
        ne(invoices.status, "draft"),
        ne(invoices.status, "void"),
        isNull(invoices.recurringInvoiceId),
        gte(invoices.issueDate, since),
      ),
    )
    .groupBy(clients.id, clients.name)
    .having(sql`${months} >= ${RECURRING_MONTHS}`)
    .orderBy(sql`${months} desc`)
    .limit(1);
  if (!row) return null;
  return {
    id: "recurring",
    title: "Send repeat invoices automatically",
    reason: `You've invoiced ${row.clientName} in ${row.months} different months recently. Recurring invoices can send these for you.`,
    features: ["recurring"],
  };
}

async function reimbursementsSuggestion(
  companyId: string,
): Promise<MenuSuggestion | null> {
  const [row] = await getDb()
    .select({ count: sql<number>`count(*)::int` })
    .from(expenses)
    .where(and(eq(expenses.companyId, companyId), eq(expenses.status, "reimbursable")));
  const count = row?.count ?? 0;
  if (count === 0) return null;
  return {
    id: "reimbursements",
    title: "Keep track of paying people back",
    reason: `${count} expense${count === 1 ? " was" : "s were"} paid with someone's own money. Reimbursements tracks paying them back.`,
    features: ["reimbursements"],
  };
}

async function dividendsSuggestion(
  companyId: string,
  today: string,
): Promise<MenuSuggestion | null> {
  const since = addMonths(today, -12);
  const looksLikeDividend = or(
    ilike(bankTransactions.reference, "%dividend%"),
    ilike(bankTransactions.description, "%dividend%"),
    ilike(bankTransactions.spendingCategory, "%dividend%"),
  );
  const [row] = await getDb()
    .select({ count: sql<number>`count(*)::int` })
    .from(bankTransactions)
    .innerJoin(bankAccounts, eq(bankAccounts.id, bankTransactions.bankAccountId))
    .where(
      and(
        eq(bankAccounts.companyId, companyId),
        lt(bankTransactions.amountPence, 0),
        gte(bankTransactions.bookedAt, since),
        looksLikeDividend,
      ),
    );
  const count = row?.count ?? 0;
  if (count === 0) return null;
  return {
    id: "payingYourself",
    title: "Record the dividends you pay",
    reason: `${count} bank payment${count === 1 ? " looks" : "s look"} like ${count === 1 ? "a dividend" : "dividends"}. Dividends and Safe to pay help you take money out legally and keep the paperwork.`,
    features: ["dividends", "shareholders", "safeToPay", "reserves"],
  };
}

/** Enough bank history for a meaningful forecast. */
const FORECAST_MONTHS = 3;

async function forecastSuggestion(
  companyId: string,
): Promise<MenuSuggestion | null> {
  const months = sql<number>`count(distinct date_trunc('month', ${bankTransactions.bookedAt}))::int`;
  const [row] = await getDb()
    .select({ months })
    .from(bankTransactions)
    .innerJoin(bankAccounts, eq(bankAccounts.id, bankTransactions.bankAccountId))
    .where(eq(bankAccounts.companyId, companyId));
  const count = row?.months ?? 0;
  if (count < FORECAST_MONTHS) return null;
  return {
    id: "forecast",
    title: "See your cash a few months ahead",
    reason: `You have ${count} months of bank history, enough for a cash forecast.`,
    features: ["forecast"],
  };
}

/**
 * Suggestions to add hidden menu items, based on how the business actually
 * runs. Only features the person can open but has hidden are considered, and
 * dismissed suggestions are skipped.
 */
export async function getMenuSuggestions(
  companyId: string,
  options: {
    /** Features this person can open but has hidden from their menu. */
    hidden: readonly MenuFeature[];
    dismissed: readonly string[];
    today?: string;
  },
): Promise<MenuSuggestion[]> {
  const hidden = new Set(options.hidden);
  if (hidden.size === 0) return [];
  const dismissed = new Set(options.dismissed);
  const today = options.today ?? todayIsoDate();

  const rules: {
    id: string;
    features: MenuFeature[];
    run: () => Promise<MenuSuggestion | null>;
  }[] = [
    { id: "recurring", features: ["recurring"], run: () => recurringSuggestion(companyId, today) },
    { id: "reimbursements", features: ["reimbursements"], run: () => reimbursementsSuggestion(companyId) },
    { id: "payingYourself", features: ["dividends"], run: () => dividendsSuggestion(companyId, today) },
    { id: "forecast", features: ["forecast"], run: () => forecastSuggestion(companyId) },
  ];

  const results = await Promise.all(
    rules
      .filter(
        (rule) =>
          !dismissed.has(rule.id) && rule.features.every((f) => hidden.has(f)),
      )
      .map((rule) => rule.run()),
  );

  return results
    .filter((s): s is MenuSuggestion => s !== null)
    .map((s) => ({ ...s, features: s.features.filter((f) => hidden.has(f)) }));
}
