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
  recurringInvoices,
  users,
} from "@/db/schema";
import { clientDisplayNameSql } from "@/lib/clients/sql";
import { monthName } from "@/lib/dates";
import { safeFilename } from "@/lib/files";
import { getInvoiceDetail } from "@/lib/invoices/queries";
import { renderInvoicePdfV2 } from "@/lib/invoices/pdf-v2";
import { listRecurringInvoices } from "@/lib/invoices/recurring-queries";
import { lineNetPence } from "@/lib/money";
import {
  getAgedReceivables,
  getProfitAndLoss,
  getVatSummary,
  listOtherIncomeInPeriod,
} from "@/lib/reports/queries";
import { renderVatSummaryPdf } from "@/lib/reports/vat-pdf";
import { getOrCreateCompanySettings } from "@/lib/settings/queries";
import { listShareholders } from "@/lib/shareholders/queries";
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

  const [pnl, vat, aged, otherIncomeRows, company, shareRegister, recurringRows] =
    await Promise.all([
      getProfitAndLoss(companyId, from, to),
      getVatSummary(companyId, from, to),
      getAgedReceivables(companyId),
      listOtherIncomeInPeriod(companyId, from, to),
      getOrCreateCompanySettings(companyId),
      listShareholders(companyId, { includeArchived: true }),
      listRecurringInvoices(companyId),
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
      recurringSchedule: recurringInvoices.name,
    })
    .from(invoices)
    .innerJoin(clients, eq(invoices.clientId, clients.id))
    .leftJoin(orders, eq(invoices.orderId, orders.id))
    .leftJoin(
      recurringInvoices,
      eq(invoices.recurringInvoiceId, recurringInvoices.id),
    )
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
      shareCount: dividendPayouts.shareCount,
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
      bankAccountName: bankAccounts.name,
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
        [
          "other_income",
          gbp(pnl.otherIncomePence),
          "cash — bank date; explained credits only",
        ],
        ["expenses", gbp(pnl.expensePence), "spend date in period, excl. pending"],
        ["profit", gbp(pnl.profitPence), "invoiced + other income − expenses"],
        ["basis", "", pnl.basisNote],
      ],
    ),
    "other-income.csv": toCsv(
      [
        "bank_transaction_id",
        "bank_account",
        "booked_at",
        "amount_gbp",
        "category",
        "note",
        "counterparty",
      ],
      otherIncomeRows.map((r) => [
        r.bankTransactionId,
        r.bankAccountName,
        r.bookedAt,
        gbp(r.amountPence),
        r.incomeCategory ?? "",
        r.note ?? "",
        r.counterparty ?? "",
      ]),
    ),
    "summary/company.csv": toCsv(
      ["metric", "value"],
      buildCompanyCsvRows(company),
    ),
    "summary/cutover.csv": toCsv(
      ["metric", "value", "note"],
      [
        [
          "opening_cash_gbp",
          company.openingCashPence != null ? gbp(company.openingCashPence) : "",
          "context only — not in P&L",
        ],
        [
          "opening_cash_as_at",
          company.openingCashAsAt ?? "",
          "spreadsheet migration cutover date",
        ],
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
        "recurring_schedule",
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
        r.recurringSchedule ?? "",
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
      [
        "id",
        "declared_at",
        "shareholder_name",
        "share_count",
        "amount_gbp",
        "notes",
      ],
      dividendRows.map((d) => [
        d.id,
        d.declaredAt,
        d.shareholderName,
        d.shareCount != null ? String(d.shareCount) : "",
        gbp(d.amountPence),
        d.notes ?? "",
      ]),
    ),
    "shareholders.csv": toCsv(
      [
        "id",
        "name",
        "share_count",
        "percent",
        "status",
        "linked_user_email",
      ],
      shareRegister.shareholders.map((s) => [
        s.id,
        s.name,
        String(s.shareCount),
        s.percent != null ? s.percent.toFixed(2) : "",
        s.archivedAt ? "archived" : "active",
        s.userEmail ?? "",
      ]),
    ),
    "recurring-invoices.csv": toCsv(
      [
        "id",
        "name",
        "client",
        "day_of_month",
        "enabled",
        "on_generate",
        "ends_on",
        "occurrence_count",
        "max_occurrences",
        "next_run_on",
        "gross_gbp",
      ],
      recurringRows.map((r) => [
        r.id,
        r.name,
        r.clientName,
        String(r.dayOfMonth),
        r.enabled ? "yes" : "no",
        r.onGenerate,
        r.endsOn ?? "",
        String(r.occurrenceCount),
        r.maxOccurrences != null ? String(r.maxOccurrences) : "",
        r.nextRunOn ?? "",
        gbp(r.grossPence),
      ]),
    ),
    "bank-transactions.csv": toCsv(
      [
        "id",
        "bank_account",
        "booked_at",
        "amount_gbp",
        "counterparty",
        "reference",
        "description",
        "spending_category",
        "tags",
      ],
      bankTxRows.map((t) => [
        t.id,
        t.bankAccountName,
        t.bookedAt,
        gbp(t.amountPence),
        t.counterparty ?? "",
        t.reference ?? "",
        t.description ?? "",
        t.spendingCategory ?? "",
        (t.tags ?? []).join("; "),
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
        "income_category",
        "note",
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
        m.incomeCategory ?? "",
        m.note ?? "",
        m.confirmed ? "yes" : "no",
        m.createdAt.toISOString(),
      ]),
    ),
    "README.txt": buildReadme({ from, to, warnings }),
  };

  try {
    binaryFiles["summary/vat.pdf"] = await renderVatSummaryPdf({
      companyName: company.name,
      vatNumber: vat.vatNumber,
      from,
      to,
      vatOnSalesPence: vat.vatOnSalesPence,
      vatOnPurchasesPence: vat.vatOnPurchasesPence,
      netVatPence: vat.netVatPence,
      note: vat.note,
    });
  } catch (e) {
    warnings.push(
      `VAT PDF skipped: ${e instanceof Error ? e.message : String(e)}`,
    );
  }

  const allFiles: Record<string, ZipEntry> = { ...textFiles, ...binaryFiles };
  const zip = buildStoreZip(allFiles);

  return {
    filename: `accountant-pack-${from}_${to}.zip`,
    zip,
  };
}

