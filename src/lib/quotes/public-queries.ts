import "server-only";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { companies, quotes } from "@/db/schema";
import { getQuoteDetail } from "@/lib/quotes/queries";

export async function getPublicQuoteByToken(rawToken: string) {
  const db = getDb();
  const [row] = await db
    .select({
      quoteId: quotes.id,
      companyId: quotes.companyId,
      suspendedAt: companies.suspendedAt,
      companyName: companies.name,
      logoUrl: companies.logoUrl,
      vatRegistered: companies.vatRegistered,
      vatNumber: companies.vatNumber,
    })
    .from(quotes)
    .innerJoin(companies, eq(quotes.companyId, companies.id))
    .where(eq(quotes.publicToken, rawToken))
    .limit(1);

  if (!row) return null;
  if (row.suspendedAt) return { suspended: true as const };

  const detail = await getQuoteDetail(row.companyId, row.quoteId);
  if (!detail) return null;

  return {
    suspended: false as const,
    token: rawToken,
    company: {
      name: row.companyName,
      logoUrl: row.logoUrl,
      vatRegistered: row.vatRegistered,
      vatNumber: row.vatNumber,
    },
    detail,
  };
}
