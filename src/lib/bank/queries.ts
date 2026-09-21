import 'server-only';
import {
    and,
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
    type SQL,
} from 'drizzle-orm';
import {
    BANK_PAGE_SIZE,
    bankSearchPattern,
    type BankListParams,
} from '@/lib/bank/list-params';
import { getDb } from '@/db';
import {
    bankAccounts,
    bankTransactions,
    clients,
    expenses,
    invoices,
    payments,
    reconciliationMatches,
    reimbursements,
    users,
} from '@/db/schema';
import { formatGBP } from '@/lib/money';
import { payReimbursementRun } from '@/lib/reimbursements/pay';
import type { ParsedBankRow, GenericCsvMapping } from '@/lib/bank/types';
import {
    pickBestMatch,
    scoreBankTxForInvoice,
    type MatchScoreBreakdown,
} from '@/lib/bank/match';
import { upsertBankSpendingCategory } from '@/lib/bank/spending-categories';
import {
    effectiveStatus,
    isFullySettled,
    todayIsoDate,
    type InvoiceStatus,
} from '@/lib/invoices/status';
import { clientDisplayName } from '@/lib/clients/display';
import {
    resolveBankDisplayName,
    type BankProviderId,
} from '@/lib/bank/providers';

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
    bookedAt: string;
    amountPence: number;
    counterparty: string | null;
    reference: string | null;
    description: string | null;
    spendingCategory: string | null;
    amountFormatted: string;
    matchId: string | null;
    matchType: string | null;
    matchLabel: string | null;
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
            'q' | 'type' | 'category' | 'reconciliation' | 'from' | 'to'
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
    if (filters.from)
        conditions.push(gte(bankTransactions.bookedAt, filters.from));
    if (filters.to) conditions.push(lte(bankTransactions.bookedAt, filters.to));
    return conditions.length ? and(...conditions) : undefined;
}

async function paidTotalForInvoice(
    db: ReturnType<typeof getDb>,
    invoiceId: string,
) {
    const [row] = await db
        .select({ total: sum(payments.amountPence).mapWith(Number) })
        .from(payments)
        .where(eq(payments.invoiceId, invoiceId));
    return row?.total ?? 0;
}

