"use server";

import { and, asc, eq, inArray, or, sql } from "drizzle-orm";
import { getDb } from "@/db";
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
  orders,
  payments,
  quotes,
  reconciliationMatches,
  sendJobs,
} from "@/db/schema";
import type { ActionResult } from "@/actions/result";
import { todayIsoDate } from "@/lib/dates";
import { advanceInvoiceSequences } from "@/lib/invoices/allocate";
import { isBroughtForward } from "@/lib/invoices/cutover";
import { suggestClient } from "@/lib/invoices/import/clients";
import {
  suggestMapping,
  type ColumnMapping,
  type ImportDateFormat,
} from "@/lib/invoices/import/fields";
import {
  MAX_IMPORT_INVOICES,
  MAX_IMPORT_ROWS,
  parseInvoiceImport,
  type ParsedDraft,
  type ParsedInvoice,
} from "@/lib/invoices/import/parse";
import { parseCsv } from "@/lib/csv/parse";
import { formatInvoiceNumber, highestSeqByYear } from "@/lib/invoices/numbering";
import { mutate, mutateWide } from "@/lib/mutate";
import { periodLockError } from "@/lib/period-lock";
import { getStorage } from "@/lib/storage";

const MAX_CSV_BYTES = 4 * 1024 * 1024;
const INSERT_CHUNK = 500;
const COMMIT_CHUNK = 100;
const PATHS = ["/invoices", "/clients", "/dashboard", "/reports"];

function readCsvFile(formData: FormData): { file: File } | { error: string } {
  const file = formData.get("csv");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose a CSV file" };
  if (file.size > MAX_CSV_BYTES) return { error: "The CSV can be up to 4 MB" };
  return { file };
}

async function deleteFiles(paths: (string | null)[]) {
  for (const path of paths) {
    if (!path) continue;
    try {
      await getStorage().delete(path);
    } catch {
      /* ignore */
    }
  }
}

export type InspectResult =
  | { ok: true; headers: string[]; mapping: ColumnMapping; rowCount: number }
  | { ok: false; error: string };

/** Read a file's columns and suggest how they map. Stores nothing. */
export async function inspectInvoiceImportCsv(formData: FormData): Promise<InspectResult> {
  const read = readCsvFile(formData);
  if ("error" in read) return { ok: false, error: read.error };
  return mutateWide<InspectResult>("accounts:write", async () => {
    const table = parseCsv(await read.file.text());
    if (table.length < 2) return { ok: false, error: "No data rows found in the CSV" };
    const headers = table[0].map((h) => h.trim());
    return {
      ok: true,
      headers,
      mapping: suggestMapping(headers),
      rowCount: table.length - 1,
    };
  });
}

function duplicateProblem(
  invoice: ParsedInvoice,
  existing: { number: string; grossPence: number; clientEmail: string | null; clientName: string; clientCompany: string | null } | undefined,
): "same" | "different" | null {
  if (!existing) return null;
  const sameClient =
    (invoice.client.email && invoice.client.email === existing.clientEmail?.toLowerCase()) ||
    [invoice.client.companyName, invoice.client.name].some(
      (n) =>
        n &&
        [existing.clientCompany, existing.clientName].some(
          (m) => m?.toLowerCase() === n.toLowerCase(),
        ),
    );
  return sameClient && existing.grossPence === invoice.grossPence ? "same" : "different";
}

function draftStatus(draft: ParsedDraft): "needs_review" | "ready" {
  return draft.errors.length > 0 ? "needs_review" : "ready";
}

