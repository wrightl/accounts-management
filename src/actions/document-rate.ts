"use server";

import { requireActionPermission } from "@/lib/auth";
import { documentRate } from "@/lib/document-rate";

/**
 * The Bank of England rate (units of `currency` per £1) a document dated
 * `onDate` would be converted at, for showing on the form before it is saved.
 */
export async function fetchDocumentExchangeRate(
  currency: string,
  onDate: string,
): Promise<
  | { ok: true; fxRate: number; fxRateDate: string | null }
  | { ok: false; error: string }
> {
  const authz = await requireActionPermission("accounts:read");
  if (!authz.ok) return authz;
  const date = /^\d{4}-\d{2}-\d{2}$/.test(onDate) ? onDate : new Date().toISOString().slice(0, 10);
  const result = await documentRate(currency, date);
  if (!result.ok) return result;
  return { ok: true, fxRate: result.rate.fxRate, fxRateDate: result.rate.fxRateDate };
}
