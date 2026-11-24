import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { asc, eq } from "drizzle-orm";
import { createTestDb, type TestDatabase } from "@/db/pglite";
import { setTestDb, type Database } from "@/db";
import {
  clients,
  companies,
  creditNoteLineItems,
  expenses,
  invoiceLineItems,
  invoices,
  users,
} from "@/db/schema";
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

const { createInvoice } = await import("@/actions/invoices");
const { createOrder, convertOrderToInvoice } = await import("@/actions/orders");
const { createCreditNote } = await import("@/actions/credit-notes");
const { createExpense } = await import("@/actions/expenses");
const { raiseLatePaymentInvoice } = await import("@/actions/late-payment");

let ctx: Awaited<ReturnType<typeof createTestDb>>;
let db: TestDatabase;
let companyId: string;
let clientId: string;

async function setup(vatRegistered: boolean) {
  const company = await seedCompany(db, { name: "Coded Ltd", vatRegistered, defaultVatRate: 20 });
  companyId = company!.id;
  await db.insert(users).values({
    companyId,
    clerkUserId: "user_clerk_1",
    email: "founder@example.com",
    name: "Fran",
    role: "admin",
  });
  const [client] = await db
    .insert(clients)
    .values({ companyId, name: "Client Ltd", email: "client@example.com" })
    .returning();
  clientId = client!.id;
}

beforeEach(async () => {
  ctx = await createTestDb();
  db = ctx.db;
  setTestDb(db as unknown as Database);
});

afterEach(async () => {
  setTestDb(null);
  await ctx.client.close();
});

type PostedLine = { description: string; unitPricePounds: string; taxCode?: string; vatRate?: number };

function documentForm(lines: PostedLine[]) {
  const form = new FormData();
  form.set("clientId", clientId);
  form.set("issueDate", "2026-06-01");
  form.set("linesJson", JSON.stringify(lines.map((l) => ({ quantity: 1, ...l }))));
  return form;
}

async function invoiceLines(invoiceId: string) {
  return db
    .select({
      description: invoiceLineItems.description,
      taxCode: invoiceLineItems.taxCode,
      vatRate: invoiceLineItems.vatRate,
      needsReview: invoiceLineItems.taxCodeNeedsReview,
    })
    .from(invoiceLineItems)
    .where(eq(invoiceLineItems.invoiceId, invoiceId))
    .orderBy(asc(invoiceLineItems.position));
}

function expenseForm(fields: Record<string, string>) {
  const form = new FormData();
  form.set("description", "Something");
  form.set("category", "Software");
  form.set("spentAt", "2026-06-02");
  form.set("amountPounds", "120.00");
  form.set("status", "recorded");
  for (const [k, v] of Object.entries(fields)) form.set(k, v);
  return form;
}

