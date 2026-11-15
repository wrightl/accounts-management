import "server-only";
import { and, asc, eq, inArray, isNotNull, ne, or, sql, type SQL } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { getDb } from "@/db";
import {
  bankAccounts,
  bankTransactions,
  clients,
  creditNotes,
  dividendDeclarations,
  dividendPayouts,
  expenseReceipts,
  expenses,
  invoiceLineItems,
  invoiceWriteOffs,
  invoices,
  payments,
  reconciliationMatches,
  reimbursementItems,
  reimbursements,
  users,
  type Company,
} from "@/db/schema";
import {
  creditNoteInPack,
  expenseInPack,
  invoiceInPack,
  sharedNote,
} from "@/lib/accountant/record-scope";
import { clientDisplayNameSql } from "@/lib/clients/sql";
import {
  creditNoteCountsInAccounts,
  invoiceCountsInAccounts,
  paymentCountsInAccounts,
} from "@/lib/invoices/accounts-scope";
import { getCompanySettings } from "@/lib/settings/queries";
import { listShareholders } from "@/lib/shareholders/queries";
import type { PackPeriod } from "@/lib/year-end/period";

/**
 * The one definition of "in the period" for every pack query: a calendar date
 * column (or expression) on or between the period's two dates.
 */
export function dateIn(column: AnyPgColumn | SQL, period: PackPeriod): SQL {
  return sql`(${column} >= ${period.from} and ${column} <= ${period.to})`;
}

/** The UK calendar date of a timestamp column, so it can be compared with the period. */
export function londonDate(column: AnyPgColumn): SQL<string> {
  return sql<string>`(${column} at time zone 'Europe/London')::date`;
}

export type PackPerson = { id: string; name: string };

export type PackBankMatch = {
  bankTransactionId: string;
  bookedAt: string;
  amountPence: number;
  counterparty: string | null;
};

export type PackPayment = {
  id: string;
  invoiceId: string;
  amountPence: number;
  receivedOn: string;
  method: string | null;
  reference: string | null;
  bank: PackBankMatch | null;
};

export type PackInvoice = {
  id: string;
  number: string;
  clientName: string;
  status: string;
  issueDate: string;
  dueDate: string | null;
  netPence: number;
  vatPence: number;
  grossPence: number;
  /** For the PDF in the zip. */
  pdfBlobPath: string | null;
  originalDocumentPath: string | null;
  source: "alfa" | "import";
  lines: string[];
  payments: PackPayment[];
  /** Issued credit notes against it, whenever they were issued. */
  credits: { issueDate: string; grossPence: number; refundedPence: number; refundedAt: string | null }[];
  writeOffs: { writtenOffOn: string; amountPence: number }[];
};

export type PackCreditNote = {
  id: string;
  number: string;
  issueDate: string;
  invoiceNumber: string;
  clientName: string;
  reason: string;
  netPence: number;
  vatPence: number;
  grossPence: number;
};

export type PackReceipt = { id: string; blobPath: string; filename: string };

export type PackExpense = {
  id: string;
  /** The stored reference number, shown as EXP-0001. */
  refNumber: number;
  description: string;
  category: string | null;
  spentAt: string | null;
  amountPence: number;
  vatPence: number;
  status: "recorded" | "reimbursable" | "reimbursed" | "company_paid" | "pending";
  paidByUserId: string | null;
  billable: boolean;
  billableClientName: string | null;
  mileageMiles: number | null;
  mileageRatePence: number | null;
  coversFrom: string | null;
  coversTo: string | null;
  note: string | null;
  createdAt: Date;
  /** The reimbursement run it was paid back in, if any, and when that was paid. */
  reimbursementId: string | null;
  reimbursementPaidOn: string | null;
  bank: PackBankMatch | null;
  receipts: PackReceipt[];
};

export type PackWriteOff = {
  id: string;
  writtenOffOn: string;
  kind: "bank_charges" | "bad_debt";
  amountPence: number;
  note: string | null;
  invoiceNumber: string;
  clientName: string;
};

