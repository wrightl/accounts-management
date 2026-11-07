"use server";

import { createHash, randomUUID } from "node:crypto";
import { and, eq, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import {
  clients,
  companies,
  invoiceImportBatches,
  invoiceImportDrafts,
  invoicePdfReads,
  invoices,
} from "@/db/schema";
import type { ActionResult } from "@/actions/result";
import { aiGatewayConfigured } from "@/lib/ai/models";
import { getEntitlements } from "@/lib/billing/entitlements";
import { todayIsoDate } from "@/lib/dates";
import { MAX_RECEIPT_BYTES, sniffReceiptContentType } from "@/lib/expenses/receipt-file";
import { suggestClient } from "@/lib/invoices/import/clients";
import {
  normalizeClientKey,
  validateParsedInvoice,
  type ParsedInvoice,
} from "@/lib/invoices/import/parse";
import {
  draftFromExtraction,
  extractInvoiceFromPdf,
  type InvoiceExtraction,
} from "@/lib/invoices/import/pdf-extract";
import { readInvoicePdfLocally } from "@/lib/invoices/import/pdf-local";
import { pdfImportMonthlyLimit } from "@/lib/invoices/import/limits";
import { mutate, mutateWide } from "@/lib/mutate";
import { getStorage } from "@/lib/storage";

// Leaves room in the page's 60s for a local read if the model times out.
const EXTRACT_TIMEOUT_MS = 30_000;

export type PdfBatchResult = { ok: true; id: string } | { ok: false; error: string };

/** Start a batch for uploading invoice PDFs one at a time. */
export async function createPdfImportBatch(): Promise<PdfBatchResult> {
  return mutateWide<PdfBatchResult>("accounts:write", async ({ companyId, localUserId }) => {
    const [batch] = await getDb()
      .insert(invoiceImportBatches)
      .values({
        companyId,
        kind: "pdf",
        filename: "Uploaded PDFs",
        createdByUserId: localUserId,
      })
      .returning({ id: invoiceImportBatches.id });
    return { ok: true, id: batch.id };
  });
}

/**
 * Count one read against this month's allowance, or return false if it's used
 * up. A single statement, so parallel uploads can't both take the last one.
 */
async function reservePdfRead(companyId: string, limit: number | null): Promise<boolean> {
  const db = getDb();
  const month = todayIsoDate().slice(0, 7);
  if (limit != null && limit <= 0) return false;
  const reserved = await db
    .insert(invoicePdfReads)
    .values({ companyId, month, reads: 1 })
    .onConflictDoUpdate({
      target: [invoicePdfReads.companyId, invoicePdfReads.month],
      set: { reads: sql`${invoicePdfReads.reads} + 1` },
      where: limit == null ? undefined : sql`${invoicePdfReads.reads} < ${limit}`,
    })
    .returning({ reads: invoicePdfReads.reads });
  return reserved.length > 0;
}

/** Problems that only the database can see, on top of the invoice's own checks. */
async function numberProblem(
  companyId: string,
  invoice: ParsedInvoice,
): Promise<string | null> {
  if (!invoice.number) return null;
  const [taken] = await getDb()
    .select({ id: invoices.id })
    .from(invoices)
    .where(
      and(
        eq(invoices.companyId, companyId),
        sql`lower(${invoices.number}) = lower(${invoice.number})`,
      ),
    )
    .limit(1);
  return taken ? `Invoice number ${invoice.number} is already in Alfa` : null;
}

/** Record how this draft's client resolves, without overriding an earlier choice. */
async function ensureClientResolution(
  companyId: string,
  batchId: string,
  invoice: ParsedInvoice,
) {
  const db = getDb();
  const existing = await db
    .select({
      id: clients.id,
      name: clients.name,
      companyName: clients.companyName,
      email: clients.email,
    })
    .from(clients)
    .where(eq(clients.companyId, companyId));
  const suggestion = suggestClient(invoice.client, existing);
  const entry = JSON.stringify({
    [invoice.client.key]: suggestion.preselect ? suggestion.clientId : null,
  });
  await db
    .update(invoiceImportBatches)
    .set({
      clientResolutions: sql`${entry}::jsonb || ${invoiceImportBatches.clientResolutions}`,
    })
    .where(
      and(
        eq(invoiceImportBatches.id, batchId),
        eq(invoiceImportBatches.companyId, companyId),
      ),
    );
}

function logReadFailure(reader: "ai" | "local", err: unknown) {
  console.warn(
    JSON.stringify({
      level: "warn",
      msg: "invoice_pdf_extract_failed",
      reader,
      error: err instanceof Error ? err.message : String(err),
    }),
  );
}

type PdfRead = {
  extraction: InvoiceExtraction;
  reader: "ai" | "local";
  /** The monthly AI allowance, when it being used up is why AI wasn't used. */
  overLimit?: number;
};

/**
 * Read with the model when it's available and this month's allowance has
 * room, otherwise (or if it fails) locally with pdf.js and Tesseract. Null
 * when neither could read it.
 */
async function readInvoicePdf(companyId: string, bytes: Buffer): Promise<PdfRead | null> {
  let overLimit: number | undefined;
  if (aiGatewayConfigured()) {
    const limit = pdfImportMonthlyLimit(await getEntitlements(companyId));
    if (await reservePdfRead(companyId, limit)) {
      try {
        const extraction = await extractInvoiceFromPdf(
          bytes,
          AbortSignal.timeout(EXTRACT_TIMEOUT_MS),
        );
        return { extraction, reader: "ai" };
      } catch (err) {
        logReadFailure("ai", err);
      }
    } else if (limit != null) {
      overLimit = limit;
    }
  }
  try {
    const extraction = await readInvoicePdfLocally(bytes);
    console.info(JSON.stringify({ level: "info", msg: "invoice_pdf_extract", reader: "local" }));
    return { extraction, reader: "local", overLimit };
  } catch (err) {
    logReadFailure("local", err);
    return null;
  }
}

export type UploadResult =
  | { ok: true; id: string }
  | { ok: false; error: string };

/**
 * Store one PDF and read it. The file is saved first, so if reading fails the
 * user still gets a draft to fill in by hand. Nothing here becomes an invoice.
 */
export async function uploadInvoicePdf(
  batchId: string,
  formData: FormData,
): Promise<UploadResult> {
  const file = formData.get("document");
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "Choose a PDF file" };
  if (file.size > MAX_RECEIPT_BYTES) return { ok: false, error: `${file.name} is over 4.5 MB` };
  const bytes = Buffer.from(await file.arrayBuffer());
  if (sniffReceiptContentType(bytes) !== "application/pdf") {
    return { ok: false, error: `${file.name} isn't a PDF` };
  }

  return mutateWide<UploadResult>(
    "accounts:write",
    async ({ companyId }) => {
      const db = getDb();
      const [batch] = await db
        .select()
        .from(invoiceImportBatches)
        .where(
          and(
            eq(invoiceImportBatches.id, batchId),
            eq(invoiceImportBatches.companyId, companyId),
            eq(invoiceImportBatches.kind, "pdf"),
          ),
        );
      if (!batch || batch.status !== "draft") {
        return { ok: false, error: "This import is no longer open" };
      }

      // Before any AI spend: the same file can't be read twice.
      const sha256 = createHash("sha256").update(bytes).digest("hex");
      const [seenDraft] = await db
        .select({ id: invoiceImportDrafts.id })
        .from(invoiceImportDrafts)
        .where(
          and(
            eq(invoiceImportDrafts.companyId, companyId),
            eq(invoiceImportDrafts.documentSha256, sha256),
            ne(invoiceImportDrafts.status, "skipped"),
          ),
        )
        .limit(1);
      const [seenInvoice] = await db
        .select({ number: invoices.number })
        .from(invoices)
        .where(
          and(
            eq(invoices.companyId, companyId),
            eq(invoices.originalDocumentSha256, sha256),
          ),
        )
        .limit(1);
      if (seenDraft || seenInvoice) {
        return {
          ok: false,
          error: seenInvoice
            ? `${file.name} is already attached to invoice ${seenInvoice.number}`
            : `${file.name} has already been uploaded`,
        };
      }

      const stored = await getStorage().put(
        `invoice-imports/${companyId}/${batchId}/${randomUUID()}.pdf`,
        bytes,
        "application/pdf",
      );

      const [company] = await db
        .select()
        .from(companies)
        .where(eq(companies.id, companyId));
      const blank: ParsedInvoice = {
        number: null,
        client: { key: normalizeClientKey(null, null, null), name: null, companyName: null, email: null, address: null },
        issueDate: "",
        dueDate: null,
        status: "sent",
        netPence: 0,
        vatPence: 0,
        grossPence: 0,
        amountPaidPence: 0,
        paidDate: null,
        paymentReference: null,
        lines: [{ description: "Imported invoice", quantity: 1, unitPricePence: 0, vatRate: 0, discountPercent: 0 }],
        sourceRows: [],
      };

      let invoice = blank;
      const errors: string[] = [];
      const warnings: string[] = [];
      const read = await readInvoicePdf(companyId, bytes);
      if (read) {
        const draft = draftFromExtraction(read.extraction, company);
        invoice = draft.invoice;
        errors.push(...draft.errors);
        warnings.push(...draft.warnings);
        if (read.reader === "local") {
          warnings.push(
            read.overLimit
              ? `Read without AI, as this month's ${read.overLimit} AI reads are used up. Check every field against the PDF.`
              : "Read without AI. Check every field against the PDF.",
          );
        }
      } else {
        errors.push("Alfa couldn't read this file. Fill in the details from the PDF.");
      }
      errors.push(...validateParsedInvoice(invoice));
      const problem = await numberProblem(companyId, invoice);
      if (problem) errors.push(problem);

      const [{ position }] = await db
        .select({
          position: sql<number>`coalesce(max(${invoiceImportDrafts.position}), -1) + 1`.mapWith(Number),
        })
        .from(invoiceImportDrafts)
        .where(
          and(
            eq(invoiceImportDrafts.batchId, batchId),
            eq(invoiceImportDrafts.companyId, companyId),
          ),
        );
      const [draft] = await db
        .insert(invoiceImportDrafts)
        .values({
          batchId,
          companyId,
          position,
          status: "needs_review",
          parsed: invoice,
          errors: [...new Set(errors)],
          warnings,
          documentPath: stored.path,
          documentFilename: file.name,
          documentSize: bytes.byteLength,
          documentSha256: sha256,
        })
        .returning({ id: invoiceImportDrafts.id });
      if (invoice.client.name || invoice.client.companyName || invoice.client.email) {
        await ensureClientResolution(companyId, batchId, invoice);
      }
      return { ok: true, id: draft.id };
    },
    { paths: [`/invoices/import/${batchId}`] },
  );
}

