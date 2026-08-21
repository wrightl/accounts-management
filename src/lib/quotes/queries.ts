import "server-only";
import { desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { clients, quoteLineItems, quotes } from "@/db/schema";
import { formatGBP } from "@/lib/money";

export async function listQuotes() {
  const db = getDb();
  const rows = await db
    .select({
      id: quotes.id,
      number: quotes.number,
      status: quotes.status,
      issueDate: quotes.issueDate,
      grossPence: quotes.grossPence,
      clientName: clients.name,
    })
    .from(quotes)
    .innerJoin(clients, eq(quotes.clientId, clients.id))
    .orderBy(desc(quotes.createdAt));

  return rows.map((r) => ({
    ...r,
    grossFormatted: formatGBP(r.grossPence),
  }));
}

export async function getQuoteDetail(id: string) {
  const db = getDb();
  const rows = await db
    .select({ quote: quotes, client: clients })
    .from(quotes)
    .innerJoin(clients, eq(quotes.clientId, clients.id))
    .where(eq(quotes.id, id))
    .limit(1);
  if (!rows[0]) return null;

  const lines = await db
    .select()
    .from(quoteLineItems)
    .where(eq(quoteLineItems.quoteId, id))
    .orderBy(quoteLineItems.position);

  return {
    quote: {
      ...rows[0].quote,
      grossFormatted: formatGBP(rows[0].quote.grossPence),
    },
    client: rows[0].client,
    lines,
  };
}

export async function nextQuoteNumber(): Promise<string> {
  const db = getDb();
  const year = new Date().getFullYear();
  const rows = await db.select({ number: quotes.number }).from(quotes);
  const prefix = `Q-${year}-`;
  let max = 0;
  for (const r of rows) {
    if (r.number.startsWith(prefix)) {
      const n = Number(r.number.slice(prefix.length));
      if (n > max) max = n;
    }
  }
  return `${prefix}${String(max + 1).padStart(4, "0")}`;
}
