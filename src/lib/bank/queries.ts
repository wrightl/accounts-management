import 'server-only';
import {
    expenseInPack,
    invoiceInPack,
    reimbursementInPack,
    type RecordScope,
} from '@/lib/accountant/record-scope';
import type { RecordQuery } from '@/lib/queries/status';
import {
    and,
    asc,
    count,
    desc,
    eq,
    gt,
    gte,
    ilike,
    inArray,
    isNull,
    lt,
    lte,
    or,
    sql,
    sum,
    type AnyColumn,
    type SQL,
} from 'drizzle-orm';
import {
    BANK_PAGE_SIZE,
    bankSearchPattern,
    type BankListParams,
    type BankSortColumn,
} from '@/lib/bank/list-params';
import type { SortDir } from '@/lib/table-sort';
import { getDb } from '@/db';
import { matchOfCompany } from '@/lib/bank/match-scope';
import {
    bankAccounts,
    bankTransactionLabels,
    bankTransactions,
    clients,
    companies,
    expenses,
    invoices,
    payments,
    reconciliationMatches,
    reimbursements,
    users,
} from '@/db/schema';
import { rowOfCompany } from '@/lib/tenant-scope';
import { formatGBP } from '@/lib/money';
import { labelsForBankTransactions, type RowLabel } from '@/lib/labels/queries';
import { payReimbursementRun } from '@/lib/reimbursements/pay';
import type { ParsedBankRow, GenericCsvMapping } from '@/lib/bank/types';
import {
    creditExplainLabel,
    parseCreditExplainInput,
    type CreditExplainInput,
    type CreditExplainType,
} from '@/lib/bank/credit-explain';
import { resolveIncomeCategory } from '@/lib/bank/income-category-catalog';
import {
    pickBestMatch,
    canSettleInvoiceBalance,
    MIN_SUGGEST_SCORE,
    scoreBankTxForInvoice,
    type MatchScoreBreakdown,
} from '@/lib/bank/match';
import {
    findExpenseMatchForBankTx,
    formatExpenseMatchTarget,
} from '@/lib/bank/expense-match';
import { upsertBankSpendingCategory } from '@/lib/bank/spending-categories';
import { expenseSettlementFields } from '@/lib/bank/expense-settle';
import {
    effectiveStatus,
    todayIsoDate,
    type InvoiceStatus,
} from '@/lib/invoices/status';
import { clientDisplayName } from '@/lib/clients/display';
import {
    creditAdjustmentForInvoice,
    creditAdjustmentsByInvoice,
} from '@/lib/credit-notes/adjustments';
import { paymentCountsInAccounts } from '@/lib/invoices/accounts-scope';
import { periodLockError } from '@/lib/period-lock';
import { getBooksLockedThrough } from '@/lib/period-lock-queries';
import {
    invoiceAmountDue,
    invoiceBalance,
    isInvoiceSettled,
    settlementMinor,
    settlementPence,
} from '@/lib/invoices/balance';
import { syncFxDifference } from '@/lib/invoices/fx-difference';
import { isForeignDocumentCurrency } from '@/lib/currency';
import {
    resolveBankDisplayName,
    type BankProviderId,
} from '@/lib/bank/providers';
import { isUniqueViolation } from '@/lib/db-errors';

export async function getOrCreateBankAccount(
    companyId: string,
    provider: BankProviderId,
    displayName?: string | null,
) {
    const db = getDb();
    const existing = await db
        .select()
        .from(bankAccounts)
        .where(
            and(
                eq(bankAccounts.companyId, companyId),
                eq(bankAccounts.provider, provider),
            ),
        )
        .limit(1);
    if (existing[0]) return existing[0];
    const name = resolveBankDisplayName(provider, displayName);
    const [created] = await db
        .insert(bankAccounts)
        .values({
            companyId,
            name,
            provider,
        })
        .returning();
    return created;
}

/** @deprecated Prefer getOrCreateBankAccount(companyId, provider). */
export async function getOrCreateDefaultBankAccount(companyId: string) {
    return getOrCreateBankAccount(companyId, 'starling');
}

export async function saveBankAccountCsvMapping(
    companyId: string,
    accountId: string,
    mapping: GenericCsvMapping,
) {
    const db = getDb();
    await db
        .update(bankAccounts)
        .set({ csvMapping: mapping })
        .where(
            and(
                eq(bankAccounts.id, accountId),
                eq(bankAccounts.companyId, companyId),
            ),
        );
}

export async function importBankRows(
    companyId: string,
    accountId: string,
    rows: ParsedBankRow[],
): Promise<{ inserted: number; skipped: number; skippedNonGbp: number }> {
    const db = getDb();
    const [account] = await db
        .select({ id: bankAccounts.id })
        .from(bankAccounts)
        .where(
            and(
                eq(bankAccounts.id, accountId),
                eq(bankAccounts.companyId, companyId),
            ),
        )
        .limit(1);
    if (!account) {
        throw new Error('Bank account not found for company');
    }

    let inserted = 0;
    let skipped = 0;
    let skippedNonGbp = 0;

    for (const row of rows) {
        if (row.skipReason === 'non_gbp') {
            skippedNonGbp++;
            continue;
        }

        const spendingCategory = row.spendingCategory
            ? await upsertBankSpendingCategory(companyId, row.spendingCategory)
            : null;

        try {
            await db.insert(bankTransactions).values({
                bankAccountId: accountId,
                externalId: row.externalId,
                bookedAt: row.bookedAt,
                amountPence: row.amountPence,
                counterparty: row.counterparty,
                reference: row.reference,
                description: row.description,
                spendingCategory,
                tags: row.tags,
                raw: row.raw,
            });
            inserted++;
        } catch (err) {
            if (isUniqueViolation(err)) {
                skipped++;
                await db
                    .update(bankTransactions)
                    .set({
                        spendingCategory,
                        tags: row.tags,
                    })
                    .where(
                        and(
                            eq(bankTransactions.bankAccountId, accountId),
                            eq(bankTransactions.externalId, row.externalId),
                            isNull(bankTransactions.spendingCategory),
                            rowOfCompany(bankTransactions.bankAccountId, bankAccounts, companyId),
                        ),
                    );
                continue;
            }
            throw err;
        }
    }
    return { inserted, skipped, skippedNonGbp };
}

export type BankTransactionListItem = {
    id: string;
    /** Set by callers that show query state; see recordQueriesFor. */
    queries?: RecordQuery[];
    bookedAt: string;
    amountPence: number;
    counterparty: string | null;
    reference: string | null;
    description: string | null;
    spendingCategory: string | null;
    bankAccountName: string;
    tags: string[];
    notes: string | null;
    noteSharedWithAccountant: boolean;
    labels: RowLabel[];
    amountFormatted: string;
    matchId: string | null;
    matchType: string | null;
    matchLabel: string | null;
    /** Page for the matched invoice, expense or reimbursement run, when there is one. */
    matchHref: string | null;
    matchNote: string | null;
    confirmed: boolean;
    reconciled: boolean;
    suggested: boolean;
};

export interface BankTransactionListResult {
    rows: BankTransactionListItem[];
    total: number;
    page: number;
    pageSize: number;
    pageCount: number;
}

export type SuggestedMatchTarget =
    | {
          kind: 'invoice_payment';
          invoiceNumber: string;
          clientName: string;
          paymentId?: string | null;
          invoiceId?: string | null;
      }
    | {
          kind: 'expense';
          description: string;
          expenseId: string;
      }
    | {
          kind: 'reimbursement';
          payeeName: string;
          reimbursementId: string;
          totalFormatted: string;
      };

export type SuggestedMatch = {
    matchId: string;
    bankTransactionId: string;
    matchType: 'invoice_payment' | 'expense' | 'reimbursement';
    score: number;
    breakdown: MatchScoreBreakdown;
    /** FX rate explanation for foreign-currency expense suggestions. */
    note: string | null;
    tx: {
        bookedAt: string;
        amountPence: number;
        counterparty: string | null;
        reference: string | null;
        amountFormatted: string;
    };
    target: SuggestedMatchTarget;
};

export type ReimbursementBankMatch = {
    bankTransactionId: string;
    bookedAt: string;
    amountPence: number;
    amountFormatted: string;
    counterparty: string | null;
    reference: string | null;
    score: number;
    breakdown: MatchScoreBreakdown;
};

export type InvoiceBankMatch = {
    bankTransactionId: string;
    bookedAt: string;
    amountPence: number;
    amountFormatted: string;
    counterparty: string | null;
    reference: string | null;
    score: number;
    breakdown: MatchScoreBreakdown;
};

class ReconciliationError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'ReconciliationError';
    }
}

const confirmedReconciliationExists = sql`EXISTS (
  SELECT 1 FROM ${reconciliationMatches}
  WHERE ${reconciliationMatches.bankTransactionId} = ${bankTransactions.id}
    AND ${reconciliationMatches.confirmed} = true
)`;

