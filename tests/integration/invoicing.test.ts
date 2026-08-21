import { describe, it, expect, beforeEach, afterEach } from "vitest";
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
import { nextInvoiceNumber } from "@/lib/invoices/numbering";
import { isFullySettled } from "@/lib/invoices/status";

let ctx: Awaited<ReturnType<typeof createTestDb>>;
let db: TestDatabase;

beforeEach(async () => {
  ctx = await createTestDb();
  db = ctx.db;
});

afterEach(async () => {
  await ctx.client.close();
});

async function ensureSettings() {
  const rows = await db.select().from(companySettings).limit(1);
  if (rows[0]) return rows[0];
  const [created] = await db.insert(companySettings).values({}).returning();
  return created;
}

async function allocateNumber(issueYear: number) {
  return db.transaction(async (tx) => {
    let rows = await tx.select().from(companySettings).limit(1);
    if (!rows[0]) {
      const [created] = await tx.insert(companySettings).values({}).returning();
      rows = [created];
    }
    const settings = rows[0];
    const allocated = nextInvoiceNumber(
      {
        invoiceNumberPrefix: settings.invoiceNumberPrefix,
        invoiceNextSeq: settings.invoiceNextSeq,
        invoiceSeqYear: settings.invoiceSeqYear,
      },
      issueYear,
    );
    await tx
      .update(companySettings)
      .set({
        invoiceNextSeq: allocated.nextSeq,
        invoiceSeqYear: allocated.seqYear,
      })
      .where(eq(companySettings.id, settings.id));
    return allocated.number;
  });
}

describe("invoicing integration (PGlite)", () => {
  it("seeds company settings with invoice numbering defaults via migration", async () => {
    // Migration INSERT may seed a row; otherwise defaults apply on insert.
    const settings = await ensureSettings();
    expect(settings.invoiceNumberPrefix).toBe("DD");
    expect(settings.invoiceNextSeq).toBe(1);
  });

  it("allocates unique year-aware invoice numbers", async () => {
    await ensureSettings();
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
      .values({ name: "Acme", email: "ap@acme.test" })
      .returning();

    const lines = [
      { description: "Workshop", quantity: 2, unitPricePence: 50000, vatRate: 0 },
    ];
    const totals = invoiceTotals(lines);
    const number = await allocateNumber(2026);

    const [inv] = await db
      .insert(invoices)
      .values({
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
    const [client] = await db.insert(clients).values({ name: "Beta" }).returning();
    const [inv] = await db
      .insert(invoices)
      .values({
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
    const [client] = await db.insert(clients).values({ name: "Gamma" }).returning();
    await db.insert(invoices).values({
      number: "DD-2026-0100",
      clientId: client.id,
    });

    await expect(
      db.delete(clients).where(eq(clients.id, client.id)),
    ).rejects.toThrow();
  });

  it("persists company settings updates", async () => {
    const settings = await ensureSettings();
    await db
      .update(companySettings)
      .set({
        invoiceNumberPrefix: "XX",
        sortCode: "12-34-56",
        accountNumber: "12345678",
      })
      .where(eq(companySettings.id, settings.id));

    const [updated] = await db.select().from(companySettings);
    expect(updated.invoiceNumberPrefix).toBe("XX");
    expect(updated.sortCode).toBe("12-34-56");
  });
});
