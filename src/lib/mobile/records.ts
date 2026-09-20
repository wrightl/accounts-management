import type { SessionUser } from "@/lib/auth";
import { listBankTransactions } from "@/lib/bank/queries";
import { listClients } from "@/lib/clients/queries";
import { resolvePeriod } from "@/lib/dates";
import { listInvoices } from "@/lib/invoices/queries";
import { listRecurringInvoices } from "@/lib/invoices/recurring-queries";
import { listOrders } from "@/lib/orders/queries";
import { listQuotes } from "@/lib/quotes/queries";
import { listReimbursements } from "@/lib/reimbursements/queries";
import {
  defaultReportPeriod,
  getAgedReceivables,
  getProfitAndLoss,
  listDividendDeclarations,
} from "@/lib/reports/queries";
import { getCompanySettings } from "@/lib/settings/queries";
import { listShareholders } from "@/lib/shareholders/queries";
import { getSpendingSummary, getTopSpending } from "@/lib/spending/queries";
import { listUsers } from "@/lib/users";
import type { MobileResource } from "@/lib/mobile/resources";

export type { MobileResource } from "@/lib/mobile/resources";
export {
  MOBILE_RESOURCES,
  canAccessResource,
  isMobileResource,
} from "@/lib/mobile/resources";

export type BookRecord = {
  id: string;
  title: string;
  subtitle: string;
  amount: string | null;
  status: string | null;
  date: string | null;
  details: Record<string, string>;
};

export type BookStat = {
  label: string;
  value: string;
};

export type BooksPage = {
  title: string;
  emptyMessage: string;
  stats: BookStat[];
  items: BookRecord[];
};

