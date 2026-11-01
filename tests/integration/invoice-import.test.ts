import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";
import { createTestDb, type TestDatabase } from "@/db/pglite";
import { setTestDb, type Database } from "@/db";
import {
  auditLog,
  clients,
  companies,
  creditNotes,
  documentSequences,
  invoiceImportBatches,
  invoiceImportDrafts,
  invoiceLineItems,
  invoices,
  payments,
  sendJobs,
  users,
} from "@/db/schema";
import {
  commitInvoiceImportChunk,
  discardInvoiceImport,
  setImportClientResolution,
  setImportDraftsSkipped,
  setNextInvoiceSequence,
  stageInvoiceImport,
  undoInvoiceImport,
} from "@/actions/invoice-import";
import { sendEmail } from "@/lib/email";
import { allocateInvoiceNumber } from "@/lib/invoices/allocate";
import { getImportBatchReview } from "@/lib/invoices/import/queries";
import { enqueueOverdueReminders } from "@/lib/outbox";
import { getProfitAndLoss, getVatSummary } from "@/lib/reports/queries";
import { commitAll, importCsv, stageCsv } from "@/lib/test/import-invoices";
import { seedCompany } from "@/lib/test/seed-company";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
  unstable_cache: <T,>(fn: T) => fn,
}));
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
vi.mock("@/lib/email", () => ({
  sendEmail: vi.fn(async () => ({ id: "email_1" })),
}));

const CUTOVER = "2026-04-01";
const HEAD =
  "invoice number,client name,client company,client email,issue date,due date,description,net,vat,status,amount paid,paid date,payment reference";

let ctx: Awaited<ReturnType<typeof createTestDb>>;
let db: TestDatabase;
let companyId: string;
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
  await setCutover(CUTOVER);
});

afterEach(async () => {
  setTestDb(null);
  await ctx.client.close();
});

async function setCutover(date: string | null) {
  await db
    .update(companies)
    .set({ invoiceCutoverDate: date })
    .where(eq(companies.id, companyId));
}

async function allInvoices() {
  return db.select().from(invoices).where(eq(invoices.companyId, companyId));
}

async function byNumber(number: string) {
  const [row] = await db
    .select()
    .from(invoices)
    .where(and(eq(invoices.companyId, companyId), eq(invoices.number, number)));
  return row;
}

async function draftsOf(batchId: string) {
  return db
    .select()
    .from(invoiceImportDrafts)
    .where(eq(invoiceImportDrafts.batchId, batchId));
}

const SAMPLE = [
  HEAD,
  "OLD-1,Jane,Acme Ltd,jane@acme.example,01/02/2020,15/02/2020,Ancient work,100.00,20.00,paid,120.00,10/02/2020,BANK-1",
  "OLD-2,Jane,Acme Ltd,jane@acme.example,01/03/2026,15/03/2026,Open debt,200.00,40.00,sent,,,",
  "NEW-1,Bob,,bob@studio.example,01/05/2026,15/05/2026,This year,300.00,60.00,sent,100.00,20/05/2026,PART",
].join("\n");

