import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestDb, type TestDatabase } from "@/db/pglite";
import { setTestDb, type Database } from "@/db";
import { bankAccounts, bankTransactions, companies } from "@/db/schema";
import { getBankFeedAdapter } from "@/lib/bank/adapters";
import {
  getOrCreateBankAccount,
  importBankRows,
  saveBankAccountCsvMapping,
} from "@/lib/bank/queries";
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

describe("multi-bank CSV import routing", () => {
  it("creates a Lloyds account without writing into an existing Starling account", async () => {
    const [starling] = await db
      .insert(bankAccounts)
      .values({ companyId, name: "Starling Bank", provider: "starling" })
      .returning();

    await db
      .update(companies)
      .set({ bankProvider: "lloyds", bankName: "Lloyds" })
      .where(eq(companies.id, companyId));

    const lloyds = await getOrCreateBankAccount(companyId, "lloyds");
    expect(lloyds.id).not.toBe(starling.id);
    expect(lloyds.provider).toBe("lloyds");

    const csv = [
      "Transaction Date,Transaction Description,Debit Amount,Credit Amount",
      "15/03/2026,TESCO STORES,18.40,",
    ].join("\n");
    const rows = getBankFeedAdapter("lloyds").parse(csv);
    const result = await importBankRows(companyId, lloyds.id, rows);

    expect(result.inserted).toBe(1);
    expect(result.skippedNonGbp).toBe(0);

    const starlingTx = await db
      .select()
      .from(bankTransactions)
      .where(eq(bankTransactions.bankAccountId, starling.id));
    const lloydsTx = await db
      .select()
      .from(bankTransactions)
      .where(eq(bankTransactions.bankAccountId, lloyds.id));

    expect(starlingTx).toHaveLength(0);
    expect(lloydsTx).toHaveLength(1);
    expect(lloydsTx[0]?.amountPence).toBe(-1840);
  });

  it("imports Other bank via mapping and is idempotent on re-import", async () => {
    await db
      .update(companies)
      .set({ bankProvider: "other", bankName: "Metro Bank" })
      .where(eq(companies.id, companyId));

    const account = await getOrCreateBankAccount(companyId, "other", "Metro Bank");
    expect(account.name).toBe("Metro Bank");

    const mapping = {
      date: "Txn Date",
      moneyOut: "Out",
      moneyIn: "In",
      counterparty: "Narration",
    };
    const csv = [
      "Txn Date,Narration,Out,In",
      "15/03/2026,Shop,12.00,",
      "16/03/2026,Client,,99.50",
    ].join("\n");

    const rows = getBankFeedAdapter("other", mapping).parse(csv);
    const first = await importBankRows(companyId, account.id, rows);
    expect(first.inserted).toBe(2);

    await saveBankAccountCsvMapping(companyId, account.id, mapping);
    const [reloaded] = await db
      .select()
      .from(bankAccounts)
      .where(eq(bankAccounts.id, account.id));
    expect(reloaded?.csvMapping).toMatchObject(mapping);

    const second = await importBankRows(
      companyId,
      account.id,
      getBankFeedAdapter("other", mapping).parse(csv),
    );
    expect(second.inserted).toBe(0);
    expect(second.skipped).toBe(2);

    const all = await db
      .select()
      .from(bankTransactions)
      .where(eq(bankTransactions.bankAccountId, account.id));
    expect(all).toHaveLength(2);
  });

  it("counts skipped non-GBP rows without inserting them", async () => {
    const account = await getOrCreateBankAccount(companyId, "revolut");
    const csv = [
      "Date completed (UTC),ID,Description,Amount,Payment currency",
      "2026-03-15,rev1,Hotel,-80.00,EUR",
      "2026-03-16,rev2,Client,200.00,GBP",
    ].join("\n");
    const rows = getBankFeedAdapter("revolut").parse(csv);
    const result = await importBankRows(companyId, account.id, rows);
    expect(result.inserted).toBe(1);
    expect(result.skippedNonGbp).toBe(1);

    const txs = await db
      .select()
      .from(bankTransactions)
      .where(eq(bankTransactions.bankAccountId, account.id));
    expect(txs).toHaveLength(1);
    expect(txs[0]?.amountPence).toBe(20000);
  });
});
