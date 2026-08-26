import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb, type TestDatabase } from "@/db/pglite";
import {
  clients,
  companySettings,
  invoices,
  invoiceLineItems,
  payments,
} from "@/db/schema";
import { invoiceTotals } from "@/lib/money";
import { allocateInvoiceNumber } from "@/lib/invoices/allocate";
import { isFullySettled } from "@/lib/invoices/status";
import { seedCompany } from "@/lib/test/seed-company";

vi.mock("server-only", () => ({}));

let ctx: Awaited<ReturnType<typeof createTestDb>>;
let db: TestDatabase;
let companyId: string;

beforeEach(async () => {
  ctx = await createTestDb();
  db = ctx.db;
  const company = await seedCompany(db);
  companyId = company.id;
});

afterEach(async () => {
  await ctx.client.close();
});

async function allocateNumber(issueYear: number) {
  return db.transaction(async (tx) =>
    allocateInvoiceNumber(tx as never, companyId, `${issueYear}-06-01`),
  );
}

describe("invoicing integration (PGlite)", () => {
  it("seeds company settings with invoice numbering defaults via migration", async () => {
    const [settings] = await db
      .select()
      .from(companySettings)
      .where(eq(companySettings.id, companyId));
    expect(settings.invoiceNumberPrefix).toBe("DD");
    expect(settings.invoiceNextSeq).toBe(1);
  });

  it("allocates unique year-aware invoice numbers", async () => {
    const a = await allocateNumber(2026);
    const b = await allocateNumber(2026);
    const c = await allocateNumber(2027);
    expect(a).toBe("DD-2026-0001");
    expect(b).toBe("DD-2026-0002");
    expect(c).toBe("DD-2027-0001");
  });

  it("creates an invoice with line totals", async () => {
    const [client] = await db
      .insert(clients)
      .values({ companyId, name: "Acme", email: "ap@acme.test" })
      .returning();

    const lines = [
      { description: "Workshop", quantity: 2, unitPricePence: 50000, vatRate: 0 },
    ];
    const totals = invoiceTotals(lines);
    const number = await allocateNumber(2026);

    const [inv] = await db
      .insert(invoices)
      .values({
        companyId,
        number,
        clientId: client.id,
        status: "draft",
        issueDate: "2026-03-01",
        dueDate: "2026-03-15",
        ...totals,
      })
      .returning();

    await db.insert(invoiceLineItems).values(
      lines.map((l, i) => ({ ...l, invoiceId: inv.id, position: i })),
    );

    expect(inv.grossPence).toBe(100000);
    expect(inv.number).toBe("DD-2026-0001");
  });

  it("flips to paid when payments cover the gross", async () => {
    const [client] = await db
      .insert(clients)
      .values({ companyId, name: "Beta" })
      .returning();
    const [inv] = await db
      .insert(invoices)
      .values({
        companyId,
        number: "DD-2026-0099",
        clientId: client.id,
        status: "sent",
        grossPence: 25000,
        netPence: 25000,
      })
      .returning();

    await db.insert(payments).values({
      invoiceId: inv.id,
      amountPence: 25000,
      method: "bank_transfer",
    });

    const paid = (
      await db.select().from(payments).where(eq(payments.invoiceId, inv.id))
    ).reduce((a, p) => a + p.amountPence, 0);

    expect(isFullySettled(inv.grossPence, paid)).toBe(true);

    await db
      .update(invoices)
      .set({ status: "paid", paidAt: new Date() })
      .where(eq(invoices.id, inv.id));

    const [updated] = await db
      .select()
      .from(invoices)
      .where(eq(invoices.id, inv.id));
    expect(updated.status).toBe("paid");
    expect(updated.paidAt).toBeTruthy();
  });

  it("blocks deleting a client that has invoices", async () => {
    const [client] = await db
      .insert(clients)
      .values({ companyId, name: "Gamma" })
      .returning();
    await db.insert(invoices).values({
      companyId,
      number: "DD-2026-0100",
      clientId: client.id,
    });

    await expect(
      db.delete(clients).where(eq(clients.id, client.id)),
    ).rejects.toThrow();
  });

  it("persists company settings updates", async () => {
    await db
      .update(companySettings)
      .set({
        invoiceNumberPrefix: "XX",
        sortCode: "12-34-56",
        accountNumber: "12345678",
      })
      .where(eq(companySettings.id, companyId));

    const [updated] = await db
      .select()
      .from(companySettings)
      .where(eq(companySettings.id, companyId));
    expect(updated.invoiceNumberPrefix).toBe("XX");
    expect(updated.sortCode).toBe("12-34-56");
  });
});