async function loadOpenDraft(companyId: string, batchId: string, draftId: string) {
  const [row] = await getDb()
    .select({ draft: invoiceImportDrafts, status: invoiceImportBatches.status })
    .from(invoiceImportDrafts)
    .innerJoin(
      invoiceImportBatches,
      eq(invoiceImportDrafts.batchId, invoiceImportBatches.id),
    )
    .where(
      and(
        eq(invoiceImportDrafts.id, draftId),
        eq(invoiceImportDrafts.batchId, batchId),
        eq(invoiceImportDrafts.companyId, companyId),
      ),
    );
  return row?.status === "draft" && row.draft.status !== "committed" ? row.draft : null;
}

const MAX_PENCE = 2_000_000_000;
const pence = z.number().int().min(-MAX_PENCE).max(MAX_PENCE);
const optionalText = z.string().trim().max(500).nullable();

const editedInvoiceSchema = z.object({
  number: optionalText,
  client: z.object({
    name: optionalText,
    companyName: optionalText,
    email: optionalText,
    address: z.string().trim().max(2000).nullable(),
  }),
  issueDate: z.string().max(10),
  dueDate: z.string().max(10).nullable(),
  netPence: pence,
  vatPence: pence,
  grossPence: pence,
  amountPaidPence: pence,
  paidDate: z.string().max(10).nullable(),
  paymentReference: optionalText,
  lines: z
    .array(
      z.object({
        description: z.string().trim().min(1).max(2000),
        quantity: z.number().positive().max(1_000_000),
        unitPricePence: pence,
        vatRate: z.number().int().min(0).max(100),
        discountPercent: z.number().min(0).max(100),
      }),
    )
    .min(1)
    .max(500),
});

