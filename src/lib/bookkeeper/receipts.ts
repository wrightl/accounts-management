import "server-only";
import { generateText, Output } from "ai";
import { z } from "zod";
import { and, eq, gte, inArray, isNull, lt, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { bankAccounts, bankTransactions, expenses, reconciliationMatches } from "@/db/schema";
import { BULK_MODEL, aiGatewayConfigured } from "@/lib/ai/models";
import { EXPENSE_MATCH_STATUSES } from "@/lib/bank/expense-match";
import { dateDiffDays } from "@/lib/bank/match";
import { todayIsoDate } from "@/lib/dates";
import { addDays } from "@/lib/ledger/corporation-tax";
import { formatGBP } from "@/lib/money";

/** How far apart a receipt and a card payment can be and still be compared. */
export const NEAR_MATCH_DAYS = 7;
const LOOKBACK_DAYS = 120;
const AI_BATCH = 40;

/** Card payments can differ from the receipt by a tip, fee or exchange rate. */
export function withinNearAmount(receiptPence: number, bankPence: number): boolean {
  return Math.abs(receiptPence - bankPence) <= Math.max(500, Math.round(receiptPence * 0.1));
}

/** The AI's one-line reason, with both amounts when they differ. */
export function nearMatchNote(reason: string, receiptPence: number, bankPence: number): string {
  const amounts =
    receiptPence === bankPence
      ? ""
      : ` Receipt ${formatGBP(receiptPence)}, bank ${formatGBP(bankPence)}: check for a tip, fee or exchange rate.`;
  return `AI: ${reason.trim().replace(/\.?$/, ".")}${amounts}`;
}

const aiSchema = z.object({
  matches: z.array(
    z.object({
      expenseId: z.string(),
      bankTransactionId: z.string().nullable(),
      reason: z.string(),
    }),
  ),
});

/**
 * Pair receipts with card payments the exact matcher missed: amounts a little
 * different, or merchant names that read differently on the statement. Each
 * pairing becomes an unconfirmed suggestion for someone to accept.
 */
export async function suggestReceiptMatches(
  companyId: string,
  today: string = todayIsoDate(),
): Promise<{ suggested: number; aiUnavailable: boolean }> {
  if (!aiGatewayConfigured()) return { suggested: 0, aiUnavailable: true };
  const db = getDb();
  const since = addDays(today, -LOOKBACK_DAYS);

  const [receipts, payments] = await Promise.all([
    db
      .select({
        id: expenses.id,
        description: expenses.description,
        amountPence: expenses.amountPence,
        spentAt: expenses.spentAt,
        currency: expenses.detectedCurrency,
      })
      .from(expenses)
      .leftJoin(reconciliationMatches, eq(reconciliationMatches.expenseId, expenses.id))
      .where(
        and(
          eq(expenses.companyId, companyId),
          inArray(expenses.status, [...EXPENSE_MATCH_STATUSES]),
          isNull(expenses.mileageMiles),
          isNull(reconciliationMatches.id),
          gte(expenses.spentAt, since),
          sql`${expenses.amountPence} > 0`,
        ),
      ),
    db
      .select({
        id: bankTransactions.id,
        counterparty: bankTransactions.counterparty,
        reference: bankTransactions.reference,
        description: bankTransactions.description,
        amountPence: bankTransactions.amountPence,
        bookedAt: bankTransactions.bookedAt,
      })
      .from(bankTransactions)
      .innerJoin(bankAccounts, eq(bankTransactions.bankAccountId, bankAccounts.id))
      .leftJoin(
        reconciliationMatches,
        eq(reconciliationMatches.bankTransactionId, bankTransactions.id),
      )
      .where(
        and(
          eq(bankAccounts.companyId, companyId),
          lt(bankTransactions.amountPence, 0),
          isNull(reconciliationMatches.id),
          gte(bankTransactions.bookedAt, addDays(since, -NEAR_MATCH_DAYS)),
        ),
      ),
  ]);

  const work = receipts
    .map((r) => ({
      receipt: r,
      candidates: payments.filter(
        (p) =>
          r.spentAt &&
          Math.abs(dateDiffDays(r.spentAt, p.bookedAt)) <= NEAR_MATCH_DAYS &&
          withinNearAmount(r.amountPence, -p.amountPence),
      ),
    }))
    .filter((w) => w.candidates.length > 0)
    .slice(0, AI_BATCH);
  if (work.length === 0) return { suggested: 0, aiUnavailable: false };

  const { output } = await generateText({
    model: BULK_MODEL,
    output: Output.object({ schema: aiSchema }),
    instructions: `You match expense receipts to card payments on a UK business bank statement.
For each receipt, pick the bank payment that is the same purchase, or null if none clearly is.
Merchant names often look different on statements (e.g. "AMZN Mktp UK" is Amazon). Amounts can differ slightly because of tips, card fees or exchange rates.
Only match when you're confident. Give a reason of at most 20 words a bookkeeper would understand.`,
    prompt: JSON.stringify(
      work.map((w) => ({
        expenseId: w.receipt.id,
        receipt: {
          description: w.receipt.description,
          amount: formatGBP(w.receipt.amountPence),
          currency: w.receipt.currency ?? "GBP",
          date: w.receipt.spentAt,
        },
        bankPayments: w.candidates.map((c) => ({
          bankTransactionId: c.id,
          payee: c.counterparty,
          reference: c.reference,
          description: c.description,
          amount: formatGBP(-c.amountPence),
          date: c.bookedAt,
        })),
      })),
    ),
  });

  const usedTx = new Set<string>();
  let suggested = 0;
  for (const m of output?.matches ?? []) {
    const item = work.find((w) => w.receipt.id === m.expenseId);
    const tx = item?.candidates.find((c) => c.id === m.bankTransactionId);
    if (!item || !tx || usedTx.has(tx.id)) continue;
    usedTx.add(tx.id);
    await db.insert(reconciliationMatches).values({
      bankTransactionId: tx.id,
      matchType: "expense",
      expenseId: item.receipt.id,
      confirmed: false,
      note: nearMatchNote(m.reason, item.receipt.amountPence, -tx.amountPence),
    });
    suggested++;
  }
  return { suggested, aiUnavailable: false };
}

/** Unconfirmed receipt matches the AI suggested, for review. */
export async function listAiReceiptMatches(companyId: string) {
  return getDb()
    .select({
      matchId: reconciliationMatches.id,
      note: reconciliationMatches.note,
      expenseId: expenses.id,
      expenseDescription: expenses.description,
      expenseAmountPence: expenses.amountPence,
      spentAt: expenses.spentAt,
      bankAmountPence: bankTransactions.amountPence,
      bookedAt: bankTransactions.bookedAt,
      counterparty: bankTransactions.counterparty,
    })
    .from(reconciliationMatches)
    .innerJoin(expenses, eq(reconciliationMatches.expenseId, expenses.id))
    .innerJoin(bankTransactions, eq(reconciliationMatches.bankTransactionId, bankTransactions.id))
    .where(
      and(
        eq(expenses.companyId, companyId),
        eq(reconciliationMatches.confirmed, false),
        sql`${reconciliationMatches.note} like 'AI:%'`,
      ),
    );
}