function asDate(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

function record(partial: BookRecord): BookRecord {
  return partial;
}

export async function loadBooksPage(
  companyId: string,
  _user: SessionUser,
  resource: MobileResource,
): Promise<BooksPage> {
  switch (resource) {
    case "clients": {
      const rows = await listClients(companyId);
      return {
        title: "Clients",
        emptyMessage: "No clients yet.",
        stats: [{ label: "Clients", value: String(rows.length) }],
        items: rows.map((row) =>
          record({
            id: row.id,
            title: row.companyName || row.name,
            subtitle: row.email || row.name,
            amount: null,
            status: null,
            date: asDate(row.createdAt),
            details: {
              Name: row.name,
              Company: row.companyName || "—",
              Email: row.email || "—",
              Address: row.addressLines || "—",
            },
          }),
        ),
      };
    }
    case "invoices": {
      const rows = await listInvoices(companyId);
      return {
        title: "Invoices",
        emptyMessage: "No invoices yet.",
        stats: [{ label: "Invoices", value: String(rows.length) }],
        items: rows.map((row) =>
          record({
            id: row.id,
            title: row.number,
            subtitle: row.clientName,
            amount: row.grossFormatted,
            status: row.status,
            date: row.issueDate,
            details: {
              Number: row.number,
              Client: row.clientName,
              Status: row.status,
              Issued: row.issueDate || "—",
              Due: row.dueDate || "—",
              Total: row.grossFormatted,
              Order: row.orderNumber || "—",
            },
          }),
        ),
      };
    }
    case "quotes": {
      const rows = await listQuotes(companyId);
      return {
        title: "Quotes",
        emptyMessage: "No quotes yet.",
        stats: [{ label: "Quotes", value: String(rows.length) }],
        items: rows.map((row) =>
          record({
            id: row.id,
            title: row.number,
            subtitle: row.clientName,
            amount: row.grossFormatted,
            status: row.status,
            date: row.issueDate,
            details: {
              Number: row.number,
              Version: row.versionLabel,
              Client: row.clientName,
              Status: row.status,
              Issued: row.issueDate || "—",
              Total: row.grossFormatted,
            },
          }),
        ),
      };
    }
    case "orders": {
      const rows = await listOrders(companyId);
      return {
        title: "Orders",
        emptyMessage: "No orders yet.",
        stats: [{ label: "Orders", value: String(rows.length) }],
        items: rows.map((row) =>
          record({
            id: row.id,
            title: row.number,
            subtitle: row.clientName,
            amount: row.grossFormatted,
            status: row.status,
            date: row.issueDate,
            details: {
              Number: row.number,
              Client: row.clientName,
              Status: row.status,
              Issued: row.issueDate || "—",
              Quote: row.quoteNumber || "—",
              Total: row.grossFormatted,
            },
          }),
        ),
      };
    }
    case "transactions": {
      const result = await listBankTransactions(companyId, { pageSize: 50 });
      return {
        title: "Transactions",
        emptyMessage: "No bank transactions imported.",
        stats: [{ label: "Showing", value: String(result.rows.length) }],
        items: result.rows.map((row) =>
          record({
            id: row.id,
            title: row.counterparty || row.description || "Transaction",
            subtitle: row.reference || row.spendingCategory || "Bank",
            amount: row.amountFormatted,
            status: row.reconciled
              ? "reconciled"
              : row.suggested
                ? "suggested"
                : "unreconciled",
            date: row.bookedAt,
            details: {
              Counterparty: row.counterparty || "—",
              Reference: row.reference || "—",
              Description: row.description || "—",
              Category: row.spendingCategory || "—",
              Amount: row.amountFormatted,
              Status: row.reconciled
                ? "Reconciled"
                : row.suggested
                  ? "Suggested match"
                  : "Unreconciled",
              Match: row.matchLabel || "—",
            },
          }),
        ),
      };
    }
    case "reimbursements": {
      const rows = await listReimbursements(companyId);
      return {
        title: "Reimbursements",
        emptyMessage: "No reimbursement runs yet.",
        stats: [{ label: "Runs", value: String(rows.length) }],
        items: rows.map((row) =>
          record({
            id: row.id,
            title: row.payeeName || row.payeeEmail || "Payee",
            subtitle: row.reference || "Reimbursement",
            amount: row.totalFormatted,
            status: row.status,
            date: asDate(row.createdAt),
            details: {
              Payee: row.payeeName || row.payeeEmail || "—",
              Reference: row.reference || "—",
              Status: row.status,
              Total: row.totalFormatted,
              Paid: asDate(row.paidAt) || "—",
            },
          }),
        ),
      };
    }
    case "recurring": {
      const rows = await listRecurringInvoices(companyId);
      return {
        title: "Recurring invoices",
        emptyMessage: "No recurring invoices yet.",
        stats: [{ label: "Templates", value: String(rows.length) }],
        items: rows.map((row) =>
          record({
            id: row.id,
            title: row.name,
            subtitle: row.clientName,
            amount: row.grossFormatted,
            status: row.enabled ? "enabled" : "paused",
            date: row.nextRunOn,
            details: {
              Name: row.name,
              Client: row.clientName,
              Amount: row.grossFormatted,
              "Day of month": String(row.dayOfMonth),
              "Next run": row.nextRunOn || "—",
              Status: row.enabled ? "Enabled" : "Paused",
            },
          }),
        ),
      };
    }
    case "spending": {
      const settings = await getCompanySettings(companyId);
      const period = resolvePeriod(
        "current-month",
        settings.financialYearEndMonth,
      );
      const [summary, top] = await Promise.all([
        getSpendingSummary(companyId, {
          from: period.from,
          to: period.to,
          compareFrom: period.compareFrom,
          compareTo: period.compareTo,
        }),
        getTopSpending(companyId, {
          from: period.from,
          to: period.to,
          groupBy: "category",
          limit: 12,
        }),
      ]);
      return {
        title: "Spending",
        emptyMessage: "No cash spending this month.",
        stats: [
          { label: period.label, value: summary.totalFormatted },
          { label: period.compareLabel, value: summary.compareTotalFormatted },
        ],
        items: top.map((row) =>
          record({
            id: row.key,
            title: row.label,
            subtitle: `${row.sharePercent}% of outflows`,
            amount: row.totalFormatted,
            status: null,
            date: null,
            details: {
              Category: row.label,
              Amount: row.totalFormatted,
              Share: `${row.sharePercent}%`,
            },
          }),
        ),
      };
    }
    case "reports": {
      const period = await defaultReportPeriod(companyId);
      const [pnl, aged] = await Promise.all([
        getProfitAndLoss(companyId, period.from, period.to),
        getAgedReceivables(companyId),
      ]);
      return {
        title: "Reports",
        emptyMessage: "No report figures yet.",
        stats: [
          { label: "Income", value: pnl.incomeFormatted },
          { label: "Expenses", value: pnl.expenseFormatted },
          { label: "Profit", value: pnl.profitFormatted },
        ],
        items: [
          record({
            id: "aged-current",
            title: "Current receivables",
            subtitle: "Not yet due",
            amount: aged.current,
            status: null,
            date: null,
            details: { Bucket: "Current", Amount: aged.current },
          }),
          record({
            id: "aged-30",
            title: "1–30 days overdue",
            subtitle: "Aged receivables",
            amount: aged.d30,
            status: null,
            date: null,
            details: { Bucket: "1–30 days", Amount: aged.d30 },
          }),
          record({
            id: "aged-60",
            title: "31–60 days overdue",
            subtitle: "Aged receivables",
            amount: aged.d60,
            status: null,
            date: null,
            details: { Bucket: "31–60 days", Amount: aged.d60 },
          }),
          record({
            id: "aged-90",
            title: "90+ days overdue",
            subtitle: "Aged receivables",
            amount: aged.d90,
            status: "overdue",
            date: null,
            details: { Bucket: "90+ days", Amount: aged.d90 },
          }),
        ],
      };
    }
    case "dividends": {
      const rows = await listDividendDeclarations(companyId);
      return {
        title: "Dividends",
        emptyMessage: "No dividend declarations yet.",
        stats: [{ label: "Declarations", value: String(rows.length) }],
        items: rows.map((row) =>
          record({
            id: row.id,
            title: row.totalFormatted,
            subtitle: `${row.payouts.length} payout${row.payouts.length === 1 ? "" : "s"}`,
            amount: row.totalFormatted,
            status: null,
            date: row.declaredAt,
            details: {
              Declared: row.declaredAt,
              Total: row.totalFormatted,
              Notes: row.notes || "—",
            },
          }),
        ),
      };
    }
    case "shareholders": {
      const data = await listShareholders(companyId);
      return {
        title: "Shareholders",
        emptyMessage: "No shareholders on the register.",
        stats: [
          {
            label: "Issued shares",
            value: data.totalShares != null ? String(data.totalShares) : "—",
          },
        ],
        items: data.shareholders.map((row) =>
          record({
            id: row.id,
            title: row.name,
            subtitle: row.linkedUserLabel || "Shareholder",
            amount: `${row.shareCount} shares`,
            status: row.archivedAt ? "archived" : "active",
            date: asDate(row.createdAt),
            details: {
              Name: row.name,
              Shares: String(row.shareCount),
              Percent:
                row.percent != null ? `${row.percent.toFixed(1)}%` : "—",
              User: row.linkedUserLabel || "—",
            },
          }),
        ),
      };
    }
    case "settings": {
      const company = await getCompanySettings(companyId);
      const rows: Array<[string, string]> = [
        ["Trading name", company.name],
        ["Legal name", company.legalName],
        ["Entity", company.entityType.replaceAll("_", " ")],
        ["Email", company.email || "—"],
        [
          "VAT",
          company.vatRegistered
            ? `Registered${company.vatNumber ? ` · ${company.vatNumber}` : ""}`
            : "Not registered",
        ],
        ["FY end month", String(company.financialYearEndMonth)],
        ["Bank", company.bankName || company.bankProvider || "—"],
        ["Invoice prefix", company.invoiceNumberPrefix],
      ];
      return {
        title: "Settings",
        emptyMessage: "No company settings.",
        stats: [{ label: "Company", value: company.name }],
        items: rows.map(([label, value]) =>
          record({
            id: label,
            title: label,
            subtitle: value,
            amount: null,
            status: null,
            date: null,
            details: { [label]: value },
          }),
        ),
      };
    }
    case "users": {
      const rows = await listUsers(companyId);
      return {
        title: "Users",
        emptyMessage: "No users in this company.",
        stats: [{ label: "Users", value: String(rows.length) }],
        items: rows.map((row) =>
          record({
            id: row.id,
            title: row.name || row.email,
            subtitle: row.email,
            amount: null,
            status: row.role,
            date: null,
            details: {
              Name: row.name || "—",
              Email: row.email,
              Role: row.role,
            },
          }),
        ),
      };
    }
  }
}
