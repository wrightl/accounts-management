import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";
import { createTestDb, type TestDatabase } from "@/db/pglite";
import { setTestDb, type Database } from "@/db";
import {
  bankAccounts,
  bankTransactions,
  expenses,
  fxRates,
  reconciliationMatches,
  users,
} from "@/db/schema";
import { confirmMatch, suggestMatches } from "@/lib/bank/queries";
import { refreshExpenseBankSuggestion } from "@/lib/bank/expense-match";
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

describe("expense bank reconciliation", () => {
  it("suggests a pending sterling expense on exact pence", async () => {
    const [account] = await db
      .insert(bankAccounts)
      .values({ companyId, name: "Starling", provider: "starling" })
      .returning();

    await db.insert(expenses).values({
      companyId,
      description: "Hosting",
      spentAt: "2026-04-03",
      amountPence: 1500,
      status: "pending",
    });

    await db.insert(bankTransactions).values({
      bankAccountId: account.id,
      externalId: "tx-hosting",
      bookedAt: "2026-04-03",
      amountPence: -1500,
      counterparty: "AWS",
      reference: "Hosting",
    });

    const suggestions = await suggestMatches(companyId);
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0].matchType).toBe("expense");
    expect(suggestions[0].note).toBeNull();
  });

  it("suggests a pending USD expense inside the FX band", async () => {
    const [account] = await db
      .insert(bankAccounts)
      .values({ companyId, name: "Starling", provider: "starling" })
      .returning();

    await db.insert(fxRates).values({
      currency: "USD",
      observationDate: "2026-04-01",
      foreignPerGbp: 1.27,
    });

    await db.insert(expenses).values({
      companyId,
      description: "Starbucks Seattle",
      spentAt: "2026-04-01",
      amountPence: 10000,
      status: "pending",
      detectedCurrency: "USD",
    });

    await db.insert(bankTransactions).values({
      bankAccountId: account.id,
      externalId: "tx-fx-in",
      bookedAt: "2026-04-02",
      amountPence: -8000,
      counterparty: "Starbucks Seattle",
      reference: "CARD",
    });

    const suggestions = await suggestMatches(companyId);
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0].matchType).toBe("expense");
    expect(suggestions[0].note).toContain("FX USD");
  });

  it("does not suggest a USD expense outside the FX band", async () => {
    const [account] = await db
      .insert(bankAccounts)
      .values({ companyId, name: "Starling", provider: "starling" })
      .returning();

    await db.insert(fxRates).values({
      currency: "USD",
      observationDate: "2026-04-01",
      foreignPerGbp: 1.27,
    });

    await db.insert(expenses).values({
      companyId,
      description: "Starbucks Seattle",
      spentAt: "2026-04-01",
      amountPence: 10000,
      status: "pending",
      detectedCurrency: "USD",
    });

    await db.insert(bankTransactions).values({
      bankAccountId: account.id,
      externalId: "tx-fx-out",
      bookedAt: "2026-04-02",
      amountPence: -5000,
      counterparty: "Starbucks Seattle",
      reference: "CARD",
    });

    const suggestions = await suggestMatches(companyId);
    expect(suggestions).toHaveLength(0);
  });

  it("accepting an expense suggestion sets company_paid", async () => {
    const [account] = await db
      .insert(bankAccounts)
      .values({ companyId, name: "Starling", provider: "starling" })
      .returning();

    const [expense] = await db
      .insert(expenses)
      .values({
        companyId,
        description: "Software",
        spentAt: "2026-04-03",
        amountPence: 2200,
        status: "pending",
      })
      .returning();

    await db.insert(bankTransactions).values({
      bankAccountId: account.id,
      externalId: "tx-soft",
      bookedAt: "2026-04-03",
      amountPence: -2200,
      counterparty: "Vendor",
      reference: "Software",
    });

    const suggestions = await suggestMatches(companyId);
    expect(suggestions).toHaveLength(1);

    await confirmMatch(companyId, suggestions[0].matchId);

    const [updated] = await db
      .select()
      .from(expenses)
      .where(eq(expenses.id, expense.id));
    expect(updated.status).toBe("company_paid");
    expect(updated.paidByUserId).toBeNull();
  });

  it("does not suggest reimbursable expenses", async () => {
    const [account] = await db
      .insert(bankAccounts)
      .values({ companyId, name: "Starling", provider: "starling" })
      .returning();
    const [founder] = await db
      .insert(users)
      .values({
        companyId,
        clerkUserId: "user_clerk_fx",
        email: "fx@example.com",
        name: "Fx",
        role: "admin",
      })
      .returning();

    await db.insert(expenses).values({
      companyId,
      description: "Taxi",
      spentAt: "2026-04-01",
      amountPence: 1800,
      status: "reimbursable",
      paidByUserId: founder.id,
      createdByUserId: founder.id,
    });

    await db.insert(bankTransactions).values({
      bankAccountId: account.id,
      externalId: "tx-taxi",
      bookedAt: "2026-04-01",
      amountPence: -1800,
      counterparty: "Uber",
      reference: "Taxi",
    });

    expect(await suggestMatches(companyId)).toHaveLength(0);
  });

  it("drops an unconfirmed suggestion when the expense becomes reimbursable", async () => {
    const [account] = await db
      .insert(bankAccounts)
      .values({ companyId, name: "Starling", provider: "starling" })
      .returning();
    const [founder] = await db
      .insert(users)
      .values({
        companyId,
        clerkUserId: "user_clerk_drop",
        email: "drop@example.com",
        name: "Drop",
        role: "admin",
      })
      .returning();

    const [expense] = await db
      .insert(expenses)
      .values({
        companyId,
        description: "Lunch",
        spentAt: "2026-04-03",
        amountPence: 1200,
        status: "pending",
      })
      .returning();

    await db.insert(bankTransactions).values({
      bankAccountId: account.id,
      externalId: "tx-lunch",
      bookedAt: "2026-04-03",
      amountPence: -1200,
      counterparty: "Cafe",
      reference: "Lunch",
    });

    expect(await suggestMatches(companyId)).toHaveLength(1);

    await db
      .update(expenses)
      .set({ status: "reimbursable", paidByUserId: founder.id })
      .where(eq(expenses.id, expense.id));

    await refreshExpenseBankSuggestion(companyId, expense.id);

    const remaining = await db
      .select()
      .from(reconciliationMatches)
      .where(
        and(
          eq(reconciliationMatches.expenseId, expense.id),
          eq(reconciliationMatches.confirmed, false),
        ),
      );
    expect(remaining).toHaveLength(0);
  });

  it("creates a suggestion from the expense side when the bank line already exists", async () => {
    const [account] = await db
      .insert(bankAccounts)
      .values({ companyId, name: "Starling", provider: "starling" })
      .returning();

    await db.insert(bankTransactions).values({
      bankAccountId: account.id,
      externalId: "tx-pre",
      bookedAt: "2026-04-03",
      amountPence: -3300,
      counterparty: "Printer ink",
      reference: "Office",
    });

    const [expense] = await db
      .insert(expenses)
      .values({
        companyId,
        description: "Printer ink",
        spentAt: "2026-04-03",
        amountPence: 3300,
        status: "recorded",
      })
      .returning();

    const match = await refreshExpenseBankSuggestion(companyId, expense.id);
    expect(match).not.toBeNull();

    const rows = await db
      .select()
      .from(reconciliationMatches)
      .where(eq(reconciliationMatches.expenseId, expense.id));
    expect(rows).toHaveLength(1);
    expect(rows[0].confirmed).toBe(false);
  });
});
