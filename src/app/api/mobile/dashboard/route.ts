import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getDashboardKpis, countOverdueInvoices } from "@/lib/invoices/queries";
import { getReimbursableSummary } from "@/lib/expenses/queries";
import { listPendingExpenses } from "@/lib/expenses/inbound-email";
import { countUnreconciledBankTransactions } from "@/lib/bank/queries";
import { getIncomeByMonth, getExpenseByMonth } from "@/lib/reports/queries";
import { todayIsoDate } from "@/lib/dates";

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    
    if (!user || !user.companyId) {
      return NextResponse.json(
        { ok: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    const companyId = user.companyId;
    const today = todayIsoDate();
    const currentMonth = today.substring(0, 7);
    const monthStart = `${currentMonth}-01`;

    const [
      invoiceKpis,
      overdueCount,
      reimbursable,
      pendingExpenses,
      unreconciledCount,
      incomeThisMonth,
      expensesThisMonth,
    ] = await Promise.all([
      getDashboardKpis(companyId),
      countOverdueInvoices(companyId),
      getReimbursableSummary(companyId),
      listPendingExpenses(companyId, 10),
      countUnreconciledBankTransactions(companyId),
      getIncomeByMonth(companyId, monthStart, today),
      getExpenseByMonth(companyId, monthStart, today),
    ]);

    const expensesThisMonthPence = expensesThisMonth[0]?.totalPence ?? 0;
    const recentInvoicesCount = 5; // Placeholder since count is not in the data

    const attentionItems = [];
    
    if (overdueCount > 0) {
      attentionItems.push({
        id: "overdue-invoices",
        type: "invoice",
        title: "Overdue Invoices",
        description: `${overdueCount} invoice${overdueCount === 1 ? "" : "s"} overdue`,
        priority: "high",
        createdAt: new Date().toISOString(),
      });
    }

    if (pendingExpenses.length > 0) {
      attentionItems.push({
        id: "pending-expenses",
        type: "expense",
        title: "Pending Expenses",
        description: `${pendingExpenses.length} expense${pendingExpenses.length === 1 ? "" : "s"} awaiting approval`,
        priority: "medium",
        createdAt: new Date().toISOString(),
      });
    }

    if (unreconciledCount > 0) {
      attentionItems.push({
        id: "unreconciled-transactions",
        type: "bank",
        title: "Unreconciled Transactions",
        description: `${unreconciledCount} bank transaction${unreconciledCount === 1 ? "" : "s"} to reconcile`,
        priority: "low",
        createdAt: new Date().toISOString(),
      });
    }

    return NextResponse.json({
      success: true,
      data: {
        kpis: {
          totalRevenuePence: invoiceKpis.invoicedThisMonthPence,
          outstandingPence: invoiceKpis.outstandingPence,
          expensesThisMonthPence,
          pendingExpensesCount: pendingExpenses.length,
          overdueInvoicesCount: overdueCount,
        },
        attentionItems,
        recentActivity: {
          recentExpensesCount: pendingExpenses.length,
          recentInvoicesCount,
          recentQuotesCount: 0,
        },
      },
    });
  } catch (error) {
    console.error("Dashboard error:", error);
    return NextResponse.json(
      { ok: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
