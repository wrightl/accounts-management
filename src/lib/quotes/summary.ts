import "server-only";
import { and, eq, ne } from "drizzle-orm";
import { getDb } from "@/db";
import { clients, quotes } from "@/db/schema";
import { formatGBP } from "@/lib/money";
import {
  quoteFilterConditions,
  type QuoteListFilters,
} from "@/lib/quotes/queries";
import {
  quoteStatusLabel,
  type QuoteStatus,
} from "@/lib/quotes/status";

export type DeclineReasonSlice = {
  category: string;
  count: number;
  grossPence: number;
  grossFormatted: string;
  percent: number;
};

export type QuotesSummaryData = {
  totalCount: number;
  totalGrossFormatted: string;
  pipelineCount: number;
  pipelineGrossFormatted: string;
  declinedCount: number;
  declinedGrossFormatted: string;
  sentCount: number;
  expiringSoonCount: number;
  byStatus: Array<{
    status: QuoteStatus;
    label: string;
    count: number;
    grossFormatted: string;
  }>;
  declineReasons: DeclineReasonSlice[];
  largestQuote: { number: string; grossFormatted: string } | null;
  filtersActive: boolean;
};

export async function getQuotesSummary(
  companyId: string,
  filters: QuoteListFilters,
): Promise<QuotesSummaryData> {
  const db = getDb();
  const conditions = quoteFilterConditions(companyId, filters);
  const where = and(...conditions);

  const rows = await db
    .select({
      status: quotes.status,
      grossPence: quotes.grossPence,
      number: quotes.number,
      validUntil: quotes.validUntil,
      sentAt: quotes.sentAt,
      declinedReasonCategory: quotes.declinedReasonCategory,
    })
    .from(quotes)
    .innerJoin(clients, eq(quotes.clientId, clients.id))
    .where(where);

  const today = new Date().toISOString().slice(0, 10);
  const soon = new Date();
  soon.setDate(soon.getDate() + 30);
  const soonStr = soon.toISOString().slice(0, 10);

  let totalGrossPence = 0;
  let pipelineGrossPence = 0;
  let pipelineCount = 0;
  let declinedGrossPence = 0;
  let declinedCount = 0;
  let sentCount = 0;
  let expiringSoonCount = 0;
  let largestQuote: { number: string; grossPence: number } | null = null;

  const statusTotals = new Map<QuoteStatus, { count: number; grossPence: number }>();
  for (const status of ["draft", "sent", "accepted", "declined"] as QuoteStatus[]) {
    statusTotals.set(status, { count: 0, grossPence: 0 });
  }

  const declineByCategory = new Map<string, { count: number; grossPence: number }>();

  for (const row of rows) {
    totalGrossPence += row.grossPence;
    const bucket = statusTotals.get(row.status as QuoteStatus);
    if (bucket) {
      bucket.count += 1;
      bucket.grossPence += row.grossPence;
    }

    if (row.status === "draft" || row.status === "sent" || row.status === "accepted") {
      pipelineCount += 1;
      pipelineGrossPence += row.grossPence;
    }
    if (row.status === "declined") {
      declinedCount += 1;
      declinedGrossPence += row.grossPence;
      if (row.declinedReasonCategory) {
        const existing = declineByCategory.get(row.declinedReasonCategory) ?? {
          count: 0,
          grossPence: 0,
        };
        existing.count += 1;
        existing.grossPence += row.grossPence;
        declineByCategory.set(row.declinedReasonCategory, existing);
      }
    }
    if (row.sentAt) sentCount += 1;

    if (
      row.validUntil &&
      row.validUntil >= today &&
      row.validUntil <= soonStr &&
      row.status !== "declined" &&
      row.status !== "accepted"
    ) {
      expiringSoonCount += 1;
    }

    if (!largestQuote || row.grossPence > largestQuote.grossPence) {
      largestQuote = { number: row.number, grossPence: row.grossPence };
    }
  }

  const declineReasons: DeclineReasonSlice[] = Array.from(declineByCategory.entries())
    .map(([category, data]) => ({
      category,
      count: data.count,
      grossPence: data.grossPence,
      grossFormatted: formatGBP(data.grossPence),
      percent: declinedCount > 0 ? Math.round((data.count / declinedCount) * 100) : 0,
    }))
    .sort((a, b) => b.count - a.count);

  return {
    totalCount: rows.length,
    totalGrossFormatted: formatGBP(totalGrossPence),
    pipelineCount,
    pipelineGrossFormatted: formatGBP(pipelineGrossPence),
    declinedCount,
    declinedGrossFormatted: formatGBP(declinedGrossPence),
    sentCount,
    expiringSoonCount,
    byStatus: (["draft", "sent", "accepted", "declined"] as QuoteStatus[])
      .map((status) => {
        const bucket = statusTotals.get(status)!;
        return {
          status,
          label: quoteStatusLabel(status),
          count: bucket.count,
          grossFormatted: formatGBP(bucket.grossPence),
        };
      })
      .filter((row) => row.count > 0),
    declineReasons,
    largestQuote: largestQuote
      ? { number: largestQuote.number, grossFormatted: formatGBP(largestQuote.grossPence) }
      : null,
    filtersActive: Boolean(filters.status || filters.clientId),
  };
}

export type ExpiringQuoteRow = {
  id: string;
  number: string;
  clientName: string;
  validUntil: string;
  grossFormatted: string;
};

/** Open quotes expiring within 30 days, soonest first. */
export async function listExpiringQuotes(
  companyId: string,
  limit = 5,
): Promise<ExpiringQuoteRow[]> {
  const db = getDb();
  const today = new Date().toISOString().slice(0, 10);
  const soon = new Date();
  soon.setDate(soon.getDate() + 30);
  const soonStr = soon.toISOString().slice(0, 10);

  const rows = await db
    .select({
      id: quotes.id,
      number: quotes.number,
      validUntil: quotes.validUntil,
      grossPence: quotes.grossPence,
      clientName: clients.name,
      companyName: clients.companyName,
    })
    .from(quotes)
    .innerJoin(clients, eq(quotes.clientId, clients.id))
    .where(
      and(
        eq(quotes.companyId, companyId),
        ne(quotes.status, "declined"),
        ne(quotes.status, "accepted"),
      ),
    );

  return rows
    .filter(
      (row) =>
        row.validUntil &&
        row.validUntil >= today &&
        row.validUntil <= soonStr,
    )
    .sort((a, b) => (a.validUntil ?? "").localeCompare(b.validUntil ?? ""))
    .slice(0, limit)
    .map((row) => ({
      id: row.id,
      number: row.number,
      clientName: row.companyName?.trim() || row.clientName,
      validUntil: row.validUntil!,
      grossFormatted: formatGBP(row.grossPence),
    }));
}
