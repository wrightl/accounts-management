import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";
import { createTestDb, type TestDatabase } from "@/db/pglite";
import { setTestDb, type Database } from "@/db";
import {
  auditLog,
  bankAccounts,
  bankTransactions,
  clients,
  companies,
  invoiceImportBatches,
  invoiceImportDrafts,
  invoicePdfReads,
  invoices,
  payments,
  reconciliationMatches,
  users,
} from "@/db/schema";
import {
  approveImportDrafts,
  createPdfImportBatch,
  findImportDraftBankMatches,
  updateImportDraft,
  uploadInvoicePdf,
} from "@/actions/invoice-import-pdf";
import {
  commitInvoiceImportChunk,
  discardInvoiceImport,
  setImportDraftsSkipped,
  undoInvoiceImport,
} from "@/actions/invoice-import";
import { GET as draftDocument } from "@/app/api/invoice-imports/drafts/[id]/document/route";
import { deleteCompanyById } from "@/lib/companies/delete";
import { todayIsoDate } from "@/lib/dates";
import { getImportBatchReview } from "@/lib/invoices/import/queries";
import { purgeAbandonedImports } from "@/lib/invoices/import/purge";
import { getStorage } from "@/lib/storage";
import { commitAll } from "@/lib/test/import-invoices";
import { seedCompany } from "@/lib/test/seed-company";

const { generateText, readLocally, ai } = vi.hoisted(() => ({
  generateText: vi.fn(),
  readLocally: vi.fn(),
  ai: { on: true },
}));

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
vi.mock("ai", () => ({
  generateText,
  Output: { object: (opts: unknown) => opts },
}));
vi.mock("@/lib/ai/models", () => ({
  aiGatewayConfigured: () => ai.on,
  INVOICE_EXTRACT_MODEL: "test/model",
}));
vi.mock("@/lib/invoices/import/pdf-local", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/invoices/import/pdf-local")>()),
  readInvoicePdfLocally: readLocally,
}));

const reading = {
  issuerName: "Test Co",
  issuerVatNumber: null,
  invoiceCount: 1,
  number: "PDF-1",
  issueDate: "2026-02-01",
  dueDate: "2026-03-01",
  clientName: "Jane",
  clientCompany: "Acme Ltd",
  clientEmail: "jane@acme.example",
  clientAddress: "1 High St",
  currency: "GBP",
  netPounds: "100.00",
  vatPounds: "20.00",
  grossPounds: "120.00",
  amountPaidPounds: null,
  paidDate: null,
  lines: [
    {
      description: "Work",
      quantity: 1,
      unitPricePounds: "100.00",
      discountPercent: null,
      vatRate: 20,
      lineNetPounds: "100.00",
    },
  ],
};

let ctx: Awaited<ReturnType<typeof createTestDb>>;
let db: TestDatabase;
let companyId: string;
let fileCount = 0;

beforeEach(async () => {
  ctx = await createTestDb();
  db = ctx.db;
  setTestDb(db as unknown as Database);
  companyId = (await seedCompany(db, { name: "Test Co", invoiceCutoverDate: "2026-04-01" })).id;
  await db.insert(users).values({
    companyId,
    clerkUserId: "user_clerk_1",
    email: "owner@example.com",
    name: "Owner",
    role: "admin",
  });
  generateText.mockReset();
  generateText.mockResolvedValue({ output: reading, usage: {} });
  ai.on = true;
  readLocally.mockReset();
  readLocally.mockRejectedValue(new Error("No text found in the PDF"));
});

afterEach(async () => {
  setTestDb(null);
  await ctx.client.close();
});

function pdf(content = `%PDF-1.4 file ${++fileCount}`) {
  const form = new FormData();
  form.set("document", new File([content], "invoice.pdf"));
  return form;
}

async function newBatch() {
  const batch = await createPdfImportBatch();
  if (!batch.ok) throw new Error(batch.error);
  return batch.id;
}

