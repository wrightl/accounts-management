import "server-only";
import type { Database } from "@/db";
import { quoteVersions } from "@/db/schema";
import type { QuoteVersionLine, QuoteVersionSource } from "@/lib/quotes/status";

type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];

export interface QuoteSnapshot {
  clientId: string;
  issueDate: string | null;
  validUntil: string | null;
  notes: string | null;
  netPence: number;
  vatPence: number;
  grossPence: number;
  lines: QuoteVersionLine[];
}

export async function insertQuoteVersion(
  tx: Tx,
  params: {
    quoteId: string;
    version: number;
    snapshot: QuoteSnapshot;
    source: QuoteVersionSource;
    createdByUserId: string | null;
    rolledBackFromVersion?: number | null;
  },
) {
  await tx.insert(quoteVersions).values({
    quoteId: params.quoteId,
    version: params.version,
    clientId: params.snapshot.clientId,
    issueDate: params.snapshot.issueDate,
    validUntil: params.snapshot.validUntil,
    notes: params.snapshot.notes,
    netPence: params.snapshot.netPence,
    vatPence: params.snapshot.vatPence,
    grossPence: params.snapshot.grossPence,
    lines: params.snapshot.lines,
    source: params.source,
    rolledBackFromVersion: params.rolledBackFromVersion ?? null,
    createdByUserId: params.createdByUserId,
  });
}

export function linesToSnapshot(
  lines: {
    description: string;
    quantity: number;
    unitPricePence: number;
    vatRate?: number;
    position: number;
  }[],
): QuoteVersionLine[] {
  return lines.map((l) => ({
    description: l.description,
    quantity: l.quantity,
    unitPricePence: l.unitPricePence,
    vatRate: l.vatRate ?? 0,
    position: l.position,
  }));
}
