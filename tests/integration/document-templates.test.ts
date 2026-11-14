import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb, type TestDatabase } from "@/db/pglite";
import { setTestDb, type Database } from "@/db";
import {
  clients,
  companies,
  companyBilling,
  invoiceLineItems,
  invoiceTemplateAssets,
  invoiceTemplates,
  invoices,
  quotes,
  users,
} from "@/db/schema";
import { seedCompany } from "@/lib/test/seed-company";
import {
  convertDocumentTemplate,
  createDocumentTemplate,
  deleteDocumentTemplate,
  deleteTemplateImage,
  duplicateDocumentTemplate,
  selectDocumentTemplate,
  updateDocumentTemplate,
  uploadTemplateImage,
} from "@/actions/document-templates";
import { extractPdfText } from "@/lib/expenses/receipt-pdf";
import { loadOrRenderInvoicePdf } from "@/lib/invoices/pdf-cache";
import { getInvoiceDetail } from "@/lib/invoices/queries";
import { MAX_COMPANY_TEMPLATES, getDocumentTemplate } from "@/lib/pdf/designer/queries";
import { starterDesign } from "@/lib/pdf/designer/starters";
import {
  renderCompanyCreditNotePdf,
  renderCompanyQuotePdf,
} from "@/lib/pdf/templates/company-render";
import type { DocumentKind } from "@/lib/pdf/templates/registry";
import { getCompanyTemplate } from "@/lib/pdf/templates/resolve";
import { getCompanySettings } from "@/lib/settings/queries";

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

/** 1×1 PNG */
const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

let ctx: Awaited<ReturnType<typeof createTestDb>>;
let db: TestDatabase;
let companyId: string;
let clientId: string;

beforeEach(async () => {
  ctx = await createTestDb();
  db = ctx.db;
  setTestDb(db as unknown as Database);
  const company = await seedCompany(db, { email: "accounts@test.example" });
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
});

afterEach(async () => {
  setTestDb(null);
  await ctx.client.close();
});

async function usePlan(plan: "essentials" | "premium") {
  await db.insert(companyBilling).values({ companyId, plan, status: "active" });
}

async function seedInvoice(number: string, status: "draft" | "sent") {
  const [invoice] = await db
    .insert(invoices)
    .values({
      companyId,
      number,
      clientId,
      status,
      issueDate: "2026-03-01",
      dueDate: "2026-03-15",
      netPence: 100000,
      grossPence: 100000,
    })
    .returning();
  await db.insert(invoiceLineItems).values({
    invoiceId: invoice.id,
    description: "Workshop days",
    quantity: 4,
    unitPricePence: 25000,
    position: 0,
  });
  return invoice.id;
}

async function invoicePdf(id: string): Promise<Uint8Array> {
  const detail = await getInvoiceDetail(companyId, id);
  return (await loadOrRenderInvoicePdf(detail!)).bytes;
}

async function company() {
  return getCompanySettings(companyId);
}

async function createDesign(name = "Mine", kind: DocumentKind = "invoice"): Promise<string> {
  const result = await createDocumentTemplate({ name, starter: "clean", kind });
  if (!result.ok || !result.id) throw new Error(result.ok ? "no id" : result.error);
  return result.id;
}