export type PackMatch = {
  id: string;
  matchType:
    | "invoice_payment"
    | "expense"
    | "reimbursement"
    | "other_income"
    | "transfer"
    | "tax_or_loan"
    | "drawings"
    | "money_put_in"
    | "salary";
  paymentId: string | null;
  invoiceNumber: string | null;
  expenseId: string | null;
  reimbursementId: string | null;
  personUserId: string | null;
  incomeCategory: string | null;
  note: string | null;
};

export type PackBankTransaction = {
  id: string;
  bankAccountId: string;
  bankAccountName: string;
  bookedAt: string;
  amountPence: number;
  counterparty: string | null;
  reference: string | null;
  description: string | null;
  spendingCategory: string | null;
  note: string | null;
  matches: PackMatch[];
};

export type PackBankAccount = {
  id: string;
  name: string;
  openingBalancePence: number | null;
  openingBalanceDate: string | null;
  /** Balance at the close of the day before the period starts; null without an opening balance. */
  startBalancePence: number | null;
  movementPence: number;
  /** Whether Alfa holds any transactions for it, in or out of the period. */
  hasTransactions: boolean;
};

export type PackReimbursement = {
  id: string;
  /** The stored reference number, shown as REIMB-0001. */
  refNumber: number;
  payeeUserId: string;
  reference: string | null;
  totalPence: number;
  paidOn: string;
  bank: PackBankMatch | null;
  expenseIds: string[];
};

export type PackDividend = {
  id: string;
  declaredAt: string;
  shareholderId: string | null;
  shareholderName: string;
  shareCount: number | null;
  amountPence: number;
  notes: string | null;
};

export type PackShareholder = {
  id: string;
  name: string;
  shareCount: number;
  percent: number | null;
  userId: string | null;
};

/** Money from or back to a customer on cash basis. */
export type PackCashReceipt = {
  id: string;
  kind: "payment" | "refund";
  date: string;
  documentNumber: string;
  invoiceNumber: string;
  clientName: string;
  /** Signed: a refund is negative. */
  amountPence: number;
  /** The part of the amount that is not VAT, in proportion to the document. */
  netPence: number;
  method: string | null;
  reference: string | null;
};

export type YearEndData = {
  period: PackPeriod;
  company: Company;
  isLimited: boolean;
  /** "accruals" for a limited company; a sole trader's choice, or null when not yet chosen. */
  basis: "accruals" | "cash" | null;
  people: Map<string, PackPerson>;
  /** Sole trader only. */
  owner: PackPerson | null;
  invoices: PackInvoice[];
  creditNotes: PackCreditNote[];
  /** Every expense the pack mentions, keyed by id: in the period or needed by an outside-period section. */
  expenses: Map<string, PackExpense>;
  writeOffs: PackWriteOff[];
  bankAccounts: PackBankAccount[];
  bankTransactions: PackBankTransaction[];
  reimbursements: PackReimbursement[];
  dividends: PackDividend[];
  shareholders: PackShareholder[];
  totalShares: number | null;
  /** Cash basis only: money received from and refunded to customers in the period. */
  cashReceipts: PackCashReceipt[];
};

function personName(user: { name: string | null; email: string }): string {
  return user.name?.trim() || user.email.split("@")[0] || "Unnamed person";
}

/** Part of `amountPence` that is not VAT, in proportion to a document's net and gross. */
function netShare(amountPence: number, netPence: number, grossPence: number): number {
  return grossPence > 0 ? Math.round((amountPence * netPence) / grossPence) : amountPence;
}

