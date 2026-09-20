import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb, type TestDatabase } from "@/db/pglite";
import { setTestDb, type Database } from "@/db";
import {
  bankAccounts,
  bankTransactions,
  clients,
  companies,
  companyMemberships,
  dividendDeclarations,
  expenseReceipts,
  expenses,
  inboundEmailJobs,
  invoices,
  payments,
  reconciliationMatches,
  users,
} from "@/db/schema";
import { getInvoiceDetail, listInvoices } from "@/lib/invoices/queries";
import { listReimbursableExpenses } from "@/lib/expenses/queries";
import {
  confirmMatch,
  dismissMatch,
  ReconciliationError,
  suggestMatches,
} from "@/lib/bank/queries";
import { seedCompany } from "@/lib/test/seed-company";
import { createClient } from "@/actions/clients";
import { deleteReceipt } from "@/actions/expenses";
import { deleteDividendDeclaration } from "@/actions/dividends";
import { createReimbursementRun } from "@/actions/reimbursements";
import {
  retryAllInboundEmailIssues,
  retryInboundEmailJob,
} from "@/actions/inbound-email";
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

  it("scopes listReimbursableExpenses to company", async () => {
    const companyA = await seedCompany(db, { name: "Company A" });
    const companyB = await seedCompany(db, { name: "Company B" });

    const [userA] = await db
      .insert(users)
      .values({
        companyId: companyA.id,
        clerkUserId: "user_clerk_a",
        email: "admin-a@example.com",
        role: "admin",
      })
      .returning();
    const [userB] = await db
      .insert(users)
      .values({
        companyId: companyB.id,
        clerkUserId: "user_clerk_b",
        email: "admin-b@example.com",
        role: "admin",
      })
      .returning();

    const [expA] = await db
      .insert(expenses)
      .values({
        companyId: companyA.id,
        description: "A reimbursable",
        category: "Travel",
        spentAt: "2026-03-01",
        amountPence: 1000,
        status: "reimbursable",
        paidByUserId: userA.id,
      })
      .returning();
    const [expB] = await db
      .insert(expenses)
      .values({
        companyId: companyB.id,
        description: "B reimbursable",
        category: "Travel",
        spentAt: "2026-03-01",
        amountPence: 2000,
        status: "reimbursable",
        paidByUserId: userB.id,
      })
      .returning();

    const listed = await listReimbursableExpenses(companyA.id);
    expect(listed.map((e) => e.id)).toEqual([expA.id]);
    expect(listed.map((e) => e.id)).not.toContain(expB.id);
  });

  it("refuses createReimbursementRun with another company's expense ids", async () => {
    const companyA = await seedCompany(db, { name: "Company A" });
    const companyB = await seedCompany(db, { name: "Company B" });

    const [userA] = await db
      .insert(users)
      .values({
        companyId: companyA.id,
        clerkUserId: "user_clerk_a",
        email: "admin-a@example.com",
        role: "admin",
      })
      .returning();
    const [userB] = await db
      .insert(users)
      .values({
        companyId: companyB.id,
        clerkUserId: "user_clerk_b",
        email: "admin-b@example.com",
        role: "admin",
      })
      .returning();

    const [expB] = await db
      .insert(expenses)
      .values({
        companyId: companyB.id,
        description: "B reimbursable",
        category: "Travel",
        spentAt: "2026-03-01",
        amountPence: 2000,
        status: "reimbursable",
        paidByUserId: userB.id,
      })
      .returning();

    const form = new FormData();
    form.set("payeeUserId", userA.id);
    form.set("expenseIdsJson", JSON.stringify([expB.id]));
    form.set("reference", "Cross tenant");

    const result = await createReimbursementRun(form);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/not reimbursable/i);
  });

  it("refuses confirmMatch and dismissMatch for another company's match", async () => {
    const companyA = await seedCompany(db, { name: "Company A" });
    const companyB = await seedCompany(db, { name: "Company B" });

    const [accountB] = await db
      .insert(bankAccounts)
      .values({ companyId: companyB.id, name: "B Bank", provider: "starling" })
      .returning();
    const [clientB] = await db
      .insert(clients)
      .values({ companyId: companyB.id, name: "Client B", companyName: "Acme B" })
      .returning();
    const [invoiceB] = await db
      .insert(invoices)
      .values({
        companyId: companyB.id,
        number: "B-2026-0001",
        clientId: clientB.id,
        status: "sent",
        issueDate: "2026-04-01",
        dueDate: "2026-04-15",
        grossPence: 25_000,
        netPence: 25_000,
      })
      .returning();
    await db.insert(bankTransactions).values({
      bankAccountId: accountB.id,
      externalId: "tx-b-1",
      bookedAt: "2026-04-02",
      amountPence: 25_000,
      counterparty: "Acme B",
      reference: "B20260001 payment",
    });

    const suggestions = await suggestMatches(companyB.id);
    expect(suggestions).toHaveLength(1);
    const matchId = suggestions[0].matchId;

    await expect(confirmMatch(companyA.id, matchId)).rejects.toBeInstanceOf(
      ReconciliationError,
    );

    const paymentsB = await db
      .select()
      .from(payments)
      .where(eq(payments.invoiceId, invoiceB.id));
    expect(paymentsB).toHaveLength(0);

    const [invoiceStill] = await db
      .select()
      .from(invoices)
      .where(eq(invoices.id, invoiceB.id));
    expect(invoiceStill.status).toBe("sent");

    await expect(dismissMatch(companyA.id, matchId)).rejects.toBeInstanceOf(
      ReconciliationError,
    );

    const [matchStill] = await db
      .select()
      .from(reconciliationMatches)
      .where(eq(reconciliationMatches.id, matchId));
    expect(matchStill).toBeTruthy();
    expect(matchStill.confirmed).toBe(false);
  });

  it("refuses tenant inbound-email retry against another company's job", async () => {
    const companyA = await seedCompany(db, { name: "Company A" });
    const companyB = await seedCompany(db, { name: "Company B" });

    await db.insert(users).values({
      companyId: companyA.id,
      clerkUserId: "user_clerk_a",
      email: "admin-a@example.com",
      role: "admin",
    });

    const [jobB] = await db
      .insert(inboundEmailJobs)
      .values({
        companyId: companyB.id,
        resendEmailId: "re_other_tenant",
        fromEmail: "sender@example.com",
        toEmail: "expenses+b@example.com",
        subject: "Receipt",
        status: "failed",
        lastError: "OCR failed",
        attempts: 2,
      })
      .returning();

    const retry = await retryInboundEmailJob(jobB.id);
    expect(retry.ok).toBe(false);
    if (!retry.ok) expect(retry.error).toMatch(/not found/i);

    const [jobStill] = await db
      .select()
      .from(inboundEmailJobs)
      .where(eq(inboundEmailJobs.id, jobB.id));
    expect(jobStill.status).toBe("failed");
    expect(jobStill.attempts).toBe(2);

    const retryAll = await retryAllInboundEmailIssues();
    expect(retryAll.ok).toBe(false);
    if (!retryAll.ok) expect(retryAll.error).toMatch(/no jobs/i);

    const [jobStillAfterAll] = await db
      .select()
      .from(inboundEmailJobs)
      .where(eq(inboundEmailJobs.id, jobB.id));
    expect(jobStillAfterAll.status).toBe("failed");
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
