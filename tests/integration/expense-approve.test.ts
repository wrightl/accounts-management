import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb, type TestDatabase } from "@/db/pglite";
import { setTestDb, type Database } from "@/db";
import { expenses, fxRates, users } from "@/db/schema";
import {
  approveExpense,
  rejectExpense,
  updateExpense,
} from "@/actions/expenses";
import { approvePendingExpense } from "@/lib/expenses/review";
import { isAuthorisedExpenseSender } from "@/lib/expenses/inbound-email";
import { getEmailExpensesFingerprint } from "@/lib/expenses/queries";
import { seedCompany } from "@/lib/test/seed-company";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@clerk/nextjs/server", () => ({
  auth: vi.fn(async () => ({ userId: "user_clerk_1", sessionClaims: {} })),
  currentUser: vi.fn(async () => ({
    primaryEmailAddress: { emailAddress: "lee@dotanddashconsulting.com" },
    firstName: "Lee",
    lastName: "Wright",
    publicMetadata: {},
  })),
}));

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

describe("isAuthorisedExpenseSender", () => {
  it("allows admin and user roles only", async () => {
    await db.insert(users).values([
      {
        companyId,
        email: "founder@example.com",
        role: "user",
        clerkUserId: "u1",
      },
      {
        companyId,
        email: "accountant@example.com",
        role: "accountant",
        clerkUserId: "u2",
      },
    ]);

    expect(await isAuthorisedExpenseSender("founder@example.com")).toBe(true);
    expect(await isAuthorisedExpenseSender("accountant@example.com")).toBe(false);
    expect(await isAuthorisedExpenseSender("unknown@example.com")).toBe(false);
  });
});

