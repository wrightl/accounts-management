import { expenseOriginalAmount } from "@/lib/expenses/currency";
import {
  paymentSourceSummary,
  type PaymentSourceSuggestion,
} from "@/lib/expenses/payment-source";
import { formatExpenseAmount } from "@/lib/money";

type ReceiptInput = {
  id: string;
  filename?: string | null;
  url?: string | null;
  sizeBytes?: number | null;
  fileSizeBytes?: number | null;
  uploadedAt: Date | string;
};

export type MobileExpenseInput = {
  id: string;
  companyId: string;
  description?: string | null;
  amountPence?: number | null;
  /** Currency the receipt was in; null or GBP for sterling. */
  detectedCurrency?: string | null;
  originalAmountMinor?: number | null;
  category?: string | null;
  spentAt?: string | null;
  expenseDate?: string | null;
  status: string;
  billable?: boolean | null;
  vatRate?: number | null;
  vatPence?: number | null;
  clientId?: string | null;
  orderId?: string | null;
  clientName?: string | null;
  paidByUserId?: string | null;
  paidByName?: string | null;
  source?: string | null;
  createdAt?: Date | string | null;
  createdByName?: string | null;
  receipts?: ReceiptInput[];
  /** The team's own notes and labels. */
  notes?: string | null;
  labels?: { id: string; name: string; color: string }[];
  /** How a pending expense was probably paid; omitted for reviewed ones. */
  paymentSource?: PaymentSourceSuggestion | null;
};

function isoDate(value: Date | string | null | undefined): string {
  if (!value) return new Date().toISOString();
  if (value instanceof Date) return value.toISOString();
  return value;
}

function calendarDate(value: Date | string | null | undefined): string {
  const iso = isoDate(value);
  return iso.slice(0, 10);
}

export function toMobileExpense(expense: MobileExpenseInput) {
  const createdAt = isoDate(expense.createdAt);
  const amountPence = expense.amountPence ?? 0;
  const currencyFields = {
    detectedCurrency: expense.detectedCurrency ?? null,
    originalAmountMinor: expense.originalAmountMinor ?? null,
  };
  const original = expenseOriginalAmount(currencyFields);
  return {
    id: expense.id,
    companyId: expense.companyId,
    description: expense.description ?? "",
    amountPence,
    /** Foreign currency and amount (minor units), or null for sterling. */
    currency: original?.currency ?? null,
    originalAmountMinor: original?.amountMinor ?? null,
    /** As the web shows it, e.g. "£9.60 (US$12.00)". */
    amountFormatted: formatExpenseAmount({ amountPence, ...currencyFields }),
    category: expense.category ?? "Other",
    expenseDate:
      expense.spentAt ??
      expense.expenseDate ??
      calendarDate(expense.createdAt),
    status: expense.status,
    billable: Boolean(expense.billable),
    vatRate: expense.vatRate ?? 0,
    vatPence: expense.vatPence ?? 0,
    clientId: expense.clientId ?? null,
    orderId: expense.orderId ?? null,
    clientName: expense.clientName ?? null,
    paidByUserId: expense.paidByUserId ?? null,
    paidByName: expense.paidByName ?? null,
    source: expense.source ?? "manual",
    receipts: (expense.receipts ?? []).map((receipt) => ({
      id: receipt.id,
      filename: receipt.filename ?? "receipt",
      url: receipt.url ?? `/api/receipts/${receipt.id}`,
      fileSizeBytes: receipt.fileSizeBytes ?? receipt.sizeBytes ?? null,
      uploadedAt: isoDate(receipt.uploadedAt),
    })),
    createdByName: expense.createdByName ?? null,
    notes: expense.notes ?? null,
    labels: (expense.labels ?? []).map(({ id, name, color }) => ({ id, name, color })),
    paymentSource: expense.paymentSource
      ? paymentSourceSummary(expense.paymentSource)
      : null,
    createdAt,
    updatedAt: createdAt,
  };
}
