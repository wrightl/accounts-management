import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb, type TestDatabase } from "@/db/pglite";
import { setTestDb, type Database } from "@/db";
import {
  clients,
  companies,
  creditNotes,
  invoiceLineItems,
  invoices,
  users,
} from "@/db/schema";
import { seedCompany } from "@/lib/test/seed-company";
import {
  createCreditNote,
  recordCreditNoteRefund,
  sendCreditNote,
  voidCreditNote,
} from "@/actions/credit-notes";
import { voidInvoice } from "@/actions/invoices";
import { recordPayment } from "@/actions/payments";
import { getInvoiceDetail } from "@/lib/invoices/queries";
import { getCreditNoteDetail } from "@/lib/credit-notes/queries";
import {
  getAgedReceivables,
  getIncomeByMonth,
  getProfitAndLoss,
  getVatSummary,
} from "@/lib/reports/queries";
import { sendEmail } from "@/lib/email";

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
vi.mock("@/lib/email", () => ({
  sendEmail: vi.fn(async () => ({ id: "email_1" })),
}));
vi.mock("@/lib/email/resolve-client-sender", () => ({
  resolveClientEmailSender: vi.fn(async () => ({
    from: "Test Co <billing@test.example>",
    replyTo: "lee@dotanddashconsulting.com",
  })),
}));

let ctx: Awaited<ReturnType<typeof createTestDb>>;
let db: TestDatabase;
let companyId: string;
let clientId: string;

beforeEach(async () => {
  ctx = await createTestDb();
  db = ctx.db;
  setTestDb(db as unknown as Database);
  const company = await seedCompany(db, { vatRegistered: true, vatNumber: "GB123456789" });
  companyId = company.id;
  await db.insert(users).values({
    companyId,
    clerkUserId: "user_clerk_1",
    email: "lee@dotanddashconsulting.com",
    name: "Lee",
    role: "admin",
  });
  const [client] = await db
    .insert(clients)
    .values({ companyId, name: "Acme", email: "ap@acme.test" })
    .returning();
  clientId = client.id;
  vi.mocked(sendEmail).mockClear();
});

afterEach(async () => {
  setTestDb(null);
  await ctx.client.close();
});

/** Sent invoice: 4 days at £250 + 20% VAT = £1,000 net, £1,200 gross. */
async function seedSentInvoice(status: "sent" | "draft" = "sent") {
  const [inv] = await db
    .insert(invoices)
    .values({
      companyId,
      number: "DD-2026-0001",
      clientId,
      status,
      issueDate: "2026-03-01",
      dueDate: "2026-03-15",
      netPence: 100000,
      vatPence: 20000,
      grossPence: 120000,
    })
    .returning();
  await db.insert(invoiceLineItems).values({
    invoiceId: inv.id,
    description: "Workshop days",
    quantity: 4,
    unitPricePence: 25000,
    vatRate: 20,
    position: 0,
  });
  return inv.id;
}

function creditForm(
  lines: Array<{ description: string; quantity: number; unitPricePounds: string }>,
  issueDate = "2026-03-10",
) {
  const form = new FormData();
  form.set("issueDate", issueDate);
  form.set("reason", "Workshop day cancelled");
  form.set("linesJson", JSON.stringify(lines.map((l) => ({ ...l, vatRate: 20 }))));
  return form;
}

function paymentForm(amountPounds: string) {
  const form = new FormData();
  form.set("amountPounds", amountPounds);
  form.set("receivedAt", "2026-03-05");
  return form;
}

function refundForm(amountPounds: string, refundedAt = "2026-03-12") {
  const form = new FormData();
  form.set("amountPounds", amountPounds);
  form.set("refundedAt", refundedAt);
  form.set("reference", "REFUND-1");
  return form;
}

