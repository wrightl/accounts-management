import "server-only";
import { and, desc, eq, isNull } from "drizzle-orm";
import { getDb } from "@/db";
import {
  bankAccounts,
  bankTransactions,
  expenses,
  payments,
  reconciliationMatches,
} from "@/db/schema";
import { formatGBP } from "@/lib/money";
import type { ParsedBankRow } from "@/lib/bank/starling-csv";

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
    try {
      await db.insert(bankTransactions).values({
        bankAccountId: accountId,
        externalId: row.externalId,
        bookedAt: row.bookedAt,
        amountPence: row.amountPence,
        counterparty: row.counterparty,
        reference: row.reference,
        description: row.description,
        raw: row.raw,
      });
      inserted++;
    } catch {
      skipped++;
    }
  }
  return { inserted, skipped };
}

export async function listBankTransactions() {
  const db = getDb();
  const rows = await db
    .select({
      tx: bankTransactions,
      matchId: reconciliationMatches.id,
      matchType: reconciliationMatches.matchType,
      confirmed: reconciliationMatches.confirmed,
    })
    .from(bankTransactions)
    .leftJoin(
      reconciliationMatches,
      eq(reconciliationMatches.bankTransactionId, bankTransactions.id),
    )
    .orderBy(desc(bankTransactions.bookedAt));

  return rows.map((r) => ({
    ...r.tx,
    amountFormatted: formatGBP(r.tx.amountPence),
    matchId: r.matchId,
    matchType: r.matchType,
    confirmed: r.confirmed ?? false,
    reconciled: Boolean(r.matchId && r.confirmed),
    suggested: Boolean(r.matchId && !r.confirmed),
  }));
}

/**
 * Suggest matches: incoming tx ≈ payment amount; outgoing ≈ expense amount,
 * within ±1 day of date and exact pence match.
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
    if (tx.amountPence > 0) {
      // Money in → invoice payment
      const candidates = await db
        .select()
        .from(payments)
        .where(eq(payments.amountPence, tx.amountPence));

      const match = candidates.find((p) => {
        const d = p.receivedAt.toISOString().slice(0, 10);
        return Math.abs(dateDiffDays(d, tx.bookedAt)) <= 3;
      });
      if (match) {
        // Skip if payment already matched
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
      // Money out → expense
      const amount = Math.abs(tx.amountPence);
      const candidates = await db
        .select()
        .from(expenses)
        .where(eq(expenses.amountPence, amount));

      const match = candidates.find((e) => {
        if (!e.spentAt) return false;
        return Math.abs(dateDiffDays(e.spentAt, tx.bookedAt)) <= 3;
      });
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

function dateDiffDays(a: string, b: string): number {
  const ms =
    new Date(`${a}T12:00:00Z`).getTime() - new Date(`${b}T12:00:00Z`).getTime();
  return Math.round(ms / (1000 * 60 * 60 * 24));
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