export function bankListWhere(
    companyId: string,
    filters: Partial<
        Pick<
            BankListParams,
            'q' | 'type' | 'category' | 'reconciliation' | 'labels' | 'from' | 'to'
        >
    >,
): SQL | undefined {
    const conditions: SQL[] = [
        sql`${bankTransactions.bankAccountId} in (select id from ${bankAccounts} where ${bankAccounts.companyId} = ${companyId})`,
    ];
    const pattern = filters.q ? bankSearchPattern(filters.q) : null;
    if (pattern) {
        const search = or(
            ilike(bankTransactions.counterparty, pattern),
            ilike(bankTransactions.reference, pattern),
            ilike(bankTransactions.description, pattern),
        );
        if (search) conditions.push(search);
    }
    if (filters.type === 'incoming')
        conditions.push(gt(bankTransactions.amountPence, 0));
    if (filters.type === 'outgoing')
        conditions.push(lt(bankTransactions.amountPence, 0));
    if (filters.category)
        conditions.push(
            eq(bankTransactions.spendingCategory, filters.category),
        );
    if (filters.reconciliation === 'reconciled')
        conditions.push(confirmedReconciliationExists);
    if (filters.reconciliation === 'unreconciled') {
        conditions.push(sql`NOT ${confirmedReconciliationExists}`);
    }
    if (filters.labels?.length) {
        conditions.push(sql`EXISTS (
          SELECT 1 FROM ${bankTransactionLabels}
          WHERE ${bankTransactionLabels.bankTransactionId} = ${bankTransactions.id}
            AND ${inArray(bankTransactionLabels.labelId, filters.labels)}
        )`);
    }
    if (filters.from)
        conditions.push(gte(bankTransactions.bookedAt, filters.from));
    if (filters.to) conditions.push(lte(bankTransactions.bookedAt, filters.to));
    return conditions.length ? and(...conditions) : undefined;
}

/** Paid so far on a company invoice, in the invoice's currency. */
async function paidTotalForInvoice(
    db: ReturnType<typeof getDb>,
    companyId: string,
    invoiceId: string,
) {
    const [row] = await db
        .select({ total: sum(payments.amountMinor).mapWith(Number) })
        .from(payments)
        .innerJoin(invoices, eq(invoices.id, payments.invoiceId))
        .where(
            and(
                eq(payments.invoiceId, invoiceId),
                eq(invoices.companyId, companyId),
            ),
        );
    return row?.total ?? 0;
}

/** Link each match to the record it settles (invoice, expense or reimbursement run). */
async function buildMatchHrefs(
    db: ReturnType<typeof getDb>,
    companyId: string,
    matches: (typeof reconciliationMatches.$inferSelect)[],
): Promise<Map<string, string>> {
    const paymentIds = matches
        .filter((m) => m.paymentId && !m.invoiceId)
        .map((m) => m.paymentId!);
    const invoiceByPayment = new Map<string, string>();
    if (paymentIds.length > 0) {
        const rows = await db
            .select({ id: payments.id, invoiceId: payments.invoiceId })
            .from(payments)
            .where(
                and(
                    inArray(payments.id, paymentIds),
                    rowOfCompany(payments.invoiceId, invoices, companyId),
                ),
            );
        for (const row of rows) invoiceByPayment.set(row.id, row.invoiceId);
    }

    const hrefs = new Map<string, string>();
    for (const match of matches) {
        const invoiceId =
            match.invoiceId ??
            (match.paymentId ? invoiceByPayment.get(match.paymentId) : undefined);
        if (match.matchType === 'invoice_payment' && invoiceId) {
            hrefs.set(match.id, `/invoices/${invoiceId}`);
        } else if (match.matchType === 'reimbursement' && match.reimbursementId) {
            hrefs.set(match.id, `/reimbursements/${match.reimbursementId}`);
        } else if (match.expenseId) {
            hrefs.set(match.id, `/expenses/${match.expenseId}`);
        }
    }
    return hrefs;
}

async function buildMatchLabels(
    db: ReturnType<typeof getDb>,
    companyId: string,
    matches: (typeof reconciliationMatches.$inferSelect)[],
): Promise<Map<string, string>> {
    const labels = new Map<string, string>();
    const paymentIds = matches
        .map((m) => m.paymentId)
        .filter(Boolean) as string[];
    const invoiceIds = matches
        .map((m) => m.invoiceId)
        .filter(Boolean) as string[];
    const expenseIds = matches
        .map((m) => m.expenseId)
        .filter(Boolean) as string[];
    const reimbursementIds = matches
        .map((m) => m.reimbursementId)
        .filter(Boolean) as string[];

    if (paymentIds.length > 0) {
        const rows = await db
            .select({
                paymentId: payments.id,
                invoiceNumber: invoices.number,
                clientName: clients.name,
                companyName: clients.companyName,
            })
            .from(payments)
            .innerJoin(invoices, eq(payments.invoiceId, invoices.id))
            .innerJoin(clients, eq(invoices.clientId, clients.id))
            .where(
                and(
                    inArray(payments.id, paymentIds),
                    rowOfCompany(payments.invoiceId, invoices, companyId),
                ),
            );
        for (const row of rows) {
            labels.set(
                row.paymentId,
                `${row.invoiceNumber} · ${clientDisplayName({ name: row.clientName, companyName: row.companyName })}`,
            );
        }
    }

    if (invoiceIds.length > 0) {
        const rows = await db
            .select({
                invoiceId: invoices.id,
                invoiceNumber: invoices.number,
                clientName: clients.name,
                companyName: clients.companyName,
            })
            .from(invoices)
            .innerJoin(clients, eq(invoices.clientId, clients.id))
            .where(inArray(invoices.id, invoiceIds));
        for (const row of rows) {
            labels.set(
                row.invoiceId,
                `${row.invoiceNumber} · ${clientDisplayName({ name: row.clientName, companyName: row.companyName })}`,
            );
        }
    }

    if (expenseIds.length > 0) {
        const rows = await db
            .select({ id: expenses.id, description: expenses.description })
            .from(expenses)
            .where(inArray(expenses.id, expenseIds));
        for (const row of rows) {
            labels.set(row.id, row.description ?? 'Expense');
        }
    }

    if (reimbursementIds.length > 0) {
        const rows = await db
            .select({
                id: reimbursements.id,
                totalPence: reimbursements.totalPence,
                payeeName: users.name,
                payeeEmail: users.email,
            })
            .from(reimbursements)
            .innerJoin(users, eq(reimbursements.payeeUserId, users.id))
            .where(inArray(reimbursements.id, reimbursementIds));
        for (const row of rows) {
            labels.set(
                row.id,
                `Reimbursement · ${row.payeeName || row.payeeEmail} · ${formatGBP(row.totalPence)}`,
            );
        }
    }

    const matchLabels = new Map<string, string>();
    for (const match of matches) {
        if (match.matchType === 'invoice_payment') {
            const label =
                (match.paymentId && labels.get(match.paymentId)) ||
                (match.invoiceId && labels.get(match.invoiceId)) ||
                'Invoice payment';
            matchLabels.set(match.id, label);
        } else if (
            match.matchType === 'reimbursement' &&
            match.reimbursementId
        ) {
            matchLabels.set(
                match.id,
                labels.get(match.reimbursementId) ?? 'Reimbursement',
            );
        } else if (match.matchType === 'expense' || match.expenseId) {
            matchLabels.set(match.id, labels.get(match.expenseId!) ?? 'Expense');
        } else if (
            match.matchType === 'other_income' ||
            match.matchType === 'transfer' ||
            match.matchType === 'tax_or_loan' ||
            match.matchType === 'drawings' ||
            match.matchType === 'money_put_in' ||
            match.matchType === 'salary'
        ) {
            matchLabels.set(match.id, creditExplainLabel(match));
        }
    }
    return matchLabels;
}

/**
 * Matches pointing at a record the accountant pack leaves out, such as a draft
 * invoice. The bank row is in the pack, but what it settles mustn't be named.
 */
