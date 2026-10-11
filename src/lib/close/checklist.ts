import "server-only";
import { and, asc, count, desc, eq, isNull, ne, sql } from "drizzle-orm";
import { getDb } from "@/db";
import {
  bankAccounts,
  bankTransactions,
  expenses,
  invoices,
  orderPaymentMilestones,
  orders,
  reconciliationMatches,
  users,
  weeklyCloses,
} from "@/db/schema";
import { todayIsoDate } from "@/lib/dates";
import { listOverdueInvoices } from "@/lib/invoices/queries";
import { addDays } from "@/lib/ledger/corporation-tax";
import { resolveMilestoneAmountPence } from "@/lib/orders/invoice-from-order";
import { getReimbursementBalances } from "@/lib/reimbursements/queries";

/** Milestones due within this many days count as ready to bill. */
export const MILESTONE_LOOKAHEAD_DAYS = 7;

export type CloseItemKey = "bank" | "receipts" | "overdue" | "milestones" | "reimbursements";

export type CloseItem = {
  key: CloseItemKey;
  label: string;
  /** What clearing it means, shown when it's done. */
  doneLabel: string;
  count: number;
  amountPence: number | null;
  href: string;
};

export type ReadyMilestone = {
  orderId: string;
  clientId: string;
  orderNumber: string;
  label: string;
  dueDate: string;
  amountPence: number;
};

async function countPendingReceipts(companyId: string): Promise<number> {
  const [row] = await getDb()
    .select({ total: count() })
    .from(expenses)
    .where(and(eq(expenses.companyId, companyId), eq(expenses.status, "pending")));
  return row?.total ?? 0;
}

/**
 * The latest date with every bank transaction on or before it reconciled:
 * the day before the oldest unreconciled row, or the newest row when all are
 * done. Null with no bank transactions.
 */
export async function getBankReconciledThrough(companyId: string): Promise<{
  reconciledThrough: string | null;
  unreconciled: number;
}> {
  const db = getDb();
  const [row] = await db
    .select({
      oldestOpen: sql<string | null>`min(${bankTransactions.bookedAt}) filter (where ${reconciliationMatches.id} is null)`,
      newest: sql<string | null>`max(${bankTransactions.bookedAt})`,
      open: sql<number>`count(*) filter (where ${reconciliationMatches.id} is null)`.mapWith(Number),
    })
    .from(bankTransactions)
    .innerJoin(bankAccounts, eq(bankTransactions.bankAccountId, bankAccounts.id))
    .leftJoin(
      reconciliationMatches,
      and(
        eq(reconciliationMatches.bankTransactionId, bankTransactions.id),
        eq(reconciliationMatches.confirmed, true),
      ),
    )
    .where(eq(bankAccounts.companyId, companyId));
  if (!row?.newest) return { reconciledThrough: null, unreconciled: 0 };
  return {
    reconciledThrough: row.oldestOpen ? addDays(row.oldestOpen, -1) : row.newest,
    unreconciled: row.open,
  };
}

/** Unbilled milestones on active orders due within `lookaheadDays` (a week by default). */
export async function listMilestonesReadyToBill(
  companyId: string,
  today: string,
  lookaheadDays: number = MILESTONE_LOOKAHEAD_DAYS,
): Promise<ReadyMilestone[]> {
  const db = getDb();
  const rows = await db
    .select({
      orderId: orders.id,
      orderNumber: orders.number,
      clientId: orders.clientId,
      orderIssueDate: orders.issueDate,
      orderGrossPence: orders.grossPence,
      milestone: orderPaymentMilestones,
    })
    .from(orderPaymentMilestones)
    .innerJoin(orders, eq(orderPaymentMilestones.orderId, orders.id))
    .leftJoin(
      invoices,
      and(
        eq(invoices.paymentMilestoneId, orderPaymentMilestones.id),
        ne(invoices.status, "void"),
      ),
    )
    .where(and(eq(orders.companyId, companyId), eq(orders.status, "active"), isNull(invoices.id)))
    .orderBy(asc(orders.number), asc(orderPaymentMilestones.position));

  const horizon = addDays(today, lookaheadDays);
  return rows.flatMap((r) => {
    const m = r.milestone;
    const start = r.orderIssueDate ?? today;
    const dueDate = m.dueDate ?? addDays(start, m.dueInDays ?? 0);
    if (dueDate > horizon) return [];
    let amountPence = 0;
    try {
      amountPence = resolveMilestoneAmountPence(m, r.orderGrossPence);
    } catch {
      return [];
    }
    return [
      {
        orderId: r.orderId,
        clientId: r.clientId,
        orderNumber: r.orderNumber,
        label: m.label,
        dueDate,
        amountPence,
      },
    ];
  });
}