async function upload(batchId: string, form = pdf()) {
  const result = await uploadInvoicePdf(batchId, form);
  if (!result.ok) throw new Error(result.error);
  const [draft] = await db
    .select()
    .from(invoiceImportDrafts)
    .where(eq(invoiceImportDrafts.id, result.id));
  return draft;
}

describe("uploading a PDF", () => {
  it("drafts what it reads but saves no invoice", async () => {
    const draft = await upload(await newBatch());
    expect(draft.status).toBe("needs_review");
    expect(draft.errors).toEqual([]);
    expect(draft.parsed).toMatchObject({ number: "PDF-1", grossPence: 12_000 });
    expect(await db.select().from(invoices)).toEqual([]);
  });

  it("leaves an editable draft when neither the model nor the local read can read it", async () => {
    generateText.mockRejectedValue(new Error("model down"));
    const draft = await upload(await newBatch());
    expect(readLocally).toHaveBeenCalled();
    expect(draft.errors.join()).toContain("couldn't read");
    expect(draft.documentPath).toBeTruthy();
  });

  it("reads locally when the model fails, and says so", async () => {
    generateText.mockRejectedValue(new Error("model down"));
    readLocally.mockResolvedValue({ ...reading, issuerName: null, lines: [] });
    const draft = await upload(await newBatch());
    expect(draft.parsed).toMatchObject({ number: "PDF-1", grossPence: 12_000 });
    expect(draft.warnings.join()).toContain("Read without AI");
  });

  it("doesn't count a failed AI read against the allowance", async () => {
    generateText.mockRejectedValue(new Error("model down"));
    await upload(await newBatch());
    const [row] = await db.select().from(invoicePdfReads).where(eq(invoicePdfReads.companyId, companyId));
    expect(row.reads).toBe(0);
  });

  it("gives the local read only the time left in the request", async () => {
    generateText.mockRejectedValue(new Error("timed out"));
    await upload(await newBatch());
    const [, budget] = readLocally.mock.calls[0];
    expect(budget).toBeGreaterThan(0);
    expect(budget).toBeLessThanOrEqual(55_000);
  });

  it("reads locally with no AI call when AI isn't set up", async () => {
    ai.on = false;
    readLocally.mockResolvedValue({ ...reading, issuerName: null, lines: [] });
    const draft = await upload(await newBatch());
    expect(generateText).not.toHaveBeenCalled();
    expect(draft.parsed).toMatchObject({ number: "PDF-1" });
    expect(draft.warnings.join()).toContain("Read without AI");
    const reads = await db.select().from(invoicePdfReads);
    expect(reads).toEqual([]);
  });

  it("leaves an editable draft when the model's answer is unusable", async () => {
    generateText.mockResolvedValue({ output: { ...reading, lines: [], netPounds: "nonsense", grossPounds: null, vatPounds: null, issueDate: null }, usage: {} });
    const draft = await upload(await newBatch());
    expect(draft.status).toBe("needs_review");
    expect(draft.errors.length).toBeGreaterThan(0);
  });

  it("makes no AI call for a file it has seen", async () => {
    const batchId = await newBatch();
    await upload(batchId, pdf("%PDF-1.4 same"));
    generateText.mockClear();
    const again = await uploadInvoicePdf(batchId, pdf("%PDF-1.4 same"));
    expect(again.ok).toBe(false);
    expect(generateText).not.toHaveBeenCalled();
  });

  it("rejects a file that isn't a PDF, with no AI call", async () => {
    const batchId = await newBatch();
    const form = new FormData();
    form.set("document", new File(["<html>not a pdf here</html>"], "x.pdf"));
    expect((await uploadInvoicePdf(batchId, form)).ok).toBe(false);
    expect(generateText).not.toHaveBeenCalled();
  });

  it("reads locally at the monthly limit, with no AI call", async () => {
    const batchId = await newBatch();
    await db.insert(invoicePdfReads).values({
      companyId,
      month: todayIsoDate().slice(0, 7),
      reads: 25,
    });
    readLocally.mockResolvedValue({ ...reading, issuerName: null, lines: [] });
    const draft = await upload(batchId);
    expect(generateText).not.toHaveBeenCalled();
    expect(draft.warnings.join()).toContain("25 AI reads are used up");
  });

  it("doesn't win back allowance by discarding", async () => {
    await db.insert(invoicePdfReads).values({
      companyId,
      month: todayIsoDate().slice(0, 7),
      reads: 24,
    });
    const first = await newBatch();
    await upload(first);
    await discardInvoiceImport(first);
    generateText.mockClear();
    await uploadInvoicePdf(await newBatch(), pdf());
    expect(generateText).not.toHaveBeenCalled();
    expect(readLocally).toHaveBeenCalledTimes(1);
  });

  it("can't exceed the limit with parallel uploads", async () => {
    await db.insert(invoicePdfReads).values({
      companyId,
      month: todayIsoDate().slice(0, 7),
      reads: 24,
    });
    const batchId = await newBatch();
    const results = await Promise.all([
      uploadInvoicePdf(batchId, pdf()),
      uploadInvoicePdf(batchId, pdf()),
    ]);
    expect(results.every((r) => r.ok)).toBe(true);
    expect(generateText).toHaveBeenCalledTimes(1);
    expect(readLocally).toHaveBeenCalledTimes(1);
  });

  it("doesn't count a duplicate against the limit", async () => {
    const batchId = await newBatch();
    await upload(batchId, pdf("%PDF-1.4 once"));
    await uploadInvoicePdf(batchId, pdf("%PDF-1.4 once"));
    const [row] = await db.select().from(invoicePdfReads).where(eq(invoicePdfReads.companyId, companyId));
    expect(row.reads).toBe(1);
  });

  it("warns when another business issued it", async () => {
    generateText.mockResolvedValue({
      output: { ...reading, issuerName: "Some Supplier Ltd" },
      usage: {},
    });
    const draft = await upload(await newBatch());
    expect(draft.warnings.join()).toContain("bill you received");
  });

  it("blocks a file holding several invoices, and non-GBP", async () => {
    generateText.mockResolvedValue({
      output: { ...reading, invoiceCount: 3, currency: "EUR" },
      usage: {},
    });
    const draft = await upload(await newBatch());
    expect(draft.errors.join()).toContain("several invoices");
    expect(draft.errors.join()).toContain("EUR");
  });
});