async function matchesOutsidePack(
    db: ReturnType<typeof getDb>,
    companyId: string,
    matches: (typeof reconciliationMatches.$inferSelect)[],
): Promise<Set<string>> {
    const ids = (pick: (m: (typeof matches)[number]) => string | null) =>
        matches.map(pick).filter((id): id is string => Boolean(id));
    const paymentIds = ids((m) => m.paymentId);
    const invoiceIds = ids((m) => m.invoiceId);
    const expenseIds = ids((m) => m.expenseId);
    const reimbursementIds = ids((m) => m.reimbursementId);

    const [visiblePayments, visibleInvoices, visibleExpenses, visibleReimbursements] =
        await Promise.all([
            paymentIds.length === 0
                ? []
                : db
                      .select({ id: payments.id })
                      .from(payments)
                      .innerJoin(invoices, eq(payments.invoiceId, invoices.id))
                      .where(
                          and(
                              eq(invoices.companyId, companyId),
                              inArray(payments.id, paymentIds),
                              invoiceInPack,
                          ),
                      ),
            invoiceIds.length === 0
                ? []
                : db
                      .select({ id: invoices.id })
                      .from(invoices)
                      .where(
                          and(
                              eq(invoices.companyId, companyId),
                              inArray(invoices.id, invoiceIds),
                              invoiceInPack,
                          ),
                      ),
            expenseIds.length === 0
                ? []
                : db
                      .select({ id: expenses.id })
                      .from(expenses)
                      .where(
                          and(
                              eq(expenses.companyId, companyId),
                              inArray(expenses.id, expenseIds),
                              expenseInPack,
                          ),
                      ),
            reimbursementIds.length === 0
                ? []
                : db
                      .select({ id: reimbursements.id })
                      .from(reimbursements)
                      .where(
                          and(
                              eq(reimbursements.companyId, companyId),
                              inArray(reimbursements.id, reimbursementIds),
                              reimbursementInPack,
                          ),
                      ),
        ]);

    const visible = new Set(
        [
            ...visiblePayments,
            ...visibleInvoices,
            ...visibleExpenses,
            ...visibleReimbursements,
        ].map((row) => row.id),
    );
    const hidden = new Set<string>();
    for (const match of matches) {
        const targets = [
            match.paymentId,
            match.invoiceId,
            match.expenseId,
            match.reimbursementId,
        ].filter((id): id is string => Boolean(id));
        if (targets.some((id) => !visible.has(id))) hidden.add(match.id);
    }
    return hidden;
}

/** What to call a match when its record can't be named. */
function genericMatchLabel(matchType: string): string {
    if (matchType === 'invoice_payment') return 'Invoice payment';
    if (matchType === 'reimbursement') return 'Reimbursement';
    return 'Expense';
}

/**
 * ORDER BY for the transactions table. Newest-first breaks ties, then id,
 * so rows never swap between pages.
 */
export function bankListOrderBy(
    column: BankSortColumn = 'date',
    dir: SortDir = 'desc',
): SQL[] {
    const by = (expr: SQL | AnyColumn) =>
        dir === 'asc' ? sql`${expr} asc nulls last` : sql`${expr} desc nulls last`;
    const tiebreak = [
        desc(bankTransactions.bookedAt),
        desc(bankTransactions.createdAt),
        desc(bankTransactions.id),
    ];
    switch (column) {
        case 'counterparty':
            return [
                by(sql`lower(coalesce(${bankTransactions.counterparty}, ${bankTransactions.description}))`),
                ...tiebreak,
            ];
        case 'reference':
            return [by(sql`lower(${bankTransactions.reference})`), ...tiebreak];
        case 'category':
            return [by(sql`lower(${bankTransactions.spendingCategory})`), ...tiebreak];
        case 'amount':
            return [by(bankTransactions.amountPence), ...tiebreak];
        case 'date':
            return dir === 'asc'
                ? [
                      asc(bankTransactions.bookedAt),
                      asc(bankTransactions.createdAt),
                      asc(bankTransactions.id),
                  ]
                : tiebreak;
    }
}

export async function listBankTransactions(
    companyId: string,
    filters: Partial<
        Pick<
            BankListParams,
            | 'q'
            | 'type'
            | 'category'
            | 'reconciliation'
            | 'labels'
            | 'from'
            | 'to'
            | 'page'
            | 'sort'
            | 'dir'
        >
    > & {
        pageSize?: number;
        scope?: RecordScope;
    } = {},
): Promise<BankTransactionListResult> {
    const db = getDb();
    const pageSize = filters.pageSize ?? BANK_PAGE_SIZE;
    const where = bankListWhere(companyId, filters);

    const [countRow] = await db
        .select({ total: count() })
        .from(bankTransactions)
        .where(where);
    const total = countRow?.total ?? 0;
    const pageCount = Math.max(1, Math.ceil(total / pageSize));
    const page = Math.min(Math.max(1, filters.page ?? 1), pageCount);
    const offset = (page - 1) * pageSize;

    const pageTx = await db
        .select()
        .from(bankTransactions)
        .where(where)
        .orderBy(...bankListOrderBy(filters.sort, filters.dir))
        .limit(pageSize)
        .offset(offset);

    if (pageTx.length === 0) {
        return { rows: [], total, page, pageSize, pageCount };
    }

    const allMatches = await db
        .select()
        .from(reconciliationMatches)
        .where(
            and(
                inArray(
                    reconciliationMatches.bankTransactionId,
                    pageTx.map((tx) => tx.id),
                ),
                matchOfCompany(companyId),
            ),
        );
    // Unconfirmed suggestions are the team's unfinished work.
    const inPack = filters.scope === 'pack';
    const matches = inPack ? allMatches.filter((m) => m.confirmed) : allMatches;

    const matchByTx = new Map<
        (typeof matches)[number]['bankTransactionId'],
        (typeof matches)[number]
    >();
    for (const match of matches) {
        const existing = matchByTx.get(match.bankTransactionId);
        if (!existing || (match.confirmed && !existing.confirmed)) {
            matchByTx.set(match.bankTransactionId, match);
        }
    }

    const [labelByMatchId, hrefByMatchId, labelsByTx, hiddenMatches] = await Promise.all([
        buildMatchLabels(db, companyId, matches),
        buildMatchHrefs(db, companyId, matches),
        labelsForBankTransactions(companyId, pageTx.map((tx) => tx.id)),
        inPack ? matchesOutsidePack(db, companyId, matches) : new Set<string>(),
    ]);

    const accountIds = [...new Set(pageTx.map((tx) => tx.bankAccountId))];
    const accounts =
        accountIds.length === 0
            ? []
            : await db
                  .select({ id: bankAccounts.id, name: bankAccounts.name })
                  .from(bankAccounts)
                  .where(inArray(bankAccounts.id, accountIds));
    const accountNameById = new Map(accounts.map((a) => [a.id, a.name]));

    const rows: BankTransactionListItem[] = pageTx.map((tx) => {
        const match = matchByTx.get(tx.id);
        const hidden = match ? hiddenMatches.has(match.id) : false;
        return {
            id: tx.id,
            bookedAt: tx.bookedAt,
            amountPence: tx.amountPence,
            counterparty: tx.counterparty,
            reference: tx.reference,
            description: tx.description,
            spendingCategory: tx.spendingCategory,
            bankAccountName: accountNameById.get(tx.bankAccountId) ?? '',
            tags: tx.tags ?? [],
            notes: tx.notes,
            noteSharedWithAccountant: tx.noteSharedWithAccountant,
            labels: labelsByTx.get(tx.id) ?? [],
            amountFormatted: formatGBP(tx.amountPence),
            matchId: match?.id ?? null,
            matchType: match?.matchType ?? null,
            matchLabel: match
                ? hidden
                    ? genericMatchLabel(match.matchType)
                    : (labelByMatchId.get(match.id) ?? null)
                : null,
            matchHref: match && !hidden ? (hrefByMatchId.get(match.id) ?? null) : null,
            matchNote: match?.note ?? null,
            confirmed: match?.confirmed ?? false,
            reconciled: Boolean(match?.id && match.confirmed),
            suggested: Boolean(match?.id && !match.confirmed),
        };
    });

    return { rows, total, page, pageSize, pageCount };
}

/** Count of bank accounts for a company (for multi-account UI). */
export async function countBankAccounts(companyId: string): Promise<number> {
    const db = getDb();
    const [row] = await db
        .select({ total: count() })
        .from(bankAccounts)
        .where(eq(bankAccounts.companyId, companyId));
    return row?.total ?? 0;
}

/** Unreconciled count across the whole ledger (ignores list filters). */
export async function countUnreconciledBankTransactions(
    companyId: string,
): Promise<number> {
    const db = getDb();
    const [row] = await db
        .select({ total: count() })
        .from(bankTransactions)
        .innerJoin(
            bankAccounts,
            eq(bankTransactions.bankAccountId, bankAccounts.id),
        )
        .leftJoin(
            reconciliationMatches,
            and(
                eq(
                    reconciliationMatches.bankTransactionId,
                    bankTransactions.id,
                ),
                eq(reconciliationMatches.confirmed, true),
            ),
        )
        .where(
            and(
                eq(bankAccounts.companyId, companyId),
                isNull(reconciliationMatches.id),
            ),
        );
    return row?.total ?? 0;
}

function txLikeFromRow(tx: typeof bankTransactions.$inferSelect) {
    return {
        amountPence: tx.amountPence,
        bookedAt: tx.bookedAt,
        reference: tx.reference,
        description: tx.description,
        counterparty: tx.counterparty,
    };
}

function toSuggestedTx(tx: typeof bankTransactions.$inferSelect) {
    return {
        bookedAt: tx.bookedAt,
        amountPence: tx.amountPence,
        counterparty: tx.counterparty,
        reference: tx.reference,
        amountFormatted: formatGBP(tx.amountPence),
    };
}

