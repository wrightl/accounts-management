import "server-only";
import { and, asc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { companies, dividendDeclarations, dividendPayouts } from "@/db/schema";
import { splitDirectorNames } from "@/lib/companies-house/schema";
import { totalSharesFromPayouts, type DividendPaperwork } from "@/lib/dividends/paperwork";

/** The declaration, its payouts and the company details, or null if not this company's. */
export async function getDividendPaperwork(
  companyId: string,
  declarationId: string,
): Promise<DividendPaperwork | null> {
  const db = getDb();
  const [row] = await db
    .select({
      declaration: dividendDeclarations,
      legalName: companies.legalName,
      companyNumber: companies.companyNumber,
      addressLines: companies.addressLines,
      directorNames: companies.directorNames,
    })
    .from(dividendDeclarations)
    .innerJoin(companies, eq(companies.id, dividendDeclarations.companyId))
    .where(and(eq(dividendDeclarations.id, declarationId), eq(dividendDeclarations.companyId, companyId)))
    .limit(1);
  if (!row) return null;

  const payouts = await db
    .select({
      id: dividendPayouts.id,
      shareholderName: dividendPayouts.shareholderName,
      shareCount: dividendPayouts.shareCount,
      amountPence: dividendPayouts.amountPence,
    })
    .from(dividendPayouts)
    .where(eq(dividendPayouts.declarationId, declarationId))
    .orderBy(asc(dividendPayouts.shareholderName));

  const d = row.declaration;
  return {
    company: {
      legalName: row.legalName,
      companyNumber: row.companyNumber,
      registeredOffice: row.addressLines,
      directors: splitDirectorNames(row.directorNames),
    },
    declaration: {
      id: d.id,
      declaredAt: d.declaredAt,
      totalPence: d.totalPence,
      notes: d.notes,
      availableReservesPence: d.availableReservesPence,
      overReservesConfirmed: d.overReservesConfirmed,
      totalShares: totalSharesFromPayouts(payouts),
    },
    payouts,
  };
}