/** Parse on the server and stage for review. Nothing becomes an invoice here. */
export async function stageInvoiceImport(
  formData: FormData,
): Promise<ActionResult> {
  const read = readCsvFile(formData);
  if ("error" in read) return { ok: false, error: read.error };
  let mapping: ColumnMapping;
  try {
    mapping = JSON.parse(String(formData.get("mapping") ?? "{}")) as ColumnMapping;
  } catch {
    return { ok: false, error: "Invalid column mapping" };
  }
  const dateFormat: ImportDateFormat =
    formData.get("dateFormat") === "mdy" ? "mdy" : "dmy";
  if (!mapping.issueDate) return { ok: false, error: "Choose which column holds the issue date" };
  if (!mapping.clientName && !mapping.clientCompany && !mapping.clientEmail) {
    return { ok: false, error: "Choose which column identifies the client" };
  }
  if (!mapping.gross && !mapping.net && !mapping.unitPrice && !mapping.lineNet) {
    return { ok: false, error: "Choose which column holds the amount" };
  }

  return mutate("accounts:write", async ({ companyId, localUserId }) => {
    const db = getDb();
    const [company] = await db
      .select({ terms: companies.invoicePaymentTermsDays })
      .from(companies)
      .where(eq(companies.id, companyId));
    const parsed = parseInvoiceImport(await read.file.text(), mapping, {
      dateFormat,
      paymentTermsDays: company.terms,
    });
    if (parsed.rowCount > MAX_IMPORT_ROWS) {
      return { ok: false, error: `A file can have up to ${MAX_IMPORT_ROWS.toLocaleString("en-GB")} rows. Split it and import each part.` };
    }
    if (parsed.drafts.length > MAX_IMPORT_INVOICES) {
      return { ok: false, error: `A file can have up to ${MAX_IMPORT_INVOICES.toLocaleString("en-GB")} invoices. Split it and import each part.` };
    }
    if (parsed.drafts.length === 0 && parsed.skipped.length === 0) {
      return { ok: false, error: "No data rows found in the CSV" };
    }

    const [existingInvoices, existingClients] = await Promise.all([
      db
        .select({
          number: invoices.number,
          grossPence: invoices.grossPence,
          clientEmail: clients.email,
          clientName: clients.name,
          clientCompany: clients.companyName,
        })
        .from(invoices)
        .innerJoin(clients, eq(invoices.clientId, clients.id))
        .where(eq(invoices.companyId, companyId)),
      db
        .select({
          id: clients.id,
          name: clients.name,
          companyName: clients.companyName,
          email: clients.email,
        })
        .from(clients)
        .where(eq(clients.companyId, companyId)),
    ]);
    const byNumber = new Map(existingInvoices.map((i) => [i.number.toLowerCase(), i]));

    const skipped = [...parsed.skipped];
    const stageable: ParsedDraft[] = [];
    for (const draft of parsed.drafts) {
      const key = draft.invoice.number?.toLowerCase();
      if (key) {
        const problem = duplicateProblem(draft.invoice, byNumber.get(key));
        if (problem === "same") {
          skipped.push({
            rows: draft.invoice.sourceRows,
            number: draft.invoice.number,
            reason: "Already in Alfa",
          });
          continue;
        }
        if (problem === "different") {
          draft.errors.push(
            `Invoice number ${draft.invoice.number} already exists in Alfa with different details`,
          );
        }
      }
      stageable.push(draft);
    }

    const resolutions: Record<string, string | null> = {};
    for (const { invoice } of stageable) {
      if (invoice.client.key in resolutions) continue;
      const suggestion = suggestClient(invoice.client, existingClients);
      resolutions[invoice.client.key] = suggestion.preselect ? suggestion.clientId : null;
    }

    const batchId = await db.transaction(async (tx) => {
      const [batch] = await tx
        .insert(invoiceImportBatches)
        .values({
          companyId,
          kind: "csv",
          filename: read.file.name,
          columnMapping: mapping as Record<string, string>,
          dateFormat,
          clientResolutions: resolutions,
          skippedRows: skipped,
          createdByUserId: localUserId,
        })
        .returning({ id: invoiceImportBatches.id });
      for (let i = 0; i < stageable.length; i += INSERT_CHUNK) {
        await tx.insert(invoiceImportDrafts).values(
          stageable.slice(i, i + INSERT_CHUNK).map((draft, offset) => ({
            batchId: batch.id,
            companyId,
            position: i + offset,
            status: draftStatus(draft),
            parsed: draft.invoice,
            errors: draft.errors,
            warnings: draft.warnings,
          })),
        );
      }
      return batch.id;
    });
    return { ok: true, id: batchId };
  });
}

async function loadBatch(companyId: string, batchId: string) {
  const [batch] = await getDb()
    .select()
    .from(invoiceImportBatches)
    .where(
      and(
        eq(invoiceImportBatches.id, batchId),
        eq(invoiceImportBatches.companyId, companyId),
      ),
    )
    .limit(1);
  return batch ?? null;
}

