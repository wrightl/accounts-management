import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { and, asc, eq, inArray } from "drizzle-orm";
import { createTestDb, type TestDatabase } from "@/db/pglite";
import type { Database } from "@/db";
import {
  clients,
  companies,
  creditNoteLineItems,
  creditNotes,
  expenses,
  invoiceLineItems,
  invoices,
  orderLineItems,
  orders,
  quoteLineItems,
  quotes,
  quoteVersions,
  recurringInvoices,
} from "@/db/schema";
import { seedCompany } from "@/lib/test/seed-company";

vi.mock("server-only", () => ({}));

const { applyTaxCodeBackfill, formatBackfillPlan, planTaxCodeBackfill } = await import(
  "@/lib/tax-code-backfill"
);
const { migration } = await import("@/db/data-migrations/0005_tax_codes");

let ctx: Awaited<ReturnType<typeof createTestDb>>;
let db: TestDatabase;
let registeredId: string;
let unregisteredId: string;
let oddDefaultId: string;
let registeredInvoiceId: string;
let unregisteredInvoiceId: string;
let before: Awaited<ReturnType<typeof amounts>>;

const asDb = () => db as unknown as Database;

/** Every stored rate and amount the backfill must not change. */
async function amounts() {
  return {
    invoiceLines: await db
      .select({ id: invoiceLineItems.id, vatRate: invoiceLineItems.vatRate, price: invoiceLineItems.unitPricePence })
      .from(invoiceLineItems)
      .orderBy(asc(invoiceLineItems.id)),
    expenses: await db
      .select({ id: expenses.id, vatRate: expenses.vatRate, amountPence: expenses.amountPence, vatPence: expenses.vatPence })
      .from(expenses)
      .orderBy(asc(expenses.id)),
    invoices: await db
      .select({ id: invoices.id, net: invoices.netPence, vat: invoices.vatPence, gross: invoices.grossPence })
      .from(invoices)
      .orderBy(asc(invoices.id)),
  };
}

async function seedBooks(companyId: string, prefix: string, rates: number[]) {
  const [client] = await db.insert(clients).values({ companyId, name: `${prefix} client` }).returning();
  const [invoice] = await db
    .insert(invoices)
    .values({
      companyId,
      number: `${prefix}-INV-1`,
      clientId: client!.id,
      status: "sent",
      issueDate: "2026-06-01",
      dueDate: "2026-07-01",
    })
    .returning();
  await db.insert(invoiceLineItems).values(
    rates.map((vatRate, position) => ({
      invoiceId: invoice!.id,
      description: `Line at ${vatRate}%`,
      unitPricePence: 10_000,
      vatRate,
      position,
    })),
  );
  const [creditNote] = await db
    .insert(creditNotes)
    .values({
      companyId,
      invoiceId: invoice!.id,
      clientId: client!.id,
      number: `${prefix}-CN-1`,
      issueDate: "2026-06-10",
      reason: "Refund",
    })
    .returning();
  await db
    .insert(creditNoteLineItems)
    .values({ creditNoteId: creditNote!.id, description: "Refund", unitPricePence: 1_000, vatRate: rates[0]! });
  const [quote] = await db
    .insert(quotes)
    .values({ companyId, number: `${prefix}-Q-1`, clientId: client!.id })
    .returning();
  await db
    .insert(quoteLineItems)
    .values({ quoteId: quote!.id, description: "Quoted", unitPricePence: 5_000, vatRate: rates[0]! });
  await db.insert(quoteVersions).values({
    quoteId: quote!.id,
    version: 1,
    clientId: client!.id,
    source: "create",
    lines: rates.map((vatRate, position) => ({
      description: `Quoted at ${vatRate}%`,
      quantity: 1,
      unitPricePence: 5_000,
      vatRate,
      position,
    })),
  });
  const [order] = await db
    .insert(orders)
    .values({ companyId, number: `${prefix}-O-1`, clientId: client!.id })
    .returning();
  await db
    .insert(orderLineItems)
    .values({ orderId: order!.id, description: "Ordered", unitPricePence: 5_000, vatRate: rates[0]! });
  await db.insert(recurringInvoices).values({
    companyId,
    clientId: client!.id,
    name: `${prefix} retainer`,
    lineTemplate: [{ description: "Retainer", quantity: 1, unitPricePence: 100_000, vatRate: rates[0]! }],
  });
  return invoice!.id;
}

