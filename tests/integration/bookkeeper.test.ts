import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";
import { createTestDb, type TestDatabase } from "@/db/pglite";
import { setTestDb, type Database } from "@/db";
import {
  auditLog,
  bankAccounts,
  bankTransactions,
  clients,
  expenses,
  invoices,
  reconciliationMatches,
  users,
} from "@/db/schema";
import { seedCompany } from "@/lib/test/seed-company";
import { suggestBankCategories, listCategorySuggestions } from "@/lib/bookkeeper/categories";
import { suggestReceiptMatches } from "@/lib/bookkeeper/receipts";
import {
  acceptCategorySuggestions,
  acceptReceiptMatch,
  askBookkeeper,
  dismissCategorySuggestions,
} from "@/actions/bookkeeper";
import { updateBankCategory } from "@/actions/bank";
import { addDays } from "@/lib/ledger/corporation-tax";
import { todayIsoDate } from "@/lib/dates";

const generateText = vi.fn();
let aiOn = true;

vi.mock("ai", async (importOriginal) => ({
  ...(await importOriginal<typeof import("ai")>()),
  generateText: (opts: unknown) => generateText(opts),
}));
vi.mock("@/lib/ai/models", () => ({
  ASSISTANT_MODEL: "test/assistant",
  BULK_MODEL: "test/bulk",
  aiGatewayConfigured: () => aiOn,
}));
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
  unstable_cache: <T,>(fn: T) => fn,
}));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@clerk/nextjs/server", () => ({
  auth: vi.fn(async () => ({ userId: "user_clerk_ai", sessionClaims: {} })),
  currentUser: vi.fn(async () => ({
    primaryEmailAddress: { emailAddress: "ai@example.com" },
    firstName: "Ai",
    lastName: "Test",
    publicMetadata: {},
  })),
}));

const today = todayIsoDate();

let ctx: Awaited<ReturnType<typeof createTestDb>>;
let db: TestDatabase;
let companyId: string;
let accountId: string;

beforeEach(async () => {
  ctx = await createTestDb();
  db = ctx.db;
  setTestDb(db as unknown as Database);
  const company = await seedCompany(db);
  companyId = company.id;
  await db.insert(users).values({
    companyId,
    clerkUserId: "user_clerk_ai",
    email: "ai@example.com",
    name: "Ai Test",
    role: "admin",
  });
  const [account] = await db
    .insert(bankAccounts)
    .values({ companyId, name: "Current", provider: "starling" })
    .returning();
  accountId = account.id;
  generateText.mockReset();
  aiOn = true;
});

afterEach(async () => {
  setTestDb(null);
  await ctx.client.close();
});

let txSeq = 0;
async function seedTx(counterparty: string, amountPence: number, opts: { category?: string; date?: string } = {}) {
  const [row] = await db
    .insert(bankTransactions)
    .values({
      bankAccountId: accountId,
      externalId: `tx-${++txSeq}`,
      bookedAt: opts.date ?? today,
      amountPence,
      counterparty,
      spendingCategory: opts.category ?? null,
    })
    .returning();
  return row.id;
}

describe("category suggestions", () => {
  it("learns from history first, then asks AI about the rest", async () => {
    await seedTx("ADOBE *CREATIVE 1", -1999, { category: "SOFTWARE_AND_SUBSCRIPTIONS" });
    await seedTx("Adobe Creative 2", -1999, { category: "SOFTWARE_AND_SUBSCRIPTIONS" });
    const adobe = await seedTx("ADOBE CREATIVE 3", -1999);
    const pret = await seedTx("PRET A MANGER", -650);
    const odd = await seedTx("XYZ LTD", -10000);
    generateText.mockImplementation(async () => ({
      output: {
        suggestions: [
          { id: pret, category: "FOOD_AND_DRINK", reason: "Pret is a café chain." },
          { id: odd, category: "NOT_A_CATEGORY", reason: "Guess." },
          { id: "someone-elses-row", category: "TRAVEL", reason: "Nope." },
        ],
      },
    }));

    expect(await suggestBankCategories(companyId)).toEqual({
      fromHistory: 1,
      fromAi: 1,
      aiUnavailable: false,
    });
    // Only the rows history couldn't place went to the model.
    const prompt = JSON.parse(generateText.mock.calls[0]![0].prompt);
    expect(prompt.payments.map((p: { id: string }) => p.id).sort()).toEqual([pret, odd].sort());
    expect(prompt.earlierChoices).toEqual([
      { payee: "adobe creative", category: "SOFTWARE_AND_SUBSCRIPTIONS" },
    ]);

    const list = await listCategorySuggestions(companyId);
    expect(list.map((r) => [r.id, r.category, r.source])).toEqual(
      expect.arrayContaining([
        [adobe, "SOFTWARE_AND_SUBSCRIPTIONS", "history"],
        [pret, "FOOD_AND_DRINK", "ai"],
      ]),
    );
    expect(list).toHaveLength(2);
  });

  it("only uses history when AI isn't set up", async () => {
    aiOn = false;
    await seedTx("PRET A MANGER", -650);
    expect(await suggestBankCategories(companyId)).toEqual({
      fromHistory: 0,
      fromAi: 0,
      aiUnavailable: true,
    });
    expect(generateText).not.toHaveBeenCalled();
  });

  it("applies accepted suggestions and never re-suggests dismissed ones", async () => {
    await seedTx("Adobe Creative", -1999, { category: "SOFTWARE_AND_SUBSCRIPTIONS" });
    const a = await seedTx("Adobe Creative", -1999);
    const b = await seedTx("Adobe Creative", -2999);
    aiOn = false;
    await suggestBankCategories(companyId);

    expect((await acceptCategorySuggestions([a])).ok).toBe(true);
    expect((await dismissCategorySuggestions([b])).ok).toBe(true);
    const [rowA] = await db.select().from(bankTransactions).where(eq(bankTransactions.id, a));
    const [rowB] = await db.select().from(bankTransactions).where(eq(bankTransactions.id, b));
    expect(rowA).toMatchObject({ spendingCategory: "SOFTWARE_AND_SUBSCRIPTIONS", suggestedCategory: null });
    expect(rowB).toMatchObject({ spendingCategory: null, categorySuggestionDismissed: true });

    await suggestBankCategories(companyId);
    expect(await listCategorySuggestions(companyId)).toHaveLength(0);
  });

  it("learns from a manual correction", async () => {
    const first = await seedTx("Uber Trip", -1200, { category: "TRAVEL" });
    expect((await updateBankCategory(first, "STAFF")).ok).toBe(true);
    await seedTx("Uber Trip", -900);
    aiOn = false;
    await suggestBankCategories(companyId);
    const [s] = await listCategorySuggestions(companyId);
    expect(s?.category).toBe("STAFF");
  });
});