/** Open invoices with their balances, loaded once per run however many there are. */
async function loadOpenInvoiceBalances(
    db: ReturnType<typeof getDb>,
    companyId: string,
) {
    const rows = await db
        .select({
            id: invoices.id,
            number: invoices.number,
            grossPence: invoices.grossPence,
            status: invoices.status,
            dueDate: invoices.dueDate,
            issueDate: invoices.issueDate,
            source: invoices.source,
            clientName: clients.name,
            companyName: clients.companyName,
        })
        .from(invoices)
        .innerJoin(clients, eq(invoices.clientId, clients.id))
        .where(
            and(
                eq(invoices.companyId, companyId),
                or(eq(invoices.status, 'sent'), eq(invoices.status, 'overdue')),
            ),
        );
    if (rows.length === 0) return [];

    const ids = rows.map((r) => r.id);
    const [paidRows, credits] = await Promise.all([
        db
            .select({
                invoiceId: payments.invoiceId,
                total: sum(payments.amountPence).mapWith(Number),
            })
            .from(payments)
            .where(
                and(
                    inArray(payments.invoiceId, ids),
                    rowOfCompany(payments.invoiceId, invoices, companyId),
                ),
            )
            .groupBy(payments.invoiceId),
        creditAdjustmentsByInvoice(db, companyId, ids),
    ]);
    const paid = new Map(paidRows.map((r) => [r.invoiceId, r.total ?? 0]));
    return rows.map((inv) => ({
        ...inv,
        balancePence: invoiceAmountDue(settlementPence(inv, paid.get(inv.id) ?? 0, credits.get(inv.id))),
    }));
}

async function findIncomingMatch(
    db: ReturnType<typeof getDb>,
    companyId: string,
    tx: typeof bankTransactions.$inferSelect,
    openInvoices: Awaited<ReturnType<typeof loadOpenInvoiceBalances>>,
) {
    const txLike = txLikeFromRow(tx);

    const paymentCandidates = await db
        .select({
            id: payments.id,
            amountPence: payments.amountPence,
            receivedAt: payments.receivedAt,
            reference: payments.reference,
            invoiceNumber: invoices.number,
            clientName: clients.name,
            companyName: clients.companyName,
        })
        .from(payments)
        .innerJoin(invoices, eq(payments.invoiceId, invoices.id))
        .innerJoin(clients, eq(invoices.clientId, clients.id))
        .where(
            and(
                eq(invoices.companyId, companyId),
                eq(payments.amountPence, tx.amountPence),
                // Money received before cutover can't be what's in this statement.
                paymentCountsInAccounts,
            ),
        );

    const paymentMatch = pickBestMatch(
        txLike,
        paymentCandidates.map((p) => ({
            id: p.id,
            amountPence: p.amountPence,
            date: p.receivedAt.toISOString().slice(0, 10),
            invoiceNumber: p.invoiceNumber,
            reference: p.reference,
            clientName: p.clientName,
            companyName: p.companyName,
        })),
    );

    const invoiceCandidates = [];
    for (const inv of openInvoices) {
        const balance = inv.balancePence;
        if (balance !== tx.amountPence) continue;
        const referenceDate = inv.dueDate ?? inv.issueDate ?? tx.bookedAt;
        invoiceCandidates.push({
            id: inv.id,
            amountPence: balance,
            date: referenceDate ?? tx.bookedAt,
            invoiceNumber: inv.number,
            clientName: inv.clientName,
            companyName: inv.companyName,
            oldDebt: inv.source === 'import',
            invoiceId: inv.id,
            invoiceNumberDisplay: inv.number,
            clientDisplay: clientDisplayName({
                name: inv.clientName,
                companyName: inv.companyName,
            }),
        });
    }

    const invoiceMatch = pickBestMatch(
        txLike,
        invoiceCandidates.map((c) => ({
            id: c.id,
            amountPence: c.amountPence,
            date: c.date,
            invoiceNumber: c.invoiceNumber,
            clientName: c.clientName,
            companyName: c.companyName,
            oldDebt: c.oldDebt,
        })),
    );

    if (paymentMatch && invoiceMatch) {
        if (paymentMatch.breakdown.total >= invoiceMatch.breakdown.total) {
            const p = paymentCandidates.find(
                (c) => c.id === paymentMatch.candidate.id,
            )!;
            return {
                kind: 'payment' as const,
                paymentId: p.id,
                breakdown: paymentMatch.breakdown,
                score: paymentMatch.breakdown.total,
                target: {
                    kind: 'invoice_payment' as const,
                    invoiceNumber: p.invoiceNumber,
                    clientName: clientDisplayName({
                        name: p.clientName,
                        companyName: p.companyName,
                    }),
                    paymentId: p.id,
                },
            };
        }
    }

    if (paymentMatch && !invoiceMatch) {
        const p = paymentCandidates.find(
            (c) => c.id === paymentMatch.candidate.id,
        )!;
        return {
            kind: 'payment' as const,
            paymentId: p.id,
            breakdown: paymentMatch.breakdown,
            score: paymentMatch.breakdown.total,
            target: {
                kind: 'invoice_payment' as const,
                invoiceNumber: p.invoiceNumber,
                clientName: clientDisplayName({
                    name: p.clientName,
                    companyName: p.companyName,
                }),
                paymentId: p.id,
            },
        };
    }

    if (invoiceMatch) {
        const inv = invoiceCandidates.find(
            (c) => c.id === invoiceMatch.candidate.id,
        )!;
        return {
            kind: 'invoice' as const,
            invoiceId: inv.invoiceId,
            breakdown: invoiceMatch.breakdown,
            score: invoiceMatch.breakdown.total,
            note: null as string | null,
            target: {
                kind: 'invoice_payment' as const,
                invoiceNumber: inv.invoiceNumberDisplay,
                clientName: inv.clientDisplay,
                invoiceId: inv.invoiceId,
            },
        };
    }

    if (paymentMatch) return null;
    return findOverpaidInvoiceMatch(tx, openInvoices);
}

/**
 * Strong evidence needed before suggesting an invoice whose balance isn't the
 * exact amount: the reference names the invoice or the payer is the client.
 */
const NEAR_AMOUNT_EVIDENCE = 80;

/**
 * An open invoice this credit slightly overpays (see canSettleInvoiceBalance).
 * Amount alone isn't evidence here, so the reference or payer must match too.
 */
function findOverpaidInvoiceMatch(
    tx: typeof bankTransactions.$inferSelect,
    openInvoices: Awaited<ReturnType<typeof loadOpenInvoiceBalances>>,
) {
    const txLike = txLikeFromRow(tx);
    let best: {
        inv: (typeof openInvoices)[number];
        breakdown: MatchScoreBreakdown;
    } | null = null;
    for (const inv of openInvoices) {
        if (inv.balancePence <= 0 || tx.amountPence <= inv.balancePence) continue;
        if (!canSettleInvoiceBalance(tx.amountPence, inv.balancePence)) continue;
        const breakdown = scoreBankTxForInvoice(
            txLike,
            {
                id: inv.id,
                number: inv.number,
                name: inv.clientName,
                companyName: inv.companyName,
                balancePence: inv.balancePence,
                dueDate: inv.dueDate,
                issueDate: inv.issueDate,
                oldDebt: inv.source === 'import',
            },
            inv.dueDate ?? inv.issueDate ?? tx.bookedAt,
        );
        if (breakdown.total < MIN_SUGGEST_SCORE) continue;
        if (
            breakdown.invoiceRefScore < NEAR_AMOUNT_EVIDENCE &&
            breakdown.counterpartyScore < NEAR_AMOUNT_EVIDENCE
        ) {
            continue;
        }
        if (!best || breakdown.total > best.breakdown.total) {
            best = { inv, breakdown };
        }
    }
    if (!best) return null;
    const { inv, breakdown } = best;
    return {
        kind: 'invoice' as const,
        invoiceId: inv.id,
        breakdown,
        score: breakdown.total,
        note: overpaymentNote(tx.amountPence, inv.balancePence),
        target: {
            kind: 'invoice_payment' as const,
            invoiceNumber: inv.number,
            clientName: clientDisplayName({
                name: inv.clientName,
                companyName: inv.companyName,
            }),
            invoiceId: inv.id,
        },
    };
}

/** Explains a suggestion whose bank credit is more than the invoice balance. */
export function overpaymentNote(receivedPence: number, balancePence: number): string {
    return `${formatGBP(receivedPence - balancePence)} more than the ${formatGBP(balancePence)} still owed. The extra will show as a refund due to the client.`;
}

/**
 * Suggest matches: incoming tx → payment or unpaid invoice; outgoing tx →
 * reimbursement or eligible expense (pending / recorded / company_paid).
 * Foreign-currency expenses use BoE rates and a 3 working-day window.
 */
