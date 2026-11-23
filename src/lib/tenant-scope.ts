import { sql, type SQL } from "drizzle-orm";
import type { AnyPgColumn, PgTable } from "drizzle-orm/pg-core";

/** A table that belongs to a company directly. */
type CompanyOwnedTable = PgTable & { id: AnyPgColumn; companyId: AnyPgColumn };

/**
 * Limits a query on a table with no company_id (payments, line items,
 * receipts…) to rows whose parent belongs to the company: `column` must point
 * at a row of `parent` owned by `companyId`. Use it in the same statement as
 * the read, update or delete, rather than relying on an earlier company check
 * (CLAUDE.md, #78). The `tenant-scope/require-company-scope` lint rule looks
 * for it.
 *
 *   .where(and(eq(payments.invoiceId, id), rowOfCompany(payments.invoiceId, invoices, companyId)))
 */
export function rowOfCompany(
  column: AnyPgColumn,
  parent: CompanyOwnedTable,
  companyId: string,
): SQL {
  return sql`${column} in (select ${parent.id} from ${parent} where ${parent.companyId} = ${companyId})`;
}

/**
 * Limits a query to rows whose bank transaction belongs to the company. Bank
 * transactions have no company_id either; they belong to it through their
 * bank account.
 */
export function bankTransactionOfCompany(column: AnyPgColumn, companyId: string): SQL {
  return sql`${column} in (
    select scope_tx.id from bank_transactions scope_tx
    join bank_accounts scope_account on scope_account.id = scope_tx.bank_account_id
    where scope_account.company_id = ${companyId}
  )`;
}