describe("credit notes", () => {
  it("part-credits an unpaid invoice and reduces balance, income and VAT", async () => {
    const invoiceId = await seedSentInvoice();

    const result = await createCreditNote(
      invoiceId,
      creditForm([{ description: "Workshop day", quantity: 1, unitPricePounds: "250" }]),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const note = await getCreditNoteDetail(companyId, result.id!);
    expect(note?.creditNote.number).toBe("CN-2026-0001");
    expect(note?.creditNote.netPence).toBe(25000);
    expect(note?.creditNote.vatPence).toBe(5000);
    expect(note?.creditNote.grossPence).toBe(30000);

    const detail = await getInvoiceDetail(companyId, invoiceId);
    // Still open; the due date has passed, so it displays as overdue.
    expect(detail?.invoice.status).toBe("overdue");
    expect(detail?.creditedPence).toBe(30000);
    expect(detail?.balancePence).toBe(90000);
    expect(detail?.creditablePence).toBe(90000);

    const pnl = await getProfitAndLoss(companyId, "2026-03-01", "2026-03-31");
    expect(pnl.incomePence).toBe(75000);
    expect(pnl.creditNotePence).toBe(25000);

    const vat = await getVatSummary(companyId, "2026-03-01", "2026-03-31");
    expect(vat.vatOnSalesPence).toBe(15000);
    expect(vat.creditNoteVatPence).toBe(5000);

    const aged = await getAgedReceivables(companyId);
    const agedTotal = aged.raw.current + aged.raw.d30 + aged.raw.d60 + aged.raw.d90;
    expect(agedTotal).toBe(90000);
  });

  it("books a credit in the month it was issued, not the invoice month", async () => {
    const invoiceId = await seedSentInvoice();
    await createCreditNote(
      invoiceId,
      creditForm(
        [{ description: "Workshop day", quantity: 1, unitPricePounds: "250" }],
        "2026-04-02",
      ),
    );

    const march = await getProfitAndLoss(companyId, "2026-03-01", "2026-03-31");
    expect(march.incomePence).toBe(100000);
    const april = await getProfitAndLoss(companyId, "2026-04-01", "2026-04-30");
    expect(april.incomePence).toBe(-25000);

    const byMonth = await getIncomeByMonth(companyId, "2026-03-01", "2026-04-30");
    expect(byMonth.map((m) => [m.month, m.totalPence])).toEqual([
      ["2026-03", 100000],
      ["2026-04", -25000],
    ]);
  });

  it("limits payments to the balance left after credits", async () => {
    const invoiceId = await seedSentInvoice();
    await createCreditNote(
      invoiceId,
      creditForm([{ description: "Workshop day", quantity: 1, unitPricePounds: "250" }]),
    );

    const tooMuch = await recordPayment(invoiceId, paymentForm("1000"));
    expect(tooMuch.ok).toBe(false);

    const exact = await recordPayment(invoiceId, paymentForm("900"));
    expect(exact.ok).toBe(true);
    const detail = await getInvoiceDetail(companyId, invoiceId);
    expect(detail?.invoice.status).toBe("paid");
    expect(detail?.balancePence).toBe(0);
  });

  it("settles a fully credited invoice and reopens it when the credit is voided", async () => {
    const invoiceId = await seedSentInvoice();
    const full = await createCreditNote(
      invoiceId,
      creditForm([{ description: "Workshop days", quantity: 4, unitPricePounds: "250" }]),
    );
    expect(full.ok).toBe(true);
    if (!full.ok) return;

    let detail = await getInvoiceDetail(companyId, invoiceId);
    expect(detail?.invoice.status).toBe("paid");
    expect(detail?.balancePence).toBe(0);
    expect(detail?.refundDuePence).toBe(0);

    const voided = await voidCreditNote(full.id!);
    expect(voided.ok).toBe(true);
    detail = await getInvoiceDetail(companyId, invoiceId);
    // Still open; the due date has passed, so it displays as overdue.
    expect(detail?.invoice.status).toBe("overdue");
    expect(detail?.invoice.paidAt).toBeNull();
    expect(detail?.balancePence).toBe(120000);

    const pnl = await getProfitAndLoss(companyId, "2026-03-01", "2026-03-31");
    expect(pnl.incomePence).toBe(100000);
  });

  it("creates a refund due when a paid invoice is credited, and records the refund", async () => {
    const invoiceId = await seedSentInvoice();
    expect((await recordPayment(invoiceId, paymentForm("1200"))).ok).toBe(true);

    const credit = await createCreditNote(
      invoiceId,
      creditForm([{ description: "Workshop day", quantity: 1, unitPricePounds: "250" }]),
    );
    expect(credit.ok).toBe(true);
    if (!credit.ok) return;

    let detail = await getInvoiceDetail(companyId, invoiceId);
    expect(detail?.invoice.status).toBe("paid");
    expect(detail?.refundDuePence).toBe(30000);

    const over = await recordCreditNoteRefund(credit.id!, refundForm("400"));
    expect(over.ok).toBe(false);

    const early = await recordCreditNoteRefund(credit.id!, refundForm("300", "2026-03-01"));
    expect(early.ok).toBe(false);

    const refunded = await recordCreditNoteRefund(credit.id!, refundForm("300"));
    expect(refunded.ok).toBe(true);
    detail = await getInvoiceDetail(companyId, invoiceId);
    expect(detail?.refundDuePence).toBe(0);
    expect(detail?.balancePence).toBe(0);

    const again = await recordCreditNoteRefund(credit.id!, refundForm("1"));
    expect(again.ok).toBe(false);

    // Refunded credit notes can no longer be voided.
    expect((await voidCreditNote(credit.id!)).ok).toBe(false);
  });

  it("refuses a refund when the credit only reduced an unpaid balance", async () => {
    const invoiceId = await seedSentInvoice();
    const credit = await createCreditNote(
      invoiceId,
      creditForm([{ description: "Workshop day", quantity: 1, unitPricePounds: "250" }]),
    );
    if (!credit.ok) throw new Error(credit.error);
    const refund = await recordCreditNoteRefund(credit.id!, refundForm("300"));
    expect(refund.ok).toBe(false);
  });

  it("rejects credits over the remaining amount, on drafts, or dated before the invoice", async () => {
    const invoiceId = await seedSentInvoice();
    const first = await createCreditNote(
      invoiceId,
      creditForm([{ description: "Workshop days", quantity: 3, unitPricePounds: "250" }]),
    );
    expect(first.ok).toBe(true);

    const over = await createCreditNote(
      invoiceId,
      creditForm([{ description: "Workshop days", quantity: 2, unitPricePounds: "250" }]),
    );
    expect(over.ok).toBe(false);
    if (!over.ok) expect(over.error).toMatch(/left to credit/);

    const backdated = await createCreditNote(
      invoiceId,
      creditForm(
        [{ description: "Workshop day", quantity: 1, unitPricePounds: "250" }],
        "2026-02-01",
      ),
    );
    expect(backdated.ok).toBe(false);

    await db.delete(invoiceLineItems);
    await db.delete(creditNotes);
    await db.delete(invoices);
    const draftId = await seedSentInvoice("draft");
    const onDraft = await createCreditNote(
      draftId,
      creditForm([{ description: "Workshop day", quantity: 1, unitPricePounds: "250" }]),
    );
    expect(onDraft.ok).toBe(false);
  });

  it("uses the company's credit note prefix and numbers each year from 1", async () => {
    await db
      .update(companies)
      .set({ creditNoteNumberPrefix: "CR" })
      .where(eq(companies.id, companyId));
    const invoiceId = await seedSentInvoice();
    const a = await createCreditNote(
      invoiceId,
      creditForm([{ description: "Day", quantity: 1, unitPricePounds: "100" }]),
    );
    const b = await createCreditNote(
      invoiceId,
      creditForm([{ description: "Day", quantity: 1, unitPricePounds: "100" }]),
    );
    if (!a.ok || !b.ok) throw new Error("credit failed");
    expect((await getCreditNoteDetail(companyId, a.id!))?.creditNote.number).toBe(
      "CR-2026-0001",
    );
    expect((await getCreditNoteDetail(companyId, b.id!))?.creditNote.number).toBe(
      "CR-2026-0002",
    );
  });

  it("blocks voiding an invoice that has credit notes", async () => {
    const invoiceId = await seedSentInvoice();
    await createCreditNote(
      invoiceId,
      creditForm([{ description: "Workshop day", quantity: 1, unitPricePounds: "250" }]),
    );
    const result = await voidInvoice(invoiceId);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/credit notes/);
  });

  it("emails the credit note with its PDF and then stops it being voided", async () => {
    const invoiceId = await seedSentInvoice();
    const credit = await createCreditNote(
      invoiceId,
      creditForm([{ description: "Workshop day", quantity: 1, unitPricePounds: "250" }]),
    );
    if (!credit.ok) throw new Error(credit.error);

    const sent = await sendCreditNote(credit.id!);
    expect(sent.ok).toBe(true);
    expect(sendEmail).toHaveBeenCalledTimes(1);
    const message = vi.mocked(sendEmail).mock.calls[0]![0];
    expect(message.to).toBe("ap@acme.test");
    expect(message.subject).toContain("CN-2026-0001");
    expect(message.attachments?.[0]?.filename).toBe("CN-2026-0001.pdf");
    expect(message.attachments?.[0]?.content.byteLength).toBeGreaterThan(1000);

    const detail = await getCreditNoteDetail(companyId, credit.id!);
    expect(detail?.creditNote.sentAt).not.toBeNull();
    expect((await voidCreditNote(credit.id!)).ok).toBe(false);
  });
});