/** Link a client in the file to an existing client, or null to create a new one. */
export async function setImportClientResolution(
  batchId: string,
  key: string,
  clientId: string | null,
): Promise<ActionResult> {
  return mutate(
    "accounts:write",
    async ({ companyId }) => {
      return getDb().transaction(async (tx): Promise<ActionResult> => {
        // Read under a row lock, so two choices made together both survive.
        const [batch] = await tx
          .select()
          .from(invoiceImportBatches)
          .where(
            and(
              eq(invoiceImportBatches.id, batchId),
              eq(invoiceImportBatches.companyId, companyId),
            ),
          )
          .for("update");
        if (!batch || batch.status !== "draft") return { ok: false, error: "Import not found" };
        if (!(key in batch.clientResolutions)) return { ok: false, error: "Client not found in this import" };
        if (clientId) {
          const [client] = await tx
            .select({ id: clients.id })
            .from(clients)
            .where(and(eq(clients.id, clientId), eq(clients.companyId, companyId)))
            .limit(1);
          if (!client) return { ok: false, error: "Client not found" };
        }
        await tx
          .update(invoiceImportBatches)
          .set({ clientResolutions: { ...batch.clientResolutions, [key]: clientId } })
          .where(
            and(
              eq(invoiceImportBatches.id, batchId),
              eq(invoiceImportBatches.companyId, companyId),
            ),
          );
        return { ok: true };
      });
    },
    { paths: [`/invoices/import/${batchId}`] },
  );
}

/** Leave invoices out of the import, or bring back ones left out. */
export async function setImportDraftsSkipped(
  batchId: string,
  selection: { draftId: string } | { allWithErrors: true },
  skip: boolean,
): Promise<ActionResult> {
  return mutate(
    "accounts:write",
    async ({ companyId }) => {
      const db = getDb();
      const batch = await loadBatch(companyId, batchId);
      if (!batch || batch.status !== "draft") return { ok: false, error: "Import not found" };
      const scope = and(
        eq(invoiceImportDrafts.batchId, batchId),
        eq(invoiceImportDrafts.companyId, companyId),
      );
      if ("allWithErrors" in selection) {
        await db
          .update(invoiceImportDrafts)
          .set({ status: "skipped" })
          .where(and(scope, eq(invoiceImportDrafts.status, "needs_review")));
        return { ok: true };
      }
      await db
        .update(invoiceImportDrafts)
        .set({
          status: skip
            ? "skipped"
            : sql`case when jsonb_array_length(${invoiceImportDrafts.errors}) > 0 then 'needs_review' else 'ready' end`,
        })
        .where(
          and(
            scope,
            eq(invoiceImportDrafts.id, selection.draftId),
            inArray(invoiceImportDrafts.status, ["needs_review", "ready", "skipped"]),
          ),
        );
      return { ok: true };
    },
    { paths: [`/invoices/import/${batchId}`] },
  );
}

export type CommitChunkResult =
  | { ok: true; committed: number; remaining: number }
  | { ok: false; error: string };

/**
 * Turn the next chunk of reviewed drafts into invoices. Each call is one
 * transaction, so a large import shows progress and can be re-run after a
 * failure: committed drafts aren't picked up again.
 */