beforeAll(async () => {
  ctx = await createTestDb();
  db = ctx.db;

  const registered = await seedCompany(db, { name: "Registered Ltd", vatRegistered: true, defaultVatRate: 20 });
  const unregistered = await seedCompany(db, { name: "Small Ltd", vatRegistered: false });
  const oddDefault = await seedCompany(db, { name: "Odd Default Ltd", vatRegistered: true, defaultVatRate: 17 });
  registeredId = registered!.id;
  unregisteredId = unregistered!.id;
  oddDefaultId = oddDefault!.id;

  registeredInvoiceId = await seedBooks(registeredId, "REG", [20, 5, 0, 17]);
  unregisteredInvoiceId = await seedBooks(unregisteredId, "SML", [0]);

  await db.insert(expenses).values([
    { companyId: registeredId, description: "Laptop", category: "Equipment", amountPence: 12_000, vatRate: 20, vatPence: 2_000 },
    { companyId: registeredId, description: "Train", category: "Travel", amountPence: 5_000, vatRate: 0 },
    { companyId: registeredId, description: "Course", category: "Training", amountPence: 30_000, vatRate: 0 },
    {
      companyId: registeredId,
      description: "SaaS",
      category: "Software",
      amountPence: 4_000,
      vatRate: 0,
      detectedCurrency: "USD",
      originalAmountMinor: 5_000,
    },
    { companyId: registeredId, description: "Misc", category: null, amountPence: 1_000, vatRate: 0 },
    { companyId: unregisteredId, description: "Laptop", category: "Equipment", amountPence: 12_000, vatRate: 0 },
  ]);
  before = await amounts();
}, 60_000);

afterAll(async () => {
  await ctx.client.close();
});

async function lineCodes(invoiceId: string) {
  return db
    .select({
      vatRate: invoiceLineItems.vatRate,
      taxCode: invoiceLineItems.taxCode,
      needsReview: invoiceLineItems.taxCodeNeedsReview,
    })
    .from(invoiceLineItems)
    .where(eq(invoiceLineItems.invoiceId, invoiceId))
    .orderBy(asc(invoiceLineItems.position));
}

