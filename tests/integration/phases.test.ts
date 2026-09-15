import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "@/db/pglite";
import {
  bankAccounts,
  bankTransactions,
  expenses,
  reimbursements,
  reimbursementItems,
  users,
} from "@/db/schema";
import { StarlingCsvAdapter } from "@/lib/bank/starling-csv";
import { seedCompany } from "@/lib/test/seed-company";

let ctx: Awaited<ReturnType<typeof createTestDb>>;
let companyId: string;

beforeEach(async () => {
  ctx = await createTestDb();
  const company = await seedCompany(ctx.db);
  companyId = company.id;
});

afterEach(async () => {
  await ctx.client.close();
});

describe("phases 2–4 integration", () => {
  it("applies new tables from 0002 migration", async () => {
    const { rows } = await ctx.client.query<{ table_name: string }>(
      "select table_name from information_schema.tables where table_schema = 'public'",
    );
    const names = rows.map((r) => r.table_name);
    for (const t of [
      "bank_accounts",
      "bank_transactions",
      "reconciliation_matches",
      "dividend_declarations",
      "dividend_payouts",
      "shareholders",
      "quotes",
      "quote_line_items",
      "recurring_invoices",
      "send_jobs",
    ]) {
      expect(names).toContain(t);
    }
    expect(names).not.toContain("dividends");
  });

  it("imports Starling CSV idempotently", async () => {
    const { db } = ctx;
    const [account] = await db
      .insert(bankAccounts)
      .values({ companyId, name: "Starling", provider: "starling" })
      .returning();

    const csv = [
      "Date,Counter Party,Reference,Type,Amount,Balance",
      "01/04/2026,Client,INV-1,FASTER PAYMENT,100.00,100.00",
    ].join("\n");
    const rows = new StarlingCsvAdapter().parse(csv);

    await db.insert(bankTransactions).values({
      bankAccountId: account.id,
      ...rows[0],
    });

    await expect(
      db.insert(bankTransactions).values({
        bankAccountId: account.id,
        ...rows[0],
      }),
    ).rejects.toThrow();

    const saved = await db.select().from(bankTransactions);
    expect(saved).toHaveLength(1);
  });

  it("marks expenses reimbursed when a run is paid", async () => {
    const { db } = ctx;
    const [founder] = await db
      .insert(users)
      .values({
        companyId,
        email: "lee@example.com",
        name: "Lee",
        role: "admin",
      })
      .returning();

    const [exp] = await db
      .insert(expenses)
      .values({
        companyId,
        description: "Train",
        amountPence: 5000,
        status: "reimbursable",
        paidByUserId: founder.id,
      })
      .returning();

    const [run] = await db
      .insert(reimbursements)
      .values({
        companyId,
        payeeUserId: founder.id,
        status: "pending",
        totalPence: 5000,
      })
      .returning();

    await db.insert(reimbursementItems).values({
      reimbursementId: run.id,
      expenseId: exp.id,
    });

    await db
      .update(reimbursements)
      .set({ status: "paid", paidAt: new Date() })
      .where(eq(reimbursements.id, run.id));
    await db
      .update(expenses)
      .set({ status: "reimbursed" })
      .where(eq(expenses.id, exp.id));

    const [updated] = await db.select().from(expenses).where(eq(expenses.id, exp.id));
    expect(updated.status).toBe("reimbursed");
  });

  it("rejects a second reimbursement item for the same expense", async () => {
    const { db } = ctx;
    const [founder] = await db
      .insert(users)
      .values({
        companyId,
        email: "angel@example.com",
        name: "Angel",
        role: "user",
      })
      .returning();

    const [exp] = await db
      .insert(expenses)
      .values({
        companyId,
        description: "Taxi",
        amountPence: 2000,
        status: "reimbursable",
        paidByUserId: founder.id,
      })
      .returning();

    const [runA] = await db
      .insert(reimbursements)
      .values({
        companyId,
        payeeUserId: founder.id,
        status: "pending",
        totalPence: 2000,
      })
      .returning();
    const [runB] = await db
      .insert(reimbursements)
      .values({
        companyId,
        payeeUserId: founder.id,
        status: "pending",
        totalPence: 2000,
      })
      .returning();

    await db.insert(reimbursementItems).values({
      reimbursementId: runA.id,
      expenseId: exp.id,
    });

    await expect(
      db.insert(reimbursementItems).values({
        reimbursementId: runB.id,
        expenseId: exp.id,
      }),
    ).rejects.toThrow();
  });
});
