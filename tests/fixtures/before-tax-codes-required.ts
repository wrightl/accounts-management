import type { PGlite } from "@electric-sql/pglite";

const TABLES = [
  "invoice_line_items",
  "credit_note_line_items",
  "quote_line_items",
  "order_line_items",
  "expenses",
] as const;

/**
 * Put a test database back as it was before migration 0099, so tests of the
 * tax code backfill (data migrations 0005 and 0006) can hold rows with no
 * code: the columns accept null again and the trigger that codes new rows is
 * off. Only use it on a database from `createTestDb({ fresh: true })`, as it
 * changes the schema.
 */
export async function beforeTaxCodesRequired(client: Pick<PGlite, "exec">) {
  for (const table of TABLES) {
    await client.exec(`ALTER TABLE "${table}" ALTER COLUMN "tax_code" DROP NOT NULL`);
    await client.exec(`ALTER TABLE "${table}" DISABLE TRIGGER "${table}_fill_tax_code"`);
  }
}