describe("receipt matching", () => {
  it("suggests a near match and can take the bank amount when accepted", async () => {
    const [expense] = await db
      .insert(expenses)
      .values({
        companyId,
        description: "Lunch with client",
        spentAt: addDays(today, -3),
        amountPence: 1_250,
        vatRate: 20,
        vatPence: 208,
        status: "recorded",
      })
      .returning();
    const pret = await seedTx("PRET A MANGER 123", -1_400, { date: addDays(today, -2) });
    await seedTx("FAR TOO BIG", -9_000, { date: addDays(today, -2) });
    generateText.mockImplementation(async (opts: { prompt: string }) => {
      const work = JSON.parse(opts.prompt);
      // Only the plausible payment was offered.
      expect(work[0].bankPayments.map((p: { bankTransactionId: string }) => p.bankTransactionId)).toEqual([pret]);
      return {
        output: {
          matches: [{ expenseId: expense.id, bankTransactionId: pret, reason: "Same café, a day apart" }],
        },
      };
    });

    expect(await suggestReceiptMatches(companyId)).toEqual({ suggested: 1, aiUnavailable: false });
    const [match] = await db.select().from(reconciliationMatches);
    expect(match).toMatchObject({ confirmed: false, expenseId: expense.id, bankTransactionId: pret });
    expect(match!.note).toBe(
      "AI: Same café, a day apart. Receipt £12.50, bank £14.00: check for a tip, fee or exchange rate.",
    );

    expect((await acceptReceiptMatch(match!.id, true)).ok).toBe(true);
    const [updated] = await db.select().from(expenses).where(eq(expenses.id, expense.id));
    expect(updated).toMatchObject({ amountPence: 1_400, vatPence: 233, status: "company_paid" });
    const [confirmed] = await db.select().from(reconciliationMatches);
    expect(confirmed!.confirmed).toBe(true);
  });
});

describe("asking questions", () => {
  it("answers from the tools, records what it used, and audits the question", async () => {
    const [client] = await db.insert(clients).values({ companyId, name: "Acme" }).returning();
    await db.insert(invoices).values({
      companyId,
      number: "INV-1",
      clientId: client.id,
      status: "sent",
      issueDate: today,
      dueDate: today,
      netPence: 100_000,
      grossPence: 100_000,
    });
    generateText.mockImplementation(
      async (opts: { tools: Record<string, { execute: (input: unknown) => Promise<unknown> }> }) => {
        const pnl = (await opts.tools.profit_and_loss!.execute({ from: today, to: today })) as {
          profit: string;
        };
        return { text: `Profit today is ${pnl.profit}.` };
      },
    );

    const result = await askBookkeeper("What's our profit today?");
    expect(result).toEqual({
      ok: true,
      answer: "Profit today is £1,000.00.",
      sources: [expect.stringMatching(/^Profit and loss, /)],
    });
    const [entry] = await db
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.companyId, companyId), eq(auditLog.action, "ai.ask")));
    expect(entry!.meta).toMatchObject({ question: "What's our profit today?", ok: true });
  });

  it("refuses empty questions without calling the model", async () => {
    expect((await askBookkeeper("  ")).ok).toBe(false);
    expect(generateText).not.toHaveBeenCalled();
  });
});