describe("importing invoices", () => {
  it("brings in old paid history, as brought-forward", async () => {
    await importCsv(SAMPLE);
    const old = await byNumber("OLD-1");
    expect(old).toMatchObject({
      status: "paid",
      source: "import",
      broughtForward: true,
      chaseEnabled: false,
      sentAt: null,
      grossPence: 12_000,
    });
    expect(old.paidAt?.toISOString().slice(0, 10)).toBe("2020-02-10");
  });

  it("only adds invoices from the cutover onwards to the accounts", async () => {
    await importCsv(SAMPLE);
    const pnl = await getProfitAndLoss(companyId, "2020-01-01", "2026-12-31");
    expect(pnl.incomePence).toBe(30_000);
    const vat = await getVatSummary(companyId, "2020-01-01", "2026-12-31");
    expect(vat.vatOnSalesPence).toBe(6_000);
  });

  it("records payments on the source date and keeps part-paid invoices open", async () => {
    await importCsv(SAMPLE);
    const inv = await byNumber("NEW-1");
    expect(inv.status).toBe("sent");
    const [payment] = await db
      .select()
      .from(payments)
      .where(eq(payments.invoiceId, inv.id));
    expect(payment).toMatchObject({
      amountPence: 10_000,
      method: "import",
      reference: "PART",
    });
    expect(payment.receivedAt.toISOString().slice(0, 10)).toBe("2026-05-20");
  });

  it("keeps real lines with mixed VAT", async () => {
    await importCsv(
      [
        "invoice number,client name,issue date,description,quantity,unit price,vat rate",
        "M-1,Acme,01/05/2026,Design,1,100.00,20",
        "M-1,Acme,01/05/2026,Print,1,100.00,0",
      ].join("\n"),
    );
    const inv = await byNumber("M-1");
    const lines = await db
      .select()
      .from(invoiceLineItems)
      .where(eq(invoiceLineItems.invoiceId, inv.id));
    expect(lines.map((l) => l.vatRate).sort()).toEqual([0, 20]);
    expect(inv.vatPence).toBe(2_000);
  });

  it("doesn't email or queue anything", async () => {
    await importCsv(SAMPLE);
    await enqueueOverdueReminders();
    expect(sendEmail).not.toHaveBeenCalled();
    expect(await db.select().from(sendJobs)).toEqual([]);
  });

  it("creates each client once, even without an email", async () => {
    await importCsv(
      [
        "invoice number,client name,issue date,description,net",
        "A-1,No Email Ltd,01/05/2026,W,10.00",
        "A-2,NO EMAIL LTD,01/05/2026,W,10.00",
      ].join("\n"),
    );
    const rows = await db.select().from(clients).where(eq(clients.companyId, companyId));
    expect(rows).toHaveLength(1);
  });

  it("links to an existing client without overwriting it", async () => {
    const [existing] = await db
      .insert(clients)
      .values({ companyId, name: "Original", email: "jane@acme.example", notes: "Keep" })
      .returning();
    await importCsv(
      [
        "invoice number,client name,client email,issue date,description,net",
        "L-1,Renamed,JANE@acme.example,01/05/2026,W,10.00",
      ].join("\n"),
    );
    expect((await byNumber("L-1")).clientId).toBe(existing.id);
    const [after] = await db.select().from(clients).where(eq(clients.id, existing.id));
    expect(after).toMatchObject({ name: "Original", notes: "Keep" });
  });

  it("doesn't link on a merely similar name until the user chooses", async () => {
    const [existing] = await db
      .insert(clients)
      .values({ companyId, name: "Northern Widgets" })
      .returning();
    const csv = "invoice number,client name,issue date,description,net\nS-1,Northern Widget,01/05/2026,W,10.00";
    const batchId = await stageCsv(csv);
    const review = await getImportBatchReview(companyId, batchId);
    expect(review?.clients[0].suggestion).toMatchObject({ clientId: existing.id, preselect: false });
    expect(review?.clients[0].resolution).toBeNull();

    const key = review!.clients[0].key;
    expect((await setImportClientResolution(batchId, key, existing.id)).ok).toBe(true);
    await commitAll(batchId);
    expect((await byNumber("S-1")).clientId).toBe(existing.id);
  });
});

