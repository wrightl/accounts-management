import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb, type TestDatabase } from "@/db/pglite";
import { setTestDb, type Database } from "@/db";
import { companies, expenses, users } from "@/db/schema";
import { seedCompany } from "@/lib/test/seed-company";
import {
  GET as listExpenses,
  POST as createExpense,
} from "@/app/api/mobile/expenses/route";
import { GET as getExpense } from "@/app/api/mobile/expenses/[id]/route";
import { POST as approveExpense } from "@/app/api/mobile/expenses/[id]/approve/route";

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

beforeEach(async () => {
  ctx = await createTestDb();
  db = ctx.db;
  setTestDb(db as unknown as Database);
  clerkMocks.auth.mockResolvedValue({
    userId: "user_clerk_mobile",
    sessionClaims: {},
  });
  clerkMocks.currentUser.mockResolvedValue({
    primaryEmailAddress: { emailAddress: "admin@example.com" },
    firstName: "Admin",
    lastName: "Mobile",
    publicMetadata: {},
  });
});

afterEach(async () => {
  setTestDb(null);
  await ctx.client.close();
});

async function seedAdmin(companyId: string) {
  return db
    .insert(users)
    .values({
      companyId,
      clerkUserId: "user_clerk_mobile",
      email: "admin@example.com",
      role: "admin",
      name: "Admin",
    })
    .returning()
    .then((rows) => rows[0]);
}

describe("mobile API authz and tenant isolation", () => {
  it("allows accountant to list expenses but refuses writes", async () => {
    const company = await seedCompany(db, { name: "Mobile Co" });
    await db.insert(users).values({
      companyId: company.id,
      clerkUserId: "user_clerk_mobile",
      email: "accountant@example.com",
      role: "accountant",
      name: "Acc",
    });
    clerkMocks.currentUser.mockResolvedValue({
      primaryEmailAddress: { emailAddress: "accountant@example.com" },
      firstName: "Acc",
      lastName: "Ountant",
      publicMetadata: {},
    });

    await db.insert(expenses).values({
      companyId: company.id,
      description: "Coffee",
      category: "Meals",
      spentAt: "2026-03-01",
      amountPence: 500,
      status: "pending",
    });

    const listRes = await listExpenses(
      new Request("http://localhost/api/mobile/expenses") as never,
    );
    expect(listRes.status).toBe(200);
    const listBody = await listRes.json();
    expect(listBody.success).toBe(true);
    expect(listBody.data).toHaveLength(1);

    const createRes = await createExpense(
      new Request("http://localhost/api/mobile/expenses", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          description: "Should fail",
          amountPence: 100,
          category: "Travel",
          expenseDate: "2026-03-02",
        }),
      }) as never,
    );
    expect(createRes.status).toBe(403);
    const createBody = await createRes.json();
    expect(createBody.code).toBe("no_permission");

    const [pending] = await db.select().from(expenses).where(eq(expenses.status, "pending"));
    const approveRes = await approveExpense(
      new Request("http://localhost/api/mobile/expenses/x/approve", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ approvalType: "recorded" }),
      }) as never,
      { params: Promise.resolve({ id: pending.id }) },
    );
    expect(approveRes.status).toBe(403);
  });

  it("returns 403 for pending users without a company", async () => {
    await db.insert(users).values({
      companyId: null,
      clerkUserId: "user_clerk_mobile",
      email: "pending@example.com",
      role: "pending",
    });
    clerkMocks.currentUser.mockResolvedValue({
      primaryEmailAddress: { emailAddress: "pending@example.com" },
      firstName: "Pending",
      lastName: "User",
      publicMetadata: {},
    });

    const listRes = await listExpenses(
      new Request("http://localhost/api/mobile/expenses") as never,
    );
    expect(listRes.status).toBe(403);
    const body = await listRes.json();
    expect(body.code).toBe("no_permission");
  });

  it("returns 401 when unauthenticated", async () => {
    clerkMocks.auth.mockResolvedValue({
      userId: "" as string,
      sessionClaims: {},
    });

    const listRes = await listExpenses(
      new Request("http://localhost/api/mobile/expenses") as never,
    );
    expect(listRes.status).toBe(401);
  });

  it("refuses writes when the company is suspended", async () => {
    const company = await seedCompany(db, { name: "Suspended Mobile" });
    await db
      .update(companies)
      .set({ suspendedAt: new Date(), suspendedReason: "Non-payment" })
      .where(eq(companies.id, company.id));
    await seedAdmin(company.id);

    const createRes = await createExpense(
      new Request("http://localhost/api/mobile/expenses", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          description: "Blocked",
          amountPence: 100,
          category: "Travel",
          expenseDate: "2026-03-02",
        }),
      }) as never,
    );
    expect(createRes.status).toBe(403);
    const body = await createRes.json();
    expect(body.code).toBe("company_suspended");
  });

  it("returns 404 for another company's expense id", async () => {
    const companyA = await seedCompany(db, { name: "Company A" });
    const companyB = await seedCompany(db, { name: "Company B" });
    await seedAdmin(companyA.id);

    const [expenseB] = await db
      .insert(expenses)
      .values({
        companyId: companyB.id,
        description: "Other",
        category: "Travel",
        spentAt: "2026-03-01",
        amountPence: 900,
        status: "pending",
      })
      .returning();

    const getRes = await getExpense(
      new Request("http://localhost/api/mobile/expenses/x") as never,
      { params: Promise.resolve({ id: expenseB.id }) },
    );
    expect(getRes.status).toBe(404);

    const listRes = await listExpenses(
      new Request("http://localhost/api/mobile/expenses") as never,
    );
    const listBody = await listRes.json();
    expect(listBody.data).toHaveLength(0);
  });

  it("allows admin to create an expense in their company", async () => {
    const company = await seedCompany(db, { name: "Write Co" });
    await seedAdmin(company.id);

    const createRes = await createExpense(
      new Request("http://localhost/api/mobile/expenses", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          description: "Taxi",
          amountPence: 1500,
          category: "Travel",
          expenseDate: "2026-03-02",
        }),
      }) as never,
    );
    expect(createRes.status).toBe(201);
    const body = await createRes.json();
    expect(body.success).toBe(true);
    expect(body.data.companyId).toBe(company.id);

    const rows = await db
      .select()
      .from(expenses)
      .where(eq(expenses.companyId, company.id));
    expect(rows).toHaveLength(1);
  });
});
