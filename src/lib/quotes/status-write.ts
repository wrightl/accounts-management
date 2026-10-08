import "server-only";
import { and, eq } from "drizzle-orm";
import type { Database } from "@/db";
import { quotes } from "@/db/schema";
import type { Tx } from "@/lib/invoices/allocate";
import type { QuoteStatus } from "@/lib/quotes/status";

/** The quote's status changed between our read and our write. */
export class QuoteStatusConflictError extends Error {
  constructor() {
    super("This quote was just updated. Refresh and try again.");
    this.name = "QuoteStatusConflictError";
  }
}

/**
 * Compare-and-set a quote status change. The write only applies while the
 * quote is still in `from`, so a client accepting via the public link and a
 * founder declining in-app (or a double-click) cannot both win. Returns false
 * when it lost; inside a transaction, throw {@link QuoteStatusConflictError}
 * so any order created alongside rolls back.
 */
export async function writeQuoteStatus(
  db: Database | Tx,
  args: {
    companyId: string;
    quoteId: string;
    from: QuoteStatus;
    set: Partial<typeof quotes.$inferInsert> & { status: QuoteStatus };
  },
): Promise<boolean> {
  const rows = await db
    .update(quotes)
    .set(args.set)
    .where(
      and(
        eq(quotes.id, args.quoteId),
        eq(quotes.companyId, args.companyId),
        eq(quotes.status, args.from),
      ),
    )
    .returning({ id: quotes.id });
  return rows.length > 0;
}
