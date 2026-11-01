"use server";

import { createHash, randomUUID } from "node:crypto";
import { and, count, eq, gte, isNotNull, ne, sql } from "drizzle-orm";
import { getDb } from "@/db";
import {
  clients,
  companies,
  invoiceImportBatches,
  invoiceImportDrafts,
  invoices,
} from "@/db/schema";
import type { ActionResult } from "@/actions/result";
import { aiGatewayConfigured } from "@/lib/ai/models";
import { getEntitlements } from "@/lib/billing/entitlements";
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
} from "@/lib/invoices/import/pdf-extract";
import { pdfImportMonthlyLimit } from "@/lib/invoices/import/limits";
import { mutate, mutateWide } from "@/lib/mutate";
import { getStorage } from "@/lib/storage";

const EXTRACT_TIMEOUT_MS = 45_000;

export type PdfBatchResult = { ok: true; id: string } | { ok: false; error: string };

/** Start a batch for uploading invoice PDFs one at a time. */
export async function createPdfImportBatch(): Promise<PdfBatchResult> {
  if (!aiGatewayConfigured()) {
    return { ok: false, error: "Reading PDFs isn't set up on this deployment" };
  }
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

function monthStart(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
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
  if (!aiGatewayConfigured()) {
    return { ok: false, error: "Reading PDFs isn't set up on this deployment" };
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

      const limit = pdfImportMonthlyLimit(await getEntitlements(companyId));
      if (limit != null) {
        const [used] = await db
          .select({ total: count() })
          .from(invoiceImportDrafts)
          .where(
            and(
              eq(invoiceImportDrafts.companyId, companyId),
              isNotNull(invoiceImportDrafts.documentPath),
              gte(invoiceImportDrafts.createdAt, monthStart()),
            ),
          );
        if ((used?.total ?? 0) >= limit) {
          return {
            ok: false,
            error: `You've reached this month's limit of ${limit} PDFs. Import the rest by CSV, or try again next month.`,
          };
        }
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
      try {
        const extraction = await extractInvoiceFromPdf(
          bytes,
          AbortSignal.timeout(EXTRACT_TIMEOUT_MS),
        );
        const draft = draftFromExtraction(extraction, company);
        invoice = draft.invoice;
        errors.push(...draft.errors);
        warnings.push(...draft.warnings);
      } catch (err) {
        console.warn(
          JSON.stringify({
            level: "warn",
            msg: "invoice_pdf_extract_failed",
            error: err instanceof Error ? err.message : String(err),
          }),
        );
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
        .where(eq(invoiceImportDrafts.batchId, batchId));
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

      const client = {
        ...invoice.client,
        email: invoice.client.email?.trim().toLowerCase() || null,
      };
      const next: ParsedInvoice = {
        ...invoice,
        client: {
          ...client,
          key: normalizeClientKey(client.email, client.name, client.companyName),
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
