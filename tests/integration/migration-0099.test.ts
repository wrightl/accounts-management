import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";

const BREAKPOINT = "--> statement-breakpoint";
const journal = JSON.parse(readFileSync(join(process.cwd(), "drizzle/meta/_journal.json"), "utf8")) as {
  entries: { idx: number; tag: string }[];
};
const sqlOf = (tag: string) => readFileSync(join(process.cwd(), "drizzle", `${tag}.sql`), "utf8");

let client: PGlite;

/** A database as production is before this migration: every earlier migration, and none after. */
beforeEach(async () => {
  client = new PGlite();
  for (const { idx, tag } of journal.entries) {
    if (idx >= 99) break;
    for (const statement of sqlOf(tag).split(BREAKPOINT)) await client.exec(statement);
  }
});

afterEach(async () => {
  await client.close();
});

const runMigration = () =>
  // In one transaction, as the migrator runs it.
  client.transaction(async (tx) => {
    for (const statement of sqlOf("0099_tax_code_required").split(BREAKPOINT)) await tx.exec(statement);
  });

async function company(name: string, vatRegistered: boolean) {
  const { rows } = await client.query<{ id: string }>(
    `insert into companies (name, legal_name, slug, entity_type, vat_registered)
     values ($1, $1, $2, 'limited_company', $3) returning id`,
    [name, name.toLowerCase().replaceAll(" ", "-"), vatRegistered],
  );
  return rows[0]!.id;
}

async function invoice(companyId: string, number: string) {
  const { rows: clientRows } = await client.query<{ id: string }>(
    `insert into clients (company_id, name) values ($1, 'Client') returning id`,
    [companyId],
  );
  const { rows } = await client.query<{ id: string }>(
    `insert into invoices (company_id, number, client_id, status) values ($1, $2, $3, 'draft') returning id`,
    [companyId, number, clientRows[0]!.id],
  );
  return rows[0]!.id;
}

async function line(invoiceId: string, vatRate: number, taxCode: string | null = null) {
  const { rows } = await client.query<{ id: string }>(
    `insert into invoice_line_items (invoice_id, description, vat_rate, tax_code) values ($1, 'Line', $2, $3) returning id`,
    [invoiceId, vatRate, taxCode],
  );
  return rows[0]!.id;
}

async function codeOf(table: string, id: string) {
  const { rows } = await client.query<{ tax_code: string; tax_code_needs_review: boolean; vat_rate: number }>(
    `select tax_code, tax_code_needs_review, vat_rate from ${table} where id = $1`,
    [id],
  );
  return rows[0];
}

describe("migration 0099", () => {
  it("codes and flags rows still without a code, then makes the column required", async () => {
    const registered = await company("Registered Ltd", true);
    const small = await company("Small Ltd", false);
    const regInvoice = await invoice(registered, "R-1");
    const smallInvoice = await invoice(small, "S-1");
    const standard = await line(regInvoice, 20);
    const reduced = await line(regInvoice, 5);
    const zero = await line(regInvoice, 0);
    const negative = await line(regInvoice, -5);
    const outside = await line(smallInvoice, 0);
    const deregistered = await line(smallInvoice, 20);
    const alreadyCoded = await line(regInvoice, 0, "exempt");
    const { rows: expenseRows } = await client.query<{ id: string }>(
      `insert into expenses (company_id, description, amount_pence, vat_rate) values ($1, 'Lunch', 1200, 0) returning id`,
      [registered],
    );

    await runMigration();

    expect(await codeOf("invoice_line_items", standard)).toEqual({ tax_code: "standard", tax_code_needs_review: true, vat_rate: 20 });
    expect(await codeOf("invoice_line_items", reduced)).toMatchObject({ tax_code: "reduced", tax_code_needs_review: true });
    expect(await codeOf("invoice_line_items", zero)).toMatchObject({ tax_code: "zero_rated", tax_code_needs_review: true });
    expect(await codeOf("invoice_line_items", negative)).toMatchObject({ tax_code: "standard", vat_rate: -5 });
    expect(await codeOf("invoice_line_items", outside)).toMatchObject({ tax_code: "outside_scope" });
    expect(await codeOf("invoice_line_items", deregistered)).toMatchObject({ tax_code: "standard", vat_rate: 20 });
    expect(await codeOf("invoice_line_items", alreadyCoded)).toEqual({
      tax_code: "exempt",
      tax_code_needs_review: false,
      vat_rate: 0,
    });
    expect(await codeOf("expenses", expenseRows[0]!.id)).toMatchObject({ tax_code: "zero_rated", tax_code_needs_review: true });

    const { rows: nullable } = await client.query<{ table_name: string; is_nullable: string }>(
      `select table_name, is_nullable from information_schema.columns where column_name = 'tax_code'
       and table_name in ('invoice_line_items', 'credit_note_line_items', 'quote_line_items', 'order_line_items', 'expenses')`,
    );
    expect(nullable).toHaveLength(5);
    expect(nullable.every((c) => c.is_nullable === "NO")).toBe(true);
  });

  it("codes and flags a row inserted without a code afterwards, and leaves a coded row alone", async () => {
    await runMigration();
    const registered = await company("Registered Ltd", true);
    const small = await company("Small Ltd", false);
    const regInvoice = await invoice(registered, "R-1");
    const smallInvoice = await invoice(small, "S-1");

    expect(await codeOf("invoice_line_items", await line(regInvoice, 0))).toMatchObject({
      tax_code: "zero_rated",
      tax_code_needs_review: true,
    });
    expect(await codeOf("invoice_line_items", await line(smallInvoice, 0))).toMatchObject({
      tax_code: "outside_scope",
      tax_code_needs_review: true,
    });
    expect(await codeOf("invoice_line_items", await line(regInvoice, 20, "standard"))).toEqual({
      tax_code: "standard",
      tax_code_needs_review: false,
      vat_rate: 20,
    });

    const { rows: expense } = await client.query<{ id: string }>(
      `insert into expenses (company_id, description, amount_pence, vat_rate) values ($1, 'Laptop', 1200, 20) returning id`,
      [small],
    );
    expect(await codeOf("expenses", expense[0]!.id)).toMatchObject({ tax_code: "standard", tax_code_needs_review: true });

    await expect(
      client.query(`update invoice_line_items set tax_code = null where invoice_id = $1`, [regInvoice]),
    ).rejects.toThrow();
  });
});