describe("numbering", () => {
  it("keeps source numbers verbatim, whatever the format", async () => {
    await importCsv("number,client name,issue date,description,net\nSI/2019-a#7,Acme,01/05/2026,W,10.00");
    expect(await byNumber("SI/2019-a#7")).toBeDefined();
  });

  it("gives blank numbers an IMP- number without using the legal series", async () => {
    const batchId = await importCsv(
      "number,client name,issue date,description,net\n,Acme,01/05/2026,W,10.00",
    );
    const [inv] = await allInvoices();
    expect(inv.number).toBe(`IMP-${batchId.slice(0, 8)}-1`);
    const number = await db.transaction((tx) =>
      allocateInvoiceNumber(tx as never, companyId, "2026-06-01"),
    );
    expect(number).toBe("DD-2026-0001");
  });

  it("moves each year's series past numbers in the company's format", async () => {
    await importCsv(
      [
        "number,client name,issue date,description,net",
        "DD-2025-0005,Acme,01/05/2025,W,10.00",
        "DD-2026-0010,Acme,01/05/2026,W,10.00",
        "INV-0099,Acme,01/05/2026,W,10.00",
      ].join("\n"),
    );
    const allocate = (date: string) =>
      db.transaction((tx) => allocateInvoiceNumber(tx as never, companyId, date));
    expect(await allocate("2025-07-01")).toBe("DD-2025-0006");
    expect(await allocate("2026-07-01")).toBe("DD-2026-0011");
  });

  it("won't set the next number below what's been used", async () => {
    const year = new Date().getFullYear();
    await importCsv(
      `number,client name,issue date,description,net\nDD-${year}-0010,Acme,01/05/${year},W,10.00`,
    );
    expect((await setNextInvoiceSequence(5)).ok).toBe(false);
    expect((await setNextInvoiceSequence(50)).ok).toBe(true);
    const [series] = await db
      .select()
      .from(documentSequences)
      .where(
        and(eq(documentSequences.companyId, companyId), eq(documentSequences.year, year)),
      );
    expect(series.nextSeq).toBe(50);
  });

  it("sets the next number before any invoice exists this year", async () => {
    expect((await setNextInvoiceSequence(200)).ok).toBe(true);
    const year = new Date().getFullYear();
    const number = await db.transaction((tx) =>
      allocateInvoiceNumber(tx as never, companyId, `${year}-06-01`),
    );
    expect(number).toBe(`DD-${year}-0200`);
  });
});

describe("duplicates", () => {
  const csv = "number,client name,issue date,description,net\nD-1,Acme,01/05/2026,W,10.00";

  it("skips an invoice that's already in Alfa", async () => {
    await importCsv(csv);
    const batchId = await stageCsv(csv);
    expect(await draftsOf(batchId)).toHaveLength(0);
    const review = await getImportBatchReview(companyId, batchId);
    expect(review?.batch.skippedRows[0]).toMatchObject({
      number: "D-1",
      reason: "Already in Alfa",
    });
  });

  it("blocks the same number with different details", async () => {
    await importCsv(csv);
    const batchId = await stageCsv(
      "number,client name,issue date,description,net\nd-1,Acme,01/05/2026,W,99.00",
    );
    const [draft] = await draftsOf(batchId);
    expect(draft.status).toBe("needs_review");
    expect((await commitInvoiceImportChunk(batchId)).ok).toBe(false);

    await setImportDraftsSkipped(batchId, { allWithErrors: true }, true);
    await commitAll(batchId);
    expect(await allInvoices()).toHaveLength(1);
  });

  it("catches a number taken between staging and saving", async () => {
    const batchId = await stageCsv(csv);
    await importCsv(csv);
    const result = await commitInvoiceImportChunk(batchId);
    expect(result.ok).toBe(false);
    const [draft] = await draftsOf(batchId);
    expect(draft.status).toBe("needs_review");
  });
});