describe("uploading the same file again", () => {
  it("allows a file held by an import that was never saved", async () => {
    await upload(await newBatch(), pdf("%PDF-1.4 abandoned"));
    const again = await uploadInvoicePdf(await newBatch(), pdf("%PDF-1.4 abandoned"));
    expect(again.ok).toBe(true);
  });

  it("refuses it once it's on a saved invoice", async () => {
    const batchId = await newBatch();
    const draft = await upload(batchId, pdf("%PDF-1.4 saved"));
    await approveImportDrafts(batchId, { draftId: draft.id });
    await commitAll(batchId);
    const again = await uploadInvoicePdf(await newBatch(), pdf("%PDF-1.4 saved"));
    expect(again).toMatchObject({ ok: false, error: expect.stringContaining("already attached to invoice") });
  });

  it("won't save the same file from two open imports", async () => {
    const first = await newBatch();
    const a = await upload(first, pdf("%PDF-1.4 twice"));
    generateText.mockResolvedValue({ output: { ...reading, number: "PDF-2" }, usage: {} });
    const second = await newBatch();
    const b = await upload(second, pdf("%PDF-1.4 twice"));
    await approveImportDrafts(first, { draftId: a.id });
    await approveImportDrafts(second, { draftId: b.id });
    await commitAll(first);

    const result = await commitInvoiceImportChunk(second);
    expect(result).toMatchObject({ ok: false, error: expect.stringContaining("already attached to invoice PDF-1") });
    expect(await db.select().from(invoices)).toHaveLength(1);
  });
});