export async function commitInvoiceImportChunk(
  batchId: string,
): Promise<CommitChunkResult> {
  return mutateWide<CommitChunkResult>(
    "accounts:write",
    async ({ companyId, localUserId }) => {
      const db = getDb();
      const result = await db.transaction(async (tx): Promise<CommitChunkResult> => {
        // Under the lock saveInvoiceCutover takes, so a cutover saved while this
        // runs can't leave rows flagged against the old date.
        await tx.execute(
          sql`select id from companies where id = ${companyId} for update`,
        );
        const [company] = await tx
          .select()
          .from(companies)
          .where(eq(companies.id, companyId));
        if (!company.invoiceCutoverDate) {
          return { ok: false, error: "Set a cutover date before importing" };
        }
        const cutover = company.invoiceCutoverDate;

        const [batch] = await tx
          .select()
          .from(invoiceImportBatches)
          .where(
            and(
              eq(invoiceImportBatches.id, batchId),
              eq(invoiceImportBatches.companyId, companyId),
            ),
          )
          .for("update");
        if (!batch || batch.status !== "draft") {
          return { ok: false, error: "This import is no longer open" };
        }

        const unresolved = await tx
          .select({ id: invoiceImportDrafts.id })
          .from(invoiceImportDrafts)
          .where(
            and(
              eq(invoiceImportDrafts.batchId, batchId),
              eq(invoiceImportDrafts.companyId, companyId),
              eq(invoiceImportDrafts.status, "needs_review"),
            ),
          )
          .limit(1);
        if (unresolved[0]) {
          return { ok: false, error: "Leave out or fix the invoices with problems first" };
        }

        const drafts = await tx
          .select()
          .from(invoiceImportDrafts)
          .where(
            and(
              eq(invoiceImportDrafts.batchId, batchId),
              eq(invoiceImportDrafts.companyId, companyId),
              eq(invoiceImportDrafts.status, "ready"),
            ),
          )
          .orderBy(asc(invoiceImportDrafts.position))
          .limit(COMMIT_CHUNK);

        const flag = async (draftId: string, error: string) => {
          await tx
            .update(invoiceImportDrafts)
            .set({ status: "needs_review", errors: [error] })
            .where(
              and(
                eq(invoiceImportDrafts.id, draftId),
                eq(invoiceImportDrafts.companyId, companyId),
              ),
            );
          return { ok: false as const, error };
        };

        const numbers = drafts.flatMap((d) =>
          d.parsed.number ? [d.parsed.number.toLowerCase()] : [],
        );
        const taken =
          numbers.length === 0
            ? []
            : await tx
                .select({ number: invoices.number })
                .from(invoices)
                .where(
                  and(
                    eq(invoices.companyId, companyId),
                    inArray(sql`lower(${invoices.number})`, numbers),
                  ),
                );
        const takenNumbers = new Set(taken.map((t) => t.number.toLowerCase()));

        for (const draft of drafts) {
          const { parsed } = draft;
          if (parsed.number && takenNumbers.has(parsed.number.toLowerCase())) {
            return flag(draft.id, `Invoice number ${parsed.number} is already in Alfa`);
          }
          const broughtForward = isBroughtForward(parsed.issueDate, cutover);
          const paymentDate = parsed.amountPaidPence > 0 ? parsed.paidDate ?? parsed.issueDate : null;
          // A brought-forward invoice moves no figures, except a payment from cutover onwards.
          const dates = broughtForward
            ? paymentDate && paymentDate >= cutover
              ? [paymentDate]
              : []
            : [parsed.issueDate, paymentDate];
          const locked = periodLockError(company.booksLockedThrough, ...dates);
          if (locked) return flag(draft.id, locked);
        }

        const resolutions: Record<string, string | null> = { ...batch.clientResolutions };
        const createdClientIds = [...batch.createdClientIds];
        const clientIds = Object.values(resolutions).filter((id): id is string => Boolean(id));
        const valid = clientIds.length
          ? await tx
              .select({ id: clients.id })
              .from(clients)
              .where(and(eq(clients.companyId, companyId), inArray(clients.id, clientIds)))
          : [];
        const validIds = new Set(valid.map((c) => c.id));
        // Before anything is written: returning from this transaction commits it.
        for (const { parsed } of drafts) {
          const chosen = resolutions[parsed.client.key];
          if (chosen && !validIds.has(chosen)) {
            return { ok: false, error: `A client chosen for ${parsed.number ?? "an invoice"} no longer exists` };
          }
        }

        await advanceInvoiceSequences(
          tx,
          companyId,
          drafts.flatMap((d) => (d.parsed.number ? [d.parsed.number] : [])),
        );

        const createdInvoiceIds: string[] = [];
        for (const draft of drafts) {
          const { parsed } = draft;
          let clientId = resolutions[parsed.client.key] ?? null;
          if (!clientId) {
            const [created] = await tx
              .insert(clients)
              .values({
                companyId,
                name: parsed.client.name || parsed.client.companyName || parsed.client.email || "Client",
                companyName: parsed.client.companyName,
                email: parsed.client.email,
                addressLines: parsed.client.address,
              })
              .returning({ id: clients.id });
            clientId = created.id;
            resolutions[parsed.client.key] = clientId;
            validIds.add(clientId);
            createdClientIds.push(clientId);
          }

          const paymentDate = parsed.amountPaidPence > 0 ? parsed.paidDate ?? parsed.issueDate : null;
          const [invoice] = await tx
            .insert(invoices)
            .values({
              companyId,
              number: parsed.number ?? `IMP-${batchId.slice(0, 8)}-${draft.position + 1}`,
              clientId,
              status: parsed.status,
              issueDate: parsed.issueDate,
              dueDate: parsed.dueDate,
              netPence: parsed.netPence,
              vatPence: parsed.vatPence,
              grossPence: parsed.grossPence,
              paidAt:
                parsed.status === "paid" && paymentDate
                  ? new Date(`${paymentDate}T12:00:00Z`)
                  : null,
              createdByUserId: localUserId,
              source: "import",
              chaseEnabled: false,
              broughtForward: isBroughtForward(parsed.issueDate, cutover),
              importBatchId: batchId,
              originalDocumentPath: draft.documentPath,
              originalDocumentFilename: draft.documentFilename,
              originalDocumentSize: draft.documentSize,
              originalDocumentSha256: draft.documentSha256,
            })
            .returning({ id: invoices.id });
          createdInvoiceIds.push(invoice.id);

          await tx.insert(invoiceLineItems).values(
            parsed.lines.map((line, position) => ({
              invoiceId: invoice.id,
              description: line.description,
              quantity: line.quantity,
              unitPricePence: line.unitPricePence,
              vatRate: line.vatRate,
              discountPercent: line.discountPercent,
              position,
            })),
          );
          if (paymentDate) {
            await tx.insert(payments).values({
              invoiceId: invoice.id,
              amountPence: parsed.amountPaidPence,
              receivedAt: new Date(`${paymentDate}T12:00:00Z`),
              reference: parsed.paymentReference,
              method: "import",
            });
          }
          await tx
            .update(invoiceImportDrafts)
            .set({ status: "committed", invoiceId: invoice.id })
            .where(
              and(
                eq(invoiceImportDrafts.id, draft.id),
                eq(invoiceImportDrafts.companyId, companyId),
              ),
            );
        }

        const remaining = await tx
          .select({ count: sql<number>`count(*)`.mapWith(Number) })
          .from(invoiceImportDrafts)
          .where(
            and(
              eq(invoiceImportDrafts.batchId, batchId),
              eq(invoiceImportDrafts.companyId, companyId),
              eq(invoiceImportDrafts.status, "ready"),
            ),
          );
        const left = remaining[0]?.count ?? 0;
        await tx
          .update(invoiceImportBatches)
          .set({
            clientResolutions: resolutions,
            createdClientIds,
            ...(left === 0 ? { status: "committed" as const, committedAt: new Date() } : {}),
          })
          .where(
            and(
              eq(invoiceImportBatches.id, batchId),
              eq(invoiceImportBatches.companyId, companyId),
            ),
          );
        await tx.insert(auditLog).values({
          companyId,
          actorUserId: localUserId,
          action: "invoice_import.commit",
          entityType: "invoice_import_batch",
          entityId: batchId,
          meta: { invoiceIds: createdInvoiceIds },
        });
        return { ok: true, committed: drafts.length, remaining: left };
      });

      // Files for drafts the user left out aren't needed once the import is saved.
      if (result.ok && result.remaining === 0) {
        const leftOut = await db
          .select({ path: invoiceImportDrafts.documentPath })
          .from(invoiceImportDrafts)
          .where(
            and(
              eq(invoiceImportDrafts.batchId, batchId),
              eq(invoiceImportDrafts.companyId, companyId),
              eq(invoiceImportDrafts.status, "skipped"),
            ),
          );
        await deleteFiles(leftOut.map((f) => f.path));
      }
      return result;
    },
    { paths: PATHS },
  );
}

