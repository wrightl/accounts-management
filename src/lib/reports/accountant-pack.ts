import "server-only";
import { and, eq, gte, inArray, lte, ne } from "drizzle-orm";
import { getDb } from "@/db";
import {
  bankAccounts,
  bankTransactions,
  clients,
  dividendDeclarations,
  dividendPayouts,
  expenseReceipts,
  expenses,
  invoiceLineItems,
  invoices,
  orders,
  payments,
  reconciliationMatches,
  reimbursementItems,
  reimbursements,
  users,
} from "@/db/schema";
import { clientDisplayNameSql } from "@/lib/clients/sql";
import { safeFilename } from "@/lib/files";
import { getInvoiceDetail } from "@/lib/invoices/queries";
import { renderInvoicePdf } from "@/lib/invoices/pdf";
import { lineNetPence } from "@/lib/money";
import {
  getAgedReceivables,
  getProfitAndLoss,
  getVatSummary,
} from "@/lib/reports/queries";
import { getOrCreateCompanySettings } from "@/lib/settings/queries";
import { getStorage } from "@/lib/storage";

export type ZipEntry = string | Uint8Array;

const FETCH_CONCURRENCY = 5;

export type AccountantPackResult = {
  filename: string;
  zip: Uint8Array;
};

/** Build a period accountant pack (CSVs, summary reports, invoice PDFs, receipt files). */
export async function buildAccountantPack({
  companyId,
  from,
  to,
}: {
  companyId: string;
  from: string;
  to: string;
}): Promise<AccountantPackResult> {
  const db = getDb();
  const warnings: string[] = [];
  const binaryFiles: Record<string, Uint8Array> = {};

  const [pnl, vat, aged] = await Promise.all([
    getProfitAndLoss(companyId, from, to),
    getVatSummary(from, to),
    getAgedReceivables(companyId),
  ]);

  const invRows = await db
    .select({
      id: invoices.id,
      number: invoices.number,
      status: invoices.status,
      issueDate: invoices.issueDate,
      dueDate: invoices.dueDate,
      netPence: invoices.netPence,
      vatPence: invoices.vatPence,
      grossPence: invoices.grossPence,
      sentAt: invoices.sentAt,
      paidAt: invoices.paidAt,
      pdfBlobPath: invoices.pdfBlobPath,
      clientName: clientDisplayNameSql.as("client_name"),
      orderNumber: orders.number,
    })
    .from(invoices)
    .innerJoin(clients, eq(invoices.clientId, clients.id))
    .leftJoin(orders, eq(invoices.orderId, orders.id))
    .where(
      and(
        eq(invoices.companyId, companyId),
        ne(invoices.status, "draft"),
        ne(invoices.status, "void"),
        gte(invoices.issueDate, from),
        lte(invoices.issueDate, to),
      ),
    );

  const invIds = invRows.map((r) => r.id);
  const lineRows =
    invIds.length === 0
      ? []
      : await db
          .select({
            invoiceId: invoiceLineItems.invoiceId,
            description: invoiceLineItems.description,
            quantity: invoiceLineItems.quantity,
            unitPricePence: invoiceLineItems.unitPricePence,
            vatRate: invoiceLineItems.vatRate,
            position: invoiceLineItems.position,
          })
          .from(invoiceLineItems)
          .where(inArray(invoiceLineItems.invoiceId, invIds))
          .orderBy(invoiceLineItems.position);

  const invNumberById = new Map(invRows.map((r) => [r.id, r.number]));

  const payRows = await db
    .select({
      id: payments.id,
      invoiceId: payments.invoiceId,
      invoiceNumber: invoices.number,
      amountPence: payments.amountPence,
      method: payments.method,
      reference: payments.reference,
      receivedAt: payments.receivedAt,
    })
    .from(payments)
    .innerJoin(invoices, eq(payments.invoiceId, invoices.id))
    .where(
      and(
        eq(invoices.companyId, companyId),
        gte(payments.receivedAt, new Date(`${from}T00:00:00Z`)),
        lte(payments.receivedAt, new Date(`${to}T23:59:59.999Z`)),
      ),
    );

  const expRows = await db
    .select({
      expense: expenses,
      paidByEmail: users.email,
      billableClientName: clientDisplayNameSql.as("billable_client_name"),
    })
    .from(expenses)
    .leftJoin(users, eq(expenses.paidByUserId, users.id))
    .leftJoin(clients, eq(expenses.billableClientId, clients.id))
    .where(
      and(
        eq(expenses.companyId, companyId),
        ne(expenses.status, "pending"),
        gte(expenses.spentAt, from),
        lte(expenses.spentAt, to),
      ),
    );

  const reimbRows = await db
    .select({
      id: reimbursements.id,
      payeeEmail: users.email,
      payeeName: users.name,
      status: reimbursements.status,
      reference: reimbursements.reference,
      totalPence: reimbursements.totalPence,
      createdAt: reimbursements.createdAt,
      paidAt: reimbursements.paidAt,
    })
    .from(reimbursements)
    .innerJoin(users, eq(reimbursements.payeeUserId, users.id))
    .where(
      and(
        eq(reimbursements.companyId, companyId),
        gte(reimbursements.createdAt, new Date(`${from}T00:00:00Z`)),
        lte(reimbursements.createdAt, new Date(`${to}T23:59:59.999Z`)),
      ),
    );

  const reimbIds = reimbRows.map((r) => r.id);
  const allReimbItems =
    reimbIds.length === 0
      ? []
      : await db
          .select({
            reimbursementId: reimbursementItems.reimbursementId,
            expenseId: reimbursementItems.expenseId,
            description: expenses.description,
            amountPence: expenses.amountPence,
          })
          .from(reimbursementItems)
          .innerJoin(expenses, eq(reimbursementItems.expenseId, expenses.id))
          .where(inArray(reimbursementItems.reimbursementId, reimbIds));

  const expenseIds = expRows.map((e) => e.expense.id);
  const receiptRows =
    expenseIds.length === 0
      ? []
      : await db
          .select()
          .from(expenseReceipts)
          .where(inArray(expenseReceipts.expenseId, expenseIds));

  const dividendRows = await db
    .select({
      id: dividendPayouts.id,
      declaredAt: dividendDeclarations.declaredAt,
      shareholderName: dividendPayouts.shareholderName,
      amountPence: dividendPayouts.amountPence,
      notes: dividendDeclarations.notes,
    })
    .from(dividendPayouts)
    .innerJoin(
      dividendDeclarations,
      eq(dividendPayouts.declarationId, dividendDeclarations.id),
    )
    .where(
      and(
        eq(dividendDeclarations.companyId, companyId),
        gte(dividendDeclarations.declaredAt, from),
        lte(dividendDeclarations.declaredAt, to),
      ),
    );

  const bankTxRows = await db
    .select({
      id: bankTransactions.id,
      bankAccountId: bankTransactions.bankAccountId,
      externalId: bankTransactions.externalId,
      bookedAt: bankTransactions.bookedAt,
      amountPence: bankTransactions.amountPence,
      counterparty: bankTransactions.counterparty,
      reference: bankTransactions.reference,
      description: bankTransactions.description,
      spendingCategory: bankTransactions.spendingCategory,
      tags: bankTransactions.tags,
      createdAt: bankTransactions.createdAt,
    })
    .from(bankTransactions)
    .innerJoin(bankAccounts, eq(bankTransactions.bankAccountId, bankAccounts.id))
    .where(
      and(
        eq(bankAccounts.companyId, companyId),
        gte(bankTransactions.bookedAt, from),
        lte(bankTransactions.bookedAt, to),
      ),
    );

  const bankTxIds = bankTxRows.map((t) => t.id);
  const reconRows =
    bankTxIds.length === 0
      ? []
      : await db
          .select()
          .from(reconciliationMatches)
          .where(inArray(reconciliationMatches.bankTransactionId, bankTxIds));

  await mapWithConcurrency(invRows, FETCH_CONCURRENCY, async (inv) => {
    const pdfPath = `invoices/${safeFilename(`${inv.number}.pdf`)}`;
    try {
      const bytes = await resolveInvoicePdf(companyId, inv.id, inv.pdfBlobPath);
      binaryFiles[pdfPath] = bytes;
    } catch (err) {
      warnings.push(
        `Invoice PDF missing: ${inv.number} (${inv.id}) — ${formatError(err)}`,
      );
    }
  });

  const receiptIndexRows: string[][] = [];
  await mapWithConcurrency(receiptRows, FETCH_CONCURRENCY, async (receipt) => {
    const zipPath = `receipts/${receipt.expenseId}/${safeFilename(receipt.filename)}`;
    try {
      const bytes = await loadReceiptBytes(receipt.blobPath);
      binaryFiles[zipPath] = bytes;
      receiptIndexRows.push([
        receipt.id,
        receipt.expenseId,
        receipt.filename,
        receipt.contentType ?? "",
        String(receipt.sizeBytes ?? bytes.byteLength),
        receipt.uploadedAt.toISOString(),
        zipPath,
      ]);
    } catch (err) {
      warnings.push(
        `Receipt file missing: ${receipt.filename} (${receipt.id}) — ${formatError(err)}`,
      );
      receiptIndexRows.push([
        receipt.id,
        receipt.expenseId,
        receipt.filename,
        receipt.contentType ?? "",
        String(receipt.sizeBytes ?? ""),
        receipt.uploadedAt.toISOString(),
        "MISSING",
      ]);
    }
  });

  const textFiles: Record<string, string> = {
    "summary/pnl.csv": toCsv(
      ["metric", "value_gbp", "note"],
      [
        ["income_invoiced", gbp(pnl.incomePence), "accrual — issue date in period"],
        ["expenses", gbp(pnl.expensePence), "spend date in period, excl. pending"],
        ["profit", gbp(pnl.profitPence), ""],
        ["basis", "", pnl.basisNote],
      ],
    ),
    "summary/vat.csv": toCsv(
      ["metric", "value_gbp", "note"],
      [
        ["vat_on_sales", gbp(vat.vatOnSalesPence), ""],
        ["vat_on_purchases", gbp(vat.vatOnPurchasesPence), ""],
        ["net_vat", gbp(vat.netVatPence), vat.note],
      ],
    ),
    "summary/aged-receivables.csv": toCsv(
      ["bucket", "amount_gbp"],
      [
        ["current", aged.current.replace(/[£,]/g, "")],
        ["1_30_days", aged.d30.replace(/[£,]/g, "")],
        ["31_60_days", aged.d60.replace(/[£,]/g, "")],
        ["90_plus_days", aged.d90.replace(/[£,]/g, "")],
      ],
    ),
    "invoices.csv": toCsv(
      [
        "id",
        "number",
        "client",
        "status",
        "issue_date",
        "due_date",
        "order_number",
        "sent_at",
        "paid_at",
        "net_gbp",
        "vat_gbp",
        "gross_gbp",
      ],
      invRows.map((r) => [
        r.id,
        r.number,
        r.clientName,
        r.status,
        r.issueDate ?? "",
        r.dueDate ?? "",
        r.orderNumber ?? "",
        r.sentAt?.toISOString() ?? "",
        r.paidAt?.toISOString() ?? "",
        gbp(r.netPence),
        gbp(r.vatPence),
        gbp(r.grossPence),
      ]),
    ),
    "invoice-line-items.csv": toCsv(
      [
        "invoice_id",
        "invoice_number",
        "description",
        "quantity",
        "unit_price_gbp",
        "vat_rate",
        "line_net_gbp",
      ],
      lineRows.map((r) => [
        r.invoiceId,
        invNumberById.get(r.invoiceId) ?? "",
        r.description,
        String(r.quantity),
        gbp(r.unitPricePence),
        String(r.vatRate),
        gbp(lineNetPence(r)),
      ]),
    ),
    "payments.csv": toCsv(
      [
        "id",
        "invoice_id",
        "invoice_number",
        "amount_gbp",
        "method",
        "reference",
        "received_at",
      ],
      payRows.map((r) => [
        r.id,
        r.invoiceId,
        r.invoiceNumber,
        gbp(r.amountPence),
        r.method ?? "",
        r.reference ?? "",
        r.receivedAt.toISOString(),
      ]),
    ),
    "expenses.csv": toCsv(
      [
        "id",
        "description",
        "category",
        "spent_at",
        "amount_gbp",
        "vat_gbp",
        "status",
        "source",
        "billable",
        "billable_client",
        "paid_by_email",
        "mileage_miles",
        "mileage_rate_pence",
      ],
      expRows.map((r) => [
        r.expense.id,
        r.expense.description,
        r.expense.category ?? "",
        r.expense.spentAt ?? "",
        gbp(r.expense.amountPence),
        gbp(r.expense.vatPence),
        r.expense.status,
        r.expense.source,
        r.expense.billable ? "yes" : "no",
        r.billableClientName ?? "",
        r.paidByEmail ?? "",
        r.expense.mileageMiles != null ? String(r.expense.mileageMiles) : "",
        r.expense.mileageRatePence != null
          ? String(r.expense.mileageRatePence)
          : "",
      ]),
    ),
    "reimbursements.csv": toCsv(
      [
        "id",
        "payee",
        "status",
        "reference",
        "total_gbp",
        "created_at",
        "paid_at",
      ],
      reimbRows.map((r) => [
        r.id,
        r.payeeName || r.payeeEmail,
        r.status,
        r.reference ?? "",
        gbp(r.totalPence),
        r.createdAt.toISOString(),
        r.paidAt?.toISOString() ?? "",
      ]),
    ),
    "reimbursement-items.csv": toCsv(
      ["reimbursement_id", "expense_id", "description", "amount_gbp"],
      allReimbItems.map((r) => [
        r.reimbursementId,
        r.expenseId,
        r.description,
        gbp(r.amountPence),
      ]),
    ),
    "receipts-index.csv": toCsv(
      [
        "id",
        "expense_id",
        "filename",
        "content_type",
        "size_bytes",
        "uploaded_at",
        "zip_path",
      ],
      receiptIndexRows,
    ),
    "dividends.csv": toCsv(
      ["id", "declared_at", "shareholder_name", "amount_gbp", "notes"],
      dividendRows.map((d) => [
        d.id,
        d.declaredAt,
        d.shareholderName,
        gbp(d.amountPence),
        d.notes ?? "",
      ]),
    ),
    "bank-transactions.csv": toCsv(
      [
        "id",
        "booked_at",
        "amount_gbp",
        "counterparty",
        "reference",
        "description",
        "spending_category",
      ],
      bankTxRows.map((t) => [
        t.id,
        t.bookedAt,
        gbp(t.amountPence),
        t.counterparty ?? "",
        t.reference ?? "",
        t.description ?? "",
        t.spendingCategory ?? "",
      ]),
    ),
    "reconciliation-matches.csv": toCsv(
      [
        "id",
        "bank_transaction_id",
        "match_type",
        "payment_id",
        "invoice_id",
        "expense_id",
        "reimbursement_id",
        "confirmed",
        "created_at",
      ],
      reconRows.map((m) => [
        m.id,
        m.bankTransactionId,
        m.matchType,
        m.paymentId ?? "",
        m.invoiceId ?? "",
        m.expenseId ?? "",
        m.reimbursementId ?? "",
        m.confirmed ? "yes" : "no",
        m.createdAt.toISOString(),
      ]),
    ),
    "README.txt": buildReadme({ from, to, warnings }),
  };

  const allFiles: Record<string, ZipEntry> = { ...textFiles, ...binaryFiles };
  const zip = buildStoreZip(allFiles);

  return {
    filename: `accountant-pack-${from}_${to}.zip`,
    zip,
  };
}