describe("choosing a library template", () => {
  it("starts on Modern and is available on the trial", async () => {
    expect((await company()).invoiceTemplateKey).toBe("modern");

    const result = await selectDocumentTemplate({ kind: "invoice", templateKey: "bold" });
    expect(result.ok).toBe(true);
    expect((await company()).invoiceTemplateKey).toBe("bold");
    expect(await getCompanyTemplate(await company(), "invoice")).toEqual({ key: "bold", design: null });
  });

  it("refuses a template that isn't in the library", async () => {
    const result = await selectDocumentTemplate({ kind: "invoice", templateKey: "fancy" });
    expect(result.ok).toBe(false);
    expect((await company()).invoiceTemplateKey).toBe("modern");
  });

  it("keeps a sent invoice as issued and restyles drafts", async () => {
    const sentId = await seedInvoice("DD-2026-0001", "sent");
    const draftId = await seedInvoice("DD-2026-0002", "draft");
    const sentBefore = await invoicePdf(sentId);
    const draftBefore = await extractPdfText(Buffer.from(await invoicePdf(draftId)));
    expect(draftBefore).not.toContain("Number");

    await db.insert(quotes).values([
      { companyId, clientId, number: "Q-2026-0001", status: "sent", pdfBlobPath: "quotes/sent.pdf" },
      { companyId, clientId, number: "Q-2026-0002", status: "draft", pdfBlobPath: "quotes/draft.pdf" },
    ]);

    const result = await selectDocumentTemplate({ kind: "invoice", templateKey: "corporate" });
    expect(result.ok).toBe(true);
    // Only the kind that changed: quotes and credit notes keep their own choice.
    expect(await company()).toMatchObject({
      invoiceTemplateKey: "corporate",
      quoteTemplateKey: "modern",
      creditNoteTemplateKey: "modern",
    });

    const [sent] = await db.select().from(invoices).where(eq(invoices.id, sentId));
    const [draft] = await db.select().from(invoices).where(eq(invoices.id, draftId));
    expect(sent.pdfBlobPath).not.toBeNull();
    expect(draft.pdfBlobPath).toBeNull();

    expect(Buffer.from(await invoicePdf(sentId)).equals(Buffer.from(sentBefore))).toBe(true);
    // Corporate lists the document number in a details box; Modern doesn't label it.
    const draftAfter = await extractPdfText(Buffer.from(await invoicePdf(draftId)));
    expect(draftAfter).toContain("Number");

    // Quotes weren't restyled, so their stored PDFs stand until the quote template changes.
    const before = await db.select().from(quotes);
    expect(before.find((row) => row.status === "draft")?.pdfBlobPath).toBe("quotes/draft.pdf");

    await db.update(invoices).set({ pdfBlobPath: "invoices/kept.v2.pdf" }).where(eq(invoices.id, draftId));
    expect((await selectDocumentTemplate({ kind: "quote", templateKey: "bold" })).ok).toBe(true);
    const quoteRows = await db.select().from(quotes);
    expect(quoteRows.find((row) => row.status === "sent")?.pdfBlobPath).toBe("quotes/sent.pdf");
    expect(quoteRows.find((row) => row.status === "draft")?.pdfBlobPath).toBeNull();
    const [untouched] = await db.select().from(invoices).where(eq(invoices.id, draftId));
    expect(untouched.pdfBlobPath).toBe("invoices/kept.v2.pdf");
    expect(await company()).toMatchObject({ invoiceTemplateKey: "corporate", quoteTemplateKey: "bold" });
  });

  it("leaves another company's drafts alone", async () => {
    const other = await seedCompany(db, { name: "Other Co" });
    const [otherClient] = await db
      .insert(clients)
      .values({ companyId: other.id, name: "Elsewhere" })
      .returning();
    const [otherDraft] = await db
      .insert(invoices)
      .values({
        companyId: other.id,
        clientId: otherClient.id,
        number: "OT-2026-0001",
        status: "draft",
        pdfBlobPath: "invoices/other.v2.pdf",
      })
      .returning();

    await selectDocumentTemplate({ kind: "invoice", templateKey: "minimal" });

    const [row] = await db.select().from(invoices).where(eq(invoices.id, otherDraft.id));
    expect(row.pdfBlobPath).toBe("invoices/other.v2.pdf");
    const [otherCompany] = await db.select().from(companies).where(eq(companies.id, other.id));
    expect(otherCompany.invoiceTemplateKey).toBe("modern");
  });
});

