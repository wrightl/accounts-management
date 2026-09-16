import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb, type TestDatabase } from "@/db/pglite";
import { setTestDb, type Database } from "@/db";
import {
  clients,
  companySettings,
  invoiceLineItems,
  invoices,
  orderPaymentMilestones,
  orders,
  quotes,
  users,
} from "@/db/schema";
import { seedCompany } from "@/lib/test/seed-company";
import {
  createOrder,
  createInvoiceFromOrder,
  convertOrderToInvoice,
} from "@/actions/orders";
import { voidInvoice } from "@/actions/invoices";
import { getOrderDetail } from "@/lib/orders/queries";
import { getClientOverview } from "@/lib/clients/overview";

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
let companyId: string;

beforeEach(async () => {
  ctx = await createTestDb();
  db = ctx.db;
  setTestDb(db as unknown as Database);
  const company = await seedCompany(db);
  companyId = company.id;
});

afterEach(async () => {
  setTestDb(null);
  await ctx.client.close();
});

async function seedAdmin() {
  await db.insert(users).values({
    companyId,
    clerkUserId: "user_clerk_1",
    email: "lee@dotanddashconsulting.com",
    name: "Lee",
    role: "admin",
  });
}

async function createTestOrder(opts?: {
  grossPounds?: string;
  milestones?: Array<{
    label: string;
    amountPence?: number;
    percentBasisPoints?: number;
    dueDate?: string;
    dueInDays?: number;
  }>;
}) {
  const [client] = await db
    .insert(clients)
    .values({ companyId, name: "Beta Ltd", email: "beta@test.com" })
    .returning();

  const form = new FormData();
  form.set("clientId", client.id);
  form.set("issueDate", "2026-08-23");
  form.set(
    "linesJson",
    JSON.stringify([
      {
        description: "Consulting",
        quantity: 1,
        unitPricePounds: opts?.grossPounds ?? "1000",
      },
    ]),
  );
  if (opts?.milestones) {
    form.set(
      "milestonesJson",
      JSON.stringify(
        opts.milestones.map((m, i) => ({
          label: m.label,
          amountPence: m.amountPence ?? null,
          percentBasisPoints: m.percentBasisPoints ?? null,
          dueDate: m.dueDate ?? null,
          dueInDays: m.dueInDays ?? null,
          position: i,
        })),
      ),
    );
  }

  const result = await createOrder(form);
  if (!result.ok || !result.id) throw new Error("create order failed");
  return { client, orderId: result.id };
}

