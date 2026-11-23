import { RuleTester } from "eslint";
import tsParser from "@typescript-eslint/parser";
import { describe, expect, it } from "vitest";
import { getTableConfig, PgTable } from "drizzle-orm/pg-core";
import * as schema from "@/db/schema";
import tenantScope, { CHILD_TABLES, NOT_COMPANY_OWNED } from "../../eslint-rules/tenant-scope.mjs";

const rule = tenantScope.rules["require-company-scope"];
const tester = new RuleTester({
  languageOptions: { parser: tsParser, ecmaVersion: 2022, sourceType: "module" },
});
const error = (table: string) => ({ messageId: "unscoped", data: { table } });

describe("tenant-scope/require-company-scope", () => {
  tester.run("require-company-scope", rule, {
    valid: [
      // Joined to the parent and filtered on the company.
      `async function f(db, companyId, id) {
        await db.select().from(payments)
          .innerJoin(invoices, eq(invoices.id, payments.invoiceId))
          .where(and(eq(payments.invoiceId, id), eq(invoices.companyId, companyId)));
      }`,
      // A scope helper.
      `async function f(tx, companyId, id) {
        await tx.delete(invoiceLineItems).where(and(
          eq(invoiceLineItems.invoiceId, id),
          rowOfCompany(invoiceLineItems.invoiceId, invoices, companyId),
        ));
      }`,
      `async function f(db, companyId) {
        await db.select().from(reconciliationMatches).where(matchOfCompany(companyId));
      }`,
      // A condition built a line earlier, directly or through another local.
      `async function f(db, companyId, filters) {
        const where = bankListWhere(companyId, filters);
        await db.select().from(bankTransactions).where(where);
      }`,
      `async function f(tx, companyId, ids) {
        const own = companyTransactionIds(tx, companyId, ids);
        const ownMatches = inArray(reconciliationMatches.bankTransactionId, own);
        await tx.delete(reconciliationMatches).where(ownMatches);
      }`,
      // A subquery on the company-owned parent.
      `async function f(tx, companyId, id) {
        await tx.select().from(payments).where(and(
          eq(payments.id, id),
          inArray(payments.invoiceId, tx.select({ id: invoices.id }).from(invoices).where(eq(invoices.companyId, companyId))),
        ));
      }`,
      // Raw SQL naming company_id.
      `async function f(db, companyId) {
        await db.select().from(payments).where(sql\`invoice_id in (select id from invoices where company_id = \${companyId})\`);
      }`,
      // A child table joined from a company-owned table filtered on the company.
      `async function f(db, companyId) {
        await db.select().from(invoices)
          .leftJoin(payments, eq(payments.invoiceId, invoices.id))
          .where(eq(invoices.companyId, companyId));
      }`,
      // Inserts have no WHERE.
      `async function f(db, id) { await db.insert(payments).values({ invoiceId: id }); }`,
      // Tables that aren't child tables.
      `async function f(db) { await db.select().from(fxRates); }`,
      `async function f(db, id) { await db.select().from(invoices).where(eq(invoices.id, id)); }`,
    ],
    invalid: [
      {
        code: `async function f(db, id) {
          await db.select().from(payments).where(eq(payments.invoiceId, id));
        }`,
        errors: [error("payments")],
      },
      {
        code: `async function f(tx, id, amount) {
          await tx.update(payments).set({ amountPence: amount }).where(eq(payments.id, id));
        }`,
        errors: [error("payments")],
      },
      {
        code: `async function f(tx, id) {
          await tx.delete(schema.quoteLineItems).where(eq(schema.quoteLineItems.quoteId, id));
        }`,
        errors: [error("quoteLineItems")],
      },
      // Data from an earlier scoped read doesn't count: the scope must be in the statement.
      {
        code: `async function f(db, companyId) {
          const rows = await db.select().from(invoices).where(eq(invoices.companyId, companyId));
          const ids = rows.map((r) => r.id);
          await db.select().from(payments).where(inArray(payments.invoiceId, ids));
        }`,
        errors: [error("payments")],
      },
      {
        code: `async function f(tx, companyId, id) {
          const inv = await lockInvoice(tx, companyId, id);
          await tx.select().from(payments).where(eq(payments.invoiceId, inv.id));
        }`,
        errors: [error("payments")],
      },
      // companyId outside the filter doesn't count.
      {
        code: `async function f(db, companyId, id) {
          await db.select().from(payments).where(eq(payments.invoiceId, id)).then(() => audit(companyId));
        }`,
        errors: [error("payments")],
      },
      {
        code: `async function f(db, companyId, ids) {
          await db.select({ companyId: invoices.companyId }).from(payments)
            .where(inArray(payments.invoiceId, ids)).limit(companyId.length);
        }`,
        errors: [error("payments")],
      },
      // Nor does passing it to a Drizzle operator against an unrelated column.
      {
        code: `async function f(db, companyId) {
          await db.select().from(payments).where(eq(payments.invoiceId, companyId));
        }`,
        errors: [error("payments")],
      },
      // A joined child table needs the statement scoped too.
      {
        code: `async function f(db, id) {
          await db.select().from(invoices)
            .innerJoin(payments, eq(payments.invoiceId, invoices.id))
            .where(eq(invoices.id, id));
        }`,
        errors: [error("payments")],
      },
      // Relational queries can't be checked, so they're reported.
      {
        code: `async function f(db) { await db.query.payments.findMany(); }`,
        errors: [{ messageId: "relational", data: { table: "payments" } }],
      },
    ],
  });
});

describe("tenant-scope table lists", () => {
  it("covers every schema table without a company_id column", () => {
    const withoutCompany = Object.entries(schema)
      .filter(([, value]) => value instanceof PgTable)
      .filter(([, table]) =>
        !getTableConfig(table as PgTable).columns.some((c) => c.name === "company_id"),
      )
      .map(([name]) => name)
      .sort();
    // A new table without company_id must be added to CHILD_TABLES (and scoped
    // through its parent) or, if no company owns it, to NOT_COMPANY_OWNED.
    expect([...CHILD_TABLES, ...NOT_COMPANY_OWNED].sort()).toEqual(withoutCompany);
  });
});
