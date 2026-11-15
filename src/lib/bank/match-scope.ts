import { sql, type SQL } from "drizzle-orm";
import { reconciliationMatches } from "@/db/schema";

/**
 * Limits a query on reconciliation_matches to one company's rows. The table has
 * no company_id, so this goes through the match's bank transaction to its bank
 * account. Use it in the same statement as the read, update or delete, rather
 * than relying on an earlier company check (CLAUDE.md, #78).
 */
export function matchOfCompany(companyId: string): SQL {
  return sql`${reconciliationMatches.bankTransactionId} in (
    select scope_tx.id from bank_transactions scope_tx
    join bank_accounts scope_account on scope_account.id = scope_tx.bank_account_id
    where scope_account.company_id = ${companyId}
  )`;
}