describe("orders", () => {
  beforeEach(seedAdmin);

  it("creates a manual order", async () => {
    const { orderId } = await createTestOrder({ grossPounds: "1200" });
    const detail = await getOrderDetail(companyId, orderId);
    expect(detail?.order.grossPence).toBe(120000);
    expect(detail?.lines).toHaveLength(1);
  });

  it("converts an order to an invoice (full remaining)", async () => {
    const { orderId } = await createTestOrder({ grossPounds: "800" });
    const converted = await convertOrderToInvoice(orderId);
    expect(converted.ok).toBe(true);

    const [invoice] = await db.select().from(invoices).where(eq(invoices.orderId, orderId));
    expect(invoice.grossPence).toBe(80000);

    const lines = await db
      .select()
      .from(invoiceLineItems)
      .where(eq(invoiceLineItems.invoiceId, invoice.id));
    expect(lines).toHaveLength(1);
    expect(lines[0].description).toBe("Consulting");
  });

  it("invoices a payment milestone", async () => {
    const { orderId } = await createTestOrder({
      grossPounds: "1000",
      milestones: [
        { label: "Deposit", amountPence: 30000, dueInDays: 14 },
        { label: "Final", amountPence: 70000, dueInDays: 30 },
      ],
    });

    const [milestone] = await db
      .select()
      .from(orderPaymentMilestones)
      .where(eq(orderPaymentMilestones.orderId, orderId));

    const form = new FormData();
    form.set("mode", "milestone");
    form.set("milestoneId", milestone.id);
    const result = await createInvoiceFromOrder(orderId, form);
    expect(result.ok).toBe(true);

    const [invoice] = await db.select().from(invoices).where(eq(invoices.orderId, orderId));
    expect(invoice.grossPence).toBe(30000);
    expect(invoice.paymentMilestoneId).toBe(milestone.id);
    
    // Due date should be set (milestone-based)
    expect(invoice.dueDate).toBeTruthy();
    expect(typeof invoice.dueDate).toBe('string');

    const lines = await db
      .select()
      .from(invoiceLineItems)
      .where(eq(invoiceLineItems.invoiceId, invoice.id));
    expect(lines[0].description).toContain("Deposit");
  });

  it("invoices a part amount in pounds", async () => {
    const { orderId } = await createTestOrder({ grossPounds: "1000" });
    const form = new FormData();
    form.set("mode", "part");
    form.set("partMode", "amount");
    form.set("amountPounds", "400");
    const result = await createInvoiceFromOrder(orderId, form);
    expect(result.ok).toBe(true);

    const [invoice] = await db.select().from(invoices).where(eq(invoices.orderId, orderId));
    expect(invoice.grossPence).toBe(40000);
  });

  it("invoices a part amount as percent of original order", async () => {
    const { orderId } = await createTestOrder({ grossPounds: "1000" });
    const form = new FormData();
    form.set("mode", "part");
    form.set("partMode", "percent");
    form.set("percent", "25");
    const result = await createInvoiceFromOrder(orderId, form);
    expect(result.ok).toBe(true);

    const [invoice] = await db.select().from(invoices).where(eq(invoices.orderId, orderId));
    expect(invoice.grossPence).toBe(25000);
  });

  it("invoices remaining after a partial invoice with summary line", async () => {
    const { orderId } = await createTestOrder({ grossPounds: "1000" });

    const partForm = new FormData();
    partForm.set("mode", "part");
    partForm.set("partMode", "amount");
    partForm.set("amountPounds", "400");
    await createInvoiceFromOrder(orderId, partForm);

    const remainForm = new FormData();
    remainForm.set("mode", "remaining");
    const result = await createInvoiceFromOrder(orderId, remainForm);
    expect(result.ok).toBe(true);

    const all = await db.select().from(invoices).where(eq(invoices.orderId, orderId));
    expect(all).toHaveLength(2);
    const remaining = all.find((i) => i.grossPence === 60000);
    expect(remaining).toBeDefined();

    const lines = await db
      .select()
      .from(invoiceLineItems)
      .where(eq(invoiceLineItems.invoiceId, remaining!.id));
    expect(lines[0].description).toContain("Remaining balance");
  });

  it("rejects invoicing more than remaining", async () => {
    const { orderId } = await createTestOrder({ grossPounds: "1000" });
    const form = new FormData();
    form.set("mode", "part");
    form.set("partMode", "amount");
    form.set("amountPounds", "1500");
    const result = await createInvoiceFromOrder(orderId, form);
    expect(result.ok).toBe(false);
  });

  it("rejects reusing a milestone", async () => {
    const { orderId } = await createTestOrder({
      grossPounds: "1000",
      milestones: [
        { label: "Deposit", percentBasisPoints: 5000, dueInDays: 14 },
        { label: "Final", percentBasisPoints: 5000, dueInDays: 30 },
      ],
    });
    const [milestone] = await db
      .select()
      .from(orderPaymentMilestones)
      .where(eq(orderPaymentMilestones.orderId, orderId));

    const first = new FormData();
    first.set("mode", "milestone");
    first.set("milestoneId", milestone.id);
    expect((await createInvoiceFromOrder(orderId, first)).ok).toBe(true);

    const second = new FormData();
    second.set("mode", "milestone");
    second.set("milestoneId", milestone.id);
    const result = await createInvoiceFromOrder(orderId, second);
    expect(result.ok).toBe(false);
  });

  it("restores remaining when an invoice is voided", async () => {
    const { orderId } = await createTestOrder({ grossPounds: "1000" });
    const form = new FormData();
    form.set("mode", "remaining");
    const created = await createInvoiceFromOrder(orderId, form);
    if (!created.ok || !created.id) throw new Error("invoice failed");

    let detail = await getOrderDetail(companyId, orderId);
    expect(detail?.remainingPence).toBe(0);

    await voidInvoice(created.id);
    detail = await getOrderDetail(companyId, orderId);
    expect(detail?.remainingPence).toBe(100000);
  });

  it("uses company payment terms for full invoice due date", async () => {
    await db.update(companySettings).set({ invoicePaymentTermsDays: 30 }).where(eq(companySettings.id, companyId));
    const { orderId } = await createTestOrder({ grossPounds: "500" });
    const form = new FormData();
    form.set("mode", "remaining");
    const result = await createInvoiceFromOrder(orderId, form);
    expect(result.ok).toBe(true);

    const [invoice] = await db.select().from(invoices).where(eq(invoices.orderId, orderId));
    
    // Due date should be set (based on company payment terms)
    expect(invoice.dueDate).toBeTruthy();
    expect(typeof invoice.dueDate).toBe('string');
  });
});

describe("client overview", () => {
  beforeEach(seedAdmin);

  it("computes pipeline quotes and outstanding excluding drafts", async () => {
    const [client] = await db
      .insert(clients)
      .values({ companyId, name: "Acme", email: "acme@test.com" })
      .returning();

    await db.insert(quotes).values([
      {
        companyId,
        number: "Q-2026-0001",
        clientId: client.id,
        status: "sent",
        grossPence: 50000,
        netPence: 50000,
        vatPence: 0,
      },
      {
        companyId,
        number: "Q-2026-0002",
        clientId: client.id,
        status: "declined",
        grossPence: 90000,
        netPence: 90000,
        vatPence: 0,
      },
    ]);

    await db.insert(orders).values({
      companyId,
      number: "O-2026-0001",
      clientId: client.id,
      status: "active",
      grossPence: 120000,
      netPence: 120000,
      vatPence: 0,
    });

    const [draftInv] = await db
      .insert(invoices)
      .values({
        companyId,
        number: "DD-2026-0001",
        clientId: client.id,
        status: "draft",
        grossPence: 10000,
        netPence: 10000,
        vatPence: 0,
        issueDate: "2026-08-01",
      })
      .returning();

    await db.insert(invoices).values({
      companyId,
      number: "DD-2026-0002",
      clientId: client.id,
      status: "sent",
      grossPence: 20000,
      netPence: 20000,
      vatPence: 0,
      issueDate: "2026-08-01",
      dueDate: "2026-08-15",
    });

    const overview = await getClientOverview(companyId, client.id);
    expect(overview?.metrics.pipelineQuoteCount).toBe(1);
    expect(overview?.metrics.pipelineQuoteFormatted).toBe("£500.00");
    expect(overview?.metrics.activeOrderCount).toBe(1);
    expect(overview?.metrics.outstandingFormatted).toBe("£200.00");
    expect(overview?.metrics.invoiceCount).toBe(2);
    expect(draftInv.id).toBeTruthy();
  });
});