function buildReadme({
  from,
  to,
  warnings,
}: {
  from: string;
  to: string;
  warnings: string[];
}) {
  const lines = [
    "Dot + Dash accountant pack",
    `Period: ${from} to ${to}`,
    `Generated: ${new Date().toISOString()}`,
    "",
    "Contents:",
    "  summary/          — P&L, VAT, aged receivables",
    "  invoices.csv      — invoice headers (excl. draft & void, by issue date)",
    "  invoice-line-items.csv",
    "  invoices/         — invoice PDFs",
    "  payments.csv      — cash received (by received_at in period)",
    "  expenses.csv      — spend (excl. pending, by spent_at)",
    "  receipts-index.csv + receipts/ — expense attachments",
    "  reimbursements.csv + reimbursement-items.csv",
    "  dividends.csv     — dividend declarations in period",
    "  bank-transactions.csv + reconciliation-matches.csv",
    "",
    "Basis notes:",
    "  Income is accrual (invoiced by issue date). Payments CSV is cash received.",
    "  Expenses exclude pending email submissions.",
  ];
  if (warnings.length > 0) {
    lines.push("", "Warnings:", ...warnings.map((w) => `  - ${w}`));
  }
  return lines.join("\n");
}

/** Resolve invoice PDF bytes from storage or regenerate (no DB cache update). */
export async function resolveInvoicePdf(
  companyId: string,
  invoiceId: string,
  pdfBlobPath: string | null,
): Promise<Uint8Array> {
  if (pdfBlobPath) {
    try {
      const obj = await getStorage().get(pdfBlobPath);
      return new Uint8Array(obj.body);
    } catch {
      // Fall through to regenerate.
    }
  }

  const detail = await getInvoiceDetail(companyId, invoiceId);
  if (!detail) {
    throw new Error("Invoice not found");
  }

  const company = await getOrCreateCompanySettings(companyId);
  return renderInvoicePdf({
    invoice: detail.invoice,
    client: detail.client,
    lines: detail.lines,
    company,
  });
}

