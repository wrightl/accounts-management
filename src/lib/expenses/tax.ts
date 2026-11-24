import { storedLineTax } from "@/lib/documents/schema";
import { carriedLineTax, type StoredLineTax } from "@/lib/tax-codes";

type Company = { vatRegistered?: boolean | null };

const OUTSIDE_SCOPE: StoredLineTax = { taxCode: "outside_scope", vatRate: 0, taxCodeNeedsReview: false };

/**
 * The tax to store on an expense someone entered. Mileage claims are outside
 * the scope of VAT; anything else resolves like a document line, on the
 * purchases side.
 */
export function expenseTax(
  company: Company,
  posted: { useMileage?: boolean; taxCode?: string | null; vatRate?: number | null },
): StoredLineTax {
  if (posted.useMileage) return OUTSIDE_SCOPE;
  return storedLineTax(company, posted, "purchases");
}

/**
 * The tax for an expense captured without a VAT rate (forwarded by email,
 * imported from a spreadsheet). For a VAT-registered company it is stored as
 * zero rated and flagged, because the receipt may well show VAT that nobody
 * has entered yet.
 */
export function capturedExpenseTax(company: Company): StoredLineTax {
  if (!company.vatRegistered) return OUTSIDE_SCOPE;
  return { taxCode: "zero_rated", vatRate: 0, taxCodeNeedsReview: true };
}

/**
 * The tax for an expense approved without changes to its VAT: what it already
 * has, or outside scope for a company that isn't VAT registered.
 */
export function keptExpenseTax(
  company: Company,
  existing: { taxCode?: unknown; taxCodeNeedsReview?: unknown; vatRate: number },
): StoredLineTax {
  if (!company.vatRegistered) return OUTSIDE_SCOPE;
  return carriedLineTax(existing, company);
}
