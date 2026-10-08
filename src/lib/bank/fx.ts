/**
 * Bank of England daily spot rates (foreign currency units per £1) for
 * matching foreign-currency expenses against GBP bank debits.
 */

import { and, desc, eq, lte } from "drizzle-orm";
import { getDb } from "@/db";
import { fxRates } from "@/db/schema";
import { formatGBP } from "@/lib/money";

/** Tolerance band around the expected sterling amount (±10%). */
export const FX_AMOUNT_TOLERANCE = 0.1;

/** Max working-day gap between receipt date and bank booking date. */
export const FX_WORKING_DAY_WINDOW = 3;

/**
 * BoE series codes for currencies we detect on receipts.
 * Quote convention: units of foreign currency per one pound sterling.
 * Currencies without a series are skipped (no foreign suggestion).
 */
export const BOE_SERIES_BY_CURRENCY: Record<string, string> = {
  USD: "XUDLUSD",
  EUR: "XUDLERD",
  JPY: "XUDLJYD",
  CHF: "XUDLSFD",
  AUD: "XUDLADD",
  CAD: "XUDLCDD",
  SEK: "XUDLSKD",
  NOK: "XUDLNKD",
  DKK: "XUDLDKD",
};

export type FxRateObservation = {
  currency: string;
  observationDate: string;
  foreignPerGbp: number;
};

export type FxAmountBand = {
  expectedGbpPence: number;
  minGbpPence: number;
  maxGbpPence: number;
  rate: FxRateObservation;
};

/** Convert a foreign receipt amount to expected sterling pence. */
export function expectedGbpPenceFromForeign(
  foreignAmountPence: number,
  foreignPerGbp: number,
): number {
  if (!(foreignPerGbp > 0) || !Number.isFinite(foreignPerGbp)) {
    throw new Error(`Invalid FX rate: ${foreignPerGbp}`);
  }
  return Math.round((foreignAmountPence / 100 / foreignPerGbp) * 100);
}

/** Inclusive ±tolerance band around expected sterling. */
export function gbpAmountBand(
  expectedGbpPence: number,
  tolerance: number = FX_AMOUNT_TOLERANCE,
): { minGbpPence: number; maxGbpPence: number } {
  const minGbpPence = Math.floor(expectedGbpPence * (1 - tolerance));
  const maxGbpPence = Math.ceil(expectedGbpPence * (1 + tolerance));
  return { minGbpPence, maxGbpPence };
}

export function bankAmountWithinFxBand(
  bankAmountPence: number,
  band: Pick<FxAmountBand, "minGbpPence" | "maxGbpPence">,
): boolean {
  const abs = Math.abs(bankAmountPence);
  return abs >= band.minGbpPence && abs <= band.maxGbpPence;
}

export function buildFxMatchNote(
  currency: string,
  band: FxAmountBand,
  bankAmountPence: number,
): string {
  return [
    `FX ${currency}`,
    `rate ${band.rate.foreignPerGbp} on ${band.rate.observationDate}`,
    `expected ${formatGBP(band.expectedGbpPence)}`,
    `bank ${formatGBP(Math.abs(bankAmountPence))}`,
  ].join(" · ");
}

function formatBoeDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const months = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  return `${String(d).padStart(2, "0")}/${months[m - 1]}/${y}`;
}

function parseBoeCsvDate(raw: string): string | null {
  // "02 Jan 2024" or "02-Jan-2024"
  const m = raw.trim().match(/^(\d{1,2})[\s\-/]([A-Za-z]{3})[\s\-/](\d{4})$/);
  if (!m) return null;
  const months: Record<string, string> = {
    Jan: "01",
    Feb: "02",
    Mar: "03",
    Apr: "04",
    May: "05",
    Jun: "06",
    Jul: "07",
    Aug: "08",
    Sep: "09",
    Oct: "10",
    Nov: "11",
    Dec: "12",
  };
  const month = months[m[2]];
  if (!month) return null;
  return `${m[3]}-${month}-${m[1].padStart(2, "0")}`;
}

function addCalendarDays(iso: string, delta: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + delta));
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`;
}

/**
 * Fetch BoE daily spot observations for a series between fromIso and toIso (inclusive).
 * Returns empty array on HTTP/parse failure — callers skip the FX suggestion.
 */
export async function fetchBoeSeriesObservations(
  seriesCode: string,
  fromIso: string,
  toIso: string,
  fetchImpl: typeof fetch = fetch,
): Promise<Array<{ observationDate: string; foreignPerGbp: number }>> {
  // URLSearchParams would percent-encode the slashes in DD/Mon/YYYY dates
  // (→ %2F), which the BoE IADB legacy server does not decode — it would
  // receive an unrecognisable date string and return no data.
  const url =
    `https://www.bankofengland.co.uk/boeapps/iadb/fromshowcolumns.asp` +
    `?csv.x=yes` +
    `&Datefrom=${formatBoeDate(fromIso)}` +
    `&Dateto=${formatBoeDate(toIso)}` +
    `&SeriesCodes=${seriesCode}` +
    `&UsingCodes=Y` +
    `&CSVF=TN` +
    `&VPD=Y`;

  let text: string;
  try {
    const res = await fetchImpl(url, {
      headers: { Accept: "text/csv,text/plain,*/*" },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return [];
    text = await res.text();
  } catch {
    return [];
  }

  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length < 2) return [];

  const out: Array<{ observationDate: string; foreignPerGbp: number }> = [];
  for (const line of lines.slice(1)) {
    const [dateRaw, valueRaw] = line.split(",");
    if (!dateRaw || valueRaw == null) continue;
    const observationDate = parseBoeCsvDate(dateRaw);
    const foreignPerGbp = Number(valueRaw);
    if (!observationDate || !Number.isFinite(foreignPerGbp) || foreignPerGbp <= 0) {
      continue;
    }
    out.push({ observationDate, foreignPerGbp });
  }
  return out;
}