describe("reviewing", () => {
  it("needs explicit approval before saving", async () => {
    const batchId = await newBatch();
    await upload(batchId);
    expect((await commitInvoiceImportChunk(batchId)).ok).toBe(false);
    expect(await db.select().from(invoices)).toEqual([]);
  });

  it("won't approve a draft with problems", async () => {
    generateText.mockResolvedValue({ output: { ...reading, grossPounds: "999.00" }, usage: {} });
    const batchId = await newBatch();
    const draft = await upload(batchId);
    expect((await approveImportDrafts(batchId, { draftId: draft.id })).ok).toBe(false);
  });

  it("re-checks after an edit, which must be approved again", async () => {
    const batchId = await newBatch();
    const draft = await upload(batchId);
    await approveImportDrafts(batchId, { draftId: draft.id });

    await updateImportDraft(batchId, draft.id, { ...draft.parsed, grossPence: 1 });
    let [row] = await db.select().from(invoiceImportDrafts).where(eq(invoiceImportDrafts.id, draft.id));
    expect(row.status).toBe("needs_review");
    expect(row.errors.join()).toContain("Gross total");

    await updateImportDraft(batchId, draft.id, draft.parsed);
    [row] = await db.select().from(invoiceImportDrafts).where(eq(invoiceImportDrafts.id, draft.id));
    expect(row.errors).toEqual([]);
    expect(row.status).toBe("needs_review");
  });

  it("rejects a malformed edit from the browser", async () => {
    const batchId = await newBatch();
    const draft = await upload(batchId);
    const bad = [
      { ...draft.parsed, netPence: 1.5 },
      { ...draft.parsed, grossPence: "120" },
      { ...draft.parsed, lines: [] },
      { ...draft.parsed, lines: [{ ...draft.parsed.lines[0], vatRate: 500 }] },
    ];
    for (const edit of bad) {
      expect((await updateImportDraft(batchId, draft.id, edit as never)).ok).toBe(false);
    }
  });

  it("works out the status itself, ignoring what the browser sends", async () => {
    const batchId = await newBatch();
    const draft = await upload(batchId);
    await updateImportDraft(batchId, draft.id, { ...draft.parsed, status: "paid" });
    const [row] = await db.select().from(invoiceImportDrafts).where(eq(invoiceImportDrafts.id, draft.id));
    expect(row.parsed.status).toBe("sent");
    expect(row.errors).toEqual([]);
  });

  it("flags a paid date with nothing paid, and dates that don't exist", async () => {
    const batchId = await newBatch();
    const draft = await upload(batchId);
    await updateImportDraft(batchId, draft.id, {
      ...draft.parsed,
      paidDate: "2026-02-31",
    });
    const [row] = await db.select().from(invoiceImportDrafts).where(eq(invoiceImportDrafts.id, draft.id));
    expect(row.errors.join()).toContain("Paid date isn't a real date");
    expect(row.errors.join()).toContain("no amount paid");
    expect((await approveImportDrafts(batchId, { draftId: draft.id })).ok).toBe(false);
  });

  it("approves all without problems, leaving the rest", async () => {
    const batchId = await newBatch();
    await upload(batchId);
    generateText.mockResolvedValue({
      output: { ...reading, number: "PDF-2", grossPounds: "1.00" },
      usage: {},
    });
    await upload(batchId);
    await approveImportDrafts(batchId, { allWithoutProblems: true });
    const review = await getImportBatchReview(companyId, batchId);
    expect(review?.counts).toMatchObject({ ready: 1, needs_review: 1 });
  });

  it("never bulk-approves a draft read without AI, but approves it on its own", async () => {
    const batchId = await newBatch();
    await upload(batchId);
    ai.on = false;
    readLocally.mockResolvedValue({ ...reading, number: "PDF-2", issuerName: null, lines: [] });
    const local = await upload(batchId);
    expect(local.errors).toEqual([]);

    expect((await getImportBatchReview(companyId, batchId))?.approvable).toBe(1);
    await approveImportDrafts(batchId, { allWithoutProblems: true });
    expect((await getImportBatchReview(companyId, batchId))?.counts).toMatchObject({
      ready: 1,
      needs_review: 1,
    });

    await approveImportDrafts(batchId, { draftId: local.id });
    expect((await getImportBatchReview(companyId, batchId))?.counts).toMatchObject({ ready: 2 });
  });

  it("uses the same duplicate check as CSV", async () => {
    const batchId = await newBatch();
    const draft = await upload(batchId);
    await approveImportDrafts(batchId, { draftId: draft.id });
    await commitAll(batchId);

    const second = await newBatch();
    const again = await upload(second);
    expect(again.errors.join()).toContain("already in Alfa");
  });
});

