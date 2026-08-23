import "server-only";
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
  type SQL,
} from "drizzle-orm";
import {
  BANK_PAGE_SIZE,
  bankSearchPattern,
  type BankListParams,
} from "@/lib/bank/list-params";
import { getDb } from "@/db";
import {
  bankAccounts,
  bankTransactions,
  expenses,
  invoices,
  payments,
  reconciliationMatches,
} from "@/db/schema";
import { formatGBP } from "@/lib/money";
import type { ParsedBankRow } from "@/lib/bank/starling-csv";
import { pickBestMatch } from "@/lib/bank/match";
import { upsertBankSpendingCategory } from "@/lib/bank/spending-categories";

export async function getOrCreateDefaultBankAccount() {
  const db = getDb();
  const existing = await db.select().from(bankAccounts).limit(1);
  if (existing[0]) return existing[0];
  const [created] = await db
    .insert(bankAccounts)
    .values({ name: "Starling Business", provider: "starling" })
    .returning();
  return created;
}

export async function importBankRows(
  accountId: string,
  rows: ParsedBankRow[],
): Promise<{ inserted: number; skipped: number }> {
  const db = getDb();
  let inserted = 0;
  let skipped = 0;

  for (const row of rows) {
    const spendingCategory = row.spendingCategory
      ? await upsertBankSpendingCategory(row.spendingCategory)
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
  return { inserted, skipped };
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

export function bankListWhere(
  filters: Partial<Pick<BankListParams, "q" | "type" | "category" | "from" | "to">>,
): SQL | undefined {
  const conditions: SQL[] = [];
  const pattern = filters.q ? bankSearchPattern(filters.q) : null;
  if (pattern) {
    const search = or(
      ilike(bankTransactions.counterparty, pattern),
      ilike(bankTransactions.reference, pattern),
      ilike(bankTransactions.description, pattern),
    );
    if (search) conditions.push(search);
  }
  if (filters.type === "incoming") conditions.push(gt(bankTransactions.amountPence, 0));
  if (filters.type === "outgoing") conditions.push(lt(bankTransactions.amountPence, 0));
  if (filters.category) conditions.push(eq(bankTransactions.spendingCategory, filters.category));
  if (filters.from) conditions.push(gte(bankTransactions.bookedAt, filters.from));
  if (filters.to) conditions.push(lte(bankTransactions.bookedAt, filters.to));
  return conditions.length ? and(...conditions) : undefined;
}

export async function listBankTransactions(
  filters: Partial<Pick<BankListParams, "q" | "type" | "category" | "from" | "to" | "page">> & {
    pageSize?: number;
  } = {},
): Promise<BankTransactionListResult> {
  const db = getDb();
  const pageSize = filters.pageSize ?? BANK_PAGE_SIZE;
  const where = bankListWhere(filters);

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
    .orderBy(desc(bankTransactions.bookedAt), desc(bankTransactions.createdAt))
    .limit(pageSize)
    .offset(offset);

  if (pageTx.length === 0) {
    return { rows: [], total, page, pageSize, pageCount };
  }

  const matches = await db
    .select()
    .from(reconciliationMatches)
    .where(inArray(reconciliationMatches.bankTransactionId, pageTx.map((tx) => tx.id)));

  const matchByTx = new Map<(typeof matches)[number]["bankTransactionId"], (typeof matches)[number]>();
  for (const match of matches) {
    const existing = matchByTx.get(match.bankTransactionId);
    if (!existing || (match.confirmed && !existing.confirmed)) {
      matchByTx.set(match.bankTransactionId, match);
    }
  }

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
      confirmed: match?.confirmed ?? false,
      reconciled: Boolean(match?.id && match.confirmed),
      suggested: Boolean(match?.id && !match.confirmed),
    };
  });

  return { rows, total, page, pageSize, pageCount };
}

