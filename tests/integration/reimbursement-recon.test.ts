import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb, type TestDatabase } from "@/db/pglite";
import { setTestDb, type Database } from "@/db";
import {
  bankAccounts,
  bankTransactions,
  expenses,
  reconciliationMatches,
  reimbursementItems,
  reimbursements,
  users,
} from "@/db/schema";
import { confirmMatch, suggestMatches } from "@/lib/bank/queries";
import { seedCompany } from "@/lib/test/seed-company";

vi.mock("server-only", () => ({}));

let ctx: Awaited<ReturnType<typeof createTestDb>>;
let db: TestDatabase;
let companyId: string;

beforeEach(async () => {
  ctx = await createTestDb();
  db = ctx.db;
  setTestDb(db as unknown as Database);
  const company = await seedCompany(db);
  companyId = company.id;
});

afterEach(async () => {
  setTestDb(null);
  await ctx.client.close();
});

async function seedReimbursementScenario() {
  const [account] = await db
    .insert(bankAccounts)
    .values({ companyId, name: "Starling Business", provider: "starling" })
    .returning();

  const [founder] = await db
    .insert(users)
    .values({
      companyId,
      clerkUserId: "user_clerk_1",
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
      category: "Travel",
      spentAt: "2026-04-01",
      amountPence: 4500,
      status: "reimbursable",
      paidByUserId: founder.id,
      createdByUserId: founder.id,
    })
    .returning();

  const [run] = await db
    .insert(reimbursements)
    .values({
      companyId,
      payeeUserId: founder.id,
      status: "pending",
      totalPence: 4500,
      reference: "Reimb Lee Apr",
    })
    .returning();

  await db.insert(reimbursementItems).values({
    reimbursementId: run.id,
    expenseId: exp.id,
  });

  const [tx] = await db
    .insert(bankTransactions)
    .values({
      bankAccountId: account.id,
      externalId: "tx-out-reimb-1",
      bookedAt: "2026-04-05",
      amountPence: -4500,
      counterparty: "Lee Wright",
      reference: "Reimb Lee Apr",
    })
    .returning();

  return { founder, exp, run, tx };
}

describe("reimbursement bank reconciliation", () => {
  it("suggests a reimbursement run for an outgoing transfer matching the total", async () => {
    await seedReimbursementScenario();

    const suggestions = await suggestMatches(companyId);
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0].matchType).toBe("reimbursement");
    expect(suggestions[0].target.kind).toBe("reimbursement");
  });

  it("confirming a reimbursement match marks the run paid and expenses reimbursed", async () => {
    const { exp, run } = await seedReimbursementScenario();
    const suggestions = await suggestMatches(companyId);
    expect(suggestions).toHaveLength(1);

    await confirmMatch(suggestions[0].matchId);

    const [updatedRun] = await db
      .select()
      .from(reimbursements)
      .where(eq(reimbursements.id, run.id));
    expect(updatedRun.status).toBe("paid");
    expect(updatedRun.paidAt).toBeTruthy();

    const [updatedExp] = await db.select().from(expenses).where(eq(expenses.id, exp.id));
    expect(updatedExp.status).toBe("reimbursed");

    const [match] = await db
      .select()
      .from(reconciliationMatches)
      .where(eq(reconciliationMatches.id, suggestions[0].matchId));
    expect(match.confirmed).toBe(true);
    expect(match.reimbursementId).toBe(run.id);
  });

  it("does not suggest reimbursable expenses for outgoing bank transactions", async () => {
    const [account] = await db
      .insert(bankAccounts)
      .values({ companyId, name: "Starling Business", provider: "starling" })
      .returning();
    const [founder] = await db
      .insert(users)
      .values({
        companyId,
        clerkUserId: "user_clerk_2",
        email: "alex@example.com",
        name: "Alex",
        role: "admin",
      })
      .returning();

    await db.insert(expenses).values({
      companyId,
      description: "Software",
      spentAt: "2026-04-01",
      amountPence: 2000,
      status: "reimbursable",
      paidByUserId: founder.id,
      createdByUserId: founder.id,
    });

    await db.insert(bankTransactions).values({
      bankAccountId: account.id,
      externalId: "tx-out-expense-1",
      bookedAt: "2026-04-02",
      amountPence: -2000,
      counterparty: "Vendor",
      reference: "SaaS",
    });

    const suggestions = await suggestMatches(companyId);
    expect(suggestions).toHaveLength(0);
  });

  it("suggests company_paid expenses for outgoing transactions", async () => {
    const [account] = await db
      .insert(bankAccounts)
      .values({ companyId, name: "Starling Business", provider: "starling" })
      .returning();

    await db.insert(expenses).values({
      companyId,
      description: "Hosting",
      spentAt: "2026-04-03",
      amountPence: 1500,
      status: "company_paid",
    });

    await db.insert(bankTransactions).values({
      bankAccountId: account.id,
      externalId: "tx-out-hosting",
      bookedAt: "2026-04-03",
      amountPence: -1500,
      counterparty: "AWS",
      reference: "Hosting",
    });

    const suggestions = await suggestMatches(companyId);
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0].matchType).toBe("expense");
  });
});