describe("the template designer", () => {
  it("is not available on Essentials", async () => {
    await usePlan("essentials");
    const created = await createDocumentTemplate({ name: "Mine", starter: "clean", kind: "invoice" });
    expect(created).toMatchObject({ ok: false, error: expect.stringContaining("Premium") });
    expect(await db.select().from(invoiceTemplates)).toHaveLength(0);

    const form = new FormData();
    form.set("image", new File([TINY_PNG], "mark.png", { type: "image/png" }));
    expect((await uploadTemplateImage(form)).ok).toBe(false);
  });

  it("creates, saves, duplicates and deletes a design on Premium", async () => {
    await usePlan("premium");
    const id = await createDesign("Studio invoice");

    const design = starterDesign("bold", "invoice");
    const saved = await updateDocumentTemplate(id, { name: "Studio invoice v2", design });
    expect(saved.ok).toBe(true);
    expect(await getDocumentTemplate(companyId, id)).toMatchObject({
      name: "Studio invoice v2",
      design,
    });

    const copy = await duplicateDocumentTemplate(id);
    expect(copy.ok).toBe(true);
    expect(await db.select().from(invoiceTemplates)).toHaveLength(2);

    expect((await deleteDocumentTemplate(id)).ok).toBe(true);
    expect(await getDocumentTemplate(companyId, id)).toBeNull();
  });

  it("refuses a design that isn't valid", async () => {
    await usePlan("premium");
    const id = await createDesign();
    const design = starterDesign("clean", "invoice");
    const result = await updateDocumentTemplate(id, {
      name: "Mine",
      design: { ...design, elements: design.elements.filter((e) => e.type !== "lineItems") },
    });
    expect(result).toMatchObject({ ok: false, error: expect.stringContaining("line items") });
    expect((await updateDocumentTemplate(id, { name: "  ", design })).ok).toBe(false);
  });

  it("draws invoices in the chosen design, leaving quotes and credit notes on their own choice", async () => {
    await usePlan("premium");
    const id = await createDesign();
    const design = starterDesign("clean", "invoice");
    const title = design.elements.find((element) => element.id === "title")!;
    if (title.type === "text") title.content = "Tax invoice {{invoice.number}}";
    await updateDocumentTemplate(id, { name: "Mine", design });

    const draftId = await seedInvoice("DD-2026-0003", "draft");
    await selectDocumentTemplate({ kind: "invoice", templateKey: "minimal" });
    expect((await selectDocumentTemplate({ kind: "invoice", customTemplateId: id })).ok).toBe(true);
    expect((await getCompanyTemplate(await company(), "quote")).design).toBeNull();
    expect((await getCompanyTemplate(await company(), "credit-note")).design).toBeNull();

    const template = await getCompanyTemplate(await company(), "invoice");
    expect(template.key).toBe("minimal");
    expect(template.design).not.toBeNull();

    const text = await extractPdfText(Buffer.from(await invoicePdf(draftId)));
    // The title wraps in its box, so compare without line breaks.
    expect(text.replace(/\s+/g, " ")).toContain("Tax invoice DD-2026-0003");
    expect(text).toContain("Workshop days");
  });

  it("falls back to the library template after a downgrade, keeping the design", async () => {
    await usePlan("premium");
    const id = await createDesign();
    await selectDocumentTemplate({ kind: "invoice", templateKey: "classic" });
    await selectDocumentTemplate({ kind: "invoice", customTemplateId: id });

    await db
      .update(companyBilling)
      .set({ plan: "essentials" })
      .where(eq(companyBilling.companyId, companyId));

    expect(await getCompanyTemplate(await company(), "invoice")).toEqual({ key: "classic", design: null });
    expect((await company()).invoiceCustomTemplateId).toBe(id);
    expect(await db.select().from(invoiceTemplates)).toHaveLength(1);
    // Choosing the design again needs Premium.
    expect((await selectDocumentTemplate({ kind: "invoice", customTemplateId: id })).ok).toBe(false);
  });

  it("can't use, change or delete another company's design", async () => {
    await usePlan("premium");
    const other = await seedCompany(db, { name: "Other Co" });
    const [theirs] = await db
      .insert(invoiceTemplates)
      .values({ companyId: other.id, name: "Theirs", design: starterDesign("clean", "invoice") })
      .returning();

    expect(
      (await selectDocumentTemplate({ kind: "invoice", customTemplateId: theirs.id })).ok,
    ).toBe(false);
    expect((await company()).invoiceCustomTemplateId).toBeNull();
    expect(
      (await updateDocumentTemplate(theirs.id, { name: "Hijacked", design: starterDesign("bold", "invoice") }))
        .ok,
    ).toBe(false);
    expect((await duplicateDocumentTemplate(theirs.id)).ok).toBe(false);
    expect((await deleteDocumentTemplate(theirs.id)).ok).toBe(false);

    const [row] = await db.select().from(invoiceTemplates).where(eq(invoiceTemplates.id, theirs.id));
    expect(row.name).toBe("Theirs");
  });

  it("stops using a design once it is deleted", async () => {
    await usePlan("premium");
    const id = await createDesign();
    await selectDocumentTemplate({ kind: "invoice", customTemplateId: id });
    await deleteDocumentTemplate(id);
    expect((await company()).invoiceCustomTemplateId).toBeNull();
    expect((await getCompanyTemplate(await company(), "invoice")).design).toBeNull();
  });

  it("goes back to a standard template when one is chosen over a design", async () => {
    await usePlan("premium");
    const id = await createDesign();
    await selectDocumentTemplate({ kind: "invoice", customTemplateId: id });
    await selectDocumentTemplate({ kind: "invoice", templateKey: "bold" });
    expect(await getCompanyTemplate(await company(), "invoice")).toEqual({ key: "bold", design: null });
  });

  it("keeps each design to its own kind of document", async () => {
    await usePlan("premium");
    const quoteId = await createDesign("Quote look", "quote");
    expect(await getDocumentTemplate(companyId, quoteId)).toMatchObject({ kind: "quote" });

    // A quote design can't be used for invoices or credit notes.
    expect((await selectDocumentTemplate({ kind: "invoice", customTemplateId: quoteId })).ok).toBe(false);
    expect(
      (await selectDocumentTemplate({ kind: "credit-note", customTemplateId: quoteId })).ok,
    ).toBe(false);
    expect((await selectDocumentTemplate({ kind: "quote", customTemplateId: quoteId })).ok).toBe(true);
    expect(await company()).toMatchObject({
      invoiceCustomTemplateId: null,
      quoteCustomTemplateId: quoteId,
      creditNoteCustomTemplateId: null,
    });

    const copy = await duplicateDocumentTemplate(quoteId);
    expect(await getDocumentTemplate(companyId, copy.ok ? copy.id! : "")).toMatchObject({
      kind: "quote",
    });
    expect((await selectDocumentTemplate({ kind: "nonsense", templateKey: "bold" })).ok).toBe(false);
  });

  it("converts a design into a new one for another kind of document", async () => {
    await usePlan("premium");
    const id = await createDesign("Studio", "invoice");
    const before = await getDocumentTemplate(companyId, id);

    const result = await convertDocumentTemplate(id, { kind: "quote", name: "Studio quote" });
    expect(result.ok).toBe(true);
    const quote = await getDocumentTemplate(companyId, result.ok ? result.id! : "");
    expect(quote).toMatchObject({ kind: "quote", name: "Studio quote" });
    const text = JSON.stringify(quote!.design);
    expect(text).toContain("{{quote.number}}");
    expect(text).not.toContain("{{invoice.");

    // The design it came from is untouched, and nothing is put into use.
    expect(await getDocumentTemplate(companyId, id)).toEqual(before);
    expect((await company()).quoteCustomTemplateId).toBeNull();

    expect((await convertDocumentTemplate(id, { kind: "invoice", name: "Same" })).ok).toBe(false);
    expect((await convertDocumentTemplate(id, { kind: "nonsense", name: "Odd" })).ok).toBe(false);
    expect((await convertDocumentTemplate(id, { kind: "quote", name: "  " })).ok).toBe(false);
    expect(await db.select().from(invoiceTemplates)).toHaveLength(2);
  });

  it("won't convert on Essentials, another company's design, or past the limit", async () => {
    await usePlan("premium");
    const other = await seedCompany(db, { name: "Other Co" });
    const [theirs] = await db
      .insert(invoiceTemplates)
      .values({ companyId: other.id, name: "Theirs", design: starterDesign("clean", "invoice") })
      .returning();
    expect((await convertDocumentTemplate(theirs.id, { kind: "quote", name: "Mine now" })).ok).toBe(
      false,
    );

    const id = await createDesign();
    await db.insert(invoiceTemplates).values(
      Array.from({ length: MAX_COMPANY_TEMPLATES - 1 }, (_, i) => ({
        companyId,
        name: `Filler ${i}`,
        design: starterDesign("blank", "invoice"),
      })),
    );
    expect(await convertDocumentTemplate(id, { kind: "quote", name: "One more" })).toMatchObject({
      ok: false,
      error: expect.stringContaining("Delete one"),
    });

    await db.update(companyBilling).set({ plan: "essentials" }).where(eq(companyBilling.companyId, companyId));
    expect(await convertDocumentTemplate(id, { kind: "quote", name: "Quote" })).toMatchObject({
      ok: false,
      error: expect.stringContaining("Premium"),
    });
  });

  it("draws quotes and credit notes in their own designs", async () => {
    await usePlan("premium");
    const client = { name: "Acme", email: "ap@acme.test", addressLines: null };
    const lines = [{ description: "Workshop days", quantity: 4, unitPricePence: 25000 }];
    const quote = {
      number: "Q-2026-0009",
      version: 1,
      issueDate: "2026-03-01",
      validUntil: "2026-03-31",
      notes: "Half up front.",
      netPence: 100000,
      vatPence: 0,
      grossPence: 100000,
    };
    const creditNote = {
      number: "CN-2026-0004",
      issueDate: "2026-03-05",
      netPence: 100000,
      vatPence: 0,
      grossPence: 100000,
      reason: "Cancelled workshop",
    };
    const text = async (bytes: Uint8Array) =>
      (await extractPdfText(Buffer.from(bytes))).replace(/\s+/g, " ");

    // Before any design is chosen both use the library template.
    const libraryQuote = await text(
      await renderCompanyQuotePdf(await company(), { quote, client, lines }),
    );
    expect(libraryQuote).not.toContain("My quote");

    const quoteId = await createDesign("Quote look", "quote");
    const quoteDesign = starterDesign("clean", "quote");
    const quoteTitle = quoteDesign.elements.find((element) => element.id === "title")!;
    if (quoteTitle.type === "text") quoteTitle.content = "My quote";
    await updateDocumentTemplate(quoteId, { name: "Quote look", design: quoteDesign });
    await selectDocumentTemplate({ kind: "quote", customTemplateId: quoteId });

    const creditId = await createDesign("Credit look", "credit-note");
    const creditDesign = starterDesign("clean", "credit-note");
    const creditTitle = creditDesign.elements.find((element) => element.id === "title")!;
    if (creditTitle.type === "text") creditTitle.content = "My credit";
    await updateDocumentTemplate(creditId, { name: "Credit look", design: creditDesign });
    await selectDocumentTemplate({ kind: "credit-note", customTemplateId: creditId });

    const quoteText = await text(
      await renderCompanyQuotePdf(await company(), { quote, client, lines }),
    );
    for (const expected of ["My quote", "Q-2026-0009", "31/03/2026", "Quote total", "Half up front."]) {
      expect(quoteText, expected).toContain(expected);
    }
    expect(quoteText).not.toContain("{{");

    const creditText = await text(
      await renderCompanyCreditNotePdf(await company(), {
        creditNote,
        invoiceNumber: "DD-2026-0001",
        client,
        lines,
      }),
    );
    for (const expected of [
      "My credit",
      "CN-2026-0004",
      "DD-2026-0001",
      "Cancelled workshop",
      "Total credited",
    ]) {
      expect(creditText, expected).toContain(expected);
    }
    expect(creditText).not.toContain("{{");

    // Invoices were never given a design.
    expect((await getCompanyTemplate(await company(), "invoice")).design).toBeNull();
  });

  it("stores pictures by what they are, and only lets a design use the company's own", async () => {
    await usePlan("premium");
    const id = await createDesign();

    const notAnImage = new FormData();
    notAnImage.set("image", new File(["<svg onload=alert(1)>"], "x.png", { type: "image/png" }));
    expect((await uploadTemplateImage(notAnImage)).ok).toBe(false);

    const form = new FormData();
    form.set("image", new File([TINY_PNG], "mark.png", { type: "image/png" }));
    const uploaded = await uploadTemplateImage(form);
    expect(uploaded.ok).toBe(true);
    const assetId = uploaded.ok ? uploaded.id! : "";

    const other = await seedCompany(db, { name: "Other Co" });
    const [theirAsset] = await db
      .insert(invoiceTemplateAssets)
      .values({
        companyId: other.id,
        blobPath: "company/other/template-assets/x",
        contentType: "image/png",
        filename: "theirs.png",
      })
      .returning();

    const withImage = (asset: string) => {
      const design = starterDesign("clean", "invoice");
      design.elements.push({
        id: "picture",
        type: "image",
        x: 300,
        y: 40,
        w: 40,
        h: 40,
        repeat: false,
        source: { kind: "asset", assetId: asset },
        fit: "contain",
      });
      return design;
    };

    expect(
      (await updateDocumentTemplate(id, { name: "Mine", design: withImage(theirAsset.id) })).ok,
    ).toBe(false);
    expect((await updateDocumentTemplate(id, { name: "Mine", design: withImage(assetId) })).ok).toBe(
      true,
    );

    // In use, so it can't be removed; nor can another company's.
    expect((await deleteTemplateImage(assetId)).ok).toBe(false);
    expect((await deleteTemplateImage(theirAsset.id)).ok).toBe(false);

    await updateDocumentTemplate(id, { name: "Mine", design: starterDesign("clean", "invoice") });
    expect((await deleteTemplateImage(assetId)).ok).toBe(true);
    expect(await db.select().from(invoiceTemplateAssets)).toHaveLength(1);
  });
});
