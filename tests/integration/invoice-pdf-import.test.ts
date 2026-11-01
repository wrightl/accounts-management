import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";
import { createTestDb, type TestDatabase } from "@/db/pglite";
import { setTestDb, type Database } from "@/db";
import {
  auditLog,
  clients,
  companies,
  invoiceImportBatches,
  invoiceImportDrafts,
  invoicePdfReads,
  invoices,
  users,
} from "@/db/schema";
import {
  approveImportDrafts,
  createPdfImportBatch,
  updateImportDraft,
  uploadInvoicePdf,
} from "@/actions/invoice-import-pdf";
import {
  commitInvoiceImportChunk,
  discardInvoiceImport,
  setImportDraftsSkipped,
} from "@/actions/invoice-import";
import { GET as draftDocument } from "@/app/api/invoice-imports/drafts/[id]/document/route";
import { deleteCompanyById } from "@/lib/companies/delete";
import { todayIsoDate } from "@/lib/dates";
import { getImportBatchReview } from "@/lib/invoices/import/queries";
import { purgeAbandonedImports } from "@/lib/invoices/import/purge";
import { getStorage } from "@/lib/storage";
import { commitAll } from "@/lib/test/import-invoices";
import { seedCompany } from "@/lib/test/seed-company";

const { generateText } = vi.hoisted(() => ({ generateText: vi.fn() }));

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
  aiGatewayConfigured: () => true,
  INVOICE_EXTRACT_MODEL: "test/model",
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

  it("leaves an editable draft when reading fails", async () => {
    generateText.mockRejectedValue(new Error("model down"));
    const draft = await upload(await newBatch());
    expect(draft.errors.join()).toContain("couldn't read");
    expect(draft.documentPath).toBeTruthy();
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

  it("stops at the monthly limit, with no AI call", async () => {
    const batchId = await newBatch();
    await db.insert(invoicePdfReads).values({
      companyId,
      month: todayIsoDate().slice(0, 7),
      reads: 25,
    });
    const result = await uploadInvoicePdf(batchId, pdf());
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error).toContain("limit");
    expect(generateText).not.toHaveBeenCalled();
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
    const result = await uploadInvoicePdf(await newBatch(), pdf());
    expect(result.ok).toBe(false);
    expect(generateText).not.toHaveBeenCalled();
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
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(generateText).toHaveBeenCalledTimes(1);
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
