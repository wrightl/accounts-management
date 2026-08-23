import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb, type TestDatabase } from "@/db/pglite";
import { setTestDb, type Database } from "@/db";
import { expenses, users } from "@/db/schema";
import {
  approveExpense,
  rejectExpense,
  updateExpense,
} from "@/actions/expenses";
import { isAuthorisedExpenseSender } from "@/lib/expenses/inbound-email";

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

beforeEach(async () => {
  ctx = await createTestDb();
  db = ctx.db;
  setTestDb(db as unknown as Database);
});

afterEach(async () => {
  setTestDb(null);
  await ctx.client.close();
});

describe("isAuthorisedExpenseSender", () => {
  it("allows admin and user roles only", async () => {
    await db.insert(users).values([
      { email: "founder@example.com", role: "user", clerkUserId: "u1" },
      { email: "accountant@example.com", role: "accountant", clerkUserId: "u2" },
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
        clerkUserId: "user_clerk_1",
        email: "lee@dotanddashconsulting.com",
        name: "Lee",
        role: "admin",
      })
      .returning();
    const [reviewer] = await db
      .insert(users)
      .values({
        clerkUserId: "user_clerk_2",
        email: "angel@dotanddashconsulting.com",
        name: "Angel",
        role: "user",
      })
      .returning();

    const [expense] = await db
      .insert(expenses)
      .values({
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

  it("rejectExpense deletes pending expense", async () => {
    const { expense } = await seedPendingExpense();

    const result = await rejectExpense(expense.id);
    expect(result.ok).toBe(true);

    const rows = await db.select().from(expenses).where(eq(expenses.id, expense.id));
    expect(rows).toHaveLength(0);
  });
});