export async function suggestMatches(
    companyId: string,
): Promise<SuggestedMatch[]> {
    const db = getDb();
    const unmatched = await db
        .select({ tx: bankTransactions })
        .from(bankTransactions)
        .innerJoin(
            bankAccounts,
            eq(bankTransactions.bankAccountId, bankAccounts.id),
        )
        .leftJoin(
            reconciliationMatches,
            eq(reconciliationMatches.bankTransactionId, bankTransactions.id),
        )
        .where(
            and(
                eq(bankAccounts.companyId, companyId),
                isNull(reconciliationMatches.id),
            ),
        );

    const created: SuggestedMatch[] = [];
    const openInvoices = unmatched.some(({ tx }) => tx.amountPence > 0)
        ? await loadOpenInvoiceBalances(db, companyId)
        : [];

    for (const { tx } of unmatched) {
        if (tx.amountPence > 0) {
            const incoming = await findIncomingMatch(
                db,
                companyId,
                tx,
                openInvoices,
            );
            if (!incoming) continue;

            if (incoming.kind === 'payment') {
                const existing = await db
                    .select()
                    .from(reconciliationMatches)
                    .where(
                        and(
                            eq(reconciliationMatches.paymentId, incoming.paymentId),
                            matchOfCompany(companyId),
                        ),
                    )
                    .limit(1);
                if (existing[0]) continue;

                const [row] = await db
                    .insert(reconciliationMatches)
                    .values({
                        bankTransactionId: tx.id,
                        matchType: 'invoice_payment',
                        paymentId: incoming.paymentId,
                        confirmed: false,
                    })
                    .returning();

                created.push({
                    matchId: row.id,
                    bankTransactionId: tx.id,
                    matchType: 'invoice_payment',
                    score: incoming.score,
                    breakdown: incoming.breakdown,
                    note: null,
                    tx: toSuggestedTx(tx),
                    target: incoming.target,
                });
            } else {
                const existing = await db
                    .select()
                    .from(reconciliationMatches)
                    .where(
                        and(
                            eq(reconciliationMatches.invoiceId, incoming.invoiceId),
                            matchOfCompany(companyId),
                        ),
                    )
                    .limit(1);
                if (existing[0]) continue;

                const [row] = await db
                    .insert(reconciliationMatches)
                    .values({
                        bankTransactionId: tx.id,
                        matchType: 'invoice_payment',
                        invoiceId: incoming.invoiceId,
                        confirmed: false,
                        note: incoming.note,
                    })
                    .returning();

                created.push({
                    matchId: row.id,
                    bankTransactionId: tx.id,
                    matchType: 'invoice_payment',
                    score: incoming.score,
                    breakdown: incoming.breakdown,
                    note: incoming.note,
                    tx: toSuggestedTx(tx),
                    target: incoming.target,
                });
            }
        } else {
            const amount = Math.abs(tx.amountPence);
            const txLike = txLikeFromRow(tx);

            const reimbCandidates = await db
                .select({
                    id: reimbursements.id,
                    totalPence: reimbursements.totalPence,
                    createdAt: reimbursements.createdAt,
                    reimbursementDate: reimbursements.reimbursementDate,
                    reference: reimbursements.reference,
                    payeeName: users.name,
                    payeeEmail: users.email,
                })
                .from(reimbursements)
                .innerJoin(users, eq(reimbursements.payeeUserId, users.id))
                .where(
                    and(
                        eq(reimbursements.companyId, companyId),
                        eq(reimbursements.status, 'pending'),
                        eq(reimbursements.totalPence, amount),
                    ),
                );

            const reimbMatch =
                reimbCandidates.length === 1
                    ? {
                          candidate: {
                              id: reimbCandidates[0].id,
                              amountPence: reimbCandidates[0].totalPence,
                              date:
                                  reimbCandidates[0].reimbursementDate ??
                                  reimbCandidates[0].createdAt
                                      .toISOString()
                                      .slice(0, 10),
                              reference: [
                                  reimbCandidates[0].reference,
                                  reimbCandidates[0].payeeName,
                                  reimbCandidates[0].payeeEmail,
                              ]
                                  .filter(Boolean)
                                  .join(' '),
                          },
                          breakdown: {
                              dateScore: 100,
                              invoiceRefScore: 0,
                              paymentRefScore: 100,
                              counterpartyScore: 0,
                              total: 100,
                          },
                      }
                    : pickBestMatch(
                          txLike,
                          reimbCandidates.map((r) => ({
                              id: r.id,
                              amountPence: r.totalPence,
                              date:
                                  r.reimbursementDate ??
                                  r.createdAt.toISOString().slice(0, 10),
                              reference: [
                                  r.reference,
                                  r.payeeName,
                                  r.payeeEmail,
                              ]
                                  .filter(Boolean)
                                  .join(' '),
                          })),
                      );

            if (reimbMatch) {
                const existing = await db
                    .select()
                    .from(reconciliationMatches)
                    .where(
                        and(
                            eq(
                                reconciliationMatches.reimbursementId,
                                reimbMatch.candidate.id,
                            ),
                            matchOfCompany(companyId),
                        ),
                    )
                    .limit(1);
                if (!existing[0]) {
                    const run = reimbCandidates.find(
                        (r) => r.id === reimbMatch.candidate.id,
                    )!;
                    const [row] = await db
                        .insert(reconciliationMatches)
                        .values({
                            bankTransactionId: tx.id,
                            matchType: 'reimbursement',
                            reimbursementId: reimbMatch.candidate.id,
                            confirmed: false,
                        })
                        .returning();

                    created.push({
                        matchId: row.id,
                        bankTransactionId: tx.id,
                        matchType: 'reimbursement',
                        score: reimbMatch.breakdown.total,
                        breakdown: reimbMatch.breakdown,
                        note: null,
                        tx: toSuggestedTx(tx),
                        target: {
                            kind: 'reimbursement',
                            payeeName: run.payeeName || run.payeeEmail,
                            reimbursementId: run.id,
                            totalFormatted: formatGBP(run.totalPence),
                        },
                    });
                }
                continue;
            }

            const expenseMatch = await findExpenseMatchForBankTx(companyId, tx);
            if (!expenseMatch) continue;

            const [expense] = await db
                .select({
                    id: expenses.id,
                    description: expenses.description,
                })
                .from(expenses)
                .where(eq(expenses.id, expenseMatch.expenseId))
                .limit(1);
            if (!expense) continue;

            const [row] = await db
                .insert(reconciliationMatches)
                .values({
                    bankTransactionId: tx.id,
                    matchType: 'expense',
                    expenseId: expense.id,
                    confirmed: false,
                    note: expenseMatch.note,
                })
                .returning();

            created.push({
                matchId: row.id,
                bankTransactionId: tx.id,
                matchType: 'expense',
                score: expenseMatch.score,
                breakdown: expenseMatch.breakdown,
                note: expenseMatch.note,
                tx: toSuggestedTx(tx),
                target: {
                    kind: 'expense',
                    description: formatExpenseMatchTarget(expense.description),
                    expenseId: expense.id,
                },
            });
        }
    }

    return created;
}

async function createPaymentFromBankMatch(
    tx: ReturnType<typeof getDb>,
    companyId: string,
    match: typeof reconciliationMatches.$inferSelect,
    bankTx: typeof bankTransactions.$inferSelect,
) {
    if (!match.invoiceId)
        throw new ReconciliationError('Invoice match missing invoice');

    await tx.execute(
        sql`select id from invoices where id = ${match.invoiceId} for update`,
    );

    const [inv] = await tx
        .select()
        .from(invoices)
        .where(
            and(
                eq(invoices.id, match.invoiceId),
                eq(invoices.companyId, companyId),
            ),
        )
        .limit(1);
    if (!inv) throw new ReconciliationError('Invoice not found');

    const status = effectiveStatus(
        inv.status as InvoiceStatus,
        inv.dueDate,
        todayIsoDate(),
    );
    if (status === 'draft' || status === 'void' || status === 'paid') {
        throw new ReconciliationError(
            `Cannot record a payment against a ${status} invoice`,
        );
    }

    if (isForeignDocumentCurrency(inv.currency)) {
        // The bank line is in pounds; record it from the invoice, giving both amounts.
        throw new ReconciliationError(
            `Invoice ${inv.number} is in ${inv.currency}. Record this payment from the invoice instead.`,
        );
    }

    const alreadyPaid = await paidTotalForInvoice(tx, companyId, inv.id);
    const credits = await creditAdjustmentForInvoice(tx, companyId, inv.id);
    const remaining = invoiceBalance(settlementMinor(inv, alreadyPaid, credits));
    // A receipt slightly over the balance is accepted; the extra becomes a refund due.
    if (remaining <= 0 || !canSettleInvoiceBalance(bankTx.amountPence, remaining)) {
        throw new ReconciliationError(
            `Payment exceeds remaining balance of ${formatGBP(remaining)}`,
        );
    }

    const receivedAt = new Date(`${bankTx.bookedAt}T12:00:00Z`);
    const [payment] = await tx
        .insert(payments)
        .values({
            invoiceId: inv.id,
            amountPence: bankTx.amountPence,
            // Sterling invoice (checked above), so the two amounts are equal.
            amountMinor: bankTx.amountPence,
            method: 'bank_transfer',
            reference: bankTx.reference,
            receivedAt,
        })
        .returning({ id: payments.id });

    const paidTotal = alreadyPaid + bankTx.amountPence;
    if (isInvoiceSettled(settlementMinor(inv, paidTotal, credits))) {
        await tx
            .update(invoices)
            .set({ status: 'paid', paidAt: receivedAt })
            .where(
                and(eq(invoices.id, inv.id), eq(invoices.companyId, companyId)),
            );
    }
    await syncFxDifference(tx, companyId, inv.id, bankTx.bookedAt);

    return payment.id;
}

