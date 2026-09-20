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
  category?: string | null;
  spentAt?: string | null;
  expenseDate?: string | null;
  status: string;
  billable?: boolean | null;
  source?: string | null;
  createdAt?: Date | string | null;
  createdByName?: string | null;
  receipts?: ReceiptInput[];
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
  return {
    id: expense.id,
    companyId: expense.companyId,
    description: expense.description ?? "",
    amountPence: expense.amountPence ?? 0,
    category: expense.category ?? "Other",
    expenseDate:
      expense.spentAt ??
      expense.expenseDate ??
      calendarDate(expense.createdAt),
    status: expense.status,
    notes: null as string | null,
    billable: Boolean(expense.billable),
    source: expense.source ?? "manual",
    receipts: (expense.receipts ?? []).map((receipt) => ({
      id: receipt.id,
      filename: receipt.filename ?? "receipt",
      url: receipt.url ?? `/api/receipts/${receipt.id}`,
      fileSizeBytes: receipt.fileSizeBytes ?? receipt.sizeBytes ?? null,
      uploadedAt: isoDate(receipt.uploadedAt),
    })),
    createdByName: expense.createdByName ?? null,
    createdAt,
    updatedAt: createdAt,
  };
}