/** Save the user's corrections to a draft and re-check it. It still needs approving. */
export async function updateImportDraft(
  batchId: string,
  draftId: string,
  invoice: ParsedInvoice,
): Promise<ActionResult> {
  return mutate(
    "accounts:write",
    async ({ companyId }) => {
      const draft = await loadOpenDraft(companyId, batchId, draftId);
      if (!draft) return { ok: false, error: "Draft not found" };

      const parsed = editedInvoiceSchema.safeParse(invoice);
      if (!parsed.success) {
        return { ok: false, error: "Check the invoice details: something isn't valid" };
      }
      const edited = parsed.data;
      const email = edited.client.email?.toLowerCase() || null;
      // Worked out here, not taken from the browser, so status and amounts agree.
      const next: ParsedInvoice = {
        ...edited,
        status:
          edited.grossPence > 0 && edited.amountPaidPence >= edited.grossPence
            ? "paid"
            : "sent",
        client: {
          ...edited.client,
          email,
          key: normalizeClientKey(email, edited.client.name, edited.client.companyName),
        },
        sourceRows: [],
      };
      const errors = validateParsedInvoice(next);
      const problem = await numberProblem(companyId, next);
      if (problem) errors.push(problem);

      await getDb()
        .update(invoiceImportDrafts)
        .set({ parsed: next, errors, status: "needs_review" })
        .where(
          and(
            eq(invoiceImportDrafts.id, draftId),
            eq(invoiceImportDrafts.companyId, companyId),
          ),
        );
      if (next.client.name || next.client.companyName || next.client.email) {
        await ensureClientResolution(companyId, batchId, next);
      }
      return { ok: true, id: draftId };
    },
    { paths: [`/invoices/import/${batchId}`] },
  );
}