/** Load a reconciliation match only if its bank account belongs to the company. */
async function getMatchForCompany(
    tx: ReturnType<typeof getDb>,
    companyId: string,
    matchId: string,
) {
    const [row] = await tx
        .select({ match: reconciliationMatches })
        .from(reconciliationMatches)
        .innerJoin(
            bankTransactions,
            eq(reconciliationMatches.bankTransactionId, bankTransactions.id),
        )
        .innerJoin(
            bankAccounts,
            eq(bankTransactions.bankAccountId, bankAccounts.id),
        )
        .where(
            and(
                eq(reconciliationMatches.id, matchId),
                eq(bankAccounts.companyId, companyId),
            ),
        )
        .limit(1);
    return row?.match ?? null;
}

/** Refuse reconciliation changes to bank rows booked in the locked period. */
async function assertBankRowOpen(
    db: Parameters<typeof getMatchForCompany>[0],
    companyId: string,
    bankTransactionId: string,
): Promise<void> {
    const [row] = await db
        .select({ bookedAt: bankTransactions.bookedAt })
        .from(bankTransactions)
        .where(
            and(
                eq(bankTransactions.id, bankTransactionId),
                rowOfCompany(bankTransactions.bankAccountId, bankAccounts, companyId),
            ),
        )
        .limit(1);
    const locked = periodLockError(
        await getBooksLockedThrough(companyId, db),
        row?.bookedAt,
    );
    if (locked) throw new ReconciliationError(locked);
}

export async function confirmMatch(companyId: string, matchId: string) {
    const db = getDb();
    await db.transaction(async (tx) => {
        const match = await getMatchForCompany(tx, companyId, matchId);
        if (!match) throw new ReconciliationError('Match not found');
        if (match.confirmed) return;
        await assertBankRowOpen(tx, companyId, match.bankTransactionId);

        if (
            match.matchType === 'invoice_payment' &&
            match.invoiceId &&
            !match.paymentId
        ) {
            const [bankTx] = await tx
                .select()
                .from(bankTransactions)
                .where(
                    and(
                        eq(bankTransactions.id, match.bankTransactionId),
                        rowOfCompany(bankTransactions.bankAccountId, bankAccounts, companyId),
                    ),
                )
                .limit(1);
            if (!bankTx)
                throw new ReconciliationError('Bank transaction not found');

            const paymentId = await createPaymentFromBankMatch(
                tx,
                companyId,
                match,
                bankTx,
            );
            await tx
                .update(reconciliationMatches)
                .set({ paymentId, confirmed: true })
                .where(and(eq(reconciliationMatches.id, matchId), matchOfCompany(companyId)));
        } else if (
            match.matchType === 'reimbursement' &&
            match.reimbursementId
        ) {
            const [bankTx] = await tx
                .select()
                .from(bankTransactions)
                .where(
                    and(
                        eq(bankTransactions.id, match.bankTransactionId),
                        rowOfCompany(bankTransactions.bankAccountId, bankAccounts, companyId),
                    ),
                )
                .limit(1);
            if (!bankTx)
                throw new ReconciliationError('Bank transaction not found');

            const paidAt = new Date(`${bankTx.bookedAt}T12:00:00Z`);
            await payReimbursementRun(
                tx,
                companyId,
                match.reimbursementId,
                paidAt,
            );
            await tx
                .update(reconciliationMatches)
                .set({ confirmed: true })
                .where(and(eq(reconciliationMatches.id, matchId), matchOfCompany(companyId)));
        } else if (match.matchType === 'expense' && match.expenseId) {
            const [expense] = await tx
                .select()
                .from(expenses)
                .where(
                    and(
                        eq(expenses.id, match.expenseId),
                        eq(expenses.companyId, companyId),
                    ),
                )
                .limit(1);
            const [bankTx] = await tx
                .select({ amountPence: bankTransactions.amountPence })
                .from(bankTransactions)
                .where(
                    and(
                        eq(bankTransactions.id, match.bankTransactionId),
                        rowOfCompany(bankTransactions.bankAccountId, bankAccounts, companyId),
                    ),
                )
                .limit(1);
            if (!expense || !bankTx)
                throw new ReconciliationError('Match not found');
            await tx
                .update(expenses)
                .set(
                    await expenseSettlementFields(
                        tx,
                        companyId,
                        expense,
                        bankTx.amountPence,
                    ),
                )
                .where(
                    and(
                        eq(expenses.id, match.expenseId),
                        eq(expenses.companyId, companyId),
                    ),
                );
            await tx
                .update(reconciliationMatches)
                .set({ confirmed: true })
                .where(and(eq(reconciliationMatches.id, matchId), matchOfCompany(companyId)));
        } else {
            await tx
                .update(reconciliationMatches)
                .set({ confirmed: true })
                .where(and(eq(reconciliationMatches.id, matchId), matchOfCompany(companyId)));
        }
    });
}

export async function confirmMatchesBatch(
    companyId: string,
    matchIds: string[],
) {
    for (const id of matchIds) {
        await confirmMatch(companyId, id);
    }
}

export async function dismissMatch(companyId: string, matchId: string) {
    const db = getDb();
    const match = await getMatchForCompany(db, companyId, matchId);
    if (!match) throw new ReconciliationError('Match not found');
    await db
        .delete(reconciliationMatches)
        .where(
            and(
                eq(reconciliationMatches.id, matchId),
                eq(reconciliationMatches.confirmed, false),
                matchOfCompany(companyId),
            ),
        );
}

export async function dismissMatchesBatch(
    companyId: string,
    matchIds: string[],
) {
    if (matchIds.length === 0) return;
    for (const id of matchIds) {
        await dismissMatch(companyId, id);
    }
}

const CREDIT_EXPLAIN_TYPES: readonly CreditExplainType[] = [
    'other_income',
    'transfer',
    'tax_or_loan',
];

/** Explain an unmatched incoming credit (other income, transfer, tax/loan). */
export async function explainBankCredit(
    companyId: string,
    transactionId: string,
    input: CreditExplainInput,
): Promise<{ matchId: string }> {
    const { matchIds } = await explainBankCredits(companyId, [transactionId], input);
    return { matchId: matchIds[0] };
}

/**
 * This company's bank transactions among `ids`, as a query to use inside
 * another statement. reconciliation_matches has no company_id, so each query on
 * it scopes itself through this rather than relying on an earlier read.
 */
function transactionIdsOfCompany(
    db: Pick<ReturnType<typeof getDb>, 'select'>,
    companyId: string,
    ids: string[],
) {
    return db
        .select({ id: bankTransactions.id })
        .from(bankTransactions)
        .innerJoin(bankAccounts, eq(bankTransactions.bankAccountId, bankAccounts.id))
        .where(and(inArray(bankTransactions.id, ids), eq(bankAccounts.companyId, companyId)));
}

/**
 * Give several incoming credits the same explanation. All or nothing: if any
 * row can't be explained, none are.
 */
export async function explainBankCredits(
    companyId: string,
    transactionIds: string[],
    input: CreditExplainInput,
): Promise<{ matchIds: string[] }> {
    const ids = [...new Set(transactionIds)];
    if (ids.length === 0) throw new ReconciliationError('Select some transactions');
    const single = ids.length === 1;
    const some = (count: number, what: string) =>
        `${count} of the selected transactions ${what}`;

    const db = getDb();
    const rows = await db
        .select({
            id: bankTransactions.id,
            amountPence: bankTransactions.amountPence,
            bookedAt: bankTransactions.bookedAt,
        })
        .from(bankTransactions)
        .innerJoin(
            bankAccounts,
            eq(bankTransactions.bankAccountId, bankAccounts.id),
        )
        .where(
            and(
                inArray(bankTransactions.id, ids),
                eq(bankAccounts.companyId, companyId),
            ),
        );
    if (rows.length !== ids.length) {
        throw new ReconciliationError('Bank transaction not found');
    }
    const outgoing = rows.filter((r) => r.amountPence <= 0).length;
    if (outgoing > 0) {
        throw new ReconciliationError(
            single
                ? 'Only incoming credits can be explained this way'
                : some(outgoing, 'are not incoming credits'),
        );
    }
    const locked = periodLockError(
        await getBooksLockedThrough(companyId),
        ...rows.map((r) => r.bookedAt),
    );
    if (locked) throw new ReconciliationError(locked);

    const resolvedCategory =
        input.matchType === 'other_income'
            ? await resolveIncomeCategory(companyId, input.incomeCategory)
            : null;
    const parsed = parseCreditExplainInput(input, resolvedCategory);
    if (!parsed.ok) throw new ReconciliationError(parsed.error);

    return db.transaction(async (dbTx) => {
        const own = transactionIdsOfCompany(dbTx, companyId, ids);
        const ownMatches = inArray(reconciliationMatches.bankTransactionId, own);
        const confirmed = await dbTx
            .select({ id: reconciliationMatches.bankTransactionId })
            .from(reconciliationMatches)
            .where(
                and(ownMatches, eq(reconciliationMatches.confirmed, true)),
            );
        const reconciled = new Set(confirmed.map((c) => c.id)).size;
        if (reconciled > 0) {
            throw new ReconciliationError(
                single
                    ? 'This transaction is already reconciled'
                    : some(reconciled, 'are already reconciled'),
            );
        }

        await dbTx
            .delete(reconciliationMatches)
            .where(
                and(ownMatches, eq(reconciliationMatches.confirmed, false)),
            );

        const ownIds = await own;
        if (ownIds.length !== ids.length) {
            throw new ReconciliationError('Bank transaction not found');
        }
        const created = await dbTx
            .insert(reconciliationMatches)
            .values(
                ownIds.map(({ id: bankTransactionId }) => ({
                    bankTransactionId,
                    matchType: parsed.value.matchType,
                    incomeCategory: parsed.value.incomeCategory,
                    note: parsed.value.note,
                    confirmed: true,
                })),
            )
            .returning({ id: reconciliationMatches.id });

        return { matchIds: created.map((c) => c.id) };
    });
}

