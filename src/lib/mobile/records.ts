import type { SessionUser } from "@/lib/auth";
import { listClients } from "@/lib/clients/queries";
import { resolvePeriod, todayIsoDate } from "@/lib/dates";
import { invoiceAmountsDue, listInvoices } from "@/lib/invoices/queries";
import { can } from "@/lib/roles";
import { listQuotes } from "@/lib/quotes/queries";
import { listReimbursements } from "@/lib/reimbursements/queries";
import { listDividendDeclarations } from "@/lib/reports/queries";
import { getCompanySettings } from "@/lib/settings/queries";
import { getSpendingSummary, getTopSpending } from "@/lib/spending/queries";
import type { MobileResource } from "@/lib/mobile/resources";
import { pageResult, type MobilePage } from "@/lib/mobile/paging";

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
  /** What the phone can do with this record; absent when nothing. */
  actions?: {
    /** Record a payment; the amount still owed prefills the form. */
    recordPayment?: { amountDuePence: number };
    /** Mark the reimbursement run paid. */
    markPaid?: boolean;
  };
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
  /** More items after this page. */
  hasMore: boolean;
};

function asDate(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

function record(partial: BookRecord): BookRecord {
  return partial;
}

/**
 * One page of a read-only list. The shared list queries load every row (the
 * web shows them all), so this pages what is sent to the phone; the stats
 * still count everything.
 */
export async function loadBooksPage(
  companyId: string,
  user: SessionUser,
  resource: MobileResource,
  page: MobilePage = { limit: Number.MAX_SAFE_INTEGER, offset: 0 },
): Promise<BooksPage> {
  const all = await loadAllRecords(companyId, user, resource);
  const { items, hasMore } = pageResult(all.items.slice(page.offset), page);
  const withActions = await addActions(items, all.payable, can(user.role, "accounts:write"));
  return { title: all.title, emptyMessage: all.emptyMessage, stats: all.stats, items: withActions, hasMore };
}

/** Sent invoices still owed money, and unpaid runs due today or earlier. */
type Payable = {
  invoices?: Map<string, number>;
  runs?: Set<string>;
};

async function addActions(
  items: BookRecord[],
  payable: Payable | undefined,
  canWrite: boolean,
): Promise<BookRecord[]> {
  if (!canWrite || !payable) return items;
  const owed = payable.invoices
    ? await invoiceAmountsDue(
        items
          .filter((i) => payable.invoices!.has(i.id))
          .map((i) => ({ id: i.id, grossPence: payable.invoices!.get(i.id)! })),
      )
    : new Map<string, number>();
  return items.map((item) => {
    const amountDuePence = owed.get(item.id) ?? 0;
    if (amountDuePence > 0) return { ...item, actions: { recordPayment: { amountDuePence } } };
    if (payable.runs?.has(item.id)) return { ...item, actions: { markPaid: true } };
    return item;
  });
}

async function loadAllRecords(
  companyId: string,
  _user: SessionUser,
  resource: MobileResource,
): Promise<Omit<BooksPage, "hasMore"> & { payable?: Payable }> {
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
        payable: {
          invoices: new Map(
            rows
              .filter((row) => row.status === "sent" || row.status === "overdue")
              .map((row) => [row.id, row.grossPence]),
          ),
        },
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
    case "reimbursements": {
      const rows = await listReimbursements(companyId);
      const today = todayIsoDate();
      return {
        payable: {
          runs: new Set(
            rows
              .filter(
                (row) =>
                  row.status !== "paid" &&
                  (!row.reimbursementDate || row.reimbursementDate <= today),
              )
              .map((row) => row.id),
          ),
        },
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
              "Reimbursement date": row.reimbursementDate || "—",
              Paid: asDate(row.paidAt) || "—",
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
  }
}