function buildCompanyCsvRows(company: Awaited<ReturnType<typeof getOrCreateCompanySettings>>) {
  const rows: string[][] = [
    ["entity_type", company.entityType],
    ["trading_name", company.name],
    ["legal_name", company.legalName],
    ["company_number", company.companyNumber ?? ""],
    ["utr", company.utr ?? ""],
    ["vat_registered", company.vatRegistered ? "yes" : "no"],
    ["vat_number", company.vatNumber ?? ""],
    ["email", company.email ?? ""],
    ["address", company.addressLines ?? ""],
    ["financial_year_end_month", monthName(company.financialYearEndMonth)],
    ["invoice_bank_name", company.bankName ?? ""],
    ["invoice_bank_account_name", company.bankAccountName ?? ""],
    ["invoice_sort_code", company.sortCode ?? ""],
    ["invoice_account_number", company.accountNumber ?? ""],
  ];
  if (company.entityType === "limited_company") {
    rows.push([
      "total_shares",
      company.totalShares != null ? String(company.totalShares) : "",
    ]);
  }
  return rows;
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
    "Alfa accountant pack",
    `Period: ${from} to ${to}`,
    `Generated: ${new Date().toISOString()}`,
    "",
    "Contents:",
    "  summary/          — company profile, P&L, VAT, aged receivables, cutover",
    "  invoices.csv      — invoice headers (excl. draft & void, by issue date)",
    "  invoice-line-items.csv",
    "  invoices/         — invoice PDFs",
    "  payments.csv      — cash received (by received_at in period)",
    "  expenses.csv      — spend (excl. pending, by spent_at)",
    "  receipts-index.csv + receipts/ — expense attachments",
    "  reimbursements.csv + reimbursement-items.csv",
    "  dividends.csv     — dividend declarations in period",
    "  shareholders.csv  — share register at export time (not period-filtered)",
    "  recurring-invoices.csv — current schedules (not period-filtered)",
    "  bank-transactions.csv + reconciliation-matches.csv",
    "  other-income.csv   — explained bank credits (cash, by bank date)",
    "",
    "Basis notes:",
    "  Invoiced income is accrual (by issue date). Other income is cash on the bank date.",
    "  Payments CSV is cash received. Expenses exclude pending email submissions.",
    "  Invoices link to recurring schedules via recurring_schedule when generated from one.",
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
  if (pdfBlobPath?.includes(".v2.")) {
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
  return renderInvoicePdfV2({
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