/** Unreconciled count across the whole ledger (ignores list filters). */
export async function countUnreconciledBankTransactions(): Promise<number> {
  const db = getDb();
  const [row] = await db
    .select({ total: count() })
    .from(bankTransactions)
    .leftJoin(
      reconciliationMatches,
      and(
        eq(reconciliationMatches.bankTransactionId, bankTransactions.id),
        eq(reconciliationMatches.confirmed, true),
      ),
    )
    .where(isNull(reconciliationMatches.id));
  return row?.total ?? 0;
}

/**
 * Suggest matches: incoming tx → payment; outgoing tx → expense.
 * Exact pence required; date window and invoice number in the reference
 * are scored in {@link pickBestMatch}.
 */
export async function suggestMatches(): Promise<number> {
  const db = getDb();
  const unmatched = await db
    .select({ tx: bankTransactions })
    .from(bankTransactions)
    .leftJoin(
      reconciliationMatches,
      eq(reconciliationMatches.bankTransactionId, bankTransactions.id),
    )
    .where(isNull(reconciliationMatches.id));

  let created = 0;

  for (const { tx } of unmatched) {
    const txLike = {
      amountPence: tx.amountPence,
      bookedAt: tx.bookedAt,
      reference: tx.reference,
      description: tx.description,
    };

    if (tx.amountPence > 0) {
      const candidates = await db
        .select({
          id: payments.id,
          amountPence: payments.amountPence,
          receivedAt: payments.receivedAt,
          reference: payments.reference,
          invoiceNumber: invoices.number,
        })
        .from(payments)
        .innerJoin(invoices, eq(payments.invoiceId, invoices.id))
        .where(eq(payments.amountPence, tx.amountPence));

      const match = pickBestMatch(
        txLike,
        candidates.map((p) => ({
          id: p.id,
          amountPence: p.amountPence,
          date: p.receivedAt.toISOString().slice(0, 10),
          invoiceNumber: p.invoiceNumber,
          reference: p.reference,
        })),
      );
      if (match) {
        const existing = await db
          .select()
          .from(reconciliationMatches)
          .where(eq(reconciliationMatches.paymentId, match.id))
          .limit(1);
        if (!existing[0]) {
          await db.insert(reconciliationMatches).values({
            bankTransactionId: tx.id,
            matchType: "invoice_payment",
            paymentId: match.id,
            confirmed: false,
          });
          created++;
        }
      }
    } else {
      const amount = Math.abs(tx.amountPence);
      const candidates = await db
        .select()
        .from(expenses)
        .where(eq(expenses.amountPence, amount));

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
      if (match) {
        const existing = await db
          .select()
          .from(reconciliationMatches)
          .where(eq(reconciliationMatches.expenseId, match.id))
          .limit(1);
        if (!existing[0]) {
          await db.insert(reconciliationMatches).values({
            bankTransactionId: tx.id,
            matchType: "expense",
            expenseId: match.id,
            confirmed: false,
          });
          created++;
        }
      }
    }
  }

  return created;
}

function isUniqueViolation(err: unknown): boolean {
  const code =
    typeof err === "object" && err !== null
      ? String(
          (err as { code?: string }).code ??
            (err as { cause?: { code?: string } }).cause?.code ??
            "",
        )
      : "";
  if (code === "23505") return true;
  const message = err instanceof Error ? err.message : String(err);
  return /duplicate key|unique constraint/i.test(message);
}

export async function confirmMatch(matchId: string) {
  const db = getDb();
  await db
    .update(reconciliationMatches)
    .set({ confirmed: true })
    .where(eq(reconciliationMatches.id, matchId));
}

export async function dismissMatch(matchId: string) {
  const db = getDb();
  await db
    .delete(reconciliationMatches)
    .where(and(eq(reconciliationMatches.id, matchId), eq(reconciliationMatches.confirmed, false)));
}

export async function updateTransactionCategory(
  transactionId: string,
  spendingCategory: string | null,
) {
  const db = getDb();
  const resolved =
    spendingCategory === null ? null : await upsertBankSpendingCategory(spendingCategory);
  await db
    .update(bankTransactions)
    .set({ spendingCategory: resolved })
    .where(eq(bankTransactions.id, transactionId));
}