export type OwnerExplainType = 'drawings' | 'money_put_in' | 'salary';

const OWNER_EXPLAIN_TYPES: readonly string[] = ['drawings', 'money_put_in', 'salary'];

export function isOwnerExplainType(value: string): value is OwnerExplainType {
    return OWNER_EXPLAIN_TYPES.includes(value);
}

/**
 * Mark bank transactions as money between the business and its people rather
 * than an expense or income: a sole trader's drawings (money out) or money
 * put in (money in), or a limited company's salary payment to one person.
 * All or nothing, like {@link explainBankCredits}.
 */
export async function explainOwnerTransactions(
    companyId: string,
    transactionIds: string[],
    input: { matchType: OwnerExplainType; personUserId?: string | null; note?: string | null },
): Promise<{ matchIds: string[] }> {
    const ids = [...new Set(transactionIds)];
    if (ids.length === 0) throw new ReconciliationError('Select some transactions');

    const db = getDb();
    const [company] = await db
        .select({ entityType: companies.entityType })
        .from(companies)
        .where(eq(companies.id, companyId))
        .limit(1);
    const soleTrader = company?.entityType === 'sole_trader';
    if (input.matchType === 'salary' ? soleTrader : !soleTrader) {
        throw new ReconciliationError(
            input.matchType === 'salary'
                ? 'Salary is only for limited companies. Mark money you take out as drawings.'
                : 'Drawings and money put in are only for sole traders.',
        );
    }

    const rows = await db
        .select({
            id: bankTransactions.id,
            amountPence: bankTransactions.amountPence,
            bookedAt: bankTransactions.bookedAt,
        })
        .from(bankTransactions)
        .innerJoin(bankAccounts, eq(bankTransactions.bankAccountId, bankAccounts.id))
        .where(and(inArray(bankTransactions.id, ids), eq(bankAccounts.companyId, companyId)));
    if (rows.length !== ids.length) {
        throw new ReconciliationError('Bank transaction not found');
    }
    const wantsIncoming = input.matchType === 'money_put_in';
    if (rows.some((r) => (wantsIncoming ? r.amountPence <= 0 : r.amountPence >= 0))) {
        throw new ReconciliationError(
            wantsIncoming
                ? 'Only money coming in can be marked as money put in'
                : 'Only money going out can be marked this way',
        );
    }
    const locked = periodLockError(
        await getBooksLockedThrough(companyId),
        ...rows.map((r) => r.bookedAt),
    );
    if (locked) throw new ReconciliationError(locked);

    let personUserId: string | null = null;
    if (input.matchType === 'salary') {
        const [person] = input.personUserId
            ? await db
                  .select({ id: users.id })
                  .from(users)
                  .where(and(eq(users.id, input.personUserId), eq(users.companyId, companyId)))
                  .limit(1)
            : [];
        if (!person) throw new ReconciliationError('Choose who the salary was paid to');
        personUserId = person.id;
    }
    const note = input.note?.trim() ? input.note.trim().slice(0, 500) : null;

    return db.transaction(async (dbTx) => {
        const ownTransactions = transactionIdsOfCompany(dbTx, companyId, ids);
        const ownMatches = inArray(reconciliationMatches.bankTransactionId, ownTransactions);
        const confirmed = await dbTx
            .select({ id: reconciliationMatches.bankTransactionId })
            .from(reconciliationMatches)
            .where(
                and(ownMatches, eq(reconciliationMatches.confirmed, true)),
            );
        if (confirmed.length > 0) {
            throw new ReconciliationError(
                ids.length === 1
                    ? 'This transaction is already reconciled'
                    : 'Some of the selected transactions are already reconciled',
            );
        }
        await dbTx
            .delete(reconciliationMatches)
            .where(
                and(ownMatches, eq(reconciliationMatches.confirmed, false)),
            );
        const own = await ownTransactions;
        if (own.length !== ids.length) {
            throw new ReconciliationError('Bank transaction not found');
        }
        const created = await dbTx
            .insert(reconciliationMatches)
            .values(
                own.map(({ id: bankTransactionId }) => ({
                    bankTransactionId,
                    matchType: input.matchType,
                    personUserId,
                    note,
                    confirmed: true,
                })),
            )
            .returning({ id: reconciliationMatches.id });
        return { matchIds: created.map((c) => c.id) };
    });
}

/** Remove an explanation: other income, transfer, tax or loan, drawings, money put in or salary. */
export async function clearBankCreditExplanation(
    companyId: string,
    matchId: string,
) {
    const db = getDb();
    const match = await getMatchForCompany(db, companyId, matchId);
    if (!match) throw new ReconciliationError('Match not found');
    if (
        !(CREDIT_EXPLAIN_TYPES as readonly string[]).includes(match.matchType) &&
        !OWNER_EXPLAIN_TYPES.includes(match.matchType)
    ) {
        throw new ReconciliationError(
            'Only credit explanations can be cleared this way',
        );
    }
    await assertBankRowOpen(db, companyId, match.bankTransactionId);
    await db
        .delete(reconciliationMatches)
        .where(and(eq(reconciliationMatches.id, matchId), matchOfCompany(companyId)));
}

/** Incoming bank transactions not linked to any reconciliation match. */
export async function listUnmatchedIncomingTransactions(companyId: string) {
    const db = getDb();
    return db
        .select({ tx: bankTransactions })
        .from(bankTransactions)
        .innerJoin(
            bankAccounts,
            eq(bankTransactions.bankAccountId, bankAccounts.id),
        )
        .leftJoin(
            reconciliationMatches,
            eq(reconciliationMatches.bankTransactionId, bankTransactions.id),
        )
        .where(
            and(
                eq(bankAccounts.companyId, companyId),
                isNull(reconciliationMatches.id),
                gt(bankTransactions.amountPence, 0),
            ),
        );
}

export async function findBankTransactionsForInvoice(
    companyId: string,
    invoiceId: string,
): Promise<InvoiceBankMatch[]> {
    const found = await loadInvoiceTarget(companyId, invoiceId);
    if (!found) return [];
    return rankIncomingForInvoice(companyId, found.invoiceTarget, found.referenceDate, {
        minScore: 70,
    });
}

/**
 * Every unlinked bank credit that could pay the invoice (up to its balance
 * plus the overpayment allowance), newest first, for picking by hand when
 * none scored well enough to suggest. Leaves out `excludeIds`.
 */
export async function listLinkableReceiptsForInvoice(
    companyId: string,
    invoiceId: string,
    excludeIds: ReadonlySet<string>,
    limit = 100,
): Promise<InvoiceBankMatch[]> {
    const found = await loadInvoiceTarget(companyId, invoiceId);
    if (!found) return [];
    const { invoiceTarget, referenceDate } = found;
    const unmatched = await listUnmatchedIncomingTransactions(companyId);
    return unmatched
        .map(({ tx }) => tx)
        .filter(
            (tx) =>
                !excludeIds.has(tx.id) &&
                canSettleInvoiceBalance(tx.amountPence, invoiceTarget.balancePence),
        )
        .sort((a, b) => b.bookedAt.localeCompare(a.bookedAt))
        .slice(0, limit)
        .map((tx) => {
            const breakdown = scoreBankTxForInvoice(
                txLikeFromRow(tx),
                invoiceTarget,
                referenceDate,
            );
            return {
                bankTransactionId: tx.id,
                bookedAt: tx.bookedAt,
                amountPence: tx.amountPence,
                amountFormatted: formatGBP(tx.amountPence),
                counterparty: tx.counterparty,
                reference: tx.reference,
                score: breakdown.total,
                breakdown,
            };
        });
}

