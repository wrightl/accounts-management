import "server-only";
import { isTaxCode } from "@/lib/tax-codes";
import type { DocumentCurrencyColumns } from "@/lib/document-rate";
import type { Database } from "@/db";
import { quoteVersions } from "@/db/schema";
import type { QuoteVersionLine, QuoteVersionSource } from "@/lib/quotes/status";

type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];

/** A quote as it stood at one version, including its currency and rate. */
export interface QuoteSnapshot extends DocumentCurrencyColumns {
  clientId: string;
  issueDate: string | null;
  validUntil: string | null;
  notes: string | null;
  /** Prices in `currency`'s minor units. */
  lines: QuoteVersionLine[];
}

/** The currency columns of a snapshot, to store on the quote or a version. */
export function snapshotCurrencyColumns(s: DocumentCurrencyColumns): DocumentCurrencyColumns {
  return {
    currency: s.currency,
    fxRate: s.fxRate,
    fxRateDate: s.fxRateDate,
    fxRateSource: s.fxRateSource,
    netMinor: s.netMinor,
    vatMinor: s.vatMinor,
    grossMinor: s.grossMinor,
    netPence: s.netPence,
    vatPence: s.vatPence,
    grossPence: s.grossPence,
  };
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
    ...snapshotCurrencyColumns(params.snapshot),
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
    taxCode?: string | null;
    taxCodeNeedsReview?: boolean;
    discountPercent?: number;
    position: number;
  }[],
): QuoteVersionLine[] {
  return lines.map((l) => ({
    description: l.description,
    quantity: l.quantity,
    unitPricePence: l.unitPricePence,
    vatRate: l.vatRate ?? 0,
    ...(isTaxCode(l.taxCode)
      ? { taxCode: l.taxCode, taxCodeNeedsReview: l.taxCodeNeedsReview === true }
      : {}),
    discountPercent: l.discountPercent ?? 0,
    position: l.position,
  }));
}