/** The earliest dated record the business holds, for the list of years to offer. */
export async function earliestRecordDate(companyId: string): Promise<string | null> {
  const db = getDb();
  const [[inv], [exp], [bank]] = await Promise.all([
    db
      .select({ d: sql<string | null>`min(${invoices.issueDate})` })
      .from(invoices)
      .where(and(eq(invoices.companyId, companyId), invoiceInPack, invoiceCountsInAccounts)),
    db
      .select({ d: sql<string | null>`min(${expenses.spentAt})` })
      .from(expenses)
      .where(and(eq(expenses.companyId, companyId), expenseInPack)),
    db
      .select({ d: sql<string | null>`min(${bankTransactions.bookedAt})` })
      .from(bankTransactions)
      .innerJoin(bankAccounts, eq(bankTransactions.bankAccountId, bankAccounts.id))
      .where(eq(bankAccounts.companyId, companyId)),
  ]);
  const dates = [inv?.d, exp?.d, bank?.d].filter((d): d is string => Boolean(d));
  return dates.length > 0 ? dates.sort()[0]! : null;
}

/** Every record the pack for `period` is built from. Reads only. */
export async function loadYearEndData(
  companyId: string,
  period: PackPeriod,
): Promise<YearEndData> {
  const db = getDb();
  const company = await getCompanySettings(companyId);
  const isLimited = company.entityType === "limited_company";
  const basis = isLimited ? "accruals" : company.accountingBasis;

  const memberRows = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      role: users.role,
      createdAt: users.createdAt,
    })
    .from(users)
    .where(eq(users.companyId, companyId))
    .orderBy(asc(users.createdAt));
  const people = new Map<string, PackPerson>(
    memberRows.map((u) => [u.id, { id: u.id, name: personName(u) }]),
  );
  const ownerId = isLimited
    ? null
    : (memberRows.find((u) => u.id === company.ownerUserId)?.id ??
      memberRows.find((u) => u.role === "admin")?.id ??
      null);
  const owner = ownerId
    ? { id: ownerId, name: company.legalName.trim() || people.get(ownerId)!.name }
    : null;

  // --- Sales ---------------------------------------------------------------

  const invoiceRows = await db
    .select({
      id: invoices.id,
      number: invoices.number,
      status: invoices.status,
      issueDate: invoices.issueDate,
      dueDate: invoices.dueDate,
      netPence: invoices.netPence,
      vatPence: invoices.vatPence,
      grossPence: invoices.grossPence,
      clientName: clientDisplayNameSql.as("client_name"),
      pdfBlobPath: invoices.pdfBlobPath,
      originalDocumentPath: invoices.originalDocumentPath,
      source: invoices.source,
    })
    .from(invoices)
    .innerJoin(clients, eq(invoices.clientId, clients.id))
    .where(
      and(
        eq(invoices.companyId, companyId),
        invoiceInPack,
        invoiceCountsInAccounts,
        dateIn(invoices.issueDate, period),
      ),
    )
    .orderBy(asc(invoices.issueDate), asc(invoices.number));
  const invoiceIds = invoiceRows.map((r) => r.id);

  const receivedOn = londonDate(payments.receivedAt);
  const [lineRows, paymentRows, creditRows, invoiceWriteOffRows] =
    invoiceIds.length === 0
      ? [[], [], [], []]
      : await Promise.all([
          db
            .select({
              invoiceId: invoiceLineItems.invoiceId,
              description: invoiceLineItems.description,
            })
            .from(invoiceLineItems)
            .innerJoin(invoices, eq(invoiceLineItems.invoiceId, invoices.id))
            .where(
              and(eq(invoices.companyId, companyId), inArray(invoiceLineItems.invoiceId, invoiceIds)),
            )
            .orderBy(asc(invoiceLineItems.position)),
          db
            .select({
              id: payments.id,
              invoiceId: payments.invoiceId,
              amountPence: payments.amountPence,
              receivedOn,
              method: payments.method,
              reference: payments.reference,
            })
            .from(payments)
            .innerJoin(invoices, eq(payments.invoiceId, invoices.id))
            .where(and(eq(invoices.companyId, companyId), inArray(payments.invoiceId, invoiceIds)))
            .orderBy(asc(payments.receivedAt)),
          db
            .select({
              invoiceId: creditNotes.invoiceId,
              issueDate: creditNotes.issueDate,
              grossPence: creditNotes.grossPence,
              refundedPence: creditNotes.refundedPence,
              refundedAt: creditNotes.refundedAt,
            })
            .from(creditNotes)
            .where(
              and(
                eq(creditNotes.companyId, companyId),
                eq(creditNotes.status, "issued"),
                inArray(creditNotes.invoiceId, invoiceIds),
              ),
            ),
          db
            .select({
              invoiceId: invoiceWriteOffs.invoiceId,
              writtenOffOn: invoiceWriteOffs.writtenOffOn,
              amountPence: invoiceWriteOffs.amountPence,
            })
            .from(invoiceWriteOffs)
            .where(
              and(
                eq(invoiceWriteOffs.companyId, companyId),
                inArray(invoiceWriteOffs.invoiceId, invoiceIds),
              ),
            ),
        ]);

  const paymentBank = await bankMatchesFor(
    companyId,
    reconciliationMatches.paymentId,
    paymentRows.map((p) => p.id),
  );
  const linesByInvoice = Map.groupBy(lineRows, (l) => l.invoiceId);
  const paymentsByInvoice = Map.groupBy(paymentRows, (p) => p.invoiceId);
  const creditsByInvoice = Map.groupBy(creditRows, (c) => c.invoiceId);
  const writeOffsByInvoice = Map.groupBy(invoiceWriteOffRows, (w) => w.invoiceId);

  const packInvoices: PackInvoice[] = invoiceRows.map((r) => ({
    ...r,
    issueDate: r.issueDate!,
    lines: (linesByInvoice.get(r.id) ?? []).map((l) => l.description),
    payments: (paymentsByInvoice.get(r.id) ?? []).map((p) => ({
      ...p,
      bank: paymentBank.get(p.id) ?? null,
    })),
    credits: creditsByInvoice.get(r.id) ?? [],
    writeOffs: writeOffsByInvoice.get(r.id) ?? [],
  }));

  const creditNoteRows = await db
    .select({
      id: creditNotes.id,
      number: creditNotes.number,
      issueDate: creditNotes.issueDate,
      invoiceNumber: invoices.number,
      clientName: clientDisplayNameSql.as("client_name"),
      reason: creditNotes.reason,
      netPence: creditNotes.netPence,
      vatPence: creditNotes.vatPence,
      grossPence: creditNotes.grossPence,
    })
    .from(creditNotes)
    .innerJoin(
      invoices,
      and(eq(creditNotes.invoiceId, invoices.id), eq(invoices.companyId, companyId)),
    )
    .innerJoin(clients, eq(creditNotes.clientId, clients.id))
    .where(
      and(
        eq(creditNotes.companyId, companyId),
        eq(creditNotes.status, "issued"),
        creditNoteInPack,
        dateIn(creditNotes.issueDate, period),
      ),
    )
    .orderBy(asc(creditNotes.issueDate), asc(creditNotes.number));

  const writeOffRows = await db
    .select({
      id: invoiceWriteOffs.id,
      writtenOffOn: invoiceWriteOffs.writtenOffOn,
      kind: invoiceWriteOffs.kind,
      amountPence: invoiceWriteOffs.amountPence,
      note: invoiceWriteOffs.note,
      invoiceNumber: invoices.number,
      clientName: clientDisplayNameSql.as("client_name"),
    })
    .from(invoiceWriteOffs)
    .innerJoin(
      invoices,
      and(eq(invoiceWriteOffs.invoiceId, invoices.id), eq(invoices.companyId, companyId)),
    )
    .innerJoin(clients, eq(invoices.clientId, clients.id))
    .where(
      and(
        eq(invoiceWriteOffs.companyId, companyId),
        dateIn(invoiceWriteOffs.writtenOffOn, period),
      ),
    )
    .orderBy(asc(invoiceWriteOffs.writtenOffOn), asc(invoices.number));

  // --- Bank ----------------------------------------------------------------

  const accountRows = await db
    .select({
      id: bankAccounts.id,
      name: bankAccounts.name,
      openingBalancePence: bankAccounts.openingBalancePence,
      openingBalanceDate: bankAccounts.openingBalanceDate,
      // Cumulative movement to the day before the period, and to the opening balance date.
      beforePeriod: sql<number>`coalesce(sum(${bankTransactions.amountPence}) filter (where ${bankTransactions.bookedAt} < ${period.from}), 0)`.mapWith(Number),
      throughOpening: sql<number>`coalesce(sum(${bankTransactions.amountPence}) filter (where ${bankTransactions.bookedAt} <= ${bankAccounts.openingBalanceDate}), 0)`.mapWith(Number),
      inPeriod: sql<number>`coalesce(sum(${bankTransactions.amountPence}) filter (where ${dateIn(bankTransactions.bookedAt, period)}), 0)`.mapWith(Number),
      transactions: sql<number>`count(${bankTransactions.id})`.mapWith(Number),
    })
    .from(bankAccounts)
    .leftJoin(bankTransactions, eq(bankTransactions.bankAccountId, bankAccounts.id))
    .where(eq(bankAccounts.companyId, companyId))
    .groupBy(bankAccounts.id)
    .orderBy(asc(bankAccounts.createdAt));
  const packAccounts: PackBankAccount[] = accountRows.map((a) => ({
    id: a.id,
    name: a.name,
    openingBalancePence: a.openingBalancePence,
    openingBalanceDate: a.openingBalanceDate,
    startBalancePence:
      a.openingBalancePence != null && a.openingBalanceDate != null
        ? a.openingBalancePence - a.throughOpening + a.beforePeriod
        : null,
    movementPence: a.inPeriod,
    hasTransactions: a.transactions > 0,
  }));

  const txRows = await db
    .select({
      id: bankTransactions.id,
      bankAccountId: bankTransactions.bankAccountId,
      bankAccountName: bankAccounts.name,
      bookedAt: bankTransactions.bookedAt,
      amountPence: bankTransactions.amountPence,
      counterparty: bankTransactions.counterparty,
      reference: bankTransactions.reference,
      description: bankTransactions.description,
      spendingCategory: bankTransactions.spendingCategory,
      notes: bankTransactions.notes,
      noteSharedWithAccountant: bankTransactions.noteSharedWithAccountant,
    })
    .from(bankTransactions)
    .innerJoin(bankAccounts, eq(bankTransactions.bankAccountId, bankAccounts.id))
    .where(and(eq(bankAccounts.companyId, companyId), dateIn(bankTransactions.bookedAt, period)))
    .orderBy(asc(bankTransactions.bookedAt), asc(bankTransactions.createdAt), asc(bankTransactions.id));

  // Each match on a transaction in the period, with the invoice it settles:
  // named on the match, or through its payment.
  const matchRows = await db
    .select({
      id: reconciliationMatches.id,
      bankTransactionId: reconciliationMatches.bankTransactionId,
      matchType: reconciliationMatches.matchType,
      paymentId: reconciliationMatches.paymentId,
      expenseId: reconciliationMatches.expenseId,
      reimbursementId: reconciliationMatches.reimbursementId,
      personUserId: reconciliationMatches.personUserId,
      incomeCategory: reconciliationMatches.incomeCategory,
      note: reconciliationMatches.note,
      invoiceNumber: invoices.number,
    })
    .from(reconciliationMatches)
    .innerJoin(bankTransactions, eq(reconciliationMatches.bankTransactionId, bankTransactions.id))
    .innerJoin(bankAccounts, eq(bankTransactions.bankAccountId, bankAccounts.id))
    .leftJoin(payments, eq(reconciliationMatches.paymentId, payments.id))
    .leftJoin(
      invoices,
      and(
        eq(invoices.companyId, companyId),
        eq(invoices.id, sql`coalesce(${reconciliationMatches.invoiceId}, ${payments.invoiceId})`),
      ),
    )
    .where(
      and(
        eq(bankAccounts.companyId, companyId),
        // An unconfirmed match is only a suggestion.
        eq(reconciliationMatches.confirmed, true),
        dateIn(bankTransactions.bookedAt, period),
      ),
    )
    .orderBy(asc(reconciliationMatches.createdAt));
  const matchesByTx = Map.groupBy(matchRows, (m) => m.bankTransactionId);
  const packTransactions: PackBankTransaction[] = txRows.map((t) => ({
    id: t.id,
    bankAccountId: t.bankAccountId,
    bankAccountName: t.bankAccountName,
    bookedAt: t.bookedAt,
    amountPence: t.amountPence,
    counterparty: t.counterparty,
    reference: t.reference,
    description: t.description,
    spendingCategory: t.spendingCategory,
    note: sharedNote(t),
    matches: (matchesByTx.get(t.id) ?? []).map(({ bankTransactionId: _tx, ...m }) => m),
  }));

  // --- Reimbursements paid in the period -------------------------------------

  const reimbursementPaidOn = londonDate(reimbursements.paidAt);
  const reimbursementRows = await db
    .select({
      id: reimbursements.id,
      refNumber: reimbursements.refNumber,
      payeeUserId: reimbursements.payeeUserId,
      reference: reimbursements.reference,
      totalPence: reimbursements.totalPence,
      paidOn: reimbursementPaidOn,
    })
    .from(reimbursements)
    .where(
      and(
        eq(reimbursements.companyId, companyId),
        isNotNull(reimbursements.paidAt),
        dateIn(reimbursementPaidOn, period),
      ),
    )
    .orderBy(asc(reimbursements.paidAt));
  const reimbursementIds = reimbursementRows.map((r) => r.id);
  const reimbursementBank = await bankMatchesFor(
    companyId,
    reconciliationMatches.reimbursementId,
    reimbursementIds,
  );

  // --- Expenses --------------------------------------------------------------
  // In the period by spend date, plus those an outside-period section needs:
  // items of a run paid in the period, anything paid personally up to the period
  // end (it may still have been owed then), and anything whose bank payment fell
  // in the period (cash basis counts it then; the bank tab names it either way),
  // and anything spent earlier whose covered period runs into this one (a
  // prepayment brought forward).

  const inPaidRun = sql`${expenses.id} in (
    select ri.expense_id from reimbursement_items ri
    join reimbursements r on r.id = ri.reimbursement_id
    where r.company_id = ${companyId} and r.paid_at is not null
      and ${dateIn(sql`(r.paid_at at time zone 'Europe/London')::date`, period)}
  )`;
  const paidFromBankInPeriod = sql`${expenses.id} in (
    select m.expense_id from reconciliation_matches m
    join bank_transactions t on t.id = m.bank_transaction_id
    join bank_accounts a on a.id = t.bank_account_id
    where a.company_id = ${companyId} and m.match_type = 'expense' and m.confirmed and m.expense_id is not null
      and ${dateIn(sql`t.booked_at`, period)}
  )`;
  const expenseRows = await db
    .select({
      expense: expenses,
      billableClientName: clientDisplayNameSql.as("billable_client_name"),
      reimbursementId: reimbursements.id,
      reimbursementPaidOn: sql<string | null>`(${reimbursements.paidAt} at time zone 'Europe/London')::date`,
    })
    .from(expenses)
    .leftJoin(clients, eq(expenses.clientId, clients.id))
    .leftJoin(reimbursementItems, eq(reimbursementItems.expenseId, expenses.id))
    .leftJoin(
      reimbursements,
      and(
        eq(reimbursements.id, reimbursementItems.reimbursementId),
        eq(reimbursements.companyId, companyId),
      ),
    )
    .where(
      and(
        eq(expenses.companyId, companyId),
        expenseInPack,
        or(
          dateIn(expenses.spentAt, period),
          inPaidRun,
          and(
            inArray(expenses.status, ["reimbursable", "reimbursed"]),
            sql`${expenses.spentAt} <= ${period.to}`,
          ),
          paidFromBankInPeriod,
          and(
            sql`${expenses.spentAt} < ${period.from}`,
            sql`${expenses.coversTo} >= ${period.from}`,
          ),
        ),
      ),
    )
    .orderBy(asc(expenses.spentAt), asc(expenses.createdAt), asc(expenses.id));

  const expenseIds = expenseRows.map((r) => r.expense.id);
  const expenseBank = await bankMatchesFor(companyId, reconciliationMatches.expenseId, expenseIds);
  const receiptRows =
    expenseIds.length === 0
      ? []
      : await db
          .select({
            id: expenseReceipts.id,
            expenseId: expenseReceipts.expenseId,
            blobPath: expenseReceipts.blobPath,
            filename: expenseReceipts.filename,
          })
          .from(expenseReceipts)
          .innerJoin(expenses, eq(expenseReceipts.expenseId, expenses.id))
          .where(and(eq(expenses.companyId, companyId), inArray(expenseReceipts.expenseId, expenseIds)))
          .orderBy(asc(expenseReceipts.uploadedAt));
  const receiptsByExpense = Map.groupBy(receiptRows, (r) => r.expenseId);

  const packExpenses = new Map<string, PackExpense>(
    expenseRows.map(({ expense: e, billableClientName, reimbursementId, reimbursementPaidOn: paidOn }) => [
      e.id,
      {
        id: e.id,
        refNumber: e.refNumber,
        description: e.description,
        category: e.category,
        spentAt: e.spentAt,
        amountPence: e.amountPence,
        vatPence: e.vatPence,
        status: e.status,
        paidByUserId: e.paidByUserId,
        billable: e.billable,
        billableClientName,
        mileageMiles: e.mileageMiles,
        mileageRatePence: e.mileageRatePence,
        coversFrom: e.coversFrom,
        coversTo: e.coversTo,
        note: sharedNote(e),
        createdAt: e.createdAt,
        reimbursementId,
        reimbursementPaidOn: paidOn,
        bank: expenseBank.get(e.id) ?? null,
        receipts: (receiptsByExpense.get(e.id) ?? []).map(({ expenseId: _e, ...r }) => r),
      },
    ]),
  );

  const itemsByReimbursement = Map.groupBy(
    expenseRows.filter((r) => r.reimbursementId),
    (r) => r.reimbursementId!,
  );
  const packReimbursements: PackReimbursement[] = reimbursementRows.map((r) => ({
    ...r,
    bank: reimbursementBank.get(r.id) ?? null,
    expenseIds: (itemsByReimbursement.get(r.id) ?? []).map((i) => i.expense.id),
  }));

  // --- Limited company: dividends and the share register ----------------------

  let dividends: PackDividend[] = [];
  let shareholderRows: PackShareholder[] = [];
  let totalShares: number | null = null;
  if (isLimited) {
    dividends = await db
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
      .innerJoin(dividendDeclarations, eq(dividendPayouts.declarationId, dividendDeclarations.id))
      .where(
        and(
          eq(dividendDeclarations.companyId, companyId),
          dateIn(dividendDeclarations.declaredAt, period),
        ),
      )
      .orderBy(asc(dividendDeclarations.declaredAt), asc(dividendPayouts.shareholderName));
    const register = await listShareholders(companyId);
    totalShares = register.totalShares;
    shareholderRows = register.shareholders.map((s) => ({
      id: s.id,
      name: s.name,
      shareCount: s.shareCount,
      percent: s.percent,
      userId: s.userId,
    }));
  }

  // --- Cash basis: money received from and refunded to customers ---------------

  let cashReceipts: PackCashReceipt[] = [];
  if (basis === "cash") {
    const [received, refunded] = await Promise.all([
      db
        .select({
          id: payments.id,
          date: receivedOn,
          invoiceNumber: invoices.number,
          clientName: clientDisplayNameSql.as("client_name"),
          amountPence: payments.amountPence,
          invoiceNetPence: invoices.netPence,
          invoiceGrossPence: invoices.grossPence,
          method: payments.method,
          reference: payments.reference,
        })
        .from(payments)
        .innerJoin(invoices, eq(payments.invoiceId, invoices.id))
        .innerJoin(clients, eq(invoices.clientId, clients.id))
        .where(
          and(
            eq(invoices.companyId, companyId),
            ne(invoices.status, "draft"),
            ne(invoices.status, "void"),
            paymentCountsInAccounts,
            dateIn(receivedOn, period),
          ),
        )
        .orderBy(asc(payments.receivedAt)),
      db
        .select({
          id: creditNotes.id,
          date: creditNotes.refundedAt,
          number: creditNotes.number,
          invoiceNumber: invoices.number,
          clientName: clientDisplayNameSql.as("client_name"),
          refundedPence: creditNotes.refundedPence,
          netPence: creditNotes.netPence,
          grossPence: creditNotes.grossPence,
          reference: creditNotes.refundReference,
        })
        .from(creditNotes)
        .innerJoin(
          invoices,
          and(eq(creditNotes.invoiceId, invoices.id), eq(invoices.companyId, companyId)),
        )
        .innerJoin(clients, eq(creditNotes.clientId, clients.id))
        .where(
          and(
            eq(creditNotes.companyId, companyId),
            eq(creditNotes.status, "issued"),
            sql`${creditNotes.refundedPence} > 0`,
            creditNoteCountsInAccounts(creditNotes.refundedAt),
            dateIn(creditNotes.refundedAt, period),
          ),
        )
        .orderBy(asc(creditNotes.refundedAt)),
    ]);
    cashReceipts = [
      ...received.map(
        (p): PackCashReceipt => ({
          id: p.id,
          kind: "payment",
          date: p.date,
          documentNumber: p.invoiceNumber,
          invoiceNumber: p.invoiceNumber,
          clientName: p.clientName,
          amountPence: p.amountPence,
          netPence: netShare(p.amountPence, p.invoiceNetPence, p.invoiceGrossPence),
          method: p.method,
          reference: p.reference,
        }),
      ),
      ...refunded.map(
        (c): PackCashReceipt => ({
          id: c.id,
          kind: "refund",
          date: c.date!,
          documentNumber: c.number,
          invoiceNumber: c.invoiceNumber,
          clientName: c.clientName,
          amountPence: -c.refundedPence,
          netPence: -netShare(c.refundedPence, c.netPence, c.grossPence),
          method: null,
          reference: c.reference,
        }),
      ),
    ].sort((a, b) => a.date.localeCompare(b.date));
  }

  return {
    period,
    company,
    isLimited,
    basis,
    people,
    owner,
    invoices: packInvoices,
    creditNotes: creditNoteRows,
    expenses: packExpenses,
    writeOffs: writeOffRows,
    bankAccounts: packAccounts,
    bankTransactions: packTransactions,
    reimbursements: packReimbursements,
    dividends,
    shareholders: shareholderRows,
    totalShares,
    cashReceipts,
  };
}