/** The invoice as a match target, with what's still owed; null when nothing is. */
async function loadInvoiceTarget(companyId: string, invoiceId: string) {
    const db = getDb();
    const rows = await db
        .select({ invoice: invoices, client: clients })
        .from(invoices)
        .innerJoin(clients, eq(invoices.clientId, clients.id))
        .where(
            and(eq(invoices.id, invoiceId), eq(invoices.companyId, companyId)),
        )
        .limit(1);
    if (!rows[0]) return null;

    const { invoice, client } = rows[0];
    // Bank lines are matched on exact pence, which only works for sterling invoices.
    if (isForeignDocumentCurrency(invoice.currency)) return null;
    const balancePence = invoiceAmountDue(
        settlementMinor(
            invoice,
            await paidTotalForInvoice(db, companyId, invoiceId),
            await creditAdjustmentForInvoice(db, companyId, invoiceId),
        ),
    );
    if (balancePence <= 0) return null;

    const referenceDate =
        invoice.dueDate ?? invoice.issueDate ?? todayIsoDate();
    const invoiceTarget = {
        id: invoice.id,
        number: invoice.number,
        name: client.name,
        companyName: client.companyName,
        balancePence,
        dueDate: invoice.dueDate,
        issueDate: invoice.issueDate,
        oldDebt: invoice.source === 'import',
    };
    return { invoiceTarget, referenceDate };
}

/**
 * Bank payments that could settle an invoice still being imported: unmatched
 * credits for exactly its gross, scored like an imported invoice. Rows chosen
 * by other drafts are left out.
 */
export async function findBankTransactionsForImportDraft(
    companyId: string,
    draft: {
        number: string | null;
        clientName: string | null;
        clientCompanyName: string | null;
        grossPence: number;
        issueDate: string;
        dueDate: string | null;
    },
    excludeIds: ReadonlySet<string>,
): Promise<InvoiceBankMatch[]> {
    if (draft.grossPence <= 0) return [];
    return rankIncomingForInvoice(
        companyId,
        {
            id: '',
            number: draft.number ?? '',
            name: draft.clientName ?? '',
            companyName: draft.clientCompanyName,
            balancePence: draft.grossPence,
            dueDate: draft.dueDate,
            issueDate: draft.issueDate,
            oldDebt: true,
        },
        draft.dueDate ?? draft.issueDate,
        {
            minScore: 1,
            accept: (tx) =>
                tx.amountPence === draft.grossPence && !excludeIds.has(tx.id),
        },
    );
}

async function rankIncomingForInvoice(
    companyId: string,
    invoiceTarget: Parameters<typeof scoreBankTxForInvoice>[1],
    referenceDate: string,
    opts: {
        minScore: number;
        accept?: (tx: typeof bankTransactions.$inferSelect) => boolean;
    },
): Promise<InvoiceBankMatch[]> {
    const unmatched = await listUnmatchedIncomingTransactions(companyId);
    const scored: InvoiceBankMatch[] = [];

    for (const { tx } of unmatched) {
        if (!canSettleInvoiceBalance(tx.amountPence, invoiceTarget.balancePence)) continue;
        if (opts.accept && !opts.accept(tx)) continue;
        const breakdown = scoreBankTxForInvoice(
            txLikeFromRow(tx),
            invoiceTarget,
            referenceDate,
        );
        if (breakdown.total < opts.minScore) continue;
        scored.push({
            bankTransactionId: tx.id,
            bookedAt: tx.bookedAt,
            amountPence: tx.amountPence,
            amountFormatted: formatGBP(tx.amountPence),
            counterparty: tx.counterparty,
            reference: tx.reference,
            score: breakdown.total,
            breakdown,
        });
    }

    scored.sort(
        (a, b) => b.score - a.score || b.bookedAt.localeCompare(a.bookedAt),
    );
    return scored;
}

/** Outgoing bank transactions not linked to any reconciliation match. */
export async function listUnmatchedOutgoingTransactions(companyId: string) {
    const db = getDb();
    return db
        .select({ tx: bankTransactions })
        .from(bankTransactions)
        .innerJoin(
            bankAccounts,
            eq(bankTransactions.bankAccountId, bankAccounts.id),
        )
        .leftJoin(
            reconciliationMatches,
            eq(reconciliationMatches.bankTransactionId, bankTransactions.id),
        )
        .where(
            and(
                eq(bankAccounts.companyId, companyId),
                isNull(reconciliationMatches.id),
                lt(bankTransactions.amountPence, 0),
            ),
        );
}

export async function findReimbursementBankMatches(
    companyId: string,
    reimbursementId: string,
): Promise<ReimbursementBankMatch[]> {
    const db = getDb();
    const [run] = await db
        .select({
            run: reimbursements,
            payeeName: users.name,
            payeeEmail: users.email,
        })
        .from(reimbursements)
        .innerJoin(users, eq(reimbursements.payeeUserId, users.id))
        .where(
            and(
                eq(reimbursements.id, reimbursementId),
                eq(reimbursements.companyId, companyId),
            ),
        )
        .limit(1);
    if (!run || run.run.status !== 'pending') return [];

    const referenceDate =
        run.run.reimbursementDate ?? run.run.createdAt.toISOString().slice(0, 10);
    const payeeLabel = run.payeeName || run.payeeEmail;
    const unmatched = await listUnmatchedOutgoingTransactions(companyId);
    const scored: ReimbursementBankMatch[] = [];

    for (const { tx } of unmatched) {
        if (Math.abs(tx.amountPence) !== run.run.totalPence) continue;
        const match = pickBestMatch(txLikeFromRow(tx), [
            {
                id: run.run.id,
                amountPence: run.run.totalPence,
                date: referenceDate,
                reference: [run.run.reference, payeeLabel]
                    .filter(Boolean)
                    .join(' '),
            },
        ]);
        if (!match || match.breakdown.total < 70) continue;
        scored.push({
            bankTransactionId: tx.id,
            bookedAt: tx.bookedAt,
            amountPence: tx.amountPence,
            amountFormatted: formatGBP(tx.amountPence),
            counterparty: tx.counterparty,
            reference: tx.reference,
            score: match.breakdown.total,
            breakdown: match.breakdown,
        });
    }

    scored.sort(
        (a, b) => b.score - a.score || b.bookedAt.localeCompare(a.bookedAt),
    );
    return scored;
}

export async function getBankTransactionById(
    companyId: string,
    transactionId: string,
) {
    const db = getDb();
    const [row] = await db
        .select({ tx: bankTransactions })
        .from(bankTransactions)
        .innerJoin(
            bankAccounts,
            eq(bankTransactions.bankAccountId, bankAccounts.id),
        )
        .where(
            and(
                eq(bankTransactions.id, transactionId),
                eq(bankAccounts.companyId, companyId),
            ),
        )
        .limit(1);
    return row?.tx ?? null;
}

/**
 * Lock the company's bank transaction row until the transaction ends, so two
 * requests can't both claim it. Take it before any invoice lock.
 * Returns false when the company has no such transaction.
 */
export async function lockBankTransaction(
    tx: Parameters<Parameters<ReturnType<typeof getDb>['transaction']>[0]>[0],
    companyId: string,
    transactionId: string,
): Promise<boolean> {
    const rows = await tx
        .select({ id: bankTransactions.id })
        .from(bankTransactions)
        .innerJoin(
            bankAccounts,
            eq(bankTransactions.bankAccountId, bankAccounts.id),
        )
        .where(
            and(
                eq(bankTransactions.id, transactionId),
                eq(bankAccounts.companyId, companyId),
            ),
        )
        .for('update', { of: bankTransactions });
    return rows.length > 0;
}

export async function isBankTransactionAvailable(
    companyId: string,
    transactionId: string,
): Promise<boolean> {
    const db = getDb();
    const [match] = await db
        .select({ id: reconciliationMatches.id })
        .from(reconciliationMatches)
        .where(
            and(
                eq(reconciliationMatches.bankTransactionId, transactionId),
                matchOfCompany(companyId),
            ),
        )
        .limit(1);
    return !match;
}

export async function updateTransactionCategory(
    companyId: string,
    transactionId: string,
    spendingCategory: string | null,
) {
    const db = getDb();
    const tx = await getBankTransactionById(companyId, transactionId);
    if (!tx) throw new Error('Bank transaction not found');
    const resolved =
        spendingCategory === null
            ? null
            : await upsertBankSpendingCategory(companyId, spendingCategory);
    await db
        .update(bankTransactions)
        // A manual choice replaces any pending suggestion, and teaches future ones.
        .set({
            spendingCategory: resolved,
            suggestedCategory: null,
            suggestedCategoryReason: null,
            suggestedCategorySource: null,
        })
        .where(
            and(
                eq(bankTransactions.id, transactionId),
                rowOfCompany(bankTransactions.bankAccountId, bankAccounts, companyId),
            ),
        );
}

export { ReconciliationError };