async function buildMatchLabels(
    db: ReturnType<typeof getDb>,
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
            .where(inArray(payments.id, paymentIds));
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
        } else if (match.expenseId) {
            matchLabels.set(match.id, labels.get(match.expenseId) ?? 'Expense');
        }
    }
    return matchLabels;
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
            | 'from'
            | 'to'
            | 'page'
        >
    > & {
        pageSize?: number;
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
        .orderBy(
            desc(bankTransactions.bookedAt),
            desc(bankTransactions.createdAt),
        )
        .limit(pageSize)
        .offset(offset);

    if (pageTx.length === 0) {
        return { rows: [], total, page, pageSize, pageCount };
    }

    const matches = await db
        .select()
        .from(reconciliationMatches)
        .where(
            inArray(
                reconciliationMatches.bankTransactionId,
                pageTx.map((tx) => tx.id),
            ),
        );

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

    const labelByMatchId = await buildMatchLabels(db, matches);

    const rows: BankTransactionListItem[] = pageTx.map((tx) => {
        const match = matchByTx.get(tx.id);
        return {
            id: tx.id,
            bookedAt: tx.bookedAt,
            amountPence: tx.amountPence,
            counterparty: tx.counterparty,
            reference: tx.reference,
            description: tx.description,
            spendingCategory: tx.spendingCategory,
            amountFormatted: formatGBP(tx.amountPence),
            matchId: match?.id ?? null,
            matchType: match?.matchType ?? null,
            matchLabel: match ? (labelByMatchId.get(match.id) ?? null) : null,
            confirmed: match?.confirmed ?? false,
            reconciled: Boolean(match?.id && match.confirmed),
            suggested: Boolean(match?.id && !match.confirmed),
        };
    });

    return { rows, total, page, pageSize, pageCount };
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

async function findIncomingMatch(
    db: ReturnType<typeof getDb>,
    companyId: string,
    tx: typeof bankTransactions.$inferSelect,
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

    const invoiceRows = await db
        .select({
            id: invoices.id,
            number: invoices.number,
            grossPence: invoices.grossPence,
            status: invoices.status,
            dueDate: invoices.dueDate,
            issueDate: invoices.issueDate,
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

    const invoiceCandidates = [];
    for (const inv of invoiceRows) {
        const paid = await paidTotalForInvoice(db, inv.id);
        const balance = Math.max(0, inv.grossPence - paid);
        if (balance !== tx.amountPence) continue;
        const referenceDate = inv.dueDate ?? inv.issueDate ?? tx.bookedAt;
        invoiceCandidates.push({
            id: inv.id,
            amountPence: balance,
            date: referenceDate ?? tx.bookedAt,
            invoiceNumber: inv.number,
            clientName: inv.clientName,
            companyName: inv.companyName,
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
            target: {
                kind: 'invoice_payment' as const,
                invoiceNumber: inv.invoiceNumberDisplay,
                clientName: inv.clientDisplay,
                invoiceId: inv.invoiceId,
            },
        };
    }

    return null;
}

/**
 * Suggest matches: incoming tx → payment or unpaid invoice; outgoing tx → reimbursement or company-paid expense.
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

    for (const { tx } of unmatched) {
        if (tx.amountPence > 0) {
            const incoming = await findIncomingMatch(db, companyId, tx);
            if (!incoming) continue;

            if (incoming.kind === 'payment') {
                const existing = await db
                    .select()
                    .from(reconciliationMatches)
                    .where(
                        eq(reconciliationMatches.paymentId, incoming.paymentId),
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
                    tx: toSuggestedTx(tx),
                    target: incoming.target,
                });
            } else {
                const existing = await db
                    .select()
                    .from(reconciliationMatches)
                    .where(
                        eq(reconciliationMatches.invoiceId, incoming.invoiceId),
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
                    })
                    .returning();

                created.push({
                    matchId: row.id,
                    bankTransactionId: tx.id,
                    matchType: 'invoice_payment',
                    score: incoming.score,
                    breakdown: incoming.breakdown,
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
                              date: reimbCandidates[0].createdAt
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
                              date: r.createdAt.toISOString().slice(0, 10),
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
                        eq(
                            reconciliationMatches.reimbursementId,
                            reimbMatch.candidate.id,
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

            const candidates = await db
                .select()
                .from(expenses)
                .where(
                    and(
                        eq(expenses.companyId, companyId),
                        eq(expenses.amountPence, amount),
                        eq(expenses.status, 'company_paid'),
                    ),
                );

            const match = pickBestMatch(
                txLike,
                candidates
                    .filter((e) => e.spentAt)
                    .map((e) => ({
                        id: e.id,
                        amountPence: e.amountPence,
                        date: e.spentAt as string,
                        reference: e.description,
                    })),
            );
            if (!match) continue;

            const existing = await db
                .select()
                .from(reconciliationMatches)
                .where(eq(reconciliationMatches.expenseId, match.candidate.id))
                .limit(1);
            if (existing[0]) continue;

            const expense = candidates.find(
                (e) => e.id === match.candidate.id,
            )!;
            const [row] = await db
                .insert(reconciliationMatches)
                .values({
                    bankTransactionId: tx.id,
                    matchType: 'expense',
                    expenseId: match.candidate.id,
                    confirmed: false,
                })
                .returning();

            created.push({
                matchId: row.id,
                bankTransactionId: tx.id,
                matchType: 'expense',
                score: match.breakdown.total,
                breakdown: match.breakdown,
                tx: toSuggestedTx(tx),
                target: {
                    kind: 'expense',
                    description: expense.description ?? 'Expense',
                    expenseId: expense.id,
                },
            });
        }
    }

    return created;
}

function isUniqueViolation(err: unknown): boolean {
    const code =
        typeof err === 'object' && err !== null
            ? String(
                  (err as { code?: string }).code ??
                      (err as { cause?: { code?: string } }).cause?.code ??
                      '',
              )
            : '';
    if (code === '23505') return true;
    const message = err instanceof Error ? err.message : String(err);
    return /duplicate key|unique constraint/i.test(message);
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

    const alreadyPaid = await paidTotalForInvoice(tx, inv.id);
    const remaining = inv.grossPence - alreadyPaid;
    if (bankTx.amountPence > remaining) {
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
            method: 'bank_transfer',
            reference: bankTx.reference,
            receivedAt,
        })
        .returning({ id: payments.id });

    const paidTotal = alreadyPaid + bankTx.amountPence;
    if (isFullySettled(inv.grossPence, paidTotal)) {
        await tx
            .update(invoices)
            .set({ status: 'paid', paidAt: receivedAt })
            .where(
                and(eq(invoices.id, inv.id), eq(invoices.companyId, companyId)),
            );
    }

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

export async function confirmMatch(companyId: string, matchId: string) {
    const db = getDb();
    await db.transaction(async (tx) => {
        const match = await getMatchForCompany(tx, companyId, matchId);
        if (!match) throw new ReconciliationError('Match not found');
        if (match.confirmed) return;

        if (
            match.matchType === 'invoice_payment' &&
            match.invoiceId &&
            !match.paymentId
        ) {
            const [bankTx] = await tx
                .select()
                .from(bankTransactions)
                .where(eq(bankTransactions.id, match.bankTransactionId))
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
                .where(eq(reconciliationMatches.id, matchId));
        } else if (
            match.matchType === 'reimbursement' &&
            match.reimbursementId
        ) {
            const [bankTx] = await tx
                .select()
                .from(bankTransactions)
                .where(eq(bankTransactions.id, match.bankTransactionId))
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
                .where(eq(reconciliationMatches.id, matchId));
        } else if (match.matchType === 'expense' && match.expenseId) {
            await tx
                .update(expenses)
                .set({ status: 'company_paid', paidByUserId: null })
                .where(
                    and(
                        eq(expenses.id, match.expenseId),
                        eq(expenses.companyId, companyId),
                    ),
                );
            await tx
                .update(reconciliationMatches)
                .set({ confirmed: true })
                .where(eq(reconciliationMatches.id, matchId));
        } else {
            await tx
                .update(reconciliationMatches)
                .set({ confirmed: true })
                .where(eq(reconciliationMatches.id, matchId));
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
    const db = getDb();
    const rows = await db
        .select({ invoice: invoices, client: clients })
        .from(invoices)
        .innerJoin(clients, eq(invoices.clientId, clients.id))
        .where(
            and(eq(invoices.id, invoiceId), eq(invoices.companyId, companyId)),
        )
        .limit(1);
    if (!rows[0]) return [];

    const { invoice, client } = rows[0];
    const paid = await paidTotalForInvoice(db, invoiceId);
    const balancePence = Math.max(0, invoice.grossPence - paid);
    if (balancePence <= 0) return [];

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
    };

    const unmatched = await listUnmatchedIncomingTransactions(companyId);
    const scored: InvoiceBankMatch[] = [];

    for (const { tx } of unmatched) {
        if (tx.amountPence > balancePence) continue;
        const breakdown = scoreBankTxForInvoice(
            txLikeFromRow(tx),
            invoiceTarget,
            referenceDate,
        );
        if (breakdown.total < 70) continue;
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

    const referenceDate = run.run.createdAt.toISOString().slice(0, 10);
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

export async function isBankTransactionAvailable(
    transactionId: string,
): Promise<boolean> {
    const db = getDb();
    const [match] = await db
        .select({ id: reconciliationMatches.id })
        .from(reconciliationMatches)
        .where(eq(reconciliationMatches.bankTransactionId, transactionId))
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
        .set({ spendingCategory: resolved })
        .where(eq(bankTransactions.id, transactionId));
}

export { ReconciliationError };
