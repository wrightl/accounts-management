import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb, type TestDatabase } from "@/db/pglite";
import { setTestDb, type Database } from "@/db";
import { clients, companies, invoices, invoiceWriteOffs, payments, users } from "@/db/schema";
import { creditAdjustmentForInvoice } from "@/lib/credit-notes/adjustments";
import { seedCompany } from "@/lib/test/seed-company";
import { getInvoiceDetail } from "@/lib/invoices/queries";
import {
  listInvoiceWriteOffs,
  removeInvoiceWriteOff,
  writeOffInvoiceBalance,
} from "@/lib/invoices/write-offs";
import { getProfitAndLoss } from "@/lib/reports/queries";
import { voidInvoice } from "@/actions/invoices";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@clerk/nextjs/server", () => ({
  auth: vi.fn(async () => ({ userId: "user_clerk_1", sessionClaims: {} })),
  currentUser: vi.fn(async () => ({
    primaryEmailAddress: { emailAddress: "owner@test.dev" },
    firstName: "Owner",
    lastName: "Test",
    publicMetadata: {},
  })),
}));

let ctx: Awaited<ReturnType<typeof createTestDb>>;
let db: TestDatabase;
let companyId: string;
let actorId: string;
let invoiceId: string;

beforeEach(async () => {
  ctx = await createTestDb();
  db = ctx.db;
  setTestDb(db as unknown as Database);
  const company = await seedCompany(db);
  companyId = company.id;
  const [actor] = await db
    .insert(users)
    .values({
      companyId,
      clerkUserId: "user_clerk_1",
      email: "owner@test.dev",
      name: "Owner",
      role: "admin",
    })
    .returning();
  actorId = actor.id;
  const [client] = await db.insert(clients).values({ companyId, name: "Acme" }).returning();
  const [inv] = await db
    .insert(invoices)
    .values({
      companyId,
      number: "DD-2026-0700",
      clientId: client.id,
      status: "sent",
      issueDate: "2026-04-01",
      dueDate: "2099-04-30",
      netPence: 10_000,
      grossPence: 10_000,
    })
    .returning();
  invoiceId = inv.id;
  // The client's bank kept £1.50.
  await db.insert(payments).values({
    invoiceId,
    amountPence: 9_850,
    method: "bank_transfer",
    receivedAt: new Date("2026-04-20T12:00:00Z"),
  });
});

afterEach(async () => {
  setTestDb(null);
  await ctx.client.close();
});

function writeOff(amountPounds: string, writtenOffOn = "2026-04-20", kind = "bank_charges") {
  return writeOffInvoiceBalance({ companyId, localUserId: actorId }, invoiceId, {
    kind,
    amountPounds,
    writtenOffOn,
    note: "",
  });
}

describe("invoice write-offs", () => {
  it("writes off a bank-fee shortfall and settles the invoice", async () => {
    const result = await writeOff("1.50");
    expect(result.ok).toBe(true);

    const detail = await getInvoiceDetail(companyId, invoiceId);
    expect(detail?.invoice.status).toBe("paid");
    expect(detail?.balanceMinor).toBe(0);
    expect(detail?.refundDueMinor).toBe(0);

    const rows = await listInvoiceWriteOffs(companyId, invoiceId);
    expect(rows).toHaveLength(1);
    expect(rows[0].kindLabel).toBe("Bank charges");
  });

  it("counts the write-off as an expense in the P&L", async () => {
    await writeOff("1.50");
    const pnl = await getProfitAndLoss(companyId, "2026-04-01", "2026-04-30");
    expect(pnl.writeOffPence).toBe(150);
    expect(pnl.expensePence).toBe(150);
    expect(pnl.profitPence).toBe(10_000 - 150);
  });

  it("leaves the invoice open after a partial write-off", async () => {
    await writeOff("1.00");
    const detail = await getInvoiceDetail(companyId, invoiceId);
    expect(detail?.invoice.status).not.toBe("paid");
    expect(detail?.balanceMinor).toBe(50);
  });

  it("refuses to write off more than is owed", async () => {
    const result = await writeOff("2.00");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/still owed/);
  });

  it("refuses a write-off in a locked period", async () => {
    await db
      .update(companies)
      .set({ booksLockedThrough: "2026-04-30" })
      .where(eq(companies.id, companyId));
    const result = await writeOff("1.50");
    expect(result.ok).toBe(false);
  });

  it("removing a write-off puts the balance back and reopens the invoice", async () => {
    const created = await writeOff("1.50");
    expect(created.ok).toBe(true);
    if (!created.ok || !created.id) return;

    const removed = await removeInvoiceWriteOff({ companyId, localUserId: actorId }, created.id);
    expect(removed.ok).toBe(true);

    const detail = await getInvoiceDetail(companyId, invoiceId);
    expect(detail?.invoice.status).not.toBe("paid");
    expect(detail?.balanceMinor).toBe(150);
  });

  it("can't remove another company's write-off", async () => {
    const created = await writeOff("1.50");
    if (!created.ok || !created.id) throw new Error("write-off failed");
    const other = await seedCompany(db, { slug: "other-co" });
    const result = await removeInvoiceWriteOff(
      { companyId: other.id, localUserId: actorId },
      created.id,
    );
    expect(result.ok).toBe(false);
  });

  it("only counts write-offs belonging to the company asked about", async () => {
    await writeOff("1.00");
    const other = await seedCompany(db, { slug: "other-co" });
    // A row tagged with another company must never change this invoice's balance.
    await db.insert(invoiceWriteOffs).values({
      companyId: other.id,
      invoiceId,
      kind: "bad_debt",
      amountPence: 50,
      writtenOffOn: "2026-04-20",
    });
    const adj = await creditAdjustmentForInvoice(db as unknown as Database, companyId, invoiceId);
    expect(adj.writtenOffPence).toBe(100);
    const otherAdj = await creditAdjustmentForInvoice(db as unknown as Database, other.id, invoiceId);
    expect(otherAdj.writtenOffPence).toBe(50);
  });

  it("blocks voiding an invoice that has a write-off", async () => {
    await db.delete(payments).where(eq(payments.invoiceId, invoiceId));
    await writeOff("10.00", "2026-04-20", "bad_debt");
    await db.update(invoices).set({ status: "sent" }).where(eq(invoices.id, invoiceId));
    const result = await voidInvoice(invoiceId);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/write-off/);
  });

  it("never leaves a voided invoice with a write-off when both happen at once", async () => {
    await db.delete(payments).where(eq(payments.invoiceId, invoiceId));
    const [voidResult, writeOffResult] = await Promise.all([
      voidInvoice(invoiceId),
      writeOff("10.00", "2026-04-20", "bad_debt"),
    ]);
    // Exactly one wins; whichever it is, the books stay consistent.
    expect([voidResult.ok, writeOffResult.ok].filter(Boolean)).toHaveLength(1);
    const [inv] = await db.select().from(invoices).where(eq(invoices.id, invoiceId));
    const rows = await listInvoiceWriteOffs(companyId, invoiceId);
    expect(inv.status === "void" && rows.length > 0).toBe(false);
  });
});