describe("saving safely", () => {
  it("needs a cutover first", async () => {
    await setCutover(null);
    const batchId = await stageCsv(SAMPLE);
    const result = await commitInvoiceImportChunk(batchId);
    expect(result.ok).toBe(false);
    expect(await allInvoices()).toHaveLength(0);
  });

  it("uses only what was staged on the server", async () => {
    const batchId = await stageCsv(SAMPLE);
    await db
      .update(invoiceImportDrafts)
      .set({ status: "skipped" })
      .where(eq(invoiceImportDrafts.batchId, batchId));
    await commitAll(batchId);
    expect(await allInvoices()).toHaveLength(0);
  });

  it("commits in chunks and carries on after a partial run", async () => {
    const rows = Array.from(
      { length: 130 },
      (_, i) => `C-${i},Acme,01/05/2026,W,10.00`,
    );
    const batchId = await stageCsv(
      ["number,client name,issue date,description,net", ...rows].join("\n"),
    );
    const first = await commitInvoiceImportChunk(batchId);
    expect(first).toMatchObject({ ok: true, committed: 100, remaining: 30 });
    expect(await allInvoices()).toHaveLength(100);

    const second = await commitInvoiceImportChunk(batchId);
    expect(second).toMatchObject({ ok: true, committed: 30, remaining: 0 });
    expect(await allInvoices()).toHaveLength(130);
    const clientRows = await db.select().from(clients).where(eq(clients.companyId, companyId));
    expect(clientRows).toHaveLength(1);
  });

  it("refuses a counted invoice in a locked period, but not a brought-forward one", async () => {
    await db
      .update(companies)
      .set({ booksLockedThrough: "2026-04-30" })
      .where(eq(companies.id, companyId));
    const old = "number,client name,issue date,description,net\nB-1,Acme,01/02/2026,W,10.00";
    await importCsv(old);
    expect((await byNumber("B-1")).broughtForward).toBe(true);

    const counted = await stageCsv(
      "number,client name,issue date,description,net\nB-2,Acme,15/04/2026,W,10.00",
    );
    const result = await commitInvoiceImportChunk(counted);
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error).toContain("locked");
  });

  it("checks a counted invoice's paid date against the lock", async () => {
    await db
      .update(companies)
      .set({ booksLockedThrough: "2026-04-30" })
      .where(eq(companies.id, companyId));
    const batchId = await stageCsv(
      "number,client name,issue date,description,net,amount paid,paid date\nB-3,Acme,01/02/2026,W,10.00,5.00,20/04/2026",
    );
    expect((await commitInvoiceImportChunk(batchId)).ok).toBe(false);
  });

  it("records what was imported in the audit log", async () => {
    const batchId = await importCsv(SAMPLE);
    const [audit] = await db
      .select()
      .from(auditLog)
      .where(eq(auditLog.action, "invoice_import.commit"));
    expect(audit.entityId).toBe(batchId);
    expect((audit.meta as { invoiceIds: string[] }).invoiceIds).toHaveLength(3);
  });
});

describe("permissions and tenancy", () => {
  it("needs write access", async () => {
    await db.update(users).set({ role: "accountant" }).where(eq(users.id, userId));
    const form = new FormData();
    form.set("csv", new File([SAMPLE], "a.csv"));
    form.set("mapping", JSON.stringify({ issueDate: "issue date", clientName: "client name", net: "net" }));
    expect((await stageInvoiceImport(form)).ok).toBe(false);
  });

  it("can't reach another company's import", async () => {
    const batchId = await stageCsv(SAMPLE);
    const other = await seedCompany(db, { name: "Other" });
    await db.update(users).set({ companyId: other.id }).where(eq(users.id, userId));
    await db
      .update(companies)
      .set({ invoiceCutoverDate: CUTOVER })
      .where(eq(companies.id, other.id));

    expect((await commitInvoiceImportChunk(batchId)).ok).toBe(false);
    expect((await undoInvoiceImport(batchId)).ok).toBe(false);
    expect((await discardInvoiceImport(batchId)).ok).toBe(false);
    expect(await getImportBatchReview(other.id, batchId)).toBeNull();
  });
});

