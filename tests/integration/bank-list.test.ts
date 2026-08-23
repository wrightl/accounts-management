import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestDb, type TestDatabase } from "@/db/pglite";
import { setTestDb, type Database } from "@/db";
import { bankAccounts, bankTransactions } from "@/db/schema";
import {
  countUnreconciledBankTransactions,
  listBankTransactions,
} from "@/lib/bank/queries";
import { getBankTransactionSummary } from "@/lib/bank/summary";

vi.mock("server-only", () => ({}));

let ctx: Awaited<ReturnType<typeof createTestDb>>;
let db: TestDatabase;

beforeEach(async () => {
  ctx = await createTestDb();
  db = ctx.db;
  setTestDb(db as unknown as Database);
});

afterEach(async () => {
  setTestDb(null);
  await ctx.client.close();
});

async function seedTransactions() {
  const [account] = await db
    .insert(bankAccounts)
    .values({ name: "Starling Business" })
    .returning();

  const rows = [
    {
      bankAccountId: account.id,
      externalId: "tx-1",
      bookedAt: "2026-08-23",
      amountPence: 12_000,
      counterparty: "Acme Ltd",
      reference: "INV-100",
      spendingCategory: "REVENUE",
      raw: { "Balance (GBP)": "1500.00" },
    },
    {
      bankAccountId: account.id,
      externalId: "tx-2",
      bookedAt: "2026-08-22",
      amountPence: -4_500,
      counterparty: "Trainline",
      reference: "Travel Aug",
      spendingCategory: "TRAVEL",
    },
    {
      bankAccountId: account.id,
      externalId: "tx-3",
      bookedAt: "2026-08-01",
      amountPence: -9_900,
      counterparty: "AWS",
      reference: "Cloud",
      spendingCategory: "SOFTWARE_AND_SUBSCRIPTIONS",
    },
    {
      bankAccountId: account.id,
      externalId: "tx-4",
      bookedAt: "2026-07-15",
      amountPence: -1_200,
      counterparty: "Pret",
      reference: "Lunch",
      spendingCategory: "FOOD_AND_DRINK",
    },
  ];
  await db.insert(bankTransactions).values(rows);
  return account;
}

describe("listBankTransactions paging and filters", () => {
  it("returns only the requested page from the server", async () => {
    await seedTransactions();
    const page1 = await listBankTransactions({ page: 1, pageSize: 2 });
    expect(page1.total).toBe(4);
    expect(page1.pageCount).toBe(2);
    expect(page1.rows).toHaveLength(2);
    expect(page1.rows[0].bookedAt).toBe("2026-08-23");
    expect(page1.rows[1].bookedAt).toBe("2026-08-22");

    const page2 = await listBankTransactions({ page: 2, pageSize: 2 });
    expect(page2.rows).toHaveLength(2);
    expect(page2.rows[0].bookedAt).toBe("2026-08-01");
    expect(page2.page).toBe(2);
  });

  it("filters by type, category, search, and date range on the server", async () => {
    await seedTransactions();

    const incoming = await listBankTransactions({ type: "incoming", pageSize: 10 });
    expect(incoming.total).toBe(1);
    expect(incoming.rows[0].counterparty).toBe("Acme Ltd");

    const travel = await listBankTransactions({ category: "TRAVEL", pageSize: 10 });
    expect(travel.total).toBe(1);
    expect(travel.rows[0].counterparty).toBe("Trainline");

    const search = await listBankTransactions({ q: "aws", pageSize: 10 });
    expect(search.total).toBe(1);
    expect(search.rows[0].counterparty).toBe("AWS");

    const ranged = await listBankTransactions({
      from: "2026-08-01",
      to: "2026-08-31",
      pageSize: 10,
    });
    expect(ranged.total).toBe(3);
  });

  it("counts unreconciled rows independently of the current page", async () => {
    await seedTransactions();
    const unreconciled = await countUnreconciledBankTransactions();
    expect(unreconciled).toBe(4);
  });
});

describe("getBankTransactionSummary", () => {
  it("aggregates incoming, outgoing, and net across all matching rows", async () => {
    await seedTransactions();

    const summary = await getBankTransactionSummary({});
    expect(summary.totalCount).toBe(4);
    expect(summary.incomingPence).toBe(12_000);
    expect(summary.outgoingPence).toBe(15_600);
    expect(summary.netPence).toBe(-3_600);
    expect(summary.incomingCount).toBe(1);
    expect(summary.outgoingCount).toBe(3);
    expect(summary.unreconciledCount).toBe(4);
    expect(summary.reconciledPercent).toBe(0);
    expect(summary.pieSlices).toHaveLength(2);
    expect(summary.statementBalancePence).toBe(150_000);
    expect(summary.largestIncomingPence).toBe(12_000);
    expect(summary.largestOutgoingPence).toBe(9_900);
  });

  it("respects the same filters as the transaction list", async () => {
    await seedTransactions();

    const summary = await getBankTransactionSummary({ type: "incoming" });
    expect(summary.totalCount).toBe(1);
    expect(summary.incomingPence).toBe(12_000);
    expect(summary.outgoingPence).toBe(0);
    expect(summary.pieSlices).toHaveLength(1);
    expect(summary.pieSlices[0].name).toBe("Incoming");
  });
});