/**
 * The bank transaction each record was matched to (confirmed matches only; an
 * unconfirmed one is a suggestion), keyed by the record's id. The earliest wins.
 */
async function bankMatchesFor(
  companyId: string,
  column:
    | typeof reconciliationMatches.paymentId
    | typeof reconciliationMatches.expenseId
    | typeof reconciliationMatches.reimbursementId,
  ids: string[],
): Promise<Map<string, PackBankMatch>> {
  if (ids.length === 0) return new Map();
  const rows = await getDb()
    .select({
      recordId: column,
      bankTransactionId: bankTransactions.id,
      bookedAt: bankTransactions.bookedAt,
      amountPence: bankTransactions.amountPence,
      counterparty: bankTransactions.counterparty,
    })
    .from(reconciliationMatches)
    .innerJoin(bankTransactions, eq(reconciliationMatches.bankTransactionId, bankTransactions.id))
    .innerJoin(bankAccounts, eq(bankTransactions.bankAccountId, bankAccounts.id))
    .where(
      and(
        eq(bankAccounts.companyId, companyId),
        eq(reconciliationMatches.confirmed, true),
        inArray(column, ids),
      ),
    )
    .orderBy(asc(bankTransactions.bookedAt));
  const byRecord = new Map<string, PackBankMatch>();
  for (const { recordId, ...match } of rows) {
    if (recordId && !byRecord.has(recordId)) byRecord.set(recordId, match);
  }
  return byRecord;
}
