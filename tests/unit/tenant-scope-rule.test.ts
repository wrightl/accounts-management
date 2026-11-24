import path from "node:path";
import { RuleTester } from "eslint";
import tsParser from "@typescript-eslint/parser";
import { describe, expect, it } from "vitest";
import { getTableConfig, PgTable } from "drizzle-orm/pg-core";
import * as schema from "@/db/schema";
import tenantScope, { CHILD_TABLES, COMPANY_TABLES, NOT_COMPANY_OWNED } from "../../eslint-rules/tenant-scope.mjs";

const rule = tenantScope.rules["require-company-scope"];
const tester = new RuleTester({
  languageOptions: { parser: tsParser, ecmaVersion: 2022, sourceType: "module" },
});
const error = (table: string) => ({ messageId: "unscoped", data: { table } });
const companyError = (table: string) => ({ messageId: "unscopedCompany", data: { table } });
const inRepo = (file: string) => path.join(process.cwd(), file);

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
        const own = transactionIdsOfCompany(tx, companyId, ids);
        const ownMatches = inArray(reconciliationMatches.bankTransactionId, own);
        await tx.delete(reconciliationMatches).where(ownMatches);
      }`,
      // A child table joined from a company-owned table filtered on the company.
      `async function f(db, companyId) {
        await db.select().from(invoices)
          .leftJoin(payments, eq(payments.invoiceId, invoices.id))
          .where(eq(invoices.companyId, companyId));
      }`,
      // Scoped through a join from another child table's scoped parent.
      `async function f(db, companyId) {
        await db.select().from(reconciliationMatches)
          .innerJoin(payments, eq(payments.id, reconciliationMatches.paymentId))
          .where(matchOfCompany(companyId));
      }`,
      // Inserts have no WHERE.
      `async function f(db, id) { await db.insert(payments).values({ invoiceId: id }); }`,
      // Tables no company owns.
      `async function f(db) { await db.select().from(fxRates); }`,
      `async function f(db, id) { await db.select().from(users).where(eq(users.id, id)); }`,
      // A company-owned table filtered on its own companyId.
      `async function f(db, companyId, row) {
        await db.update(expenses).set({ status: "approved" })
          .where(and(eq(expenses.id, row.expense.id), eq(expenses.companyId, companyId)));
      }`,
      `async function f(db, companyId, id) {
        await db.delete(clients).where(and(eq(clients.companyId, companyId), eq(clients.id, id)));
      }`,
      `async function f(db, job) {
        await db.update(sendJobs).set({ status: "sent" })
          .where(and(eq(sendJobs.id, job.id), eq(sendJobs.companyId, job.companyId)));
      }`,
      // Scoped through an inner join to a scoped company-owned table.
      `async function f(db, companyId, id) {
        await db.select().from(invoices).innerJoin(clients, eq(clients.id, invoices.clientId))
          .where(and(eq(invoices.id, id), eq(clients.companyId, companyId)));
      }`,
      // A condition built by a function in the same file.
      `function membershipWhere(userId, companyId) {
        return and(eq(companyMemberships.userId, userId), eq(companyMemberships.companyId, companyId));
      }
      async function f(db, userId, companyId) {
        await db.select().from(companyMemberships).where(membershipWhere(userId, companyId));
      }`,
      `const listWhere = (companyId, filters) => {
        const conditions = [eq(expenses.companyId, companyId)];
        if (filters.q) conditions.push(ilike(expenses.description, filters.q));
        return conditions;
      };
      async function f(db, companyId, filters) {
        await db.select().from(expenses).where(and(...listWhere(companyId, filters)));
      }`,
      // Cross-company code listed in CROSS_COMPANY, including callbacks inside it.
      {
        code: `export async function drainSendJobs() {
          const jobs = await db.select().from(sendJobs).where(eq(sendJobs.status, "pending"));
          await Promise.all(jobs.map(async (j) => db.select().from(invoices).where(eq(invoices.id, j.invoiceId))));
        }`,
        filename: inRepo("src/lib/outbox.ts"),
      },
      {
        code: `async function listPlatformCompanies(db) { await db.select().from(companyBilling); }`,
        filename: inRepo("src/lib/platform/queries.ts"),
      },
      {
        code: `export const migration = { async up(ctx) { await ctx.db.select().from(companyMemberships); } };`,
        filename: inRepo("src/db/data-migrations/0099_example.ts"),
      },
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
        errors: [error("payments"), companyError("invoices")],
      },
      // A company-owned table filtered only on its id (PR 102).
      {
        code: `async function f(db, companyId, row) {
          await db.update(expenses).set({ status: "approved" }).where(eq(expenses.id, row.expense.id));
        }`,
        errors: [companyError("expenses")],
      },
      {
        code: `async function f(db, id) { await db.select().from(invoices).where(eq(invoices.id, id)); }`,
        errors: [companyError("invoices")],
      },
      {
        code: `async function f(tx, ids) { await tx.delete(reimbursements).where(inArray(reimbursements.id, ids)); }`,
        errors: [companyError("reimbursements")],
      },
      // Filtering another table's companyId, or on a branch, doesn't scope it.
      {
        code: `async function f(db, companyId, id) {
          await db.update(expenses).set({ status: "approved" })
            .where(and(eq(expenses.id, id), eq(clients.companyId, companyId)));
        }`,
        errors: [companyError("expenses")],
      },
      {
        code: `async function f(db, companyId, id) {
          await db.delete(expenses).where(or(eq(expenses.id, id), eq(expenses.companyId, companyId)));
        }`,
        errors: [companyError("expenses")],
      },
      // A same-file function must scope everything it returns, and be given the company id.
      {
        code: `function where(companyId, all) {
          if (all) return eq(expenses.status, "approved");
          return eq(expenses.companyId, companyId);
        }
        async function f(db, companyId) { await db.select().from(expenses).where(where(companyId, true)); }`,
        errors: [companyError("expenses")],
      },
      {
        code: `function where(companyId) { return eq(expenses.companyId, companyId); }
        async function f(db, id) { await db.select().from(expenses).where(where(id)); }`,
        errors: [companyError("expenses")],
      },
      // CROSS_COMPANY only covers the functions it names, in its own file.
      {
        code: `async function processSendJob(db, id) { await db.select().from(sendJobs).where(eq(sendJobs.id, id)); }`,
        filename: inRepo("src/lib/outbox.ts"),
        errors: [companyError("sendJobs")],
      },
      {
        code: `export async function drainSendJobs(db) { await db.select().from(sendJobs); }`,
        filename: inRepo("src/lib/other.ts"),
        errors: [companyError("sendJobs")],
      },
      // Scopes that look right but don't restrict the rows.
      {
        code: `async function f(db, companyId, x) {
          await db.select().from(payments).innerJoin(invoices, eq(invoices.id, payments.invoiceId))
            .where(or(eq(invoices.companyId, companyId), eq(payments.id, x)));
        }`,
        errors: [companyError("invoices"), error("payments")],
      },
      {
        code: `async function f(db, companyId) {
          await db.select().from(payments).where(eq(payments.id, getThing(companyId)));
        }`,
        errors: [error("payments")],
      },
      {
        code: `async function f(db, companyId) {
          await db.select().from(payments).where(not(paymentOfCompany(companyId)));
        }`,
        errors: [error("payments")],
      },
      {
        code: `async function f(db, companyId) {
          await db.select().from(payments)
            .where(sql\`invoice_id in (select id from invoices where company_id = \${companyId}) or true\`);
        }`,
        errors: [error("payments")],
      },
      // A scope helper needs the company id, and its column must be from the checked table.
      {
        code: `async function f(db, someOtherId, id) {
          await db.select().from(payments).where(and(
            eq(payments.id, id),
            rowOfCompany(payments.invoiceId, invoices, someOtherId),
          ));
        }`,
        errors: [error("payments")],
      },
      {
        code: `async function f(db, companyId, id) {
          await db.select().from(payments).where(and(
            eq(payments.id, id),
            rowOfCompany(invoiceLineItems.invoiceId, invoices, companyId),
          ));
        }`,
        errors: [error("payments")],
      },
      {
        code: `async function f(db, id) {
          await db.select().from(payments).where(paymentsOfCompany(id));
        }`,
        errors: [error("payments")],
      },
      {
        code: `async function f(db, companyId) {
          await db.select().from(payments).where(inArray(payments.invoiceId, invoiceIds(companyId)));
        }`,
        errors: [error("payments")],
      },
      // A company filter on a table the statement doesn't read or inner-join.
      {
        code: `async function f(db, companyId) {
          await db.select().from(payments).where(eq(clients.companyId, companyId));
        }`,
        errors: [error("payments")],
      },
      {
        code: `async function f(db, companyId) {
          await db.select().from(payments).leftJoin(invoices, eq(invoices.id, payments.invoiceId))
            .where(eq(invoices.companyId, companyId));
        }`,
        errors: [companyError("invoices"), error("payments")],
      },
      {
        code: `async function f(db, companyId, someOtherId) {
          await db.select().from(payments).innerJoin(invoices, eq(invoices.id, payments.invoiceId))
            .where(eq(invoices.companyId, someOtherId));
        }`,
        errors: [companyError("invoices"), error("payments")],
      },
      {
        code: `async function f(db, companyId) {
          await db.select().from(payments).where(sql\`\${clients.companyId} = \${companyId}\`);
        }`,
        errors: [error("payments")],
      },
      // A listed helper only scopes its own table; an unlisted one never counts.
      {
        code: `async function f(db, companyId) {
          await db.select().from(payments).where(matchOfCompany(companyId));
        }`,
        errors: [error("payments")],
      },
      {
        code: `async function f(db, companyId) {
          await db.select().from(payments).where(paymentsWhere(companyId));
        }`,
        errors: [error("payments")],
      },
      // A scoped subquery must be matched against a column of the statement's table.
      {
        code: `async function f(tx, companyId, ids) {
          await tx.delete(reconciliationMatches)
            .where(inArray(payments.id, transactionIdsOfCompany(tx, companyId, ids)));
        }`,
        errors: [error("reconciliationMatches")],
      },
      // Raw SQL and inline subqueries aren't accepted: the rule can't tell what
      // company_id is compared with, or whether the ids belong in the column.
      {
        code: `async function f(db, companyId) {
          await db.select().from(payments).where(sql\`invoice_id in (select id from invoices where company_id = \${companyId})\`);
        }`,
        errors: [error("payments")],
      },
      {
        code: `async function f(db, someOtherId) {
          await db.select().from(payments).where(sql\`invoice_id in (select id from invoices where company_id = \${someOtherId})\`);
        }`,
        errors: [error("payments")],
      },
      {
        code: `async function f(db) {
          await db.select().from(payments).where(sql\`company_id is not null\`);
        }`,
        errors: [error("payments")],
      },
      {
        code: `async function f(tx, companyId) {
          await tx.select().from(payments).where(inArray(
            payments.invoiceId,
            tx.select({ id: expenses.id }).from(expenses).where(eq(expenses.companyId, companyId)),
          ));
        }`,
        errors: [error("payments")],
      },
      {
        code: `async function f(tx, companyId) {
          await tx.delete(reconciliationMatches).where(inArray(
            reconciliationMatches.bankTransactionId,
            tx.select({ id: bankTransactions.id }).from(bankTransactions)
              .where(rowOfCompany(bankTransactions.bankAccountId, bankAccounts, companyId)),
          ));
        }`,
        errors: [error("reconciliationMatches")],
      },
      // A subquery helper's ids only belong in its own column.
      {
        code: `async function f(tx, companyId, ids) {
          await tx.delete(reconciliationMatches)
            .where(inArray(reconciliationMatches.invoiceId, transactionIdsOfCompany(tx, companyId, ids)));
        }`,
        errors: [error("reconciliationMatches")],
      },
      // An outer join's condition doesn't remove rows.
      {
        code: `async function f(db, companyId) {
          await db.select().from(payments)
            .leftJoin(invoices, and(eq(invoices.id, payments.invoiceId), eq(invoices.companyId, companyId)));
        }`,
        errors: [companyError("invoices"), error("payments")],
      },
      // A scope that only applies on one branch.
      {
        code: `async function f(db, companyId, where) {
          await db.select().from(payments).where(where ? and(where, eq(invoices.companyId, companyId)) : undefined);
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
  const tables = Object.entries(schema).filter(([, value]) => value instanceof PgTable);
  const hasCompanyId = (table: unknown) =>
    getTableConfig(table as PgTable).columns.some((c) => c.name === "company_id");
  const names = (company: boolean) =>
    tables
      .filter(([name, table]) => hasCompanyId(table) === company && !NOT_COMPANY_OWNED.includes(name))
      .map(([name]) => name)
      .sort();

  it("covers every company-owned schema table with a company_id column", () => {
    // A new table with company_id must be added to COMPANY_TABLES or, if
    // company_id is only context and no company owns it, to NOT_COMPANY_OWNED.
    expect([...COMPANY_TABLES].sort()).toEqual(names(true));
  });

  it("covers every company-owned schema table without a company_id column", () => {
    // A new table without company_id must be added to CHILD_TABLES (and scoped
    // through its parent) or, if no company owns it, to NOT_COMPANY_OWNED.
    expect([...CHILD_TABLES].sort()).toEqual(names(false));
  });

  it("lists only schema tables in NOT_COMPANY_OWNED", () => {
    const all = tables.map(([name]) => name);
    expect(NOT_COMPANY_OWNED.filter((name) => !all.includes(name))).toEqual([]);
  });
});