describe("saving", () => {
  it("keeps the PDF as the invoice's original, brought forward as usual", async () => {
    const batchId = await newBatch();
    const draft = await upload(batchId);
    await approveImportDrafts(batchId, { draftId: draft.id });
    await commitAll(batchId);

    const [invoice] = await db.select().from(invoices).where(eq(invoices.number, "PDF-1"));
    expect(invoice).toMatchObject({
      source: "import",
      broughtForward: true,
      chaseEnabled: false,
      originalDocumentPath: draft.documentPath,
      originalDocumentSha256: draft.documentSha256,
    });
    await expect(getStorage().get(draft.documentPath!)).resolves.toBeDefined();
  });

  it("deletes files for drafts left out", async () => {
    const batchId = await newBatch();
    const kept = await upload(batchId);
    generateText.mockResolvedValue({ output: { ...reading, number: "PDF-2" }, usage: {} });
    const dropped = await upload(batchId);
    await setImportDraftsSkipped(batchId, { draftId: dropped.id }, true);
    await approveImportDrafts(batchId, { draftId: kept.id });
    await commitAll(batchId);
    await expect(getStorage().get(dropped.documentPath!)).rejects.toThrow();
    await expect(getStorage().get(kept.documentPath!)).resolves.toBeDefined();
  });
});

describe("clean-up", () => {
  it("deletes the file when discarded", async () => {
    const batchId = await newBatch();
    const draft = await upload(batchId);
    expect((await discardInvoiceImport(batchId)).ok).toBe(true);
    await expect(getStorage().get(draft.documentPath!)).rejects.toThrow();
  });

  it("clears out imports abandoned for 30 days", async () => {
    const old = await newBatch();
    const oldDraft = await upload(old);
    await db
      .update(invoiceImportBatches)
      .set({ createdAt: new Date(Date.now() - 31 * 86_400_000) })
      .where(eq(invoiceImportBatches.id, old));
    generateText.mockResolvedValue({ output: { ...reading, number: "PDF-3" }, usage: {} });
    const recent = await newBatch();
    const recentDraft = await upload(recent);

    expect(await purgeAbandonedImports()).toBe(1);

    await expect(getStorage().get(oldDraft.documentPath!)).rejects.toThrow();
    await expect(getStorage().get(recentDraft.documentPath!)).resolves.toBeDefined();
    const [batch] = await db.select().from(invoiceImportBatches).where(eq(invoiceImportBatches.id, old));
    expect(batch.status).toBe("discarded");
    const audits = await db.select().from(auditLog).where(and(eq(auditLog.action, "invoice_import.discard"), eq(auditLog.entityId, old)));
    expect(audits).toHaveLength(1);
  });

  it("leaves a partly saved import alone", async () => {
    const batchId = await newBatch();
    const draft = await upload(batchId);
    await db
      .update(invoiceImportDrafts)
      .set({ status: "committed" })
      .where(eq(invoiceImportDrafts.id, draft.id));
    await db
      .update(invoiceImportBatches)
      .set({ createdAt: new Date(Date.now() - 31 * 86_400_000) })
      .where(eq(invoiceImportBatches.id, batchId));
    expect(await purgeAbandonedImports()).toBe(0);
  });

  it("removes draft files when the company is deleted", async () => {
    const other = await seedCompany(db, { name: "Closing Co" });
    const [batch] = await db
      .insert(invoiceImportBatches)
      .values({ companyId: other.id, kind: "pdf" })
      .returning();
    const path = `invoice-imports/${other.id}/doc.pdf`;
    await getStorage().put(path, Buffer.from("%PDF-1.4 x"), "application/pdf");
    await db.insert(invoiceImportDrafts).values({
      batchId: batch.id,
      companyId: other.id,
      position: 0,
      status: "needs_review",
      parsed: {} as never,
      documentPath: path,
    });
    expect((await deleteCompanyById(other.id, "Closing Co")).ok).toBe(true);
    await expect(getStorage().get(path)).rejects.toThrow();
  });
});

