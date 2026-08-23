import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb, type TestDatabase } from "@/db/pglite";
import { setTestDb, type Database } from "@/db";
import {
  clients,
  expenses,
  invoices,
  payments,
  quoteLineItems,
  quotes,
  reimbursementItems,
  reimbursements,
  users,
} from "@/db/schema";
import { recordPayment } from "@/actions/payments";
import { createQuote } from "@/actions/quotes";
import { createReimbursementRun, markReimbursementPaid } from "@/actions/reimbursements";

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

describe("action-layer PGlite", () => {
  it("recordPayment settles an invoice through the real action", async () => {
    const [actor] = await db
      .insert(users)
      .values({
        clerkUserId: "user_clerk_1",
        email: "lee@dotanddashconsulting.com",
        name: "Lee",
        role: "admin",
      })
      .returning();
    const [client] = await db
      .insert(clients)
      .values({ name: "Acme", email: "ap@acme.test" })
      .returning();
    const [inv] = await db
      .insert(invoices)
      .values({
        number: "DD-2026-0500",
        clientId: client.id,
        status: "sent",
        issueDate: "2026-03-01",
        dueDate: "2026-03-15",
        grossPence: 10000,
        netPence: 10000,
        createdByUserId: actor.id,
      })
      .returning();

    const form = new FormData();
    form.set("amountPounds", "100.00");
    form.set("method", "bank_transfer");

    const result = await recordPayment(inv.id, form);
    expect(result.ok).toBe(true);

    const [updated] = await db.select().from(invoices).where(eq(invoices.id, inv.id));
    expect(updated.status).toBe("paid");
    const pay = await db.select().from(payments).where(eq(payments.invoiceId, inv.id));
    expect(pay).toHaveLength(1);
    expect(pay[0].amountPence).toBe(10000);
  });

  it("recordPayment refuses more than the remaining balance", async () => {
    const [actor] = await db
      .insert(users)
      .values({
        clerkUserId: "user_clerk_1",
        email: "lee@dotanddashconsulting.com",
        name: "Lee",
        role: "admin",
      })
      .returning();
    const [client] = await db.insert(clients).values({ name: "Beta" }).returning();
    const [inv] = await db
      .insert(invoices)
      .values({
        number: "DD-2026-0501",
        clientId: client.id,
        status: "sent",
        grossPence: 5000,
        netPence: 5000,
        createdByUserId: actor.id,
      })
      .returning();

    const form = new FormData();
    form.set("amountPounds", "60.00");
    const result = await recordPayment(inv.id, form);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/remaining balance/i);
  });

  it("createReimbursementRun locks expenses and marks them reimbursed", async () => {
    const [actor] = await db
      .insert(users)
      .values({
        clerkUserId: "user_clerk_1",
        email: "lee@dotanddashconsulting.com",
        name: "Lee",
        role: "admin",
      })
      .returning();
    const [exp] = await db
      .insert(expenses)
      .values({
        description: "Train",
        category: "Travel",
        spentAt: "2026-04-01",
        amountPence: 4500,
        status: "reimbursable",
        paidByUserId: actor.id,
        createdByUserId: actor.id,
      })
      .returning();

    const form = new FormData();
    form.set("payeeUserId", actor.id);
    form.set("expenseIdsJson", JSON.stringify([exp.id]));

    const result = await createReimbursementRun(form);
    expect(result.ok).toBe(true);
    if (!result.ok || !result.id) throw new Error("expected run id");

    const [afterCreate] = await db.select().from(expenses).where(eq(expenses.id, exp.id));
    expect(afterCreate.status).toBe("reimbursable");

    const paid = await markReimbursementPaid(result.id);
    expect(paid.ok).toBe(true);

    const [updated] = await db.select().from(expenses).where(eq(expenses.id, exp.id));
    expect(updated.status).toBe("reimbursed");
    const runs = await db.select().from(reimbursements);
    expect(runs).toHaveLength(1);
    expect(runs[0].totalPence).toBe(4500);
    const items = await db.select().from(reimbursementItems);
    expect(items).toHaveLength(1);
  });

  it("createQuote ignores trailing blank lines", async () => {
    await db
      .insert(users)
      .values({
        clerkUserId: "user_clerk_1",
        email: "lee@dotanddashconsulting.com",
        name: "Lee",
        role: "admin",
      })
      .returning();
    const [client] = await db
      .insert(clients)
      .values({ name: "Acme", email: "ap@acme.test" })
      .returning();

    const form = new FormData();
    form.set("clientId", client.id);
    form.set("issueDate", "2026-08-23");
    form.set(
      "linesJson",
      JSON.stringify([
        { description: "Workshop", quantity: 2, unitPricePounds: "500" },
        { description: "", quantity: 1, unitPricePounds: "" },
      ]),
    );

    const result = await createQuote(form);
    expect(result.ok).toBe(true);
    if (!result.ok || !result.id) throw new Error("expected quote id");

    const [quote] = await db.select().from(quotes).where(eq(quotes.id, result.id));
    expect(quote.grossPence).toBe(100000);
    const lines = await db
      .select()
      .from(quoteLineItems)
      .where(eq(quoteLineItems.quoteId, result.id));
    expect(lines).toHaveLength(1);
    expect(lines[0].description).toBe("Workshop");
  });

  it("createQuote rejects when every line is blank", async () => {
    await db
      .insert(users)
      .values({
        clerkUserId: "user_clerk_1",
        email: "lee@dotanddashconsulting.com",
        name: "Lee",
        role: "admin",
      })
      .returning();
    const [client] = await db.insert(clients).values({ name: "Beta" }).returning();

    const form = new FormData();
    form.set("clientId", client.id);
    form.set("issueDate", "2026-08-23");
    form.set(
      "linesJson",
      JSON.stringify([{ description: "", quantity: 1, unitPricePounds: "" }]),
    );

    const result = await createQuote(form);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected failure");
    expect(result.error).toBe("Add at least one line item");
  });
});