export type UndoResult =
  | { ok: true; removed: number; kept: { number: string; reason: string }[] }
  | { ok: false; error: string };

/** Remove a committed import's invoices, keeping any that have real activity. */
export async function undoInvoiceImport(batchId: string): Promise<UndoResult> {
  return mutateWide<UndoResult>(
    "accounts:write",
    async ({ companyId, localUserId }) => {
      const db = getDb();
      const outcome = await db.transaction(async (tx) => {
        await tx.execute(
          sql`select id from companies where id = ${companyId} for update`,
        );
        const [company] = await tx
          .select()
          .from(companies)
          .where(eq(companies.id, companyId));
        const [batch] = await tx
          .select()
          .from(invoiceImportBatches)
          .where(
            and(
              eq(invoiceImportBatches.id, batchId),
              eq(invoiceImportBatches.companyId, companyId),
            ),
          )
          .for("update");
        if (!batch || !["draft", "committed"].includes(batch.status)) {
          return { ok: false as const, error: "This import can't be undone" };
        }

        const rows = await tx
          .select()
          .from(invoices)
          .where(
            and(
              eq(invoices.companyId, companyId),
              eq(invoices.importBatchId, batchId),
            ),
          );
        const ids = rows.map((r) => r.id);
        const none = ids.length === 0;
        const [paymentRows, creditRows, matchRows, jobRows, claimRows] = none
          ? [[], [], [], [], []]
          : await Promise.all([
              tx.select({ id: payments.id, invoiceId: payments.invoiceId, method: payments.method, receivedAt: payments.receivedAt }).from(payments).where(inArray(payments.invoiceId, ids)),
              tx.select({ invoiceId: creditNotes.invoiceId }).from(creditNotes).where(inArray(creditNotes.invoiceId, ids)),
              tx
                .select({ invoiceId: reconciliationMatches.invoiceId, paymentInvoiceId: payments.invoiceId })
                .from(reconciliationMatches)
                .leftJoin(payments, eq(reconciliationMatches.paymentId, payments.id))
                .where(or(inArray(reconciliationMatches.invoiceId, ids), inArray(payments.invoiceId, ids))),
              tx.select({ invoiceId: sendJobs.invoiceId }).from(sendJobs).where(and(inArray(sendJobs.invoiceId, ids), eq(sendJobs.status, "sent"))),
              tx.select({ invoiceId: invoices.latePaymentForInvoiceId }).from(invoices).where(inArray(invoices.latePaymentForInvoiceId, ids)),
            ]);

        const reasons = new Map<string, string>();
        const block = (id: string | null, reason: string) => {
          if (id && !reasons.has(id)) reasons.set(id, reason);
        };
        for (const p of paymentRows) if (p.method !== "import") block(p.invoiceId, "Has a payment recorded in Alfa");
        for (const c of creditRows) block(c.invoiceId, "Has a credit note");
        for (const m of matchRows) block(m.invoiceId ?? m.paymentInvoiceId, "Matched to a bank transaction");
        for (const j of jobRows) block(j.invoiceId, "Has been emailed to the client");
        for (const c of claimRows) block(c.invoiceId, "Has a late payment claim");
        // The same dates saving checks: removing an invoice moves whatever saving it added.
        const cutover = company.invoiceCutoverDate;
        for (const inv of rows) {
          const paid = paymentRows
            .filter((p) => p.invoiceId === inv.id)
            .map((p) => todayIsoDate(p.receivedAt));
          const dates = inv.broughtForward
            ? paid.filter((d) => cutover && d >= cutover)
            : [inv.issueDate, ...paid];
          if (periodLockError(company.booksLockedThrough, ...dates)) {
            block(inv.id, "Falls in the locked period");
          }
        }

        const removable = rows.filter((r) => !reasons.has(r.id));
        if (removable.length > 0) {
          await tx.delete(invoices).where(
            and(
              eq(invoices.companyId, companyId),
              inArray(invoices.id, removable.map((r) => r.id)),
            ),
          );
        }

        const stillUsed = new Set<string>();
        if (batch.createdClientIds.length > 0) {
          const used = await Promise.all(
            [invoices, quotes, orders, creditNotes].map((table) =>
              tx
                .select({ clientId: table.clientId })
                .from(table)
                .where(inArray(table.clientId, batch.createdClientIds)),
            ),
          );
          for (const rowsForTable of used) {
            for (const row of rowsForTable) stillUsed.add(row.clientId);
          }
          const unused = batch.createdClientIds.filter((id) => !stillUsed.has(id));
          if (unused.length > 0) {
            await tx
              .delete(clients)
              .where(and(eq(clients.companyId, companyId), inArray(clients.id, unused)));
          }
        }

        const kept = rows
          .filter((r) => reasons.has(r.id))
          .map((r) => ({ number: r.number, reason: reasons.get(r.id)! }));
        await tx
          .update(invoiceImportBatches)
          .set(
            kept.length === 0
              ? { status: "undone", undoneAt: new Date() }
              : { createdClientIds: [...stillUsed] },
          )
          .where(
            and(
              eq(invoiceImportBatches.id, batchId),
              eq(invoiceImportBatches.companyId, companyId),
            ),
          );
        await tx.insert(auditLog).values({
          companyId,
          actorUserId: localUserId,
          action: "invoice_import.undo",
          entityType: "invoice_import_batch",
          entityId: batchId,
          meta: {
            removedInvoiceIds: removable.map((r) => r.id),
            kept: kept.map((k) => k.number),
          },
        });
        return { ok: true as const, removable, kept };
      });
      if (!outcome.ok) return outcome;

      await deleteFiles(
        outcome.removable.flatMap((row) => [row.originalDocumentPath, row.pdfBlobPath]),
      );
      return { ok: true, removed: outcome.removable.length, kept: outcome.kept };
    },
    { paths: PATHS },
  );
}

