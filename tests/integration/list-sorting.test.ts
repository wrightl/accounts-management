import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestDb, type TestDatabase } from "@/db/pglite";
import { setTestDb, type Database } from "@/db";
import { bankAccounts, bankTransactions, expenses, users } from "@/db/schema";
import { listBankTransactions } from "@/lib/bank/queries";
import { listExpenses } from "@/lib/expenses/queries";
import { seedCompany } from "@/lib/test/seed-company";

vi.mock("server-only", () => ({}));

let ctx: Awaited<ReturnType<typeof createTestDb>>;
let db: TestDatabase;
let companyId: string;

beforeEach(async () => {
  ctx = await createTestDb();
  db = ctx.db;
  setTestDb(db as unknown as Database);
  companyId = (await seedCompany(db)).id;
});

afterEach(async () => {
  setTestDb(null);
  await ctx.client.close();
});

describe("transactions table sorting", () => {
  beforeEach(async () => {
    const [account] = await db
      .insert(bankAccounts)
      .values({ companyId, name: "Starling", provider: "starling" })
      .returning();
    await db.insert(bankTransactions).values([
      { bankAccountId: account.id, externalId: "a", bookedAt: "2026-04-01", amountPence: -500, counterparty: "zoom" },
      { bankAccountId: account.id, externalId: "b", bookedAt: "2026-04-02", amountPence: 9000, counterparty: "Acme" },
      { bankAccountId: account.id, externalId: "c", bookedAt: "2026-04-03", amountPence: -2500, counterparty: null, description: "Monzo fee" },
      { bankAccountId: account.id, externalId: "d", bookedAt: "2026-04-04", amountPence: -100, counterparty: "Beta", spendingCategory: "Software" },
    ]);
  });

  const order = async (sort: "date" | "counterparty" | "amount" | "category", dir: "asc" | "desc") =>
    (await listBankTransactions(companyId, { sort, dir })).rows.map((r) => r.counterparty ?? r.description);

  it("defaults to newest first", async () => {
    expect((await listBankTransactions(companyId)).rows.map((r) => r.bookedAt)).toEqual([
      "2026-04-04",
      "2026-04-03",
      "2026-04-02",
      "2026-04-01",
    ]);
    expect(await order("date", "asc")).toEqual(["zoom", "Acme", "Monzo fee", "Beta"]);
  });

  it("sorts counterparty case-insensitively, falling back to the description", async () => {
    expect(await order("counterparty", "asc")).toEqual(["Acme", "Beta", "Monzo fee", "zoom"]);
    expect(await order("counterparty", "desc")).toEqual(["zoom", "Monzo fee", "Beta", "Acme"]);
  });

  it("sorts signed amounts and keeps blanks last either way", async () => {
    expect(await order("amount", "asc")).toEqual(["Monzo fee", "zoom", "Beta", "Acme"]);
    expect(await order("amount", "desc")).toEqual(["Acme", "Beta", "zoom", "Monzo fee"]);
    expect((await order("category", "asc"))[0]).toBe("Beta");
    expect((await order("category", "desc"))[0]).toBe("Beta");
  });

  it("pages through a sort without repeating or skipping rows", async () => {
    const pages = await Promise.all(
      [1, 2].map((page) => listBankTransactions(companyId, { sort: "amount", dir: "asc", page, pageSize: 2 })),
    );
    expect(pages.flatMap((p) => p.rows.map((r) => r.amountPence))).toEqual([-2500, -500, -100, 9000]);
  });
});

describe("expenses table sorting", () => {
  it("sorts status in workflow order and payer by name", async () => {
    const [ann, bob] = await db
      .insert(users)
      .values([
        { companyId, clerkUserId: "u_ann", email: "ann@example.test", name: "ann", role: "user" },
        { companyId, clerkUserId: "u_bob", email: "bob@example.test", name: "Bob", role: "user" },
      ])
      .returning();
    await db.insert(expenses).values([
      { companyId, description: "Train", spentAt: "2026-04-01", amountPence: 4200, status: "company_paid" },
      { companyId, description: "Lunch", spentAt: "2026-04-02", amountPence: 1500, status: "reimbursable", paidByUserId: bob.id },
      { companyId, description: "Emailed receipt", spentAt: null, amountPence: 0, status: "pending" },
      { companyId, description: "Coffee", spentAt: "2026-04-03", amountPence: 300, status: "reimbursable", paidByUserId: ann.id },
    ]);

    const by = async (sort: "status" | "paidBy" | "amount" | "date", dir: "asc" | "desc") =>
      (await listExpenses(companyId, { sort: { sort, dir } })).map((e) => e.description);

    expect(await by("status", "asc")).toEqual(["Emailed receipt", "Coffee", "Lunch", "Train"]);
    // No payer sorts last; ties fall back to newest first, undated on top.
    expect(await by("paidBy", "asc")).toEqual(["Coffee", "Lunch", "Emailed receipt", "Train"]);
    expect(await by("amount", "desc")).toEqual(["Train", "Lunch", "Coffee", "Emailed receipt"]);
    // Undated expenses stay at the top of the default newest-first view.
    expect(await by("date", "desc")).toEqual(["Emailed receipt", "Coffee", "Lunch", "Train"]);
    expect((await listExpenses(companyId)).map((e) => e.description)).toEqual(await by("date", "desc"));
  });
});