/** Load receipt bytes from private storage. */
export async function loadReceiptBytes(blobPath: string): Promise<Uint8Array> {
  const obj = await getStorage().get(blobPath);
  return new Uint8Array(obj.body);
}

function gbp(pence: number) {
  return (pence / 100).toFixed(2);
}

export function toCsv(headers: string[], rows: string[][]) {
  const esc = (v: string) =>
    /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
  return [headers.join(","), ...rows.map((r) => r.map(esc).join(","))].join("\n");
}

/** Minimal ZIP (store method, no compression). Supports text and binary entries. */
export function buildStoreZip(files: Record<string, ZipEntry>): Uint8Array {
  const encoder = new TextEncoder();
  const parts: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;

  for (const [name, content] of Object.entries(files)) {
    const nameBytes = encoder.encode(name);
    const data =
      typeof content === "string" ? encoder.encode(content) : content;
    const crc = crc32(data);
    const local = new Uint8Array(30 + nameBytes.length);
    const view = new DataView(local.buffer);
    view.setUint32(0, 0x04034b50, true);
    view.setUint16(8, 0, true);
    view.setUint32(14, crc, true);
    view.setUint32(18, data.length, true);
    view.setUint32(22, data.length, true);
    view.setUint16(26, nameBytes.length, true);
    local.set(nameBytes, 30);
    parts.push(local, data);

    const cen = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(cen.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(10, 0, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, data.length, true);
    cv.setUint32(24, data.length, true);
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint32(42, offset, true);
    cen.set(nameBytes, 46);
    central.push(cen);

    offset += local.length + data.length;
  }

  const centralSize = central.reduce((a, c) => a + c.length, 0);
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, central.length, true);
  ev.setUint16(10, central.length, true);
  ev.setUint32(12, centralSize, true);
  ev.setUint32(16, offset, true);

  const total =
    parts.reduce((a, p) => a + p.length, 0) + centralSize + end.length;
  const out = new Uint8Array(total);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  for (const c of central) {
    out.set(c, o);
    o += c.length;
  }
  out.set(end, o);
  return out;
}

/** List entry paths from a store-only ZIP (for tests). */
export function listStoreZipEntries(zip: Uint8Array): string[] {
  const names: string[] = [];
  const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
  let offset = 0;
  while (offset + 30 <= zip.byteLength) {
    if (view.getUint32(offset, true) !== 0x04034b50) break;
    const nameLen = view.getUint16(offset + 26, true);
    const extraLen = view.getUint16(offset + 28, true);
    const compSize = view.getUint32(offset + 18, true);
    const nameStart = offset + 30;
    const nameBytes = zip.subarray(nameStart, nameStart + nameLen);
    names.push(new TextDecoder().decode(nameBytes));
    offset = nameStart + nameLen + extraLen + compSize;
  }
  return names;
}

function crc32(buf: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1;
    }
  }
  return (c ^ 0xffffffff) >>> 0;
}

async function mapWithConcurrency<T>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<void>,
) {
  let index = 0;
  const workers = Array.from(
    { length: Math.min(concurrency, items.length) },
    async () => {
      while (index < items.length) {
        const i = index++;
        await fn(items[i]!);
      }
    },
  );
  await Promise.all(workers);
}

function formatError(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
