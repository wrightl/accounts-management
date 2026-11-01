import { readFile } from "node:fs/promises";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb, type TestDatabase } from "@/db/pglite";
import { setTestDb, type Database } from "@/db";
import {
  auditLog,
  clients,
  companies,
  creditNotes,
  invoices,
  payments,
  users,
} from "@/db/schema";
import {
  previewInvoiceCutover,
  saveInvoiceCutover,
} from "@/actions/invoice-cutover";
import { sumRefundsInPeriod, refundsByMonth } from "@/lib/credit-notes/period";
import {
  getCollectedByMonth,
  getCollectedInPeriod,
  getDaysSalesOutstanding,
  getInvoicedGrossByMonth,
  getInvoicedGrossInPeriod,
  getTopClientsByRevenue,
} from "@/lib/dashboard/queries";
import { getDashboardKpis } from "@/lib/invoices/queries";
import { getReservesPosition } from "@/lib/ledger/queries";
import { listClientProfitability } from "@/lib/profitability/queries";
import { streamAccountantPack } from "@/lib/reports/accountant-pack";
import {
  getAgedReceivables,
  getIncomeByMonth,
  getProfitAndLoss,
  getVatSummary,
} from "@/lib/reports/queries";
import { todayIsoDate } from "@/lib/dates";
import { importCsv } from "@/lib/test/import-invoices";
import { seedCompany } from "@/lib/test/seed-company";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@clerk/nextjs/server", () => ({
  auth: vi.fn(async () => ({ userId: "user_clerk_1", sessionClaims: {} })),
  currentUser: vi.fn(async () => ({
    primaryEmailAddress: { emailAddress: "owner@example.com" },
    firstName: "Owner",
    lastName: "One",
    publicMetadata: {},
  })),
}));

const CUTOVER = "2026-04-01";
const FROM = "2026-01-01";
const TO = "2026-06-30";

let ctx: Awaited<ReturnType<typeof createTestDb>>;
let db: TestDatabase;
let companyId: string;
let clientId: string;
let userId: string;

beforeEach(async () => {
  ctx = await createTestDb();
  db = ctx.db;
  setTestDb(db as unknown as Database);
  companyId = (await seedCompany(db, { vatRegistered: true })).id;
  const [user] = await db
    .insert(users)
    .values({
      companyId,
      clerkUserId: "user_clerk_1",
      email: "owner@example.com",
      name: "Owner",
      role: "admin",
    })
    .returning();
  userId = user.id;
  const [client] = await db
    .insert(clients)
    .values({ companyId, name: "Client" })
    .returning();
  clientId = client.id;
});

afterEach(async () => {
  setTestDb(null);
  await ctx.client.close();
});

async function addInvoice(
  number: string,
  issueDate: string,
  netPence: number,
  source: "alfa" | "import" = "import",
) {
  const [inv] = await db
    .insert(invoices)
    .values({
      companyId,
      clientId,
      number,
      issueDate,
      dueDate: issueDate,
      status: "sent",
      netPence,
      vatPence: netPence / 5,
      grossPence: netPence * 1.2,
      source,
    })
    .returning();
  return inv;
}

async function addCreditNote(invoiceId: string, number: string, issueDate: string) {
  await db.insert(creditNotes).values({
    companyId,
    invoiceId,
    clientId,
    number,
    issueDate,
    reason: "Overcharged",
    netPence: 1000,
    vatPence: 200,
    grossPence: 1200,
  });
}

async function addPayment(invoiceId: string, date: string, amountPence: number) {
  await db.insert(payments).values({
    invoiceId,
    amountPence,
    receivedAt: new Date(`${date}T12:00:00Z`),
  });
}

function cutoverForm(value: string) {
  const form = new FormData();
  form.set("cutover", value);
  return form;
}

async function setCutover(value: string) {
  const result = await saveInvoiceCutover(cutoverForm(value));
  expect(result.ok).toBe(true);
}

/** Alfa invoice, imports either side of cutover, and activity either side. */
async function seedScenario() {
  await addInvoice("A-1", "2026-02-10", 100_000, "alfa");
  const old = await addInvoice("OLD-1", "2026-02-10", 50_000);
  await addInvoice("NEW-1", "2026-05-10", 20_000);
  await addCreditNote(old.id, "CN-BEFORE", "2026-03-01");
  await addCreditNote(old.id, "CN-AFTER", "2026-05-01");
  await addPayment(old.id, "2026-03-15", 6_000);
  await addPayment(old.id, "2026-05-15", 7_000);
  return old;
}