export async function getLastWeeklyClose(companyId: string) {
  const [row] = await getDb()
    .select({
      closedAt: weeklyCloses.closedAt,
      bankReconciledThrough: weeklyCloses.bankReconciledThrough,
      snapshot: weeklyCloses.snapshot,
      closedByName: sql<string | null>`coalesce(${users.name}, ${users.email})`,
    })
    .from(weeklyCloses)
    .leftJoin(users, eq(weeklyCloses.closedByUserId, users.id))
    .where(eq(weeklyCloses.companyId, companyId))
    .orderBy(desc(weeklyCloses.closedAt))
    .limit(1);
  return row ?? null;
}

export async function listWeeklyCloses(companyId: string, limit = 8) {
  return getDb()
    .select({
      id: weeklyCloses.id,
      closedAt: weeklyCloses.closedAt,
      bankReconciledThrough: weeklyCloses.bankReconciledThrough,
      snapshot: weeklyCloses.snapshot,
      closedByName: sql<string | null>`coalesce(${users.name}, ${users.email})`,
    })
    .from(weeklyCloses)
    .leftJoin(users, eq(weeklyCloses.closedByUserId, users.id))
    .where(eq(weeklyCloses.companyId, companyId))
    .orderBy(desc(weeklyCloses.closedAt))
    .limit(limit);
}

/** Everything to clear for the weekly close, in the order to work through it. */
export async function getWeeklyCloseChecklist(companyId: string, today: string = todayIsoDate()) {
  const [bank, receipts, overdueRows, milestones, reimbursements] = await Promise.all([
    getBankReconciledThrough(companyId),
    countPendingReceipts(companyId),
    listOverdueInvoices(companyId, 1000),
    listMilestonesReadyToBill(companyId, today),
    getReimbursementBalances(companyId),
  ]);
  const overdue = overdueRows.filter((r) => r.balancePence > 0);
  const owed = reimbursements.filter((r) => r.totalPence > 0);

  const items: CloseItem[] = [
    {
      key: "bank",
      label: "Bank transactions to reconcile",
      doneLabel: "Bank transactions reconciled",
      count: bank.unreconciled,
      amountPence: null,
      href: "/transactions?reconciliation=unreconciled",
    },
    {
      key: "receipts",
      label: "Receipts to review",
      doneLabel: "Receipts reviewed",
      count: receipts,
      amountPence: null,
      href: "/expenses?status=pending",
    },
    {
      key: "overdue",
      label: "Overdue invoices to chase",
      doneLabel: "No overdue invoices",
      count: overdue.length,
      amountPence: overdue.reduce((t, r) => t + r.balancePence, 0),
      href: "/invoices",
    },
    {
      key: "milestones",
      label: "Milestones ready to bill",
      doneLabel: "No milestones waiting to be billed",
      count: milestones.length,
      amountPence: milestones.reduce((t, m) => t + m.amountPence, 0),
      href: "/orders",
    },
    {
      key: "reimbursements",
      label: "Reimbursements owed to the team",
      doneLabel: "Nobody is waiting to be reimbursed",
      count: owed.length,
      amountPence: owed.reduce((t, r) => t + r.totalPence, 0),
      href: "/reimbursements",
    },
  ];

  return {
    today,
    items,
    outstanding: items.filter((i) => i.count > 0).length,
    bankReconciledThrough: bank.reconciledThrough,
    milestones,
    overdue: overdue.slice(0, 5),
  };
}

export type WeeklyCloseChecklist = Awaited<ReturnType<typeof getWeeklyCloseChecklist>>;

/** Item counts stored with a close. */
export function checklistSnapshot(checklist: WeeklyCloseChecklist): Record<CloseItemKey, number> {
  return Object.fromEntries(checklist.items.map((i) => [i.key, i.count])) as Record<
    CloseItemKey,
    number
  >;
}
