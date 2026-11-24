import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb, type TestDatabase } from "@/db/pglite";
import { setTestDb, type Database } from "@/db";
import { expenses, users } from "@/db/schema";
import { seedCompany } from "@/lib/test/seed-company";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@clerk/nextjs/server", () => ({
  auth: vi.fn(async () => ({ userId: "user_clerk_1", sessionClaims: {} })),
  currentUser: vi.fn(async () => ({
    primaryEmailAddress: { emailAddress: "founder@example.com" },
    firstName: "Fran",
    lastName: "Founder",
    publicMetadata: {},
  })),
}));

const { approveExpense, createExpense, updateExpense } = await import("@/actions/expenses");

let ctx: Awaited<ReturnType<typeof createTestDb>>;
let db: TestDatabase;
let companyId: string;

beforeEach(async () => {
  ctx = await createTestDb();
  db = ctx.db;
  setTestDb(db as unknown as Database);
  const company = await seedCompany(db, { name: "Receipts Ltd", vatRegistered: true, defaultVatRate: 20 });
  companyId = company!.id;
  await db.insert(users).values({
    companyId,
    clerkUserId: "user_clerk_1",
    email: "founder@example.com",
    name: "Fran",
    role: "admin",
  });
});

afterEach(async () => {
  setTestDb(null);
  await ctx.client.close();
});

function form(fields: Record<string, string>) {
  const f = new FormData();
  f.set("description", "Lunch with client");
  f.set("category", "Meals");
  f.set("spentAt", "2026-06-02");
  f.set("amountPounds", "12.00");
  f.set("status", "recorded");
  f.set("taxCode", "standard");
  f.set("vatRate", "20");
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  return f;
}

async function stored(id: string) {
  const [row] = await db
    .select({
      vatPence: expenses.vatPence,
      vatPenceSource: expenses.vatPenceSource,
      receiptVatPence: expenses.receiptVatPence,
    })
    .from(expenses)
    .where(eq(expenses.id, id));
  return row;
}

describe("VAT as shown on the receipt", () => {
  it("works the VAT out from the rate when nothing else is given", async () => {
    const result = await createExpense(form({}));
    if (!result.ok) throw new Error(result.error);
    expect(await stored(result.id!)).toEqual({ vatPence: 200, vatPenceSource: "derived", receiptVatPence: null });
  });

  it("keeps the receipt's figure, and remembers it", async () => {
    const result = await createExpense(form({ vatSource: "receipt", vatPounds: "1.98" }));
    if (!result.ok) throw new Error(result.error);
    expect(await stored(result.id!)).toEqual({ vatPence: 198, vatPenceSource: "receipt", receiptVatPence: 198 });
  });

  it("keeps a typed figure, and the receipt's figure stays on record when it is overridden", async () => {
    const created = await createExpense(form({ vatSource: "receipt", vatPounds: "1.98" }));
    if (!created.ok) throw new Error(created.error);
    const updated = await updateExpense(created.id!, form({ vatSource: "manual", vatPounds: "1.50" }));
    expect(updated.ok).toBe(true);
    expect(await stored(created.id!)).toEqual({ vatPence: 150, vatPenceSource: "manual", receiptVatPence: 198 });

    const backToRate = await updateExpense(created.id!, form({ vatSource: "derived" }));
    expect(backToRate.ok).toBe(true);
    expect(await stored(created.id!)).toEqual({ vatPence: 200, vatPenceSource: "derived", receiptVatPence: 198 });
  });

  it("keeps a typed figure when an update doesn't say where the VAT came from", async () => {
    const created = await createExpense(form({ vatSource: "manual", vatPounds: "1.50" }));
    if (!created.ok) throw new Error(created.error);
    const renamed = await updateExpense(created.id!, form({ description: "Lunch with a client" }));
    expect(renamed.ok).toBe(true);
    expect(await stored(created.id!)).toMatchObject({ vatPence: 150, vatPenceSource: "manual" });

    // Once the amount no longer covers it, the typed figure gives way to the rate.
    const smaller = await updateExpense(created.id!, form({ amountPounds: "1.20" }));
    expect(smaller.ok).toBe(true);
    expect(await stored(created.id!)).toMatchObject({ vatPence: 20, vatPenceSource: "derived" });
  });

  it("refuses VAT that isn't less than the amount paid", async () => {
    const result = await createExpense(form({ vatSource: "manual", vatPounds: "12.00" }));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.fieldErrors?.vatPounds).toMatch(/less than the amount paid/);
  });

  it("has no VAT on a 0% code whatever figure is posted", async () => {
    const result = await createExpense(
      form({ taxCode: "exempt", vatRate: "0", vatSource: "manual", vatPounds: "1.00" }),
    );
    if (!result.ok) throw new Error(result.error);
    expect(await stored(result.id!)).toMatchObject({ vatPence: 0, vatPenceSource: "derived" });
  });

  it("uses an emailed receipt's VAT when the expense is approved with a rated code", async () => {
    const [pending] = await db
      .insert(expenses)
      .values({
        companyId,
        description: "Emailed receipt",
        amountPence: 1_200,
        taxCode: "zero_rated",
        taxCodeNeedsReview: true,
        vatRate: 0,
        vatPence: 0,
        receiptVatPence: 190,
        status: "pending",
        source: "email",
      })
      .returning({ id: expenses.id });
    const approved = await approveExpense(pending!.id, form({}));
    expect(approved.ok).toBe(true);
    expect(await stored(pending!.id)).toEqual({ vatPence: 190, vatPenceSource: "receipt", receiptVatPence: 190 });
  });
});