/** Text of each file in a store-only zip. */
async function packFiles() {
  const { stream } = await streamAccountantPack({ companyId, from: FROM, to: TO });
  const zip = new Uint8Array(await new Response(stream).arrayBuffer());
  const view = new DataView(zip.buffer);
  const files = new Map<string, string>();
  let offset = 0;
  while (offset + 30 <= zip.length && view.getUint32(offset, true) === 0x04034b50) {
    const size = view.getUint32(offset + 18, true);
    const nameLength = view.getUint16(offset + 26, true);
    const start = offset + 30 + nameLength + view.getUint16(offset + 28, true);
    const name = new TextDecoder().decode(
      zip.subarray(offset + 30, offset + 30 + nameLength),
    );
    files.set(name, new TextDecoder().decode(zip.subarray(start, start + size)));
    offset = start + size;
  }
  return files;
}

describe("cutover in the accounts", () => {
  it("changes nothing until a cutover is set", async () => {
    await seedScenario();
    const pnl = await getProfitAndLoss(companyId, FROM, TO);
    // 170,000 invoiced less two credit notes of 1,000
    expect(pnl.incomePence).toBe(168_000);
  });

  it("leaves out brought-forward invoices and earlier credit notes only", async () => {
    await seedScenario();
    await setCutover(CUTOVER);

    const pnl = await getProfitAndLoss(companyId, FROM, TO);
    // Alfa 100,000 + import after cutover 20,000 - credit note after cutover 1,000
    expect(pnl.incomePence).toBe(119_000);
    expect(pnl.creditNotePence).toBe(1_000);

    const vat = await getVatSummary(companyId, FROM, TO);
    expect(vat.vatOnSalesPence).toBe(23_800);

    const months = await getIncomeByMonth(companyId, FROM, TO);
    expect(months.reduce((acc, m) => acc + m.totalPence, 0)).toBe(119_000);
  });

  it("still counts the invoice in what is owed", async () => {
    await seedScenario();
    const before = await getAgedReceivables(companyId);
    await setCutover(CUTOVER);
    expect(await getAgedReceivables(companyId)).toEqual(before);
  });

  it("restores the figures when the cutover is cleared", async () => {
    await seedScenario();
    await setCutover(CUTOVER);
    await setCutover("");
    const pnl = await getProfitAndLoss(companyId, FROM, TO);
    expect(pnl.incomePence).toBe(168_000);
    const [old] = await db
      .select()
      .from(invoices)
      .where(eq(invoices.number, "OLD-1"));
    expect(old.broughtForward).toBe(false);
  });

  it("never brings forward an invoice created in Alfa", async () => {
    await seedScenario();
    await setCutover(CUTOVER);
    const [alfa] = await db
      .select()
      .from(invoices)
      .where(eq(invoices.number, "A-1"));
    expect(alfa.broughtForward).toBe(false);
  });

  it("makes the accountant pack agree with the P&L", async () => {
    await seedScenario();
    await setCutover(CUTOVER);
    const files = await packFiles();

    const invoicesCsv = files.get("invoices.csv")!;
    expect(invoicesCsv).toContain("A-1");
    expect(invoicesCsv).toContain("NEW-1");
    expect(invoicesCsv).not.toContain("OLD-1");

    const creditsCsv = files.get("credit-notes.csv")!;
    expect(creditsCsv).toContain("CN-AFTER");
    expect(creditsCsv).not.toContain("CN-BEFORE");

    const paymentsCsv = files.get("payments.csv")!;
    expect(paymentsCsv).toContain("70.00");
    expect(paymentsCsv).not.toContain("60.00");
    expect(paymentsCsv).toContain(",yes");

    expect(files.get("reference/brought-forward-invoices.csv")).toContain("OLD-1");
    // 60,000 gross - 2,400 credited - 13,000 paid
    expect(files.get("reference/open-brought-forward.csv")).toContain("446.00");
    expect(files.get("summary/aged-receivables.csv")).toContain("61_plus_days");
    expect(files.get("summary/cutover.csv")).toContain(CUTOVER);
  });

  it("leaves brought-forward income out of client profitability", async () => {
    await seedScenario();
    await setCutover(CUTOVER);
    const [row] = await listClientProfitability(companyId, { from: FROM, to: TO });
    expect(row.revenuePence).toBe(119_000);
  });

  it("starts reserves from the first invoice that counts", async () => {
    await addInvoice("ANCIENT", "2015-01-01", 500_000);
    await addInvoice("A-1", "2026-05-01", 1_000, "alfa");
    await setCutover(CUTOVER);
    const position = await getReservesPosition(companyId, "2026-06-30");
    // Without the rule, the schedule would start in 2015 with £5,000 of profit.
    expect(position.years).toHaveLength(1);
    expect(position.years[0].closingReservesPence).toBeLessThanOrEqual(1_000);
    expect(position.years[0].closingReservesPence).toBeGreaterThan(0);
  });

  it("counts refunds only from the cutover", async () => {
    const old = await addInvoice("OLD-R", "2026-02-10", 50_000);
    const refund = (number: string, refundedAt: string) =>
      db.insert(creditNotes).values({
        companyId,
        invoiceId: old.id,
        clientId,
        number,
        issueDate: "2026-02-20",
        reason: "Overcharged",
        refundedPence: 500,
        refundedAt,
      });
    await refund("CN-R1", "2026-03-10");
    await refund("CN-R2", "2026-05-10");
    await setCutover(CUTOVER);

    expect(await sumRefundsInPeriod(companyId, FROM, TO)).toBe(500);
    expect([...(await refundsByMonth(companyId, FROM, TO))]).toEqual([
      ["2026-05", 500],
    ]);
  });

  it("applies the rules to dashboard cash and invoiced figures", async () => {
    await seedScenario();
    await setCutover(CUTOVER);

    // The payment after cutover only; the one before it stays out.
    expect(await getCollectedInPeriod(companyId, FROM, TO)).toBe(7_000);
    expect(await getCollectedByMonth(companyId, FROM, TO)).toEqual([
      { month: "2026-05", totalPence: 7_000 },
    ]);

    // 120,000 + 24,000 gross, less the 1,200 credit note after cutover.
    expect(await getInvoicedGrossInPeriod(companyId, FROM, TO)).toBe(142_800);
    const months = await getInvoicedGrossByMonth(companyId, FROM, TO);
    expect(months.reduce((acc, m) => acc + m.totalPence, 0)).toBe(142_800);

    const [top] = await getTopClientsByRevenue(companyId, FROM, TO);
    expect(top.grossPence).toBe(142_800);
  });

  it("leaves brought-forward invoices out of invoiced this month", async () => {
    const today = todayIsoDate();
    const inv = await addInvoice("MONTH-1", today, 10_000);
    expect((await getDashboardKpis(companyId)).invoicedThisMonthPence).toBe(12_000);
    await db
      .update(invoices)
      .set({ broughtForward: true })
      .where(eq(invoices.id, inv.id));
    expect((await getDashboardKpis(companyId)).invoicedThisMonthPence).toBe(0);
  });

  it("leaves every import out of average days to pay, with or without a cutover", async () => {
    const own = await addInvoice("OWN", "2026-03-01", 1_000, "alfa");
    const imported = await addInvoice("IMP", "2026-03-01", 1_000);
    await db
      .update(invoices)
      .set({ status: "paid" })
      .where(eq(invoices.companyId, companyId));
    await addPayment(own.id, "2026-03-11", 1_200);
    await addPayment(imported.id, "2026-05-30", 1_200);
    expect(await getDaysSalesOutstanding(companyId)).toBe(10);
  });

  it("marks new imports using the current cutover", async () => {
    await setCutover(CUTOVER);
    await importCsv(
      [
        "invoice number,client name,issue date,description,net,status",
        "IMP-BEFORE,Imported,01/03/2026,Work,10.00,sent",
        "IMP-AFTER,Imported,01/04/2026,Work,10.00,sent",
      ].join("\n"),
    );
    const rows = await db
      .select()
      .from(invoices)
      .where(eq(invoices.companyId, companyId));
    const byNumber = new Map(rows.map((r) => [r.number, r]));
    expect(byNumber.get("IMP-BEFORE")).toMatchObject({
      source: "import",
      broughtForward: true,
    });
    expect(byNumber.get("IMP-AFTER")).toMatchObject({
      source: "import",
      broughtForward: false,
    });
  });
});

