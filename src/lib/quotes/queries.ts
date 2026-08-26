import "server-only";
import { and, desc, eq, type SQL } from "drizzle-orm";
import { getDb } from "@/db";
import { clients, quoteLineItems, quotePaymentMilestones, quoteVersions, quotes, users } from "@/db/schema";
import { clientDisplayNameSql } from "@/lib/clients/sql";
import { formatGBP } from "@/lib/money";
import {
  formatQuoteReference,
  formatQuoteVersion,
  isQuoteStatus,
  type QuoteVersionLine,
} from "@/lib/quotes/status";
import { insertQuoteVersion, linesToSnapshot, type QuoteSnapshot } from "@/lib/quotes/versions";

export type QuoteListFilters = {
  status?: string;
  clientId?: string;
};

export function quoteFilterConditions(
  companyId: string,
  filters: QuoteListFilters,
): SQL[] {
  const conditions: SQL[] = [eq(quotes.companyId, companyId)];
  if (filters.status && isQuoteStatus(filters.status)) {
    conditions.push(eq(quotes.status, filters.status));
  }
  if (filters.clientId) {
    conditions.push(eq(quotes.clientId, filters.clientId));
  }
  return conditions;
}

export async function listQuotes(companyId: string, filters: QuoteListFilters = {}) {
  const db = getDb();
  const conditions = quoteFilterConditions(companyId, filters);
  const where = and(...conditions);

  const rows = await db
    .select({
      id: quotes.id,
      number: quotes.number,
      version: quotes.version,
      status: quotes.status,
      issueDate: quotes.issueDate,
      grossPence: quotes.grossPence,
      clientName: clientDisplayNameSql.as("client_name"),
    })
    .from(quotes)
    .innerJoin(clients, eq(quotes.clientId, clients.id))
    .where(where)
    .orderBy(desc(quotes.createdAt));

  return rows.map((r) => ({
    ...r,
    grossFormatted: formatGBP(r.grossPence),
    versionLabel: formatQuoteVersion(r.version),
  }));
}

export async function getQuoteDetail(companyId: string, id: string) {
  const db = getDb();
  const rows = await db
    .select({ quote: quotes, client: clients })
    .from(quotes)
    .innerJoin(clients, eq(quotes.clientId, clients.id))
    .where(and(eq(quotes.id, id), eq(quotes.companyId, companyId)))
    .limit(1);
  if (!rows[0]) return null;

  const lines = await db
    .select()
    .from(quoteLineItems)
    .where(eq(quoteLineItems.quoteId, id))
    .orderBy(quoteLineItems.position);

  const milestones = await db
    .select()
    .from(quotePaymentMilestones)
    .where(eq(quotePaymentMilestones.quoteId, id))
    .orderBy(quotePaymentMilestones.position);

  const quote = rows[0].quote;
  return {
    quote: {
      ...quote,
      grossFormatted: formatGBP(quote.grossPence),
      versionLabel: formatQuoteVersion(quote.version),
      reference: formatQuoteReference(quote.number, quote.version),
    },
    client: rows[0].client,
    lines,
    milestones,
  };
}

export async function listQuoteVersionHistory(companyId: string, quoteId: string) {
  const db = getDb();
  const detail = await getQuoteDetail(companyId, quoteId);
  if (!detail) return null;

  let rows = await db
    .select({
      version: quoteVersions.version,
      source: quoteVersions.source,
      grossPence: quoteVersions.grossPence,
      createdAt: quoteVersions.createdAt,
      rolledBackFromVersion: quoteVersions.rolledBackFromVersion,
      actorName: users.name,
    })
    .from(quoteVersions)
    .leftJoin(users, eq(quoteVersions.createdByUserId, users.id))
    .where(eq(quoteVersions.quoteId, quoteId))
    .orderBy(desc(quoteVersions.version));

  if (rows.length === 0) {
    await db.transaction(async (tx) => {
      await insertQuoteVersion(tx, {
        quoteId,
        version: detail.quote.version,
        snapshot: {
          clientId: detail.quote.clientId,
          issueDate: detail.quote.issueDate,
          validUntil: detail.quote.validUntil,
          notes: detail.quote.notes,
          netPence: detail.quote.netPence,
          vatPence: detail.quote.vatPence,
          grossPence: detail.quote.grossPence,
          lines: linesToSnapshot(detail.lines),
        },
        source: "create",
        createdByUserId: detail.quote.createdByUserId,
      });
    });
    rows = await db
      .select({
        version: quoteVersions.version,
        source: quoteVersions.source,
        grossPence: quoteVersions.grossPence,
        createdAt: quoteVersions.createdAt,
        rolledBackFromVersion: quoteVersions.rolledBackFromVersion,
        actorName: users.name,
      })
      .from(quoteVersions)
      .leftJoin(users, eq(quoteVersions.createdByUserId, users.id))
      .where(eq(quoteVersions.quoteId, quoteId))
      .orderBy(desc(quoteVersions.version));
  }

  return rows.map((r) => ({
    ...r,
    grossFormatted: formatGBP(r.grossPence),
    versionLabel: formatQuoteVersion(r.version),
    isCurrent: r.version === detail.quote.version,
  }));
}

export async function getQuoteVersionSnapshot(
  quoteId: string,
  version: number,
): Promise<QuoteSnapshot | null> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(quoteVersions)
    .where(and(eq(quoteVersions.quoteId, quoteId), eq(quoteVersions.version, version)))
    .limit(1);
  if (!row) return null;

  return {
    clientId: row.clientId,
    issueDate: row.issueDate,
    validUntil: row.validUntil,
    notes: row.notes,
    netPence: row.netPence,
    vatPence: row.vatPence,
    grossPence: row.grossPence,
    lines: row.lines as QuoteVersionLine[],
  };
}

export async function getQuoteVersionDetail(
  companyId: string,
  quoteId: string,
  version: number,
) {
  const detail = await getQuoteDetail(companyId, quoteId);
  if (!detail) return null;

  if (version === detail.quote.version) {
    return {
      ...detail,
      viewingVersion: version,
      isCurrent: true,
      currentVersion: detail.quote.version,
    };
  }

  const snapshot = await getQuoteVersionSnapshot(quoteId, version);
  if (!snapshot) return null;

  const db = getDb();
  const [client] = await db
    .select()
    .from(clients)
    .where(and(eq(clients.id, snapshot.clientId), eq(clients.companyId, companyId)))
    .limit(1);
  if (!client) return null;

  return {
    quote: {
      id: detail.quote.id,
      number: detail.quote.number,
      version,
      status: detail.quote.status,
      issueDate: snapshot.issueDate,
      validUntil: snapshot.validUntil,
      notes: snapshot.notes,
      netPence: snapshot.netPence,
      vatPence: snapshot.vatPence,
      grossPence: snapshot.grossPence,
      grossFormatted: formatGBP(snapshot.grossPence),
      versionLabel: formatQuoteVersion(version),
      reference: formatQuoteReference(detail.quote.number, version),
      orderId: detail.quote.orderId,
    },
    client,
    lines: snapshot.lines.map((l, index) => ({
      id: `${quoteId}-v${version}-${index}`,
      description: l.description,
      quantity: l.quantity,
      unitPricePence: l.unitPricePence,
      vatRate: l.vatRate,
      position: l.position,
    })),
    viewingVersion: version,
    isCurrent: false,
    currentVersion: detail.quote.version,
  };
}