describe("pending expense approval", () => {
  async function seedPendingExpense() {
    const [founder] = await db
      .insert(users)
      .values({
        companyId,
        clerkUserId: "user_clerk_1",
        email: "lee@dotanddashconsulting.com",
        name: "Lee",
        role: "admin",
      })
      .returning();
    const [reviewer] = await db
      .insert(users)
      .values({
        companyId,
        clerkUserId: "user_clerk_2",
        email: "angel@dotanddashconsulting.com",
        name: "Angel",
        role: "user",
      })
      .returning();

    const [expense] = await db
      .insert(expenses)
      .values({
        companyId,
        description: "Coffee receipt",
        amountPence: 0,
        status: "pending",
        source: "email",
        submittedByUserId: founder.id,
      })
      .returning();

    return { founder, reviewer, expense };
  }

  it("approveExpense transitions pending to chosen status", async () => {
    const { founder, expense } = await seedPendingExpense();

    const form = new FormData();
    form.set("description", "Team coffee");
    form.set("spentAt", "2026-03-10");
    form.set("amountPounds", "12.50");
    form.set("status", "reimbursable");
    form.set("paidByUserId", founder.id);
    form.set("category", "Meals");

    const result = await approveExpense(expense.id, form);
    expect(result.ok).toBe(true);

    const [saved] = await db.select().from(expenses).where(eq(expenses.id, expense.id));
    expect(saved.status).toBe("reimbursable");
    expect(saved.amountPence).toBe(1250);
    expect(saved.paidByUserId).toBe(founder.id);
  });

  it("updateExpense keeps pending status on draft save", async () => {
    const { expense } = await seedPendingExpense();

    const form = new FormData();
    form.set("description", "Updated draft");
    form.set("amountPounds", "0");
    form.set("status", "recorded");
    form.set("paidByUserId", "");

    const result = await updateExpense(expense.id, form);
    expect(result.ok).toBe(true);

    const [saved] = await db.select().from(expenses).where(eq(expenses.id, expense.id));
    expect(saved.status).toBe("pending");
    expect(saved.description).toBe("Updated draft");
  });

  it("approveExpense clears a wrongly detected foreign currency", async () => {
    const { founder, expense } = await seedPendingExpense();
    await db.update(expenses).set({ detectedCurrency: "USD" }).where(eq(expenses.id, expense.id));

    const form = new FormData();
    form.set("description", "Team coffee");
    form.set("spentAt", "2026-03-10");
    form.set("amountPounds", "12.50");
    form.set("status", "reimbursable");
    form.set("paidByUserId", founder.id);
    form.set("currency", "GBP");

    expect((await approveExpense(expense.id, form)).ok).toBe(true);
    const [saved] = await db.select().from(expenses).where(eq(expenses.id, expense.id));
    expect(saved.detectedCurrency).toBeNull();
  });

  it("updateExpense keeps the detected currency unless GBP is chosen", async () => {
    const { expense } = await seedPendingExpense();
    await db.update(expenses).set({ detectedCurrency: "EUR" }).where(eq(expenses.id, expense.id));

    const form = new FormData();
    form.set("description", "Updated draft");
    form.set("amountPounds", "0");
    form.set("status", "recorded");
    form.set("currency", "EUR");
    expect((await updateExpense(expense.id, form)).ok).toBe(true);
    let [saved] = await db.select().from(expenses).where(eq(expenses.id, expense.id));
    expect(saved.detectedCurrency).toBe("EUR");

    form.set("currency", "GBP");
    expect((await updateExpense(expense.id, form)).ok).toBe(true);
    [saved] = await db.select().from(expenses).where(eq(expenses.id, expense.id));
    expect(saved.detectedCurrency).toBeNull();
  });

  function foreignApproveForm(founderId: string, fields: Record<string, string>) {
    const form = new FormData();
    form.set("description", "Seattle coffee");
    form.set("spentAt", "2026-03-10");
    form.set("status", "reimbursable");
    form.set("paidByUserId", founderId);
    for (const [k, v] of Object.entries(fields)) form.set(k, v);
    return form;
  }

  it("approveExpense converts a foreign amount at the Bank of England rate", async () => {
    const { founder, expense } = await seedPendingExpense();
    await db
      .insert(fxRates)
      .values({ currency: "USD", observationDate: "2026-03-10", foreignPerGbp: 1.25 });

    const form = foreignApproveForm(founder.id, {
      currency: "USD",
      originalAmount: "12.50",
      amountPounds: "",
    });
    expect((await approveExpense(expense.id, form)).ok).toBe(true);
    const [saved] = await db.select().from(expenses).where(eq(expenses.id, expense.id));
    expect(saved).toMatchObject({
      amountPence: 1000,
      originalAmountMinor: 1250,
      detectedCurrency: "USD",
      status: "reimbursable",
    });
  });

  it("approveExpense keeps a sterling amount the reviewer typed", async () => {
    const { founder, expense } = await seedPendingExpense();
    const form = foreignApproveForm(founder.id, {
      currency: "USD",
      originalAmount: "12.50",
      amountPounds: "9.80",
    });
    expect((await approveExpense(expense.id, form)).ok).toBe(true);
    const [saved] = await db.select().from(expenses).where(eq(expenses.id, expense.id));
    expect(saved).toMatchObject({ amountPence: 980, originalAmountMinor: 1250 });
  });

  it("approveExpense asks for the sterling amount when there's no rate", async () => {
    const { founder, expense } = await seedPendingExpense();
    // No Bank of England series for HKD.
    const form = foreignApproveForm(founder.id, {
      currency: "HKD",
      originalAmount: "100",
      amountPounds: "",
    });
    const result = await approveExpense(expense.id, form);
    expect(result.ok).toBe(false);
    expect(result.ok ? null : result.fieldErrors?.amountPounds).toBeTruthy();
  });

  it("approving without edits (mobile) converts a stored foreign amount", async () => {
    const { founder, expense } = await seedPendingExpense();
    await db
      .update(expenses)
      .set({ detectedCurrency: "EUR", originalAmountMinor: 2400, spentAt: "2026-03-10" })
      .where(eq(expenses.id, expense.id));
    await db
      .insert(fxRates)
      .values({ currency: "EUR", observationDate: "2026-03-10", foreignPerGbp: 1.2 });

    const result = await approvePendingExpense(
      { companyId, localUserId: founder.id },
      expense.id,
      { status: "company_paid" },
    );
    expect(result.ok).toBe(true);
    const [saved] = await db.select().from(expenses).where(eq(expenses.id, expense.id));
    expect(saved.amountPence).toBe(2000);
  });

  it("rejectExpense deletes pending expense", async () => {
    const { expense } = await seedPendingExpense();

    const result = await rejectExpense(expense.id);
    expect(result.ok).toBe(true);

    const rows = await db.select().from(expenses).where(eq(expenses.id, expense.id));
    expect(rows).toHaveLength(0);
  });
});

describe("getEmailExpensesFingerprint", () => {
  it("changes when an email expense arrives, not for manual ones", async () => {
    const empty = await getEmailExpensesFingerprint(companyId);

    await db.insert(expenses).values({
      companyId,
      description: "Manual",
      amountPence: 500,
      status: "recorded",
      source: "manual",
    });
    expect(await getEmailExpensesFingerprint(companyId)).toBe(empty);

    await db.insert(expenses).values({
      companyId,
      description: "Emailed receipt",
      amountPence: 0,
      status: "pending",
      source: "email",
    });
    const afterEmail = await getEmailExpensesFingerprint(companyId);
    expect(afterEmail).not.toBe(empty);
    expect(await getEmailExpensesFingerprint(companyId)).toBe(afterEmail);
  });
});