describe("for a VAT-registered company", () => {
  beforeEach(() => setup(true));

  it("stores the posted code with the code's own rate on an invoice", async () => {
    const result = await createInvoice(
      documentForm([
        { description: "Consulting", unitPricePounds: "100", taxCode: "standard" },
        { description: "Training", unitPricePounds: "100", taxCode: "exempt", vatRate: 20 },
        { description: "Books", unitPricePounds: "100", vatRate: 5 },
        { description: "Old form", unitPricePounds: "100", vatRate: 0 },
      ]),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(await invoiceLines(result.id!)).toEqual([
      { description: "Consulting", taxCode: "standard", vatRate: 20, needsReview: false },
      { description: "Training", taxCode: "exempt", vatRate: 0, needsReview: false },
      { description: "Books", taxCode: "reduced", vatRate: 5, needsReview: false },
      { description: "Old form", taxCode: "zero_rated", vatRate: 0, needsReview: false },
    ]);
    const [invoice] = await db.select().from(invoices).where(eq(invoices.id, result.id!));
    expect(invoice!.vatPence).toBe(2_000 + 500);
  });

  it("refuses a rate that isn't a UK rate, an unknown code, and a purchases-only code", async () => {
    for (const line of [
      { description: "Custom", unitPricePounds: "100", vatRate: 17 },
      { description: "Typo", unitPricePounds: "100", taxCode: "stadard" },
      { description: "Import", unitPricePounds: "100", taxCode: "postponed_import" },
    ]) {
      const result = await createInvoice(documentForm([line]));
      expect(result.ok).toBe(false);
    }
    expect(await db.select().from(invoices)).toEqual([]);
  });

  it("carries each line's code from order to invoice", async () => {
    const order = await createOrder(
      documentForm([
        { description: "Build", unitPricePounds: "1000", taxCode: "standard" },
        { description: "Course", unitPricePounds: "500", taxCode: "exempt" },
      ]),
    );
    expect(order.ok).toBe(true);
    if (!order.ok) return;
    const converted = await convertOrderToInvoice(order.id!);
    expect(converted.ok).toBe(true);
    const [invoice] = await db.select().from(invoices).where(eq(invoices.orderId, order.id!));
    expect((await invoiceLines(invoice!.id)).map((l) => [l.taxCode, l.vatRate])).toEqual([
      ["standard", 20],
      ["exempt", 0],
    ]);
  });

  it("credits at the codes posted, and a 0% code on a credit stays 0%", async () => {
    const created = await createInvoice(
      documentForm([
        { description: "Consulting", unitPricePounds: "1000", taxCode: "standard" },
        { description: "Course", unitPricePounds: "500", taxCode: "exempt" },
      ]),
    );
    if (!created.ok) throw new Error("invoice");
    await db.update(invoices).set({ status: "sent" }).where(eq(invoices.id, created.id!));

    const form = new FormData();
    form.set("issueDate", "2026-06-10");
    form.set("reason", "Partly refunded");
    form.set(
      "linesJson",
      JSON.stringify([
        { description: "Consulting", quantity: 1, unitPricePounds: "100", taxCode: "standard" },
        { description: "Course", quantity: 1, unitPricePounds: "100", taxCode: "exempt" },
      ]),
    );
    const credit = await createCreditNote(created.id!, form);
    expect(credit.ok).toBe(true);
    const lines = await db
      .select({ taxCode: creditNoteLineItems.taxCode, vatRate: creditNoteLineItems.vatRate })
      .from(creditNoteLineItems)
      .orderBy(asc(creditNoteLineItems.position));
    expect(lines).toEqual([
      { taxCode: "standard", vatRate: 20 },
      { taxCode: "exempt", vatRate: 0 },
    ]);
  });

  it("puts late payment interest and compensation outside the scope of VAT", async () => {
    const created = await createInvoice(
      documentForm([{ description: "Consulting", unitPricePounds: "1000", taxCode: "standard" }]),
    );
    if (!created.ok) throw new Error("invoice");
    await db
      .update(invoices)
      .set({ status: "sent", issueDate: "2026-01-01", dueDate: "2026-01-31" })
      .where(eq(invoices.id, created.id!));
    const raised = await raiseLatePaymentInvoice(created.id!);
    expect(raised.ok).toBe(true);
    if (!raised.ok) return;
    const lines = await invoiceLines(raised.id!);
    expect(lines.length).toBeGreaterThan(0);
    expect(lines.every((l) => l.taxCode === "outside_scope" && l.vatRate === 0)).toBe(true);
  });

  it("stores an expense's code, and mileage as outside scope", async () => {
    const coded = await createExpense(expenseForm({ taxCode: "reverse_charge", vatRate: "0" }));
    expect(coded.ok).toBe(true);
    const byRate = await createExpense(expenseForm({ description: "Laptop", vatRate: "20" }));
    expect(byRate.ok).toBe(true);
    const mileage = await createExpense(
      expenseForm({
        description: "Drive to client",
        category: "Travel",
        useMileage: "true",
        mileageMiles: "10",
        mileageRatePence: "45",
        vatRate: "20",
        taxCode: "standard",
      }),
    );
    expect(mileage.ok).toBe(true);

    const rows = await db
      .select({ description: expenses.description, taxCode: expenses.taxCode, vatRate: expenses.vatRate, vatPence: expenses.vatPence })
      .from(expenses)
      .where(eq(expenses.companyId, companyId))
      .orderBy(asc(expenses.description));
    expect(rows).toEqual([
      { description: "Drive to client (10 miles @ 45p/mi)", taxCode: "outside_scope", vatRate: 0, vatPence: 0 },
      { description: "Laptop", taxCode: "standard", vatRate: 20, vatPence: 2_000 },
      { description: "Something", taxCode: "reverse_charge", vatRate: 0, vatPence: 0 },
    ]);
  });

  it("refuses a sales-only code on an expense", async () => {
    const result = await createExpense(expenseForm({ taxCode: "export" }));
    expect(result.ok).toBe(false);
  });
});

describe("for a company that isn't VAT registered", () => {
  beforeEach(() => setup(false));

  it("stores outside scope at 0% whatever the form posts", async () => {
    const result = await createInvoice(
      documentForm([{ description: "Consulting", unitPricePounds: "100", taxCode: "standard", vatRate: 20 }]),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(await invoiceLines(result.id!)).toEqual([
      { description: "Consulting", taxCode: "outside_scope", vatRate: 0, needsReview: false },
    ]);
    const [company] = await db.select().from(companies).where(eq(companies.id, companyId));
    expect(company!.vatRegistered).toBe(false);
  });
});
