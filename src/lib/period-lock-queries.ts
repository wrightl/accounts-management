import "server-only";
import { eq } from "drizzle-orm";
import { getDb, type Database } from "@/db";
import { companies } from "@/db/schema";
import { periodLockError } from "@/lib/period-lock";

type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];

export async function getBooksLockedThrough(
  companyId: string,
  db: Database | Tx = getDb(),
): Promise<string | null> {
  const [row] = await db
    .select({ lockedThrough: companies.booksLockedThrough })
    .from(companies)
    .where(eq(companies.id, companyId))
    .limit(1);
  return row?.lockedThrough ?? null;
}

/** Loads the company's lock date and checks `dates` against it. */
export async function checkPeriodOpen(
  companyId: string,
  ...dates: Array<string | Date | null | undefined>
): Promise<string | null> {
  if (dates.every((d) => !d)) return null;
  return periodLockError(await getBooksLockedThrough(companyId), ...dates);
}
