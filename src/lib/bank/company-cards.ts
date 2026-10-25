import "server-only";
import { and, asc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { bankAccounts } from "@/db/schema";
import { parseCardLast4sInput } from "@/lib/expenses/payment-source";
import type { ActionResult } from "@/actions/result";

export type BankAccountCards = { id: string; name: string; cardLast4s: string[] };

/** Each bank account with the card endings that pay from it. */
export async function listBankAccountCards(companyId: string): Promise<BankAccountCards[]> {
  return getDb()
    .select({
      id: bankAccounts.id,
      name: bankAccounts.name,
      cardLast4s: bankAccounts.cardLast4s,
    })
    .from(bankAccounts)
    .where(eq(bankAccounts.companyId, companyId))
    .orderBy(asc(bankAccounts.createdAt));
}

/** Replace an account's card endings from what was typed, e.g. "1234, 5678". */
export async function setBankAccountCards(
  companyId: string,
  accountId: string,
  input: string,
): Promise<ActionResult> {
  const parsed = parseCardLast4sInput(input);
  if (!parsed.ok) return { ok: false, error: parsed.error };
  const [row] = await getDb()
    .update(bankAccounts)
    .set({ cardLast4s: parsed.value })
    .where(and(eq(bankAccounts.id, accountId), eq(bankAccounts.companyId, companyId)))
    .returning({ id: bankAccounts.id });
  if (!row) return { ok: false, error: "Bank account not found" };
  return { ok: true, id: row.id };
}