/** Approve one draft, or every draft with no problems. Nothing is ever auto-approved. */
export async function approveImportDrafts(
  batchId: string,
  selection: { draftId: string } | { allWithoutProblems: true },
): Promise<ActionResult> {
  return mutate(
    "accounts:write",
    async ({ companyId }) => {
      const db = getDb();
      const [batch] = await db
        .select({ status: invoiceImportBatches.status })
        .from(invoiceImportBatches)
        .where(
          and(
            eq(invoiceImportBatches.id, batchId),
            eq(invoiceImportBatches.companyId, companyId),
          ),
        );
      if (batch?.status !== "draft") return { ok: false, error: "This import is no longer open" };

      if ("draftId" in selection) {
        const draft = await loadOpenDraft(companyId, batchId, selection.draftId);
        if (!draft) return { ok: false, error: "Draft not found" };
        if (draft.errors.length > 0) return { ok: false, error: "Fix the problems on this invoice first" };
      }
      await db
        .update(invoiceImportDrafts)
        .set({ status: "ready" })
        .where(
          and(
            eq(invoiceImportDrafts.batchId, batchId),
            eq(invoiceImportDrafts.companyId, companyId),
            eq(invoiceImportDrafts.status, "needs_review"),
            sql`jsonb_array_length(${invoiceImportDrafts.errors}) = 0`,
            "draftId" in selection ? eq(invoiceImportDrafts.id, selection.draftId) : undefined,
          ),
        );
      return { ok: true };
    },
    { paths: [`/invoices/import/${batchId}`] },
  );
}