async function upsertRate(
  currency: string,
  observationDate: string,
  foreignPerGbp: number,
): Promise<void> {
  // Concurrent matchers fetch the same window; the unique index decides.
  await getDb()
    .insert(fxRates)
    .values({ currency, observationDate, foreignPerGbp })
    .onConflictDoNothing({
      target: [fxRates.currency, fxRates.observationDate],
    });
}

/** Back off from BoE after an empty/failed fetch (per series + date window). */
const FAILED_FETCH_TTL_MS = 10 * 60 * 1000;
const failedFetches = new Map<string, number>();

/** Test helper — forget remembered BoE fetch failures. */
export function resetFxFetchBackoff(): void {
  failedFetches.clear();
}

/**
 * Resolve the BoE rate for `currency` on or before `onDate`.
 * Uses the previous published observation when `onDate` has none.
 * Returns null when the currency is unsupported or the fetch fails.
 */
export async function resolveFxRate(
  currency: string,
  onDate: string,
  fetchImpl: typeof fetch = fetch,
): Promise<FxRateObservation | null> {
  const code = currency.trim().toUpperCase();
  const series = BOE_SERIES_BY_CURRENCY[code];
  if (!series) return null;

  const db = getDb();
  const [cached] = await db
    .select({
      observationDate: fxRates.observationDate,
      foreignPerGbp: fxRates.foreignPerGbp,
    })
    .from(fxRates)
    .where(
      and(eq(fxRates.currency, code), lte(fxRates.observationDate, onDate)),
    )
    .orderBy(desc(fxRates.observationDate))
    .limit(1);

  // Re-fetch when we have nothing, or the cached observation is older than a
  // few calendar days before onDate (might have a newer published rate).
  const needsFetch =
    !cached ||
    (cached.observationDate < onDate &&
      cached.observationDate < addCalendarDays(onDate, -5));

  const backoffKey = `${series}:${onDate}`;
  const failedAt = failedFetches.get(backoffKey);
  const backingOff =
    failedAt !== undefined && Date.now() - failedAt < FAILED_FETCH_TTL_MS;

  if (needsFetch && !backingOff) {
    const fromIso = addCalendarDays(onDate, -21);
    const observations = await fetchBoeSeriesObservations(
      series,
      fromIso,
      onDate,
      fetchImpl,
    );
    if (observations.length === 0) {
      // Outage or no data: don't make every matcher wait on the 10s timeout.
      failedFetches.set(backoffKey, Date.now());
    } else {
      failedFetches.delete(backoffKey);
    }
    for (const obs of observations) {
      await upsertRate(code, obs.observationDate, obs.foreignPerGbp);
    }

    const [fresh] = await db
      .select({
        observationDate: fxRates.observationDate,
        foreignPerGbp: fxRates.foreignPerGbp,
      })
      .from(fxRates)
      .where(
        and(eq(fxRates.currency, code), lte(fxRates.observationDate, onDate)),
      )
      .orderBy(desc(fxRates.observationDate))
      .limit(1);

    if (!fresh) return null;
    return {
      currency: code,
      observationDate: fresh.observationDate,
      foreignPerGbp: fresh.foreignPerGbp,
    };
  }

  // Backing off after a failed fetch: use a stale rate if we have one.
  if (!cached) return null;
  return {
    currency: code,
    observationDate: cached.observationDate,
    foreignPerGbp: cached.foreignPerGbp,
  };
}

/** Build the ±10% sterling band for a foreign receipt amount, or null. */
export async function buildFxAmountBand(
  foreignAmountPence: number,
  currency: string,
  spentAt: string,
  fetchImpl: typeof fetch = fetch,
): Promise<FxAmountBand | null> {
  const rate = await resolveFxRate(currency, spentAt, fetchImpl);
  if (!rate) return null;
  const expected = expectedGbpPenceFromForeign(
    foreignAmountPence,
    rate.foreignPerGbp,
  );
  const band = gbpAmountBand(expected);
  return {
    expectedGbpPence: expected,
    minGbpPence: band.minGbpPence,
    maxGbpPence: band.maxGbpPence,
    rate,
  };
}
