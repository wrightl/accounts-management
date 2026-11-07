import "server-only";
import { and, asc, desc, eq, inArray, ne, sql } from "drizzle-orm";
import { getDb } from "@/db";
import {
  clients,
  companies,
  documentSequences,
  invoiceImportBatches,
  invoiceImportDrafts,
} from "@/db/schema";
import { clientDisplayName } from "@/lib/clients/display";
import { todayIsoDate } from "@/lib/dates";
import { isBroughtForward } from "@/lib/invoices/cutover";
import { suggestClient } from "@/lib/invoices/import/clients";
import { readLocally } from "@/lib/invoices/import/pdf-local";
import { importExpiresAt } from "@/lib/invoices/import/purge";
import { formatInvoiceNumber } from "@/lib/invoices/numbering";

/** Rows shown on the review page; the counts always cover the whole batch. */
const MAX_REVIEW_ROWS = 500;

export async function getImportBatchReview(companyId: string, batchId: string) {
  const db = getDb();
  const [batch] = await db
    .select()
    .from(invoiceImportBatches)
    .where(
      and(
        eq(invoiceImportBatches.id, batchId),
        eq(invoiceImportBatches.companyId, companyId),
      ),
    )
    .limit(1);
  if (!batch) return null;

  const [drafts, existingClients, [company], [series]] = await Promise.all([
    db
      .select()
      .from(invoiceImportDrafts)
      .where(
        and(
          eq(invoiceImportDrafts.batchId, batchId),
          eq(invoiceImportDrafts.companyId, companyId),
        ),
      )
      .orderBy(asc(invoiceImportDrafts.position)),
    db
      .select({
        id: clients.id,
        name: clients.name,
        companyName: clients.companyName,
        email: clients.email,
      })
      .from(clients)
      .where(eq(clients.companyId, companyId)),
    db.select().from(companies).where(eq(companies.id, companyId)),
    db
      .select({ nextSeq: documentSequences.nextSeq })
      .from(documentSequences)
      .where(
        and(
          eq(documentSequences.companyId, companyId),
          eq(documentSequences.kind, "invoice"),
          eq(documentSequences.year, Number(todayIsoDate().slice(0, 4))),
        ),
      ),
  ]);

  const cutover = company.invoiceCutoverDate;
  const clientRows = new Map<
    string,
    {
      key: string;
      label: string;
      email: string | null;
      invoiceCount: number;
      grossPence: number;
      resolution: string | null;
      suggestion: ReturnType<typeof suggestClient>;
    }
  >();
  let broughtForward = 0;
  let counted = 0;
  let netInAccounts = 0;
  let vatInAccounts = 0;
  const counts = { needs_review: 0, ready: 0, skipped: 0, committed: 0 };
  for (const draft of drafts) {
    counts[draft.status] += 1;
    if (draft.status === "skipped") continue;
    const { parsed } = draft;
    if (isBroughtForward(parsed.issueDate, cutover)) broughtForward += 1;
    else {
      counted += 1;
      netInAccounts += parsed.netPence;
      vatInAccounts += parsed.vatPence;
    }
    const row = clientRows.get(parsed.client.key);
    if (row) {
      row.invoiceCount += 1;
      row.grossPence += parsed.grossPence;
    } else {
      clientRows.set(parsed.client.key, {
        key: parsed.client.key,
        label: parsed.client.companyName || parsed.client.name || parsed.client.email || "Client",
        email: parsed.client.email,
        invoiceCount: 1,
        grossPence: parsed.grossPence,
        resolution: batch.clientResolutions[parsed.client.key] ?? null,
        suggestion: suggestClient(parsed.client, existingClients),
      });
    }
  }

  const year = Number(todayIsoDate().slice(0, 4));
  // The daily purge leaves an import alone once any of it is saved.
  const expiresAt =
    batch.status === "draft" && counts.committed === 0 ? importExpiresAt(batch.createdAt) : null;
  const prefix = company.invoiceNumberPrefix || "DD";
  return {
    batch,
    drafts: drafts.slice(0, MAX_REVIEW_ROWS),
    totalDrafts: drafts.length,
    counts,
    clients: [...clientRows.values()],
    approvable: drafts.filter(
      (d) =>
        d.status === "needs_review" && d.errors.length === 0 && !readLocally(d.warnings),
    ).length,
    existingClients: existingClients.map((c) => ({
      id: c.id,
      label: clientDisplayName(c),
    })),
    cutover,
    broughtForward,
    counted,
    netInAccounts,
    vatInAccounts,
    nextNumber: formatInvoiceNumber(prefix, year, series?.nextSeq ?? 1),
    nextSeq: series?.nextSeq ?? 1,
    expiresAt,
  };
}

export type ImportBatchReview = NonNullable<
  Awaited<ReturnType<typeof getImportBatchReview>>
>;

type DraftCounts = { needs_review: number; ready: number; skipped: number; committed: number };

/** The company's imports, newest first. Discarded ones have nothing left to show. */
export async function listImportBatches(companyId: string, { openOnly = false } = {}) {
  const db = getDb();
  const batches = await db
    .select({
      id: invoiceImportBatches.id,
      kind: invoiceImportBatches.kind,
      status: invoiceImportBatches.status,
      filename: invoiceImportBatches.filename,
      createdAt: invoiceImportBatches.createdAt,
      committedAt: invoiceImportBatches.committedAt,
      undoneAt: invoiceImportBatches.undoneAt,
    })
    .from(invoiceImportBatches)
    .where(
      and(
        eq(invoiceImportBatches.companyId, companyId),
        openOnly
          ? eq(invoiceImportBatches.status, "draft")
          : ne(invoiceImportBatches.status, "discarded"),
      ),
    )
    .orderBy(desc(invoiceImportBatches.createdAt));
  if (batches.length === 0) return [];

  const rows = await db
    .select({
      batchId: invoiceImportDrafts.batchId,
      status: invoiceImportDrafts.status,
      count: sql<number>`count(*)`.mapWith(Number),
    })
    .from(invoiceImportDrafts)
    .where(
      and(
        eq(invoiceImportDrafts.companyId, companyId),
        inArray(
          invoiceImportDrafts.batchId,
          batches.map((b) => b.id),
        ),
      ),
    )
    .groupBy(invoiceImportDrafts.batchId, invoiceImportDrafts.status);
  const counts = new Map<string, DraftCounts>();
  for (const row of rows) {
    const c = counts.get(row.batchId) ?? { needs_review: 0, ready: 0, skipped: 0, committed: 0 };
    c[row.status] = row.count;
    counts.set(row.batchId, c);
  }

  return batches.map((b) => {
    const c = counts.get(b.id) ?? { needs_review: 0, ready: 0, skipped: 0, committed: 0 };
    return {
      ...b,
      counts: c,
      expiresAt: b.status === "draft" && c.committed === 0 ? importExpiresAt(b.createdAt) : null,
    };
  });
}

export type ImportBatchSummary = Awaited<ReturnType<typeof listImportBatches>>[number];

/** Imports started but not saved yet, for the invoice list banner. */
export function getOpenImports(companyId: string) {
  return listImportBatches(companyId, { openOnly: true });
}
