import "server-only";
import { and, eq, gte, inArray, lte, sql } from "drizzle-orm";
import {
  creditNoteInPack,
  expenseInPack,
  invoiceInPack,
  sharedNote,
} from "@/lib/accountant/record-scope";
import { getDb } from "@/db";
import {
  bankAccounts,
  bankTransactions,
  clients,
  creditNoteLineItems,
  creditNotes,
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
import {
  invoiceCountsInAccounts,
  paymentCountsInAccounts,
} from "@/lib/invoices/accounts-scope";
import { invoiceBalancePence } from "@/lib/invoices/balance";
import { loadOriginalInvoiceDocument } from "@/lib/invoices/original-document";
import { getInvoiceDetail } from "@/lib/invoices/queries";
import { renderCreditNotePdf, renderInvoicePdfV2 } from "@/lib/invoices/pdf-v2";
import { getCreditNoteDetail } from "@/lib/credit-notes/queries";
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
import { csvCell } from "@/lib/csv/write";
import { getStorage } from "@/lib/storage";
import { buildXlsx, type XlsxCell, type XlsxSheet } from "@/lib/xlsx/write";
import { zipStoreStream as zipStream, type ZipEntry } from "@/lib/zip/store";

export { listStoreZipEntries, type ZipEntry } from "@/lib/zip/store";

export type AccountantPackFormat = "csv" | "xlsx";

const FETCH_CONCURRENCY = 5;

export type AccountantPackResult = {
  filename: string;
  stream: ReadableStream<Uint8Array>;
};

/**
 * Stream a period accountant pack (CSVs or an Excel workbook, summary reports,
 * invoice PDFs, receipt files). Queries run before this resolves, so they can still fail the request;
 * files are fetched as the stream is read.
 */
export async function streamAccountantPack({
  companyId,
  from,
  to,
  includeVat = true,
  format = "csv",
  webBase,
}: {
  companyId: string;
  from: string;
  to: string;
  /** VAT summary CSV and PDF. Off when the plan doesn't include VAT export. */
  includeVat?: boolean;
  /** One CSV per table, or every table as a tab of one linked workbook. */
  format?: AccountantPackFormat;
  /** Alfa's address, e.g. `https://alfa.example`. The workbook links each document there too. */
  webBase?: string;
}): Promise<AccountantPackResult> {
  const db = getDb();
  const warnings: string[] = [];

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
      originalDocumentPath: invoices.originalDocumentPath,
      source: invoices.source,
      clientName: clientDisplayNameSql.as("client_name"),
      orderNumber: orders.number,
      recurringInvoiceId: invoices.recurringInvoiceId,
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
        invoiceInPack,
        invoiceCountsInAccounts,
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
            discountPercent: invoiceLineItems.discountPercent,
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
      broughtForward: invoices.broughtForward,
    })
    .from(payments)
    .innerJoin(invoices, eq(payments.invoiceId, invoices.id))
    .where(
      and(
        eq(invoices.companyId, companyId),
        paymentCountsInAccounts,
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
    .leftJoin(clients, eq(expenses.clientId, clients.id))
    .where(
      and(
        eq(expenses.companyId, companyId),
        expenseInPack,
        gte(expenses.spentAt, from),
        lte(expenses.spentAt, to),
      ),
    );

  const reimbPaidOn = sql`(${reimbursements.paidAt} at time zone 'Europe/London')::date`;
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
        gte(reimbPaidOn, from),
        lte(reimbPaidOn, to),
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
      shareholderId: dividendPayouts.shareholderId,
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
      notes: bankTransactions.notes,
      noteSharedWithAccountant: bankTransactions.noteSharedWithAccountant,
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
          .select({ match: reconciliationMatches })
          .from(reconciliationMatches)
          .innerJoin(
            bankTransactions,
            eq(reconciliationMatches.bankTransactionId, bankTransactions.id),
          )
          .innerJoin(bankAccounts, eq(bankTransactions.bankAccountId, bankAccounts.id))
          .where(
            and(
              eq(bankAccounts.companyId, companyId),
              inArray(reconciliationMatches.bankTransactionId, bankTxIds),
            ),
          )
          .then((rows) => rows.map((r) => r.match));

  const creditNoteRows = await db
    .select({
      id: creditNotes.id,
      number: creditNotes.number,
      status: creditNotes.status,
      issueDate: creditNotes.issueDate,
      invoiceId: creditNotes.invoiceId,
      invoiceNumber: invoices.number,
      clientName: clientDisplayNameSql.as("client_name"),
      reason: creditNotes.reason,
      netPence: creditNotes.netPence,
      vatPence: creditNotes.vatPence,
      grossPence: creditNotes.grossPence,
      refundedPence: creditNotes.refundedPence,
      refundedAt: creditNotes.refundedAt,
      refundReference: creditNotes.refundReference,
      broughtForward: invoices.broughtForward,
    })
    .from(creditNotes)
    .innerJoin(invoices, eq(creditNotes.invoiceId, invoices.id))
    .innerJoin(clients, eq(creditNotes.clientId, clients.id))
    .where(
      and(
        eq(creditNotes.companyId, companyId),
        creditNoteInPack,
        gte(creditNotes.issueDate, from),
        lte(creditNotes.issueDate, to),
      ),
    )
    .orderBy(creditNotes.issueDate, creditNotes.number);

  // All brought-forward invoices, whatever the period: open ones explain aged debtors.
  const broughtForwardRows = await db
    .select({
      id: invoices.id,
      number: invoices.number,
      status: invoices.status,
      issueDate: invoices.issueDate,
      dueDate: invoices.dueDate,
      netPence: invoices.netPence,
      vatPence: invoices.vatPence,
      grossPence: invoices.grossPence,
      originalDocumentPath: invoices.originalDocumentPath,
      clientName: clientDisplayNameSql.as("client_name"),
      paidPence: sql<number>`coalesce((select sum(p.amount_pence) from payments p where p.invoice_id = ${invoices.id}), 0)`.mapWith(Number),
      creditedPence: sql<number>`coalesce((select sum(c.gross_pence) from credit_notes c where c.invoice_id = ${invoices.id} and c.status = 'issued'), 0)`.mapWith(Number),
      refundedPence: sql<number>`coalesce((select sum(c.refunded_pence) from credit_notes c where c.invoice_id = ${invoices.id} and c.status = 'issued'), 0)`.mapWith(Number),
    })
    .from(invoices)
    .innerJoin(clients, eq(invoices.clientId, clients.id))
    .where(
      and(
        eq(invoices.companyId, companyId),
        eq(invoices.broughtForward, true),
        invoiceInPack,
      ),
    )
    .orderBy(invoices.issueDate, invoices.number);
  const broughtForwardTableRows = broughtForwardRows.map((r) => ({
    ...r,
    balancePence: invoiceBalancePence(r),
  }));
  const openBroughtForward = broughtForwardTableRows.filter((r) => r.balancePence > 0);

  const creditNoteIds = creditNoteRows.map((r) => r.id);
  const creditNoteLineRows =
    creditNoteIds.length === 0
      ? []
      : await db
          .select()
          .from(creditNoteLineItems)
          .where(inArray(creditNoteLineItems.creditNoteId, creditNoteIds))
          .orderBy(creditNoteLineItems.position);
  const creditNoteNumberById = new Map(creditNoteRows.map((r) => [r.id, r.number]));

  const usedDocumentPaths = new Set<string>();
  const broughtForwardDocuments = broughtForwardRows
    .filter((row) => row.originalDocumentPath)
    .map((row) => ({
      row,
      zipPath: uniqueZipPath(
        `reference/brought-forward-documents/${safeFilename(`${row.number}.pdf`)}`,
        usedDocumentPaths,
      ),
    }));
  const broughtForwardDocumentById = new Map(
    broughtForwardDocuments.map((d) => [d.row.id, d.zipPath]),
  );

  const usedReceiptPaths = new Set<string>();
  const receiptFiles = receiptRows.map((receipt) => ({
    receipt,
    zipPath: uniqueZipPath(
      `receipts/${receipt.expenseId}/${safeFilename(receipt.filename)}`,
      usedReceiptPaths,
    ),
  }));
  const receiptFilesByExpense = Map.groupBy(receiptFiles, (f) => f.receipt.expenseId);

  // Paths written to the zip, so links only point at files that are there.
  const writtenFiles = new Set<string>();
  const receiptSizes = new Map<string, number>();

  const invoiceIdsInPeriod = new Set(invIds);
  const invoiceTable = (invoiceId: string) =>
    invoiceIdsInPeriod.has(invoiceId) ? "invoices.csv" : "reference/brought-forward-invoices.csv";
  const fileLink = (text: string, path: string | undefined): Cell =>
    path && writtenFiles.has(path) ? { text, link: { file: path } } : text;
  const tableName = (path: string) => (format === "xlsx" ? `the ${SHEETS[path]} tab` : path);

  // Workbook only: each document in Alfa too, for when the file beside the workbook won't open
  // (Excel for Mac asks for access to it first).
  const webLinks = format === "xlsx" && webBase !== undefined;
  const onlineHeader = webLinks ? ["open_in_alfa"] : [];
  const online = (path: string | null): Cell[] =>
    !webLinks ? [] : [path ? { text: "Open in Alfa", link: { url: `${webBase}${path}` } } : ""];

  // Workbook only: columns linking each record to the records tied to it, in both directions.
  const xl = <T,>(...items: T[]): T[] => (format === "xlsx" ? items : []);
  const paymentsByInvoice = Map.groupBy(payRows, (p) => p.invoiceId);
  const linesByInvoice = Map.groupBy(lineRows, (l) => l.invoiceId);
  const creditNotesByInvoice = Map.groupBy(creditNoteRows, (c) => c.invoiceId);
  const linesByCreditNote = Map.groupBy(creditNoteLineRows, (l) => l.creditNoteId);
  const itemsByReimbursement = Map.groupBy(allReimbItems, (i) => i.reimbursementId);
  const reimbursementByExpense = new Map(allReimbItems.map((i) => [i.expenseId, i.reimbursementId]));
  const invoicesBySchedule = Map.groupBy(invRows, (r) => r.recurringInvoiceId);
  const dividendsByShareholder = Map.groupBy(dividendRows, (d) => d.shareholderId);
  const matchesByBankTx = Map.groupBy(reconRows, (m) => m.bankTransactionId);
  const bankTxFor = (recordId: (m: (typeof reconRows)[number]) => string | null) =>
    new Map(
      reconRows.flatMap((m) => {
        const id = recordId(m);
        return id ? [[id, m.bankTransactionId] as const] : [];
      }),
    );
  const bankTxByExpense = bankTxFor((m) => m.expenseId);
  const bankTxByPayment = bankTxFor((m) => m.paymentId);
  const bankTxByReimbursement = bankTxFor((m) => m.reimbursementId);
  const bankTxById = new Map(bankTxRows.map((t) => [t.id, t]));
  const expenseById = new Map(expRows.map((r) => [r.expense.id, r.expense]));
  const paymentById = new Map(payRows.map((p) => [p.id, p]));
  const reimbursementById = new Map(reimbRows.map((r) => [r.id, r]));

  /** "3 payments", linking to the first of them; blank when there are none. */
  const countLink = (
    count: number | undefined,
    singular: string,
    plural: string,
    table: string,
    firstKey: string | undefined,
  ): Cell =>
    count && firstKey
      ? rowLink(`${count} ${count === 1 ? singular : plural}`, table, firstKey)
      : "";

  const bankTxCell = (bankTxId: string | undefined): Cell => {
    if (!bankTxId) return "";
    const t = bankTxById.get(bankTxId);
    const label = t ? `${t.bookedAt} ${t.counterparty ?? t.description ?? ""}`.trim() : bankTxId;
    return rowLink(label, "bank-transactions.csv", bankTxId);
  };

  const reimbursementCell = (reimbursementId: string | undefined): Cell => {
    if (!reimbursementId) return "";
    const r = reimbursementById.get(reimbursementId);
    const label = r ? `${r.payeeName || r.payeeEmail}${r.reference ? ` (${r.reference})` : ""}` : reimbursementId;
    return rowLink(label, "reimbursements.csv", reimbursementId);
  };

  /** What a bank transaction was reconciled to, linking to that record. */
  const matchedToCell = (bankTxId: string): Cell => {
    const matches = matchesByBankTx.get(bankTxId) ?? [];
    if (matches.length === 0) return "";
    if (matches.length > 1) {
      return rowLink(`${matches.length} matches`, "reconciliation-matches.csv", matches[0].id);
    }
    const [m] = matches;
    if (m.matchType === "expense" && m.expenseId) {
      const expense = expenseById.get(m.expenseId);
      return rowLink(`Expense: ${expense?.description ?? "not in this pack"}`, "expenses.csv", m.expenseId);
    }
    if (m.matchType === "invoice_payment" && m.paymentId) {
      const payment = paymentById.get(m.paymentId);
      return rowLink(
        `Payment for ${payment?.invoiceNumber ?? "an invoice"}`,
        "payments.csv",
        m.paymentId,
      );
    }
    if (m.matchType === "invoice_payment" && m.invoiceId) {
      return rowLink(
        `Invoice ${invNumberById.get(m.invoiceId) ?? ""}`.trim(),
        invoiceTable(m.invoiceId),
        m.invoiceId,
      );
    }
    if (m.matchType === "reimbursement" && m.reimbursementId) {
      const label = reimbursementCell(m.reimbursementId);
      return rowLink(`Reimbursement: ${cellText(label)}`, "reimbursements.csv", m.reimbursementId);
    }
    if (m.matchType === "other_income") {
      return rowLink(
        `Other income${m.incomeCategory ? `: ${m.incomeCategory}` : ""}`,
        "other-income.csv",
        bankTxId,
      );
    }
    return rowLink(MATCH_LABELS[m.matchType], "reconciliation-matches.csv", m.id);
  };

  const broughtForwardTable = (path: string, rows: typeof broughtForwardTableRows): PackTable => ({
    path,
    key: 0,
    headers: [
      "id",
      "number",
      "client",
      "status",
      "issue_date",
      "due_date",
      "net_gbp",
      "vat_gbp",
      "gross_gbp",
      "balance_gbp",
      ...xl("payments", "credit_notes"),
      ...onlineHeader,
    ],
    rows: rows.map((r) => [
      r.id,
      fileLink(r.number, broughtForwardDocumentById.get(r.id)),
      r.clientName,
      r.status,
      r.issueDate ?? "",
      r.dueDate ?? "",
      money(r.netPence),
      money(r.vatPence),
      money(r.grossPence),
      money(r.balancePence),
      ...xl(invoicePaymentsCell(r.id), invoiceCreditNotesCell(r.id)),
      ...online(`/api/invoices/${r.id}/pdf`),
    ]),
  });

  function invoicePaymentsCell(invoiceId: string) {
    const rows = paymentsByInvoice.get(invoiceId);
    return countLink(rows?.length, "payment", "payments", "payments.csv", rows?.[0].id);
  }

  function invoiceCreditNotesCell(invoiceId: string) {
    const rows = creditNotesByInvoice.get(invoiceId);
    return countLink(rows?.length, "credit note", "credit notes", "credit-notes.csv", rows?.[0].id);
  }

  // Built after the files are fetched: links and the receipt index depend on the results.
  const buildTables = (): PackTable[] => [
    {
      path: "summary/company.csv",
      headers: ["metric", "value"],
      rows: buildCompanyCsvRows(company),
    },
    {
      path: "summary/pnl.csv",
      headers: ["metric", "value_gbp", "note"],
      rows: [
        [
          "income_invoiced",
          money(pnl.incomePence),
          "accrual — issue date in period, net of credit notes",
        ],
        [
          "credit_notes",
          money(pnl.creditNotePence),
          "already deducted from income_invoiced — credit note issue date in period",
        ],
        [
          "other_income",
          money(pnl.otherIncomePence),
          "cash — bank date; explained credits only",
        ],
        ["expenses", money(pnl.expensePence), "spend date in period, excl. pending"],
        ["profit", money(pnl.profitPence), "invoiced + other income − expenses"],
        ["basis", "", pnl.basisNote],
      ],
    },
    {
      path: "summary/vat.csv",
      headers: ["metric", "value_gbp", "note"],
      rows: [
        ["vat_on_sales", money(vat.vatOnSalesPence), "net of credit notes"],
        ["credit_note_vat", money(vat.creditNoteVatPence), "already deducted from vat_on_sales"],
        ["vat_on_purchases", money(vat.vatOnPurchasesPence), ""],
        ["net_vat", money(vat.netVatPence), vat.note],
      ],
    },
    {
      path: "summary/aged-receivables.csv",
      headers: ["bucket", "amount_gbp"],
      rows: [
        ["current", formattedMoney(aged.current)],
        ["1_30_days", formattedMoney(aged.d30)],
        ["31_60_days", formattedMoney(aged.d60)],
        ["61_plus_days", formattedMoney(aged.d90)],
      ],
    },
    {
      path: "summary/cutover.csv",
      headers: ["metric", "value", "note"],
      rows: [
        [
          "opening_cash_gbp",
          company.openingCashPence != null ? money(company.openingCashPence) : "",
          "context only — not in P&L",
        ],
        [
          "opening_cash_as_at",
          company.openingCashAsAt ?? "",
          "spreadsheet migration cutover date",
        ],
        [
          "invoice_cutover_date",
          company.invoiceCutoverDate ?? "",
          "imported invoices before this are brought forward, outside P&L and VAT",
        ],
        [
          "brought_forward_invoices",
          String(broughtForwardTableRows.length),
          {
            text: `see ${tableName("reference/brought-forward-invoices.csv")}`,
            link: { table: "reference/brought-forward-invoices.csv" },
          },
        ],
        [
          "open_brought_forward_gbp",
          money(openBroughtForward.reduce((acc, r) => acc + r.balancePence, 0)),
          {
            text: `included in aged receivables; see ${tableName("reference/open-brought-forward.csv")}`,
            link: { table: "reference/open-brought-forward.csv" },
          },
        ],
      ],
    },
    {
      path: "invoices.csv",
      key: 0,
      headers: [
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
        ...xl("line_items", "payments", "credit_notes"),
        ...onlineHeader,
      ],
      rows: invRows.map((r) => [
        r.id,
        fileLink(r.number, invoicePdfPath(r.number)),
        r.clientName,
        r.status,
        r.issueDate ?? "",
        r.dueDate ?? "",
        r.orderNumber ?? "",
        r.recurringInvoiceId
          ? rowLink(r.recurringSchedule ?? "", "recurring-invoices.csv", r.recurringInvoiceId)
          : "",
        r.sentAt?.toISOString() ?? "",
        r.paidAt?.toISOString() ?? "",
        money(r.netPence),
        money(r.vatPence),
        money(r.grossPence),
        ...xl(
          countLink(linesByInvoice.get(r.id)?.length, "line", "lines", "invoice-line-items.csv", r.id),
          invoicePaymentsCell(r.id),
          invoiceCreditNotesCell(r.id),
        ),
        ...online(`/api/invoices/${r.id}/pdf`),
      ]),
    },
    {
      path: "invoice-line-items.csv",
      // Links to an invoice's lines land on its first one.
      key: 0,
      headers: [
        "invoice_id",
        "invoice_number",
        "description",
        "quantity",
        "unit_price_gbp",
        "vat_rate",
        "discount_percent",
        "line_net_gbp",
      ],
      rows: lineRows.map((r) => [
        rowLink(r.invoiceId, "invoices.csv", r.invoiceId),
        rowLink(invNumberById.get(r.invoiceId) ?? "", "invoices.csv", r.invoiceId),
        r.description,
        num(r.quantity),
        money(r.unitPricePence),
        num(r.vatRate),
        num(r.discountPercent),
        money(lineNetPence(r)),
      ]),
    },
    {
      path: "credit-notes.csv",
      key: 0,
      headers: [
        "id",
        "number",
        "status",
        "issue_date",
        "invoice_number",
        "client",
        "reason",
        "net_gbp",
        "vat_gbp",
        "gross_gbp",
        "refunded_gbp",
        "refunded_at",
        "refund_reference",
        "on_brought_forward_invoice",
        ...xl("line_items"),
        ...onlineHeader,
      ],
      rows: creditNoteRows.map((r) => [
        r.id,
        r.status === "issued" ? fileLink(r.number, creditNotePdfPath(r.number)) : r.number,
        r.status,
        r.issueDate,
        rowLink(r.invoiceNumber, invoiceTable(r.invoiceId), r.invoiceId),
        r.clientName,
        r.reason,
        money(r.netPence),
        money(r.vatPence),
        money(r.grossPence),
        money(r.refundedPence),
        r.refundedAt ?? "",
        r.refundReference ?? "",
        r.broughtForward ? "yes" : "no",
        ...xl(
          countLink(
            linesByCreditNote.get(r.id)?.length,
            "line",
            "lines",
            "credit-note-line-items.csv",
            r.id,
          ),
        ),
        ...online(r.status === "issued" ? `/api/credit-notes/${r.id}/pdf` : null),
      ]),
    },
    {
      path: "credit-note-line-items.csv",
      key: 0,
      headers: [
        "credit_note_id",
        "credit_note_number",
        "description",
        "quantity",
        "unit_price_gbp",
        "vat_rate",
        "discount_percent",
        "line_net_gbp",
      ],
      rows: creditNoteLineRows.map((r) => [
        rowLink(r.creditNoteId, "credit-notes.csv", r.creditNoteId),
        rowLink(creditNoteNumberById.get(r.creditNoteId) ?? "", "credit-notes.csv", r.creditNoteId),
        r.description,
        num(r.quantity),
        money(r.unitPricePence),
        num(r.vatRate),
        num(r.discountPercent),
        money(lineNetPence(r)),
      ]),
    },
    {
      path: "payments.csv",
      key: 0,
      headers: [
        "id",
        "invoice_id",
        "invoice_number",
        "amount_gbp",
        "method",
        "reference",
        "received_at",
        "on_brought_forward_invoice",
        ...xl("bank_transaction"),
      ],
      rows: payRows.map((r) => [
        r.id,
        rowLink(r.invoiceId, invoiceTable(r.invoiceId), r.invoiceId),
        rowLink(r.invoiceNumber, invoiceTable(r.invoiceId), r.invoiceId),
        money(r.amountPence),
        r.method ?? "",
        r.reference ?? "",
        r.receivedAt.toISOString(),
        r.broughtForward ? "yes" : "no",
        ...xl(bankTxCell(bankTxByPayment.get(r.id))),
      ]),
    },
    {
      path: "expenses.csv",
      key: 0,
      headers: [
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
        "notes",
        // The CSV has receipts-index.csv for this; the workbook links straight to the file.
        ...xl("receipt", "bank_transaction", "reimbursement"),
        ...onlineHeader,
      ],
      rows: expRows.map((r) => [
        r.expense.id,
        r.expense.description,
        r.expense.category ?? "",
        r.expense.spentAt ?? "",
        money(r.expense.amountPence),
        money(r.expense.vatPence),
        r.expense.status,
        r.expense.source,
        r.expense.billable ? "yes" : "no",
        r.billableClientName ?? "",
        r.paidByEmail ?? "",
        r.expense.mileageMiles != null ? num(r.expense.mileageMiles) : "",
        r.expense.mileageRatePence != null ? num(r.expense.mileageRatePence) : "",
        sharedNote(r.expense) ?? "",
        ...xl(
          receiptCell(receiptFilesByExpense.get(r.expense.id)),
          bankTxCell(bankTxByExpense.get(r.expense.id)),
          reimbursementCell(reimbursementByExpense.get(r.expense.id)),
        ),
        // Several receipts are each linked on the Receipts tab.
        ...online(onlyReceiptPath(receiptFilesByExpense.get(r.expense.id))),
      ]),
    },
    {
      path: "receipts-index.csv",
      key: 0,
      headers: [
        "id",
        "expense_id",
        "filename",
        "content_type",
        "size_bytes",
        "uploaded_at",
        "zip_path",
        ...onlineHeader,
      ],
      rows: receiptFiles.map(({ receipt, zipPath }) => {
        const written = writtenFiles.has(zipPath);
        const size = receipt.sizeBytes ?? (written ? receiptSizes.get(receipt.id) : undefined);
        return [
          receipt.id,
          rowLink(receipt.expenseId, "expenses.csv", receipt.expenseId),
          receipt.filename,
          receipt.contentType ?? "",
          size != null ? num(size) : "",
          receipt.uploadedAt.toISOString(),
          written ? fileLink(zipPath, zipPath) : "MISSING",
          ...online(receiptPath(receipt.id)),
        ];
      }),
    },
    {
      path: "reimbursements.csv",
      key: 0,
      headers: [
        "id",
        "payee",
        "status",
        "reference",
        "total_gbp",
        "created_at",
        "paid_at",
        ...xl("items", "bank_transaction"),
      ],
      rows: reimbRows.map((r) => [
        r.id,
        r.payeeName || r.payeeEmail,
        r.status,
        r.reference ?? "",
        money(r.totalPence),
        r.createdAt.toISOString(),
        r.paidAt?.toISOString() ?? "",
        ...xl(
          countLink(
            itemsByReimbursement.get(r.id)?.length,
            "item",
            "items",
            "reimbursement-items.csv",
            r.id,
          ),
          bankTxCell(bankTxByReimbursement.get(r.id)),
        ),
      ]),
    },
    {
      path: "reimbursement-items.csv",
      key: 0,
      headers: ["reimbursement_id", "expense_id", "description", "amount_gbp"],
      rows: allReimbItems.map((r) => [
        rowLink(r.reimbursementId, "reimbursements.csv", r.reimbursementId),
        rowLink(r.expenseId, "expenses.csv", r.expenseId),
        r.description,
        money(r.amountPence),
      ]),
    },
    {
      path: "bank-transactions.csv",
      key: 0,
      headers: [
        "id",
        "bank_account",
        "booked_at",
        "amount_gbp",
        "counterparty",
        "reference",
        "description",
        "spending_category",
        "tags",
        "notes",
        ...xl("matched_to"),
      ],
      rows: bankTxRows.map((t) => [
        t.id,
        t.bankAccountName,
        t.bookedAt,
        money(t.amountPence),
        t.counterparty ?? "",
        t.reference ?? "",
        t.description ?? "",
        t.spendingCategory ?? "",
        (t.tags ?? []).join("; "),
        sharedNote(t) ?? "",
        ...xl(matchedToCell(t.id)),
      ]),
    },
    {
      path: "reconciliation-matches.csv",
      key: 0,
      headers: [
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
      rows: reconRows.map((m) => [
        m.id,
        rowLink(m.bankTransactionId, "bank-transactions.csv", m.bankTransactionId),
        m.matchType,
        m.paymentId ? rowLink(m.paymentId, "payments.csv", m.paymentId) : "",
        m.invoiceId ? rowLink(m.invoiceId, invoiceTable(m.invoiceId), m.invoiceId) : "",
        m.expenseId ? rowLink(m.expenseId, "expenses.csv", m.expenseId) : "",
        m.reimbursementId
          ? rowLink(m.reimbursementId, "reimbursements.csv", m.reimbursementId)
          : "",
        m.incomeCategory ?? "",
        m.note ?? "",
        m.confirmed ? "yes" : "no",
        m.createdAt.toISOString(),
      ]),
    },
    {
      path: "other-income.csv",
      key: 0,
      headers: [
        "bank_transaction_id",
        "bank_account",
        "booked_at",
        "amount_gbp",
        "category",
        "note",
        "counterparty",
      ],
      rows: otherIncomeRows.map((r) => [
        rowLink(r.bankTransactionId, "bank-transactions.csv", r.bankTransactionId),
        r.bankAccountName,
        r.bookedAt,
        money(r.amountPence),
        r.incomeCategory ?? "",
        r.note ?? "",
        r.counterparty ?? "",
      ]),
    },
    {
      path: "dividends.csv",
      key: 0,
      headers: [
        "id",
        "declared_at",
        "shareholder_name",
        "share_count",
        "amount_gbp",
        "notes",
      ],
      rows: dividendRows.map((d) => [
        d.id,
        d.declaredAt,
        d.shareholderId
          ? rowLink(d.shareholderName, "shareholders.csv", d.shareholderId)
          : d.shareholderName,
        d.shareCount != null ? num(d.shareCount) : "",
        money(d.amountPence),
        d.notes ?? "",
      ]),
    },
    {
      path: "shareholders.csv",
      key: 0,
      headers: [
        "id",
        "name",
        "share_count",
        "percent",
        "status",
        "linked_user_email",
        ...xl("dividends"),
      ],
      rows: shareRegister.shareholders.map((s) => [
        s.id,
        s.name,
        num(s.shareCount),
        s.percent != null ? num(Number(s.percent.toFixed(2)), s.percent.toFixed(2)) : "",
        s.archivedAt ? "archived" : "active",
        s.userEmail ?? "",
        ...xl(
          countLink(
            dividendsByShareholder.get(s.id)?.length,
            "dividend",
            "dividends",
            "dividends.csv",
            dividendsByShareholder.get(s.id)?.[0].id,
          ),
        ),
      ]),
    },
    {
      path: "recurring-invoices.csv",
      key: 0,
      headers: [
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
        ...xl("invoices"),
      ],
      rows: recurringRows.map((r) => [
        r.id,
        r.name,
        r.clientName,
        num(r.dayOfMonth),
        r.enabled ? "yes" : "no",
        r.onGenerate,
        r.endsOn ?? "",
        num(r.occurrenceCount),
        r.maxOccurrences != null ? num(r.maxOccurrences) : "",
        r.nextRunOn ?? "",
        money(r.grossPence),
        ...xl(
          countLink(
            invoicesBySchedule.get(r.id)?.length,
            "invoice",
            "invoices",
            "invoices.csv",
            invoicesBySchedule.get(r.id)?.[0].id,
          ),
        ),
      ]),
    },
    broughtForwardTable("reference/brought-forward-invoices.csv", broughtForwardTableRows),
    {
      ...broughtForwardTable("reference/open-brought-forward.csv", openBroughtForward),
      // The full brought-forward tab has the row; this one only lists the open ones.
      key: undefined,
    },
  ];

  /** One cell per expense: the receipt file itself, or its rows on the receipts tab. */
  function receiptCell(files: typeof receiptFiles | undefined): Cell {
    if (!files || files.length === 0) return "";
    const [first] = files;
    if (files.length === 1 && writtenFiles.has(first.zipPath)) {
      return fileLink("receipt", first.zipPath);
    }
    const text = files.length === 1 ? "1 receipt (missing)" : `${files.length} receipts`;
    return rowLink(text, "receipts-index.csv", first.receipt.id);
  }

  function onlyReceiptPath(files: typeof receiptFiles | undefined) {
    return files?.length === 1 ? receiptPath(files[0].receipt.id) : null;
  }

  async function* packEntries(): AsyncGenerator<[string, ZipEntry]> {
    yield* fetchInBatches(
      creditNoteRows.filter((r) => r.status === "issued"),
      writtenFiles,
      async (note) => {
        const pdfPath = creditNotePdfPath(note.number);
        try {
          const detail = await getCreditNoteDetail(companyId, note.id);
          if (!detail) throw new Error("not found");
          const bytes = await renderCreditNotePdf({
            creditNote: detail.creditNote,
            invoiceNumber: detail.invoice.number,
            client: detail.client,
            lines: detail.lines,
            company,
          });
          return [pdfPath, bytes];
        } catch (err) {
          warnings.push(
            `Credit note PDF missing: ${note.number} (${note.id}) — ${formatError(err)}`,
          );
          return null;
        }
      },
    );

    yield* fetchInBatches(invRows, writtenFiles, async (inv) => {
      const pdfPath = invoicePdfPath(inv.number);
      try {
        const original = await loadOriginalInvoiceDocument(inv);
        if (original) return [pdfPath, original];
        if (inv.originalDocumentPath) {
          warnings.push(`Original invoice missing, using a generated record: ${inv.number} (${inv.id})`);
        }
        return [
          pdfPath,
          // An import's cached PDF could predate the record marking.
          await resolveInvoicePdf(
            companyId,
            inv.id,
            inv.source === "import" ? null : inv.pdfBlobPath,
          ),
        ];
      } catch (err) {
        warnings.push(
          `Invoice PDF missing: ${inv.number} (${inv.id}) — ${formatError(err)}`,
        );
        return null;
      }
    });

    yield* fetchInBatches(broughtForwardDocuments, writtenFiles, async ({ row, zipPath }) => {
      const bytes = await loadOriginalInvoiceDocument(row);
      if (bytes) return [zipPath, bytes];
      warnings.push(`Original invoice missing: ${row.number} (${row.id})`);
      return null;
    });

    yield* fetchInBatches(receiptFiles, writtenFiles, async ({ receipt, zipPath }) => {
      try {
        const bytes = await loadReceiptBytes(receipt.blobPath);
        receiptSizes.set(receipt.id, bytes.byteLength);
        return [zipPath, bytes];
      } catch (err) {
        warnings.push(
          `Receipt file missing: ${receipt.filename} (${receipt.id}) — ${formatError(err)}`,
        );
        return null;
      }
    });

    if (includeVat) {
      let vatPdf: Uint8Array | null = null;
      try {
        vatPdf = await renderVatSummaryPdf({
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
      if (vatPdf) yield ["summary/vat.pdf", vatPdf];
    }

    const tables = buildTables().filter(
      (t) => includeVat || t.path !== "summary/vat.csv",
    );
    if (format === "xlsx") {
      yield [WORKBOOK_PATH, await buildXlsx(toSheets(tables))];
    } else {
      for (const t of tables) {
        yield [t.path, toCsv(t.headers, t.rows.map((r) => r.map(cellText)))];
      }
    }

    // Last, so it can list every warning from the files above.
    yield ["README.txt", buildReadme({ from, to, warnings, includeVat, format, webLinks })];
  }

  return {
    filename: `accountant-pack-${from}_${to}${format === "xlsx" ? "-excel" : ""}.zip`,
    stream: zipStoreStream(packEntries()),
  };
}

/**
 * Fetch a batch at a time, so a large pack only holds one batch in memory.
 * Adds each path to `written` as it goes into the zip.
 */
async function* fetchInBatches<T>(
  items: readonly T[],
  written: Set<string>,
  fetchFile: (item: T) => Promise<[string, Uint8Array] | null>,
): AsyncGenerator<[string, ZipEntry]> {
  for (let i = 0; i < items.length; i += FETCH_CONCURRENCY) {
    const files = await Promise.all(
      items.slice(i, i + FETCH_CONCURRENCY).map(fetchFile),
    );
    for (const file of files) {
      if (!file) continue;
      written.add(file[0]);
      yield file;
    }
  }
}

function invoicePdfPath(number: string) {
  return `invoices/${safeFilename(`${number}.pdf`)}`;
}

/** Alfa's receipt route; images and PDFs show in the browser rather than download. */
function receiptPath(receiptId: string) {
  return `/api/receipts/${receiptId}?inline=1`;
}

function creditNotePdfPath(number: string) {
  return `credit-notes/${safeFilename(`${number}.pdf`)}`;
}

const WORKBOOK_PATH = "accountant-pack.xlsx";

const MATCH_LABELS: Record<(typeof reconciliationMatches.$inferSelect)["matchType"], string> = {
  invoice_payment: "Invoice payment",
  expense: "Expense",
  reimbursement: "Reimbursement",
  other_income: "Other income",
  transfer: "Transfer",
  tax_or_loan: "Tax or loan",
};

/** Tab name for each table, keyed by its CSV path. */
const SHEETS: Record<string, string> = {
  "summary/company.csv": "Company",
  "summary/pnl.csv": "P&L",
  "summary/vat.csv": "VAT",
  "summary/aged-receivables.csv": "Aged receivables",
  "summary/cutover.csv": "Cutover",
  "invoices.csv": "Invoices",
  "invoice-line-items.csv": "Invoice lines",
  "credit-notes.csv": "Credit notes",
  "credit-note-line-items.csv": "Credit note lines",
  "payments.csv": "Payments",
  "expenses.csv": "Expenses",
  "receipts-index.csv": "Receipts",
  "reimbursements.csv": "Reimbursements",
  "reimbursement-items.csv": "Reimbursement items",
  "bank-transactions.csv": "Bank transactions",
  "reconciliation-matches.csv": "Reconciliation",
  "other-income.csv": "Other income",
  "dividends.csv": "Dividends",
  "shareholders.csv": "Shareholders",
  "recurring-invoices.csv": "Recurring invoices",
  "reference/brought-forward-invoices.csv": "Brought forward invoices",
  "reference/open-brought-forward.csv": "Open brought forward",
};

/**
 * A link to the row whose key column holds `key` in another table (its header
 * when there's no key), to a file in the zip, or to a web address.
 */
type Link = { table: string; key?: string } | { file: string } | { url: string };

/** CSVs use `text`; the workbook writes `number` as a number and follows `link`. */
type Cell = string | { text: string; number?: number; money?: boolean; link?: Link };

type PackTable = {
  /** Where the CSV goes in the zip; also the table's id for links. */
  path: string;
  /** Column that identifies a row, for links into this table. */
  key?: number;
  headers: string[];
  rows: Cell[][];
};

function money(pence: number): Cell {
  return { text: gbp(pence), number: pence / 100, money: true };
}

/** A display amount like `£1,234.50`. */
function formattedMoney(display: string): Cell {
  const text = display.replace(/[£,]/g, "");
  return { text, number: Number(text), money: true };
}

function num(value: number, text = String(value)): Cell {
  return { text, number: value };
}

function rowLink(text: string, table: string, key: string): Cell {
  return text ? { text, link: { table, key } } : text;
}

function cellText(cell: Cell): string {
  return typeof cell === "string" ? cell : cell.text;
}

/** One tab per table, with links resolved to row numbers. A link to a row that isn't there is left as text. */
function toSheets(tables: PackTable[]): XlsxSheet[] {
  const rowsByKey = new Map(
    tables.map((t) => {
      const rows = new Map<string, number>();
      if (t.key !== undefined) {
        t.rows.forEach((row, i) => {
          const key = cellText(row[t.key!]);
          if (!rows.has(key)) rows.set(key, i + 1);
        });
      }
      return [t.path, rows];
    }),
  );

  const toCell = (cell: Cell): XlsxCell => {
    if (typeof cell === "string") return cell;
    const value = cell.number ?? cell.text;
    const link = cell.link;
    if (!link) return { value, money: cell.money };
    if (!("table" in link)) return { value, money: cell.money, link };
    const rows = rowsByKey.get(link.table);
    if (!rows) return { value, money: cell.money };
    const row = link.key === undefined ? 0 : rows.get(link.key);
    if (row === undefined) return { value, money: cell.money };
    return { value, money: cell.money, link: { sheet: SHEETS[link.table], row } };
  };

  return tables.map((t) => ({
    name: SHEETS[t.path],
    headers: t.headers.map(headerLabel),
    rows: t.rows.map((r) => r.map(toCell)),
  }));
}

/** Workbook headers where the CSV column name doesn't read well as plain English. */
const HEADER_LABELS: Record<string, string> = {
  metric: "Item",
  bucket: "Age",
  sent_at: "Sent",
  paid_at: "Paid",
  refunded_at: "Refunded",
  received_at: "Received",
  spent_at: "Spent on",
  uploaded_at: "Uploaded",
  created_at: "Created",
  booked_at: "Date",
  declared_at: "Declared on",
  ends_on: "Ends on",
  next_run_on: "Next run on",
  vat_rate: "VAT rate (%)",
  discount_percent: "Discount (%)",
  percent: "Shareholding (%)",
  share_count: "Shares",
  size_bytes: "Size (bytes)",
  content_type: "File type",
  zip_path: "File in zip",
  paid_by_email: "Paid by",
  linked_user_email: "Linked user",
  mileage_miles: "Mileage (miles)",
  mileage_rate_pence: "Mileage rate (pence)",
  on_generate: "When generated",
  occurrence_count: "Invoices so far",
  max_occurrences: "Invoice limit",
  open_in_alfa: "Open in Alfa",
  on_brought_forward_invoice: "On brought forward invoice",
};

const ACRONYMS: Record<string, string> = { id: "ID", vat: "VAT" };

/** `unit_price_gbp` → "Unit price (£)", `invoice_id` → "Invoice ID". */
export function headerLabel(column: string): string {
  const label = HEADER_LABELS[column];
  if (label) return label;
  const words = column.split("_");
  const money = words.at(-1) === "gbp";
  if (money) words.pop();
  const text = words.map((w) => ACRONYMS[w] ?? w).join(" ");
  return `${text.charAt(0).toUpperCase()}${text.slice(1)}${money ? " (£)" : ""}`;
}

/** Suffix a repeated path (`a.jpg`, `a-2.jpg`). Ignores case, as unzipping on macOS and Windows does. */
function uniqueZipPath(path: string, used: Set<string>): string {
  const dot = path.lastIndexOf(".");
  const hasExtension = dot > path.lastIndexOf("/") + 1;
  const stem = hasExtension ? path.slice(0, dot) : path;
  const extension = hasExtension ? path.slice(dot) : "";
  let candidate = path;
  for (let n = 2; used.has(candidate.toLowerCase()); n++) {
    candidate = `${stem}-${n}${extension}`;
  }
  used.add(candidate.toLowerCase());
  return candidate;
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
  includeVat,
  format,
  webLinks,
}: {
  from: string;
  to: string;
  warnings: string[];
  includeVat: boolean;
  format: AccountantPackFormat;
  webLinks: boolean;
}) {
  const vatNote = includeVat ? "" : " (VAT summary needs Essentials or Premium)";
  const contents =
    format === "xlsx"
      ? [
          `  ${WORKBOOK_PATH} — one tab per table:`,
          `    Company, P&L, ${includeVat ? "VAT, " : ""}Aged receivables, Cutover${vatNote}`,
          "    Invoices + Invoice lines — excl. draft & void, by issue date",
          "    Credit notes + Credit note lines — by credit note issue date (incl. void)",
          "    Payments — cash received (by received_at in period)",
          "    Expenses + Receipts — spend (excl. pending, by spent_at) and its attachments",
          "    Reimbursements + Reimbursement items — runs paid in period (by paid_at, excl. unpaid)",
          "    Bank transactions + Reconciliation",
          "    Other income — explained bank credits (cash, by bank date)",
          "    Dividends — dividend declarations in period",
          "    Shareholders — share register at export time (not period-filtered)",
          "    Recurring invoices — current schedules (not period-filtered)",
          "    Brought forward invoices + Open brought forward — imported invoices from before cutover (all dates)",
          "  Each tab is an Excel table you can sort and filter. Linked ids, numbers and counts jump to the",
          "  related row: a bank transaction to what it was reconciled to, an expense to its bank transaction",
          "  and reimbursement, an invoice to its lines, payments and credit notes, and back again.",
          "  Invoice, credit note and receipt links open the file, once this zip is extracted with the",
          "  workbook left beside its folders.",
          "  invoices/         — invoice PDFs",
          "  credit-notes/     — PDFs for issued credit notes",
          "  receipts/         — expense attachments",
          "  reference/        — originals of brought forward invoices",
          ...(includeVat ? ["  summary/vat.pdf   — VAT summary"] : []),
        ]
      : [
          `  summary/          — company profile, P&L, ${includeVat ? "VAT, " : ""}aged receivables, cutover${vatNote}`,
          "  invoices.csv      — invoice headers (excl. draft & void, by issue date)",
          "  invoice-line-items.csv",
          "  invoices/         — invoice PDFs",
          "  credit-notes.csv + credit-note-line-items.csv — by credit note issue date (incl. void)",
          "  credit-notes/     — PDFs for issued credit notes",
          "  payments.csv      — cash received (by received_at in period)",
          "  expenses.csv      — spend (excl. pending, by spent_at)",
          "  receipts-index.csv + receipts/ — expense attachments",
          "  reimbursements.csv + reimbursement-items.csv — runs paid in period (by paid_at, excl. unpaid)",
          "  dividends.csv     — dividend declarations in period",
          "  shareholders.csv  — share register at export time (not period-filtered)",
          "  recurring-invoices.csv — current schedules (not period-filtered)",
          "  bank-transactions.csv + reconciliation-matches.csv",
          "  other-income.csv   — explained bank credits (cash, by bank date)",
          "  reference/        — imported invoices brought forward from before cutover (all dates), with any originals",
        ];
  const name = (path: string) => (format === "xlsx" ? SHEETS[path] : path);
  const column = (header: string) => (format === "xlsx" ? `"${headerLabel(header)}"` : header);
  const lines = [
    "Alfa accountant pack",
    `Period: ${from} to ${to}`,
    `Generated: ${new Date().toISOString()}`,
    "",
    "Contents:",
    ...contents,
    "",
    "Basis notes:",
    "  Invoiced income is accrual (by issue date), less credit notes by their issue date.",
    "  Other income is cash on the bank date.",
    `  ${name("payments.csv")} is cash received. Expenses exclude pending email submissions.`,
    `  Invoices link to recurring schedules via ${column("recurring_schedule")} when generated from one.`,
    `  Imported invoices dated before the cutover are brought forward: excluded from P&L, VAT and ${name("invoices.csv")}, but still in aged receivables.`,
    `  Payments and credit notes on them count from the cutover date onwards, and are flagged ${column("on_brought_forward_invoice")}.`,
    `  The notes column in ${name("expenses.csv")} and ${name("bank-transactions.csv")} only has notes the team chose to share with you.`,
  ];
  if (format === "xlsx") {
    lines.push(
      "",
      "Opening linked files:",
      "  Extract the whole zip first, and keep the workbook in the same folder as invoices/, credit-notes/, receipts/ and reference/.",
      "  Excel for Mac asks for permission the first time you open a linked file. Click Select…, then choose the extracted",
      "  folder rather than the single file, so every file in it opens without asking again.",
      ...(webLinks
        ? [
            `  Or use the ${headerLabel("open_in_alfa")} column, which opens the same document in Alfa in your browser (sign in to Alfa first).`,
          ]
        : []),
    );
  }
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

/** Every cell goes through csvCell, so outside text can't run as a spreadsheet formula. */
export function toCsv(headers: string[], rows: string[][]) {
  return [headers.join(","), ...rows.map((r) => r.map(csvCell).join(","))].join("\n");
}

/** The pack's zip stream; a failure is logged as the accountant pack's. */
export function zipStoreStream(
  entries: AsyncIterable<[string, ZipEntry]>,
): ReadableStream<Uint8Array> {
  return zipStream(entries, "Accountant pack");
}

function formatError(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