describe("saving a cutover", () => {
  it("previews without changing anything", async () => {
    await seedScenario();
    const preview = await previewInvoiceCutover(cutoverForm(CUTOVER));
    expect(preview.ok && preview.impact.invoicesBroughtForward).toBe(1);
    // -50,000 for the invoice, +1,000 for the credit note that stops counting
    expect(preview.ok && preview.impact.incomeChangePence).toBe(-49_000);
    const [company] = await db
      .select()
      .from(companies)
      .where(eq(companies.id, companyId));
    expect(company.invoiceCutoverDate).toBeNull();
  });

  it("is refused when it would move a locked period", async () => {
    await seedScenario();
    await db
      .update(companies)
      .set({ booksLockedThrough: "2026-02-28" })
      .where(eq(companies.id, companyId));

    const preview = await previewInvoiceCutover(cutoverForm(CUTOVER));
    expect(preview.ok && preview.lockError).toContain("locked");
    const result = await saveInvoiceCutover(cutoverForm(CUTOVER));
    expect(result.ok).toBe(false);

    const [old] = await db
      .select()
      .from(invoices)
      .where(eq(invoices.number, "OLD-1"));
    expect(old.broughtForward).toBe(false);
  });

  it("needs permission to preview or save", async () => {
    await seedScenario();
    await db.update(users).set({ role: "user" }).where(eq(users.id, userId));

    expect((await previewInvoiceCutover(cutoverForm(CUTOVER))).ok).toBe(false);
    expect((await saveInvoiceCutover(cutoverForm(CUTOVER))).ok).toBe(false);
    const [company] = await db
      .select()
      .from(companies)
      .where(eq(companies.id, companyId));
    expect(company.invoiceCutoverDate).toBeNull();
  });

  it("leaves other companies alone", async () => {
    const other = await seedCompany(db, { name: "Other Co" });
    const [otherClient] = await db
      .insert(clients)
      .values({ companyId: other.id, name: "Their client" })
      .returning();
    await db.insert(invoices).values({
      companyId: other.id,
      clientId: otherClient.id,
      number: "THEIRS",
      issueDate: "2026-02-10",
      status: "sent",
      netPence: 9_000,
      grossPence: 9_000,
      source: "import",
    });

    await seedScenario();
    await setCutover(CUTOVER);

    const [theirs] = await db
      .select()
      .from(invoices)
      .where(eq(invoices.number, "THEIRS"));
    expect(theirs.broughtForward).toBe(false);
    expect((await getProfitAndLoss(other.id, FROM, TO)).incomePence).toBe(9_000);
  });

  it("rejects a future date", async () => {
    const result = await saveInvoiceCutover(cutoverForm("2999-01-01"));
    expect(result.ok).toBe(false);
  });

  it("records the change in the audit log", async () => {
    await seedScenario();
    await setCutover(CUTOVER);
    const audits = await db
      .select()
      .from(auditLog)
      .where(eq(auditLog.action, "invoice.cutover_change"));
    expect(audits).toHaveLength(1);
    expect(audits[0].meta).toMatchObject({ from: null, to: CUTOVER });
  });
});