describe("tenancy", () => {
  it("won't serve or change another company's draft", async () => {
    const other = await seedCompany(db, { name: "Other" });
    const [batch] = await db
      .insert(invoiceImportBatches)
      .values({ companyId: other.id, kind: "pdf" })
      .returning();
    const path = `invoice-imports/${other.id}/doc.pdf`;
    await getStorage().put(path, Buffer.from("%PDF-1.4 x"), "application/pdf");
    const [draft] = await db
      .insert(invoiceImportDrafts)
      .values({
        batchId: batch.id,
        companyId: other.id,
        position: 0,
        status: "needs_review",
        parsed: reading as never,
        documentPath: path,
      })
      .returning();

    const res = await draftDocument(new Request("http://test/"), {
      params: Promise.resolve({ id: draft.id }),
    });
    expect(res.status).toBe(404);
    expect((await uploadInvoicePdf(batch.id, pdf())).ok).toBe(false);
    expect((await updateImportDraft(batch.id, draft.id, reading as never)).ok).toBe(false);
    expect((await approveImportDrafts(batch.id, { draftId: draft.id })).ok).toBe(false);
  });

  it("serves your own draft, framed only by this site", async () => {
    const draft = await upload(await newBatch());
    const res = await draftDocument(new Request("http://test/"), {
      params: Promise.resolve({ id: draft.id }),
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Security-Policy")).toBe("frame-ancestors 'self'");
    expect(res.headers.get("Content-Type")).toBe("application/pdf");
  });
});

describe("linking a bank payment", () => {
  async function credit(amountPence = 12_000, bookedAt = "2026-04-10") {
    const [account] = await db
      .insert(bankAccounts)
      .values({ companyId, name: "Starling", provider: "starling" })
      .returning();
    const [tx] = await db
      .insert(bankTransactions)
      .values({
        bankAccountId: account.id,
        externalId: `tx-${Math.random()}`,
        bookedAt,
        amountPence,
        counterparty: "ACME LTD",
        reference: "PDF-1",
      })
      .returning();
    return tx;
  }

  const paid = (parsed: typeof invoiceImportDrafts.$inferSelect["parsed"]) => ({
    ...parsed,
    amountPaidPence: parsed.grossPence,
    paidDate: "2026-04-01",
  });

  it("offers matching payments, then reconciles on save and unlinks on undo", async () => {
    const tx = await credit();
    await credit(5_000);
    const batchId = await newBatch();
    const draft = await upload(batchId);

    const found = await findImportDraftBankMatches(batchId, draft.id);
    expect(found.ok && found.matches.map((m) => m.bankTransactionId)).toEqual([tx.id]);

    expect(await updateImportDraft(batchId, draft.id, paid(draft.parsed), tx.id)).toMatchObject({ ok: true });
    const [row] = await db.select().from(invoiceImportDrafts).where(eq(invoiceImportDrafts.id, draft.id));
    expect(row.bankTransactionId).toBe(tx.id);
    expect(row.parsed.paidDate).toBe("2026-04-10");

    await approveImportDrafts(batchId, { draftId: draft.id });
    await commitAll(batchId);
    const [invoice] = await db.select().from(invoices);
    expect(invoice.status).toBe("paid");
    const [match] = await db.select().from(reconciliationMatches);
    expect(match).toMatchObject({
      bankTransactionId: tx.id,
      matchType: "invoice_payment",
      invoiceId: invoice.id,
      confirmed: true,
    });
    const [payment] = await db.select().from(payments);
    expect(match.paymentId).toBe(payment.id);

    expect((await undoInvoiceImport(batchId)).ok).toBe(true);
    expect(await db.select().from(invoices)).toEqual([]);
    expect(await db.select().from(reconciliationMatches)).toEqual([]);
  });

  it("refuses a payment for the wrong amount, one already reconciled, or an unpaid invoice", async () => {
    const wrong = await credit(5_000);
    const taken = await credit();
    await db.insert(reconciliationMatches).values({
      bankTransactionId: taken.id,
      matchType: "transfer",
      confirmed: true,
    });
    const fine = await credit();
    const batchId = await newBatch();
    const draft = await upload(batchId);

    expect((await updateImportDraft(batchId, draft.id, paid(draft.parsed), wrong.id)).ok).toBe(false);
    expect((await updateImportDraft(batchId, draft.id, paid(draft.parsed), taken.id)).ok).toBe(false);
    expect((await updateImportDraft(batchId, draft.id, draft.parsed, fine.id)).ok).toBe(false);
  });

  it("won't save if the payment was reconciled elsewhere after review", async () => {
    const tx = await credit();
    const batchId = await newBatch();
    const draft = await upload(batchId);
    await updateImportDraft(batchId, draft.id, paid(draft.parsed), tx.id);
    await approveImportDrafts(batchId, { draftId: draft.id });
    await db.insert(reconciliationMatches).values({
      bankTransactionId: tx.id,
      matchType: "transfer",
      confirmed: true,
    });

    const result = await commitInvoiceImportChunk(batchId);
    expect(result).toMatchObject({ ok: false, error: expect.stringContaining("already reconciled") });
    expect(await db.select().from(invoices)).toEqual([]);
  });
});

describe("the client on a draft", () => {
  it("can't be changed by editing the draft", async () => {
    const batchId = await newBatch();
    const draft = await upload(batchId);
    await updateImportDraft(batchId, draft.id, {
      ...draft.parsed,
      client: { ...draft.parsed.client, name: "Someone else", key: "other" },
    });
    const [row] = await db.select().from(invoiceImportDrafts).where(eq(invoiceImportDrafts.id, draft.id));
    expect(row.parsed.client).toEqual(draft.parsed.client);
  });
});

describe("client matching", () => {
  it("links a PDF's client to an existing one", async () => {
    const [existing] = await db
      .insert(clients)
      .values({ companyId, name: "Jane", email: "jane@acme.example" })
      .returning();
    const batchId = await newBatch();
    const draft = await upload(batchId);
    await approveImportDrafts(batchId, { draftId: draft.id });
    await commitAll(batchId);
    const [invoice] = await db.select().from(invoices).where(eq(invoices.number, "PDF-1"));
    expect(invoice.clientId).toBe(existing.id);
  });
});

describe("before setting a cutover", () => {
  it("can review but not save", async () => {
    await db.update(companies).set({ invoiceCutoverDate: null }).where(eq(companies.id, companyId));
    const batchId = await newBatch();
    const draft = await upload(batchId);
    await approveImportDrafts(batchId, { draftId: draft.id });
    const result = await commitInvoiceImportChunk(batchId);
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error).toContain("cutover");
  });
});