describe("tax code backfill", () => {
  it("plans without writing anything", async () => {
    const plans = await planTaxCodeBackfill(asDb());
    const registered = plans.find((p) => p.companyId === registeredId)!;
    expect(registered.defaultTaxCode).toBe("standard");
    expect(registered.groups).toContainEqual(
      expect.objectContaining({ table: "invoice_line_items", vatRate: 17, rows: 1, taxCode: "standard", needsReview: true }),
    );
    expect(registered.groups).toContainEqual(
      expect.objectContaining({ table: "quote_versions", vatRate: 5, rows: 1, taxCode: "reduced" }),
    );
    expect(plans.find((p) => p.companyId === oddDefaultId)).toMatchObject({
      defaultTaxCode: null,
      defaultNeedsReview: true,
    });

    const report = formatBackfillPlan(plans);
    expect(report).toContain("Registered Ltd");
    expect(report).toContain("NEEDS REVIEW");

    const rows = await lineCodes(registeredInvoiceId);
    expect(rows.every((r) => r.taxCode === null)).toBe(true);
  });

  it("can be limited to one company", async () => {
    await applyTaxCodeBackfill(asDb(), { companyId: unregisteredId });
    expect((await lineCodes(unregisteredInvoiceId)).map((r) => r.taxCode)).toEqual(["outside_scope"]);
    expect((await lineCodes(registeredInvoiceId)).every((r) => r.taxCode === null)).toBe(true);
  });

  it("codes every row through the data migration", async () => {
    await migration.up({ db: asDb(), queueEffect: () => {} });

    expect(await lineCodes(registeredInvoiceId)).toEqual([
      { vatRate: 20, taxCode: "standard", needsReview: false },
      { vatRate: 5, taxCode: "reduced", needsReview: false },
      { vatRate: 0, taxCode: "zero_rated", needsReview: false },
      { vatRate: 17, taxCode: "standard", needsReview: true },
    ]);

    for (const table of [creditNoteLineItems, quoteLineItems, orderLineItems]) {
      const rows = await db.select({ taxCode: table.taxCode }).from(table);
      expect(rows.length).toBeGreaterThan(0);
      expect(rows.every((r) => r.taxCode !== null)).toBe(true);
    }

    const coded = await db
      .select({ description: expenses.description, companyId: expenses.companyId, taxCode: expenses.taxCode, needsReview: expenses.taxCodeNeedsReview })
      .from(expenses)
      .where(inArray(expenses.companyId, [registeredId, unregisteredId]));
    const byName = (companyId: string, description: string) =>
      coded.find((e) => e.companyId === companyId && e.description === description);
    expect(byName(registeredId, "Laptop")).toMatchObject({ taxCode: "standard", needsReview: false });
    expect(byName(registeredId, "Train")).toMatchObject({ taxCode: "zero_rated", needsReview: false });
    expect(byName(registeredId, "Course")).toMatchObject({ taxCode: "exempt", needsReview: true });
    expect(byName(registeredId, "SaaS")).toMatchObject({ taxCode: "reverse_charge", needsReview: true });
    expect(byName(registeredId, "Misc")).toMatchObject({ taxCode: "zero_rated", needsReview: true });
    expect(byName(unregisteredId, "Laptop")).toMatchObject({ taxCode: "outside_scope", needsReview: false });

    const [version] = await db
      .select({ lines: quoteVersions.lines })
      .from(quoteVersions)
      .innerJoin(quotes, eq(quoteVersions.quoteId, quotes.id))
      .where(eq(quotes.companyId, registeredId));
    expect((version!.lines as { taxCode: string; taxCodeNeedsReview: boolean }[]).map((l) => [l.taxCode, l.taxCodeNeedsReview])).toEqual([
      ["standard", false],
      ["reduced", false],
      ["zero_rated", false],
      ["standard", true],
    ]);
    const [template] = await db
      .select({ lines: recurringInvoices.lineTemplate })
      .from(recurringInvoices)
      .where(eq(recurringInvoices.companyId, unregisteredId));
    expect((template!.lines as { taxCode: string }[])[0]!.taxCode).toBe("outside_scope");

    const defaults = await db
      .select({ id: companies.id, defaultTaxCode: companies.defaultTaxCode })
      .from(companies)
      .where(inArray(companies.id, [registeredId, unregisteredId, oddDefaultId]));
    expect(Object.fromEntries(defaults.map((c) => [c.id, c.defaultTaxCode]))).toEqual({
      [registeredId]: "standard",
      [unregisteredId]: null,
      [oddDefaultId]: null,
    });
  });

  it("leaves rates and amounts alone", async () => {
    expect(await amounts()).toEqual(before);
  });

  it("is a no-op the second time and keeps codes a person set", async () => {
    await db
      .update(invoiceLineItems)
      .set({ taxCode: "exempt", taxCodeNeedsReview: false })
      .where(and(eq(invoiceLineItems.invoiceId, registeredInvoiceId), eq(invoiceLineItems.vatRate, 0)));
    const plans = await applyTaxCodeBackfill(asDb());
    expect(plans.every((p) => p.groups.length === 0)).toBe(true);
    expect((await lineCodes(registeredInvoiceId)).map((r) => r.taxCode)).toEqual([
      "standard",
      "reduced",
      "exempt",
      "standard",
    ]);
  });

  it("refuses a 0% code with a rate above 0", async () => {
    const [line] = await db
      .select({ id: invoiceLineItems.id })
      .from(invoiceLineItems)
      .where(eq(invoiceLineItems.invoiceId, unregisteredInvoiceId));
    await expect(
      db.update(invoiceLineItems).set({ taxCode: "zero_rated", vatRate: 20 }).where(eq(invoiceLineItems.id, line!.id)),
    ).rejects.toThrow();
  });
});
