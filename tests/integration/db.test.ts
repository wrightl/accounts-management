import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "@/db/pglite";
import {
  clients,
  companySettings,
  invoices,
  invoiceLineItems,
  payments,
} from "@/db/schema";
import { invoiceTotals } from "@/lib/money";
import { seedCompany } from "@/lib/test/seed-company";

let ctx: Awaited<ReturnType<typeof createTestDb>>;

beforeEach(async () => {
  ctx = await createTestDb();
});

afterEach(async () => {
  await ctx.client.close();
});

describe("database schema (PGlite)", () => {
  it("applies migrations and creates all core tables", async () => {
    const { rows } = await ctx.client.query<{ table_name: string }>(
      "select table_name from information_schema.tables where table_schema = 'public'",
    );
    const names = rows.map((r) => r.table_name);
    for (const table of [
      "users",
      "companies",
      "clients",
      "invoices",
      "invoice_line_items",
      "payments",
      "expenses",
      "expense_receipts",
      "reimbursements",
      "reimbursement_items",
      "audit_log",
    ]) {
      expect(names).toContain(table);
    }
  });

  it("persists an invoice with line items and computes totals", async () => {
    const { db } = ctx;
    const company = await seedCompany(db);

    const [client] = await db
      .insert(clients)
      .values({ companyId: company.id, name: "Acme Ltd", email: "ap@acme.example" })
      .returning();

    const lines = [
      { description: "Discovery workshop", quantity: 2, unitPricePence: 75000, vatRate: 0 },
      { description: "Facilitation", quantity: 1, unitPricePence: 50000, vatRate: 0 },
    ];
    const totals = invoiceTotals(lines);

    const [invoice] = await db
      .insert(invoices)
      .values({
        companyId: company.id,
        number: "INV-0001",
        clientId: client.id,
        status: "sent",
        netPence: totals.netPence,
        vatPence: totals.vatPence,
        grossPence: totals.grossPence,
      })
      .returning();

    await db.insert(invoiceLineItems).values(
      lines.map((l, i) => ({ ...l, invoiceId: invoice.id, position: i })),
    );

    expect(invoice.grossPence).toBe(200000);

    const savedLines = await db
      .select()
      .from(invoiceLineItems)
      .where(eq(invoiceLineItems.invoiceId, invoice.id));
    expect(savedLines).toHaveLength(2);
  });

  it("cascades line items and payments when an invoice is deleted", async () => {
    const { db } = ctx;
    const company = await seedCompany(db);
    const [client] = await db
      .insert(clients)
      .values({ companyId: company.id, name: "Beta Co" })
      .returning();
    const [invoice] = await db
      .insert(invoices)
      .values({
        companyId: company.id,
        number: "INV-0002",
        clientId: client.id,
      })
      .returning();
    await db
      .insert(invoiceLineItems)
      .values({
        invoiceId: invoice.id,
        description: "Retainer",
        quantity: 1,
        unitPricePence: 100000,
      });
    await db
      .insert(payments)
      .values({ invoiceId: invoice.id, amountPence: 100000, method: "bank_transfer" });

    await db.delete(invoices).where(eq(invoices.id, invoice.id));

    const lines = await db
      .select()
      .from(invoiceLineItems)
      .where(eq(invoiceLineItems.invoiceId, invoice.id));
    const pays = await db
      .select()
      .from(payments)
      .where(eq(payments.invoiceId, invoice.id));
    expect(lines).toHaveLength(0);
    expect(pays).toHaveLength(0);
  });

  it("exposes company settings alias for companies table", async () => {
    const { db } = ctx;
    const company = await seedCompany(db, { name: "Alias Co" });
    const [row] = await db
      .select()
      .from(companySettings)
      .where(eq(companySettings.id, company.id));
    expect(row?.name).toBe("Alias Co");
  });
});