describe("undo", () => {
  it("removes the invoices and the clients it created", async () => {
    const batchId = await importCsv(SAMPLE);
    const result = await undoInvoiceImport(batchId);
    expect(result).toMatchObject({ ok: true, removed: 3, kept: [] });
    expect(await allInvoices()).toHaveLength(0);
    expect(await db.select().from(clients).where(eq(clients.companyId, companyId))).toHaveLength(0);
    const [batch] = await db
      .select()
      .from(invoiceImportBatches)
      .where(eq(invoiceImportBatches.id, batchId));
    expect(batch.status).toBe("undone");
  });

  it("keeps clients that existed before", async () => {
    await db
      .insert(clients)
      .values({ companyId, name: "Jane", email: "jane@acme.example" });
    const batchId = await importCsv(SAMPLE);
    await undoInvoiceImport(batchId);
    const rows = await db.select().from(clients).where(eq(clients.companyId, companyId));
    expect(rows.map((c) => c.email)).toEqual(["jane@acme.example"]);
  });

  it("keeps invoices with real activity, and their clients", async () => {
    const batchId = await importCsv(SAMPLE);
    const paid = await byNumber("OLD-2");
    await db.insert(payments).values({
      invoiceId: paid.id,
      amountPence: 500,
      receivedAt: new Date(),
      method: "bank",
    });
    const credited = await byNumber("NEW-1");
    await db.insert(creditNotes).values({
      companyId,
      invoiceId: credited.id,
      clientId: credited.clientId,
      number: "CN-1",
      issueDate: "2026-06-01",
      reason: "Overcharged",
    });

    const result = await undoInvoiceImport(batchId);

    expect(result.ok && result.removed).toBe(1);
    expect(result.ok && result.kept.map((k) => k.number).sort()).toEqual(["NEW-1", "OLD-2"]);
    expect(await byNumber("OLD-1")).toBeUndefined();
    const [batch] = await db
      .select()
      .from(invoiceImportBatches)
      .where(eq(invoiceImportBatches.id, batchId));
    expect(batch.status).toBe("committed");
  });

  it("keeps a counted invoice in a locked period", async () => {
    const batchId = await importCsv(SAMPLE);
    await db
      .update(companies)
      .set({ booksLockedThrough: "2026-05-31" })
      .where(eq(companies.id, companyId));
    const result = await undoInvoiceImport(batchId);
    expect(result.ok && result.kept.map((k) => k.number)).toEqual(["NEW-1"]);
  });
});

describe("undo and the period lock", () => {
  const lock = (date: string) =>
    db
      .update(companies)
      .set({ booksLockedThrough: date })
      .where(eq(companies.id, companyId));

  it("keeps a brought-forward invoice whose payment from cutover is locked", async () => {
    const batchId = await importCsv(
      [
        "number,client name,issue date,description,net,amount paid,paid date",
        "U-1,Acme,01/02/2026,W,10.00,5.00,20/04/2026",
        "U-2,Acme,01/02/2026,W,10.00,5.00,20/03/2026",
      ].join("\n"),
    );
    await lock("2026-04-30");
    const result = await undoInvoiceImport(batchId);
    // U-2's payment predates cutover, so it moved no figures and can go.
    expect(result.ok && result.kept.map((k) => k.number)).toEqual(["U-1"]);
    expect(result.ok && result.removed).toBe(1);
  });

  it("keeps a counted invoice whose paid date is locked, though issued after", async () => {
    await lock("2026-05-31");
    const batchId = await importCsv(
      [
        "number,client name,issue date,description,net",
        "U-3,Acme,01/06/2026,W,10.00",
      ].join("\n"),
    );
    await db.insert(payments).values({
      invoiceId: (await byNumber("U-3")).id,
      amountPence: 100,
      receivedAt: new Date("2026-05-20T12:00:00Z"),
      method: "import",
    });
    const result = await undoInvoiceImport(batchId);
    expect(result.ok && result.kept.map((k) => k.number)).toEqual(["U-3"]);
  });
});

describe("discarding", () => {
  it("removes staged drafts", async () => {
    const batchId = await stageCsv(SAMPLE);
    expect((await discardInvoiceImport(batchId)).ok).toBe(true);
    expect(await draftsOf(batchId)).toHaveLength(0);
    expect((await commitInvoiceImportChunk(batchId)).ok).toBe(false);
  });

  it("is refused once part of the import is saved", async () => {
    const rows = Array.from({ length: 101 }, (_, i) => `C-${i},Acme,01/05/2026,W,10.00`);
    const batchId = await stageCsv(
      ["number,client name,issue date,description,net", ...rows].join("\n"),
    );
    await commitInvoiceImportChunk(batchId);
    expect((await discardInvoiceImport(batchId)).ok).toBe(false);
  });
});
