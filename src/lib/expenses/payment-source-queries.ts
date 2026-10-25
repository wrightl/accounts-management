import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import {
  bankAccounts,
  bankTransactions,
  expenses,
  reconciliationMatches,
} from "@/db/schema";
import {
  cardEvidence,
  isPaymentSourceVia,
  normalizeCardLast4s,
  resolvePaymentSource,
  type PaymentSourceEvidence,
  type PaymentSourceSuggestion,
} from "@/lib/expenses/payment-source";

/** Card endings the company has listed against its bank accounts. */
export async function listCompanyCardLast4s(companyId: string): Promise<string[]> {
  const rows = await getDb()
    .select({ cards: bankAccounts.cardLast4s })
    .from(bankAccounts)
    .where(eq(bankAccounts.companyId, companyId));
  return normalizeCardLast4s(rows.flatMap((r) => r.cards));
}

/**
 * How each expense was probably paid, from what the sender said, a company
 * bank payment it matches (every bank account here is the company's), and the
 * card on its receipt. Card endings are compared now, not when the email came
 * in, so cards listed later still count.
 */
export async function getPaymentSourceSuggestions(
  companyId: string,
  expenseIds: string[],
): Promise<Map<string, PaymentSourceSuggestion>> {
  const out = new Map<string, PaymentSourceSuggestion>();
  if (expenseIds.length === 0) return out;
  const db = getDb();

  const [rows, matches, companyCards] = await Promise.all([
    db
      .select({
        id: expenses.id,
        stated: expenses.statedPaymentSource,
        via: expenses.statedPaymentSourceVia,
        cardLast4: expenses.receiptCardLast4,
      })
      .from(expenses)
      .where(and(eq(expenses.companyId, companyId), inArray(expenses.id, expenseIds))),
    db
      .select({
        expenseId: reconciliationMatches.expenseId,
        confirmed: reconciliationMatches.confirmed,
        bookedAt: bankTransactions.bookedAt,
      })
      .from(reconciliationMatches)
      .innerJoin(
        bankTransactions,
        eq(reconciliationMatches.bankTransactionId, bankTransactions.id),
      )
      .innerJoin(bankAccounts, eq(bankTransactions.bankAccountId, bankAccounts.id))
      .where(
        and(
          eq(bankAccounts.companyId, companyId),
          eq(reconciliationMatches.matchType, "expense"),
          inArray(reconciliationMatches.expenseId, expenseIds),
        ),
      ),
    listCompanyCardLast4s(companyId),
  ]);

  const bankByExpense = new Map<string, PaymentSourceEvidence>();
  for (const m of matches) {
    if (!m.expenseId) continue;
    const existing = bankByExpense.get(m.expenseId);
    // A confirmed link beats a suggestion.
    if (existing?.kind === "bank_match" && existing.confirmed) continue;
    bankByExpense.set(m.expenseId, {
      kind: "bank_match",
      source: "company",
      bookedAt: m.bookedAt,
      confirmed: m.confirmed,
    });
  }

  for (const row of rows) {
    const stated: PaymentSourceEvidence | null = row.stated
      ? {
          kind: "stated",
          source: row.stated,
          via: isPaymentSourceVia(row.via) ? row.via : "email",
        }
      : null;
    out.set(
      row.id,
      resolvePaymentSource([
        stated,
        bankByExpense.get(row.id),
        cardEvidence(row.cardLast4, companyCards),
      ]),
    );
  }
  return out;
}

export async function getPaymentSourceSuggestion(
  companyId: string,
  expenseId: string,
): Promise<PaymentSourceSuggestion | null> {
  const map = await getPaymentSourceSuggestions(companyId, [expenseId]);
  return map.get(expenseId) ?? null;
}