/** Abandon an import that hasn't been committed. */
export async function discardInvoiceImport(batchId: string): Promise<ActionResult> {
  return mutate(
    "accounts:write",
    async ({ companyId, localUserId }) => {
      const db = getDb();
      const batch = await loadBatch(companyId, batchId);
      if (!batch || batch.status !== "draft") return { ok: false, error: "This import is no longer open" };
      const [partial] = await db
        .select({ id: invoiceImportDrafts.id })
        .from(invoiceImportDrafts)
        .where(
          and(
            eq(invoiceImportDrafts.batchId, batchId),
            eq(invoiceImportDrafts.companyId, companyId),
            eq(invoiceImportDrafts.status, "committed"),
          ),
        )
        .limit(1);
      if (partial) return { ok: false, error: "Part of this import is committed. Undo it instead." };
      const files = await db
        .select({ path: invoiceImportDrafts.documentPath })
        .from(invoiceImportDrafts)
        .where(
          and(
            eq(invoiceImportDrafts.batchId, batchId),
            eq(invoiceImportDrafts.companyId, companyId),
          ),
        );
      await db.transaction(async (tx) => {
        await tx
          .delete(invoiceImportDrafts)
          .where(
            and(
              eq(invoiceImportDrafts.batchId, batchId),
              eq(invoiceImportDrafts.companyId, companyId),
            ),
          );
        await tx
          .update(invoiceImportBatches)
          .set({ status: "discarded" })
          .where(
            and(
              eq(invoiceImportBatches.id, batchId),
              eq(invoiceImportBatches.companyId, companyId),
            ),
          );
        await tx.insert(auditLog).values({
          companyId,
          actorUserId: localUserId,
          action: "invoice_import.discard",
          entityType: "invoice_import_batch",
          entityId: batchId,
        });
      });
      await deleteFiles(files.map((f) => f.path));
      return { ok: true };
    },
    { paths: ["/invoices"] },
  );
}