describe("0071 backfill", () => {
  async function runBackfill() {
    const migration = await readFile("drizzle/0071_invoice_cutover.sql", "utf8");
    for (const statement of migration
      .split("--> statement-breakpoint")
      .slice(-2)) {
      await ctx.client.exec(statement);
    }
  }

  async function sourceOf(number: string) {
    const [row] = await db
      .select()
      .from(invoices)
      .where(eq(invoices.number, number));
    return row.source;
  }

  it("finds imports by payment method", async () => {
    const inv = await addInvoice("PAID", "2026-02-01", 1000, "alfa");
    await db.insert(payments).values({
      invoiceId: inv.id,
      amountPence: 1200,
      receivedAt: new Date(),
      method: "import",
    });
    await runBackfill();
    expect(await sourceOf("PAID")).toBe("import");
    const [record] = await db
      .select()
      .from(auditLog)
      .where(eq(auditLog.action, "invoice.source_backfill"));
    expect(record.meta).toMatchObject({
      basis: "payment_method",
      invoiceIds: [inv.id],
    });
  });

  it("finds unpaid imports only when the audit count matches", async () => {
    const createdAt = new Date("2026-05-01T10:00:00Z");
    const importRow = {
      companyId,
      clientId,
      status: "sent" as const,
      createdByUserId: userId,
      createdAt,
    };
    await db.insert(invoices).values([
      { ...importRow, number: "BATCH-1" },
      { ...importRow, number: "BATCH-2" },
      {
        ...importRow,
        number: "LONE",
        createdAt: new Date("2026-05-01T09:59:00Z"),
      },
    ]);
    await db.insert(auditLog).values({
      companyId,
      actorUserId: userId,
      action: "invoice.import",
      entityType: "invoice",
      meta: { count: 2 },
      createdAt: new Date("2026-05-01T10:00:01Z"),
    });

    await runBackfill();

    expect(await sourceOf("BATCH-1")).toBe("import");
    expect(await sourceOf("BATCH-2")).toBe("import");
    expect(await sourceOf("LONE")).toBe("alfa");

    const [record] = await db
      .select()
      .from(auditLog)
      .where(eq(auditLog.action, "invoice.source_backfill"));
    expect(record.companyId).toBe(companyId);
    expect(record.meta).toMatchObject({ basis: "audit_count" });
    expect((record.meta as { invoiceIds: string[] }).invoiceIds).toHaveLength(2);
  });
});
