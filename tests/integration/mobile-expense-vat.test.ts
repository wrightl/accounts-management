import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";
import { createTestDb, type TestDatabase } from "@/db/pglite";
import { setTestDb, type Database } from "@/db";
import { expenses, users } from "@/db/schema";
import { seedCompany } from "@/lib/test/seed-company";
import { GET as listExpenses, POST as createExpense } from "@/app/api/mobile/expenses/route";
import { GET as expenseOptions } from "@/app/api/mobile/expenses/options/route";

// Tax codes and the receipt's VAT from the app (roadmap item 17), through the
// same mobile routes the phone calls.

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

const clerkMocks = vi.hoisted(() => ({
  auth: vi.fn(async () => ({ userId: "user_clerk_mobile", sessionClaims: {} })),
  currentUser: vi.fn(async () => ({
    primaryEmailAddress: { emailAddress: "admin@example.com" },
    firstName: "Admin",
    lastName: "Mobile",
    publicMetadata: {},
  })),
}));

vi.mock("@clerk/nextjs/server", () => ({
  auth: clerkMocks.auth,
  currentUser: clerkMocks.currentUser,
}));

let ctx: Awaited<ReturnType<typeof createTestDb>>;
let db: TestDatabase;
let companyId: string;

beforeEach(async () => {
  ctx = await createTestDb();
  db = ctx.db;
  setTestDb(db as unknown as Database);
  const company = await seedCompany(db, { name: "VAT Phone Ltd", vatRegistered: true, defaultVatRate: 20 });
  companyId = company.id;
  await db.insert(users).values({
    companyId,
    clerkUserId: "user_clerk_mobile",
    email: "admin@example.com",
    role: "admin",
    name: "Admin",
  });
});

afterEach(async () => {
  setTestDb(null);
  await ctx.client.close();
});

function post(body: Record<string, unknown>) {
  return createExpense(
    new Request("http://localhost/api/mobile/expenses", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        description: "Lunch with client",
        amountPence: 1200,
        category: "Meals",
        expenseDate: "2026-11-20",
        status: "company_paid",
        ...body,
      }),
    }) as never,
  );
}

async function stored(id: string) {
  const [row] = await db
    .select({
      taxCode: expenses.taxCode,
      vatRate: expenses.vatRate,
      vatPence: expenses.vatPence,
      vatPenceSource: expenses.vatPenceSource,
      receiptVatPence: expenses.receiptVatPence,
    })
    .from(expenses)
    .where(and(eq(expenses.id, id), eq(expenses.companyId, companyId)));
  return row;
}

describe("mobile expense options", () => {
  it("lists the expense tax codes with labels and rates, and the default", async () => {
    const res = await expenseOptions();
    expect(res.status).toBe(200);
    const { data } = await res.json();
    expect(data.taxCodes).toEqual([
      { code: "standard", label: "Standard rate", rate: 20 },
      { code: "reduced", label: "Reduced rate", rate: 5 },
      { code: "zero_rated", label: "Zero rated", rate: 0 },
      { code: "exempt", label: "Exempt", rate: 0 },
      { code: "outside_scope", label: "Outside the scope of VAT", rate: 0 },
      { code: "reverse_charge", label: "Reverse charge", rate: 0 },
      { code: "postponed_import", label: "Postponed import VAT", rate: 0 },
    ]);
    expect(data.defaultTaxCode).toBe("standard");
  });
});

describe("mobile expense tax codes", () => {
  it("stores the posted tax code with its own rate", async () => {
    const res = await post({ taxCode: "reduced", vatRate: 5 });
    expect(res.status).toBe(201);
    const { data } = await res.json();
    expect(data.taxCode).toBe("reduced");
    expect(data.taxCodeLabel).toBe("Reduced rate");
    expect(await stored(data.id)).toMatchObject({
      taxCode: "reduced",
      vatRate: 5,
      vatPence: 57,
      vatPenceSource: "derived",
    });
  });

  it("still accepts a bare rate from an older app", async () => {
    const res = await post({ vatRate: 20 });
    expect(res.status).toBe(201);
    const { data } = await res.json();
    expect(await stored(data.id)).toMatchObject({
      taxCode: "standard",
      vatRate: 20,
      vatPence: 200,
      vatPenceSource: "derived",
    });
  });

  it("refuses a sales-only code on an expense", async () => {
    const res = await post({ taxCode: "export", vatRate: 0 });
    expect(res.status).toBe(400);
  });

  it("returns the tax code and VAT in the expense list", async () => {
    await post({ taxCode: "exempt", vatRate: 0 });
    const res = await listExpenses(new Request("http://localhost/api/mobile/expenses") as never);
    const { data } = await res.json();
    expect(data).toHaveLength(1);
    expect(data[0]).toMatchObject({
      taxCode: "exempt",
      taxCodeLabel: "Exempt",
      vatRate: 0,
      vatPence: 0,
    });
  });
});

describe("mobile expense VAT from the receipt", () => {
  it("keeps the VAT read from the receipt", async () => {
    const res = await post({ taxCode: "standard", vatRate: 20, vatPounds: "1.98", vatSource: "receipt" });
    expect(res.status).toBe(201);
    const { data } = await res.json();
    expect(data.vatPence).toBe(198);
    expect(data.vatPenceSource).toBe("receipt");
    expect(await stored(data.id)).toMatchObject({
      vatPence: 198,
      vatPenceSource: "receipt",
      receiptVatPence: 198,
    });
  });

  it("keeps a figure the person typed", async () => {
    const res = await post({ taxCode: "standard", vatRate: 20, vatPounds: "2.50", vatSource: "manual" });
    expect(res.status).toBe(201);
    const { data } = await res.json();
    expect(await stored(data.id)).toMatchObject({
      vatPence: 250,
      vatPenceSource: "manual",
      receiptVatPence: null,
    });
  });

  it("works the VAT out when the app sends no figure", async () => {
    const res = await post({ taxCode: "standard", vatRate: 20 });
    const { data } = await res.json();
    expect(await stored(data.id)).toMatchObject({ vatPence: 200, vatPenceSource: "derived" });
  });

  it("refuses VAT that isn't less than the amount paid", async () => {
    const res = await post({ taxCode: "standard", vatRate: 20, vatPounds: "12.00", vatSource: "manual" });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.fieldErrors?.vatPounds).toBe("The VAT must be less than the amount paid");
    const rows = await db.select({ id: expenses.id }).from(expenses).where(eq(expenses.companyId, companyId));
    expect(rows).toHaveLength(0);
  });

  it("refuses VAT that isn't an amount in pounds", async () => {
    const res = await post({ taxCode: "standard", vatRate: 20, vatPounds: "two", vatSource: "manual" });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.fieldErrors?.vatPounds).toBe("Enter the VAT as an amount in pounds, like 2.00");
  });

  it("ignores a VAT figure on a 0% code", async () => {
    const res = await post({ taxCode: "zero_rated", vatRate: 0, vatPounds: "1.00", vatSource: "receipt" });
    expect(res.status).toBe(201);
    const { data } = await res.json();
    expect(await stored(data.id)).toMatchObject({ vatPence: 0, vatPenceSource: "derived" });
  });
});
