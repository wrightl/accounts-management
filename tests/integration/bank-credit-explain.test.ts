import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestDb, type TestDatabase } from "@/db/pglite";
import { setTestDb, type Database } from "@/db";
import {
  bankAccounts,
  bankTransactions,
  reconciliationMatches,
} from "@/db/schema";
import {
  clearBankCreditExplanation,
  explainBankCredit,
  listBankTransactions,
  ReconciliationError,
} from "@/lib/bank/queries";
import {
  createIncomeCategory,
  deleteUnusedIncomeCategory,
  listIncomeCategoriesWithUsage,
} from "@/lib/bank/income-category-catalog";
import { getProfitAndLoss } from "@/lib/reports/queries";
import { seedCompany } from "@/lib/test/seed-company";

vi.mock("server-only", () => ({}));

let ctx: Awaited<ReturnType<typeof createTestDb>>;
let db: TestDatabase;
let accountId: string;
let companyId: string;

beforeEach(async () => {
  ctx = await createTestDb();
  db = ctx.db;
  setTestDb(db as unknown as Database);
  const company = await seedCompany(db);
  companyId = company.id;

  const [account] = await db
    .insert(bankAccounts)
    .values({ companyId, name: "Starling Business", provider: "starling" })
    .returning();
  accountId = account.id;
});

afterEach(async () => {
  setTestDb(null);
  await ctx.client.close();
});

async function insertCredit(amountPence = 5_000) {
  const [tx] = await db
    .insert(bankTransactions)
    .values({
      bankAccountId: accountId,
      externalId: `tx-${amountPence}-${Math.random()}`,
      bookedAt: "2026-03-15",
      amountPence,
      counterparty: "ACME Bank",
    })
    .returning();
  return tx;
}

describe("explainBankCredit", () => {
  it("rejects outgoing transactions", async () => {
    const tx = await insertCredit(-2_000);
    await expect(
      explainBankCredit(companyId, tx.id, {
        matchType: "other_income",
        incomeCategory: "Interest",
      }),
    ).rejects.toBeInstanceOf(ReconciliationError);
  });

  it("explains other income and marks the row reconciled", async () => {
    const tx = await insertCredit(12_50);
    const { matchId } = await explainBankCredit(companyId, tx.id, {
      matchType: "other_income",
      incomeCategory: "Interest",
    });

    const [match] = await db
      .select()
      .from(reconciliationMatches)
      .where(eq(reconciliationMatches.id, matchId));
    expect(match?.confirmed).toBe(true);
    expect(match?.matchType).toBe("other_income");
    expect(match?.incomeCategory).toBe("Interest");

    const list = await listBankTransactions(companyId, {});
    const row = list.rows.find((r) => r.id === tx.id);
    expect(row?.reconciled).toBe(true);
    expect(row?.matchLabel).toContain("Interest");
  });

  it("accepts transfer and tax_or_loan without affecting other-income P&L", async () => {
    const transfer = await insertCredit(10_000);
    const tax = await insertCredit(2_000);
    await explainBankCredit(companyId, transfer.id, { matchType: "transfer" });
    await explainBankCredit(companyId, tax.id, {
      matchType: "tax_or_loan",
      note: "VAT refund",
    });

    const pnl = await getProfitAndLoss(companyId, "2026-01-01", "2026-12-31");
    expect(pnl.otherIncomePence).toBe(0);
    expect(pnl.incomePence).toBe(0);
  });

  it("adds other income to profit and leaves invoiced income unchanged", async () => {
    const tx = await insertCredit(3_500);
    await explainBankCredit(companyId, tx.id, {
      matchType: "other_income",
      incomeCategory: "Grant",
      note: "Innovate UK",
    });

    const pnl = await getProfitAndLoss(companyId, "2026-01-01", "2026-12-31");
    expect(pnl.incomePence).toBe(0);
    expect(pnl.otherIncomePence).toBe(3_500);
    expect(pnl.profitPence).toBe(3_500);
  });

  it("clears a credit explanation", async () => {
    const tx = await insertCredit(1_000);
    const { matchId } = await explainBankCredit(companyId, tx.id, {
      matchType: "transfer",
    });
    await clearBankCreditExplanation(companyId, matchId);

    const remaining = await db.select().from(reconciliationMatches);
    expect(remaining).toHaveLength(0);
  });

  it("removes unconfirmed suggestions when explaining", async () => {
    const tx = await insertCredit(4_000);
    await db.insert(reconciliationMatches).values({
      bankTransactionId: tx.id,
      matchType: "invoice_payment",
      confirmed: false,
    });

    await explainBankCredit(companyId, tx.id, {
      matchType: "other_income",
      incomeCategory: "Refund",
    });

    const matches = await db.select().from(reconciliationMatches);
    expect(matches).toHaveLength(1);
    expect(matches[0]?.matchType).toBe("other_income");
    expect(matches[0]?.confirmed).toBe(true);
  });
});

describe("income category catalog", () => {
  it("rejects names that duplicate built-ins", async () => {
    const result = await createIncomeCategory(companyId, "interest");
    expect(result.ok).toBe(false);
  });

  it("creates a custom category and allows explaining with it", async () => {
    const created = await createIncomeCategory(companyId, "Affiliate");
    expect(created.ok).toBe(true);

    const tx = await insertCredit(750);
    await explainBankCredit(companyId, tx.id, {
      matchType: "other_income",
      incomeCategory: "affiliate",
    });

    const [match] = await db.select().from(reconciliationMatches);
    expect(match?.incomeCategory).toBe("Affiliate");
  });

  it("refuses delete while the category is in use", async () => {
    const created = await createIncomeCategory(companyId, "Royalties");
    expect(created.ok).toBe(true);
    const catalog = await listIncomeCategoriesWithUsage(companyId);
    const row = catalog.find((c) => c.name === "Royalties");
    expect(row).toBeTruthy();

    const tx = await insertCredit(900);
    await explainBankCredit(companyId, tx.id, {
      matchType: "other_income",
      incomeCategory: "Royalties",
    });

    const del = await deleteUnusedIncomeCategory(companyId, row!.id);
    expect(del.ok).toBe(false);

    await clearBankCreditExplanation(
      companyId,
      (
        await db.select().from(reconciliationMatches)
      )[0]!.id,
    );

    const del2 = await deleteUnusedIncomeCategory(companyId, row!.id);
    expect(del2.ok).toBe(true);
  });

  it("rejects explaining with an unknown category", async () => {
    const tx = await insertCredit(100);
    await expect(
      explainBankCredit(companyId, tx.id, {
        matchType: "other_income",
        incomeCategory: "Not A Real Category",
      }),
    ).rejects.toBeInstanceOf(ReconciliationError);
  });
});
