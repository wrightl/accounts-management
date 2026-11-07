"use server";

import { createHash, randomUUID } from "node:crypto";
import { and, desc, eq, isNotNull, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import {
  bankAccounts,
  bankTransactions,
  clients,
  companies,
  invoiceImportBatches,
  invoiceImportDrafts,
  invoicePdfReads,
  invoices,
  reconciliationMatches,
} from "@/db/schema";
import type { ActionResult } from "@/actions/result";
import { aiGatewayConfigured } from "@/lib/ai/models";
import { requireActionPermission } from "@/lib/auth";
import {
  findBankTransactionsForImportDraft,
  type InvoiceBankMatch,
} from "@/lib/bank/queries";
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
import { LOCAL_READ_WARNING, readInvoicePdfLocally } from "@/lib/invoices/import/pdf-local";
import { pdfImportMonthlyLimit } from "@/lib/invoices/import/limits";
import { mutate, mutateWide } from "@/lib/mutate";
import { getStorage } from "@/lib/storage";

// Leaves room in the page's 60s for a local read if the model times out.
const EXTRACT_TIMEOUT_MS = 30_000;
/** The page's maxDuration (60s), less time to save the draft afterwards. */
const READ_BUDGET_MS = 55_000;
/** Below this, a local read isn't worth starting. */
const MIN_LOCAL_READ_MS = 3_000;

export type PdfBatchResult = { ok: true; id: string } | { ok: false; error: string };

/** Start a batch for uploading invoice PDFs one at a time. */
export async function createPdfImportBatch(): Promise<PdfBatchResult> {
  return mutateWide<PdfBatchResult>("accounts:write", async ({ companyId, localUserId }) => {
    const [batch] = await getDb()
      .insert(invoiceImportBatches)
      .values({ companyId, kind: "pdf", createdByUserId: localUserId })
      .returning({ id: invoiceImportBatches.id });
    return { ok: true, id: batch.id };
  });
}

/**
 * Count one read against this month's allowance, or return false if it's used
 * up. A single statement, so parallel uploads can't both take the last one.
 */
async function reservePdfRead(
  companyId: string,
  month: string,
  limit: number | null,
): Promise<boolean> {
  const db = getDb();
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

/** Give back a reserved read when the model didn't return one. */
async function releasePdfRead(companyId: string, month: string) {
  await getDb()
    .update(invoicePdfReads)
    .set({ reads: sql`${invoicePdfReads.reads} - 1` })
    .where(
      and(
        eq(invoicePdfReads.companyId, companyId),
        eq(invoicePdfReads.month, month),
        sql`${invoicePdfReads.reads} > 0`,
      ),
    );
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

/**
 * The client a new draft starts linked to: whatever an earlier draft in this
 * import with the same client uses, else a confident match, else none.
 */
async function initialDraftClient(
  companyId: string,
  batchId: string,
  invoice: ParsedInvoice,
): Promise<string | null> {
  const { client } = invoice;
  if (!client.name && !client.companyName && !client.email) return null;
  const db = getDb();
  const [earlier] = await db
    .select({ clientId: invoiceImportDrafts.clientId })
    .from(invoiceImportDrafts)
    .where(
      and(
        eq(invoiceImportDrafts.companyId, companyId),
        eq(invoiceImportDrafts.batchId, batchId),
        isNotNull(invoiceImportDrafts.clientId),
        ne(invoiceImportDrafts.status, "skipped"),
        sql`${invoiceImportDrafts.parsed} -> 'client' ->> 'key' = ${client.key}`,
      ),
    )
    .orderBy(desc(invoiceImportDrafts.position))
    .limit(1);
  if (earlier?.clientId) return earlier.clientId;
  const existing = await db
    .select({
      id: clients.id,
      name: clients.name,
      companyName: clients.companyName,
      email: clients.email,
    })
    .from(clients)
    .where(eq(clients.companyId, companyId));
  const suggestion = suggestClient(client, existing);
  return suggestion.preselect ? suggestion.clientId : null;
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
 * room, otherwise (or if it fails) locally with pdf.js and Tesseract, in
 * whatever time is left of the request. Null when neither could read it.
 */
async function readInvoicePdf(
  companyId: string,
  bytes: Buffer,
  startedAt: number,
): Promise<PdfRead | null> {
  let overLimit: number | undefined;
  if (aiGatewayConfigured()) {
    const limit = pdfImportMonthlyLimit(await getEntitlements(companyId));
    const month = todayIsoDate().slice(0, 7);
    if (await reservePdfRead(companyId, month, limit)) {
      try {
        const extraction = await extractInvoiceFromPdf(
          bytes,
          AbortSignal.timeout(EXTRACT_TIMEOUT_MS),
        );
        return { extraction, reader: "ai" };
      } catch (err) {
        logReadFailure("ai", err);
        // A failed read isn't one the company got, so it doesn't count.
        await releasePdfRead(companyId, month);
      }
    } else if (limit != null) {
      overLimit = limit;
    }
  }
  const remaining = READ_BUDGET_MS - (Date.now() - startedAt);
  if (remaining < MIN_LOCAL_READ_MS) {
    logReadFailure("local", new Error(`Only ${remaining}ms left for a local read`));
    return null;
  }
  try {
    const extraction = await readInvoicePdfLocally(bytes, remaining);
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
  const startedAt = Date.now();
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

      // The same file can't be added twice to one import, or again once it's
      // on an invoice. An import left open elsewhere doesn't block it: saving
      // checks the invoices again.
      const sha256 = createHash("sha256").update(bytes).digest("hex");
      const [seenDraft] = await db
        .select({ id: invoiceImportDrafts.id })
        .from(invoiceImportDrafts)
        .where(
          and(
            eq(invoiceImportDrafts.companyId, companyId),
            eq(invoiceImportDrafts.batchId, batchId),
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
            : `${file.name} is already in this import`,
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
      const read = await readInvoicePdf(companyId, bytes, startedAt);
      if (read) {
        const draft = draftFromExtraction(read.extraction, company);
        invoice = draft.invoice;
        errors.push(...draft.errors);
        warnings.push(...draft.warnings);
        if (read.reader === "local") {
          warnings.push(LOCAL_READ_WARNING);
          if (read.overLimit) {
            warnings.push(`This month's ${read.overLimit} AI reads are used up.`);
          }
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
          clientId: await initialDraftClient(companyId, batchId, invoice),
          errors: [...new Set(errors)],
          warnings,
          documentPath: stored.path,
          documentFilename: file.name,
          documentSize: bytes.byteLength,
          documentSha256: sha256,
        })
        .returning({ id: invoiceImportDrafts.id });
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

/**
 * The bank payment a draft can be linked to: this company's, incoming, unmatched,
 * for the whole invoice, and not chosen by another draft in the import.
 */
async function bankLinkProblem(
  companyId: string,
  batchId: string,
  draftId: string,
  bankTransactionId: string,
  invoice: ParsedInvoice,
): Promise<{ error: string } | { bookedAt: string }> {
  const [tx] = await getDb()
    .select({
      amountPence: bankTransactions.amountPence,
      bookedAt: bankTransactions.bookedAt,
      matchId: reconciliationMatches.id,
    })
    .from(bankTransactions)
    .innerJoin(bankAccounts, eq(bankTransactions.bankAccountId, bankAccounts.id))
    .leftJoin(
      reconciliationMatches,
      eq(reconciliationMatches.bankTransactionId, bankTransactions.id),
    )
    .where(
      and(
        eq(bankTransactions.id, bankTransactionId),
        eq(bankAccounts.companyId, companyId),
      ),
    )
    .limit(1);
  if (!tx || tx.amountPence <= 0) return { error: "Bank payment not found" };
  if (invoice.status !== "paid" || invoice.amountPaidPence !== invoice.grossPence) {
    return { error: "Only an invoice paid in full can be linked to a bank payment" };
  }
  if (tx.amountPence !== invoice.grossPence) {
    return { error: "The bank payment must be for the invoice's gross total" };
  }
  if (tx.matchId) return { error: "That bank payment is already reconciled" };
  const [taken] = await getDb()
    .select({ id: invoiceImportDrafts.id })
    .from(invoiceImportDrafts)
    .where(
      and(
        eq(invoiceImportDrafts.companyId, companyId),
        eq(invoiceImportDrafts.batchId, batchId),
        eq(invoiceImportDrafts.bankTransactionId, bankTransactionId),
        ne(invoiceImportDrafts.id, draftId),
        ne(invoiceImportDrafts.status, "skipped"),
      ),
    )
    .limit(1);
  if (taken) return { error: "Another invoice in this import uses that bank payment" };
  return { bookedAt: tx.bookedAt };
}

/**
 * Save the user's corrections to a draft and re-check it. It still needs approving.
 * The client isn't edited here: it is chosen in the import's Clients section.
 */
export async function updateImportDraft(
  batchId: string,
  draftId: string,
  invoice: Omit<ParsedInvoice, "client"> & { client?: unknown },
  bankTransactionId: string | null = null,
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
      if (bankTransactionId !== null && !z.string().uuid().safeParse(bankTransactionId).success) {
        return { ok: false, error: "Bank payment not found" };
      }
      const edited = parsed.data;
      // Worked out here, not taken from the browser, so status and amounts agree.
      const next: ParsedInvoice = {
        ...edited,
        status:
          edited.grossPence > 0 && edited.amountPaidPence >= edited.grossPence
            ? "paid"
            : "sent",
        client: draft.parsed.client,
        sourceRows: [],
      };
      if (bankTransactionId) {
        const link = await bankLinkProblem(companyId, batchId, draftId, bankTransactionId, next);
        if ("error" in link) return { ok: false, error: link.error };
        // Paid on the day the money arrived.
        next.paidDate = link.bookedAt;
      }
      const errors = validateParsedInvoice(next);
      const problem = await numberProblem(companyId, next);
      if (problem) errors.push(problem);

      await getDb()
        .update(invoiceImportDrafts)
        .set({ parsed: next, errors, status: "needs_review", bankTransactionId })
        .where(
          and(
            eq(invoiceImportDrafts.id, draftId),
            eq(invoiceImportDrafts.companyId, companyId),
          ),
        );
      return { ok: true, id: draftId };
    },
    { paths: [`/invoices/import/${batchId}`] },
  );
}

/** Bank payments a draft could be linked to, best first. */
export async function findImportDraftBankMatches(
  batchId: string,
  draftId: string,
): Promise<{ ok: true; matches: InvoiceBankMatch[] } | { ok: false; error: string }> {
  const authz = await requireActionPermission("accounts:read");
  if (!authz.ok) return authz;
  if (!authz.user.companyId) {
    return { ok: false, error: "Complete onboarding before using the dashboard." };
  }
  const companyId = authz.user.companyId;
  const draft = await loadOpenDraft(companyId, batchId, draftId);
  if (!draft) return { ok: false, error: "Draft not found" };

  const chosen = await getDb()
    .select({ id: invoiceImportDrafts.bankTransactionId })
    .from(invoiceImportDrafts)
    .where(
      and(
        eq(invoiceImportDrafts.companyId, companyId),
        eq(invoiceImportDrafts.batchId, batchId),
        ne(invoiceImportDrafts.id, draftId),
        ne(invoiceImportDrafts.status, "skipped"),
      ),
    );
  const exclude = new Set(chosen.flatMap((c) => (c.id ? [c.id] : [])));
  const { parsed } = draft;
  const matches = await findBankTransactionsForImportDraft(
    companyId,
    {
      number: parsed.number,
      clientName: parsed.client.name,
      clientCompanyName: parsed.client.companyName,
      grossPence: parsed.grossPence,
      issueDate: parsed.issueDate,
      dueDate: parsed.dueDate,
    },
    exclude,
  );
  return { ok: true, matches };
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
            // Drafts read without AI are only approved one at a time.
            "draftId" in selection
              ? undefined
              : sql`not (${invoiceImportDrafts.warnings} @> ${JSON.stringify([
                  LOCAL_READ_WARNING,
                ])}::jsonb)`,
            "draftId" in selection ? eq(invoiceImportDrafts.id, selection.draftId) : undefined,
          ),
        );
      return { ok: true };
    },
    { paths: [`/invoices/import/${batchId}`] },
  );
}