/** Set the next invoice number for this year. It can't go below what's been used. */
export async function setNextInvoiceSequence(next: number): Promise<ActionResult> {
  if (!Number.isInteger(next) || next < 1 || next > 999_999_999) {
    return { ok: false, error: "Enter a whole number" };
  }
  return mutate(
    "settings:manage",
    async ({ companyId, localUserId }) => {
      const year = Number(todayIsoDate().slice(0, 4));
      const seriesKey = [
        documentSequences.companyId,
        documentSequences.kind,
        documentSequences.year,
      ];
      return getDb().transaction(async (tx): Promise<ActionResult> => {
        // Hold the series row, which allocation also takes, so no number can be
        // issued between checking what's been used and saving the new value.
        await tx
          .insert(documentSequences)
          .values({ companyId, kind: "invoice", year, nextSeq: 1 })
          .onConflictDoUpdate({
            target: seriesKey,
            set: { nextSeq: sql`${documentSequences.nextSeq}` },
          });
        const [company] = await tx
          .select({ prefix: companies.invoiceNumberPrefix })
          .from(companies)
          .where(eq(companies.id, companyId));
        const prefix = company.prefix || "DD";
        const numbers = await tx
          .select({ number: invoices.number })
          .from(invoices)
          .where(eq(invoices.companyId, companyId));
        const highest =
          highestSeqByYear(prefix, numbers.map((n) => n.number)).get(year) ?? 0;
        if (next <= highest) {
          return {
            ok: false,
            error: `${formatInvoiceNumber(prefix, year, highest)} has been used, so start from ${highest + 1} or higher`,
          };
        }
        await tx
          .update(documentSequences)
          .set({ nextSeq: next })
          .where(
            and(
              eq(documentSequences.companyId, companyId),
              eq(documentSequences.kind, "invoice"),
              eq(documentSequences.year, year),
            ),
          );
        await tx.insert(auditLog).values({
          companyId,
          actorUserId: localUserId,
          action: "invoice.next_number_change",
          entityType: "company",
          entityId: companyId,
          meta: { year, next },
        });
        return { ok: true };
      });
    },
    { paths: ["/invoices"] },
  );
}
