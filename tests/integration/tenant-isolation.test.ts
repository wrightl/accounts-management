import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb, type TestDatabase } from "@/db/pglite";
import { setTestDb, type Database } from "@/db";
import {
  clients,
  companies,
  companyMemberships,
  dividendDeclarations,
  expenseReceipts,
  expenses,
  invoices,
  users,
} from "@/db/schema";
import { getInvoiceDetail, listInvoices } from "@/lib/invoices/queries";
import { seedCompany } from "@/lib/test/seed-company";
import { createClient } from "@/actions/clients";
import { deleteReceipt } from "@/actions/expenses";
import { deleteDividendDeclaration } from "@/actions/dividends";
import { GET as getReceipt } from "@/app/api/receipts/[id]/route";
import { getStorage } from "@/lib/storage";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

const clerkMocks = vi.hoisted(() => ({
  auth: vi.fn(async () => ({ userId: "user_clerk_a", sessionClaims: {} })),
  currentUser: vi.fn(async () => ({
    primaryEmailAddress: { emailAddress: "admin-a@example.com" },
    firstName: "Admin",
    lastName: "A",
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
  clerkMocks.auth.mockResolvedValue({ userId: "user_clerk_a", sessionClaims: {} });
  clerkMocks.currentUser.mockResolvedValue({
    primaryEmailAddress: { emailAddress: "admin-a@example.com" },
    firstName: "Admin",
    lastName: "A",
    publicMetadata: {},
  });
});

afterEach(async () => {
  setTestDb(null);
  await ctx.client.close();
});

describe("tenant isolation", () => {
  it("scopes listInvoices and getInvoiceDetail to company", async () => {
    const companyA = await seedCompany(db, { name: "Company A" });
    const companyB = await seedCompany(db, { name: "Company B" });

    const [clientA] = await db
      .insert(clients)
      .values({ companyId: companyA.id, name: "Client A" })
      .returning();
    const [clientB] = await db
      .insert(clients)
      .values({ companyId: companyB.id, name: "Client B" })
      .returning();

    const [invoiceA] = await db
      .insert(invoices)
      .values({
        companyId: companyA.id,
        number: "A-2026-0001",
        clientId: clientA.id,
        status: "sent",
        grossPence: 10_000,
        netPence: 10_000,
      })
      .returning();
    const [invoiceB] = await db
      .insert(invoices)
      .values({
        companyId: companyB.id,
        number: "B-2026-0001",
        clientId: clientB.id,
        status: "sent",
        grossPence: 20_000,
        netPence: 20_000,
      })
      .returning();

    const listedA = await listInvoices(companyA.id);
    expect(listedA.map((row) => row.id)).toEqual([invoiceA.id]);
    expect(listedA.map((row) => row.id)).not.toContain(invoiceB.id);

    const detailForA = await getInvoiceDetail(companyA.id, invoiceB.id);
    expect(detailForA).toBeNull();

    const ownDetail = await getInvoiceDetail(companyA.id, invoiceA.id);
    expect(ownDetail?.invoice.id).toBe(invoiceA.id);
  });

  it("scopes invoices to the accountant's selected company after switch", async () => {
    const companyA = await seedCompany(db, { name: "Company A" });
    const companyB = await seedCompany(db, { name: "Company B" });

    const [accountant] = await db
      .insert(users)
      .values({
        companyId: companyA.id,
        clerkUserId: "user_clerk_accountant",
        email: "accountant@example.com",
        role: "accountant",
      })
      .returning();
    await db.insert(companyMemberships).values([
      {
        userId: accountant.id,
        companyId: companyA.id,
        role: "accountant",
      },
      {
        userId: accountant.id,
        companyId: companyB.id,
        role: "accountant",
      },
    ]);

    const [clientA] = await db
      .insert(clients)
      .values({ companyId: companyA.id, name: "Client A" })
      .returning();
    const [clientB] = await db
      .insert(clients)
      .values({ companyId: companyB.id, name: "Client B" })
      .returning();

    await db.insert(invoices).values([
      {
        companyId: companyA.id,
        number: "A-2026-0001",
        clientId: clientA.id,
        status: "sent",
        grossPence: 10_000,
      },
      {
        companyId: companyB.id,
        number: "B-2026-0001",
        clientId: clientB.id,
        status: "sent",
        grossPence: 20_000,
      },
    ]);

    expect((await listInvoices(companyA.id)).map((r) => r.number)).toEqual([
      "A-2026-0001",
    ]);

    await db
      .update(users)
      .set({ companyId: companyB.id })
      .where(eq(users.id, accountant.id));

    expect((await listInvoices(companyB.id)).map((r) => r.number)).toEqual([
      "B-2026-0001",
    ]);
    expect(await getInvoiceDetail(companyB.id, (await listInvoices(companyA.id))[0]!.id)).toBeNull();
  });

  it("refuses deleteReceipt for another company's receipt", async () => {
    const companyA = await seedCompany(db, { name: "Company A" });
    const companyB = await seedCompany(db, { name: "Company B" });

    await db.insert(users).values({
      companyId: companyA.id,
      clerkUserId: "user_clerk_a",
      email: "admin-a@example.com",
      role: "admin",
    });

    const [expenseB] = await db
      .insert(expenses)
      .values({
        companyId: companyB.id,
        description: "Other tenant expense",
        category: "Software",
        spentAt: "2026-03-01",
        amountPence: 5000,
        status: "recorded",
      })
      .returning();

    await getStorage().put("receipts/other.pdf", Buffer.from("secret"), "application/pdf");
    const [receiptB] = await db
      .insert(expenseReceipts)
      .values({
        expenseId: expenseB.id,
        blobPath: "receipts/other.pdf",
        filename: "other.pdf",
        contentType: "application/pdf",
        sizeBytes: 6,
      })
      .returning();

    const result = await deleteReceipt(receiptB.id);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/not found/i);

    const stillThere = await db
      .select()
      .from(expenseReceipts)
      .where(eq(expenseReceipts.id, receiptB.id));
    expect(stillThere).toHaveLength(1);
  });

  it("streams receipt only for the caller's company", async () => {
    const companyA = await seedCompany(db, { name: "Company A" });
    const companyB = await seedCompany(db, { name: "Company B" });

    await db.insert(users).values({
      companyId: companyA.id,
      clerkUserId: "user_clerk_a",
      email: "admin-a@example.com",
      role: "admin",
    });

    const [expenseB] = await db
      .insert(expenses)
      .values({
        companyId: companyB.id,
        description: "Other tenant expense",
        category: "Software",
        spentAt: "2026-03-01",
        amountPence: 5000,
        status: "recorded",
      })
      .returning();

    await getStorage().put("receipts/secret.pdf", Buffer.from("cross-tenant"), "application/pdf");
    const [receiptB] = await db
      .insert(expenseReceipts)
      .values({
        expenseId: expenseB.id,
        blobPath: "receipts/secret.pdf",
        filename: "secret.pdf",
        contentType: "application/pdf",
        sizeBytes: 12,
      })
      .returning();

    const denied = await getReceipt(new Request("http://localhost/api/receipts/x"), {
      params: Promise.resolve({ id: receiptB.id }),
    });
    expect(denied.status).toBe(404);

    const [expenseA] = await db
      .insert(expenses)
      .values({
        companyId: companyA.id,
        description: "Own expense",
        category: "Software",
        spentAt: "2026-03-01",
        amountPence: 1000,
        status: "recorded",
      })
      .returning();
    await getStorage().put("receipts/own.pdf", Buffer.from("own-bytes"), "application/pdf");
    const [receiptA] = await db
      .insert(expenseReceipts)
      .values({
        expenseId: expenseA.id,
        blobPath: "receipts/own.pdf",
        filename: "own.pdf",
        contentType: "application/pdf",
        sizeBytes: 9,
      })
      .returning();

    const allowed = await getReceipt(new Request("http://localhost/api/receipts/x"), {
      params: Promise.resolve({ id: receiptA.id }),
    });
    expect(allowed.status).toBe(200);
    expect(await allowed.text()).toBe("own-bytes");
  });

  it("refuses deleteDividendDeclaration for another company's declaration", async () => {
    const companyA = await seedCompany(db, { name: "Company A" });
    const companyB = await seedCompany(db, { name: "Company B" });

    await db.insert(users).values({
      companyId: companyA.id,
      clerkUserId: "user_clerk_a",
      email: "admin-a@example.com",
      role: "admin",
    });

    const [declB] = await db
      .insert(dividendDeclarations)
      .values({
        companyId: companyB.id,
        declaredAt: "2026-03-01",
        totalPence: 100_000,
      })
      .returning();

    const result = await deleteDividendDeclaration(declB.id);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/not found/i);

    const stillThere = await db
      .select()
      .from(dividendDeclarations)
      .where(eq(dividendDeclarations.id, declB.id));
    expect(stillThere).toHaveLength(1);
  });

  it("refuses writes when the company is suspended", async () => {
    const company = await seedCompany(db, { name: "Suspended Co" });
    await db
      .update(companies)
      .set({
        suspendedAt: new Date(),
        suspendedReason: "Non-payment",
      })
      .where(eq(companies.id, company.id));

    await db.insert(users).values({
      companyId: company.id,
      clerkUserId: "user_clerk_a",
      email: "admin-a@example.com",
      role: "admin",
    });

    const form = new FormData();
    form.set("name", "Should Fail");
    const result = await createClient(form);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/suspended/i);

    const rows = await db.select().from(clients).where(eq(clients.companyId, company.id));
    expect(rows).toHaveLength(0);
  });
});
