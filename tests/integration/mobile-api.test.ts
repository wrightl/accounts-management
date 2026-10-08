import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb, type TestDatabase } from "@/db/pglite";
import { setTestDb, type Database } from "@/db";
import { auditLog, companies, expenseReceipts, expenses, users } from "@/db/schema";
import { seedCompany } from "@/lib/test/seed-company";
import {
  GET as listExpenses,
  POST as createExpense,
} from "@/app/api/mobile/expenses/route";
import { GET as getExpense } from "@/app/api/mobile/expenses/[id]/route";
import { POST as approveExpense } from "@/app/api/mobile/expenses/[id]/approve/route";
import { POST as rejectExpense } from "@/app/api/mobile/expenses/[id]/reject/route";
import { POST as uploadReceipt } from "@/app/api/mobile/expenses/[id]/receipts/route";

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

describe("mobile expense review matches web rules", () => {
  async function seedPending(companyId: string, amountPence = 1200) {
    const [row] = await db
      .insert(expenses)
      .values({
        companyId,
        description: "Lunch",
        category: "Meals",
        spentAt: "2026-03-01",
        amountPence,
        status: "pending",
      })
      .returning();
    return row;
  }

  function post(body: unknown) {
    return new Request("http://localhost/api/mobile/expenses/x", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }) as never;
  }

  it("approving as reimbursable sets a payer and writes an audit entry", async () => {
    const company = await seedCompany(db, { name: "Review Co" });
    const admin = await seedAdmin(company.id);
    const pending = await seedPending(company.id);

    const res = await approveExpense(post({ approvalType: "reimbursable" }), {
      params: Promise.resolve({ id: pending.id }),
    });
    expect(res.status).toBe(200);
    expect((await res.json()).data.status).toBe("reimbursable");

    const [row] = await db.select().from(expenses).where(eq(expenses.id, pending.id));
    expect(row.paidByUserId).toBe(admin.id);
    const audits = await db.select().from(auditLog).where(eq(auditLog.entityId, pending.id));
    expect(audits.map((a) => a.action)).toContain("expense.approve");
  });

  it("refuses to approve a zero-amount expense", async () => {
    const company = await seedCompany(db, { name: "Zero Co" });
    await seedAdmin(company.id);
    const pending = await seedPending(company.id, 0);

    const res = await approveExpense(post({ approvalType: "recorded" }), {
      params: Promise.resolve({ id: pending.id }),
    });
    expect(res.status).toBe(400);
    const [row] = await db.select().from(expenses).where(eq(expenses.id, pending.id));
    expect(row.status).toBe("pending");
  });

  it("rejecting discards the expense instead of recording it", async () => {
    const company = await seedCompany(db, { name: "Reject Co" });
    await seedAdmin(company.id);
    const pending = await seedPending(company.id);

    const res = await rejectExpense(post({ reason: "dupe" }), {
      params: Promise.resolve({ id: pending.id }),
    });
    expect(res.status).toBe(200);
    expect((await res.json()).data.status).toBe("rejected");
    expect(await db.select().from(expenses).where(eq(expenses.id, pending.id))).toHaveLength(0);
  });

  it("validates receipt uploads like the web path", async () => {
    const company = await seedCompany(db, { name: "Upload Co" });
    await seedAdmin(company.id);
    const pending = await seedPending(company.id);

    function upload(bytes: Uint8Array, name: string) {
      const form = new FormData();
      form.set("file", new File([bytes], name, { type: "application/octet-stream" }));
      return uploadReceipt(
        new Request("http://localhost/api/mobile/expenses/x/receipts", {
          method: "POST",
          body: form,
        }) as never,
        { params: Promise.resolve({ id: pending.id }) },
      );
    }

    const html = await upload(new TextEncoder().encode("<html><script>x</script></html>"), "r.html");
    expect(html.status).toBe(400);

    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0, 0, 0]);
    const ok = await upload(png, "r.png");
    expect(ok.status).toBe(200);
    const receipts = await db
      .select()
      .from(expenseReceipts)
      .where(eq(expenseReceipts.expenseId, pending.id));
    expect(receipts).toHaveLength(1);
    expect(receipts[0].contentType).toBe("image/png");
  });
});
