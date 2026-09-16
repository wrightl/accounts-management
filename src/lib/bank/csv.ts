import { createHash } from "node:crypto";
import { poundsToPence } from "@/lib/money";
import type { ParsedBankRow } from "@/lib/bank/types";

export function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

/** Normalize CSV headers for alias matching. */
export function normalizeHeader(h: string): string {
  return h.trim().toLowerCase().replace(/\s+/g, " ");
}

const MONTH_NAMES: Record<string, string> = {
  jan: "01",
  january: "01",
  feb: "02",
  february: "02",
  mar: "03",
  march: "03",
  apr: "04",
  april: "04",
  may: "05",
  jun: "06",
  june: "06",
  jul: "07",
  july: "07",
  aug: "08",
  august: "08",
  sep: "09",
  sept: "09",
  september: "09",
  oct: "10",
  october: "10",
  nov: "11",
  november: "11",
  dec: "12",
  december: "12",
};

/**
 * Parse common UK bank date formats to YYYY-MM-DD.
 * Accepts ISO, DD/MM/YYYY, DD-MM-YYYY, DD MMM YYYY, and ISO datetime.
 */
export function parseBankDate(value: string): string | null {
  const v = value.trim();
  if (!v) return null;

  // ISO or YYYY-MM-DD (optionally with time)
  if (/^\d{4}-\d{2}-\d{2}/.test(v)) return v.slice(0, 10);

  // DD/MM/YYYY or D/M/YYYY
  let m = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) {
    return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  }

  // DD-MM-YYYY
  m = v.match(/^(\d{1,2})-(\d{1,2})-(\d{4})/);
  if (m) {
    return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  }

  // DD MMM YYYY or DD MMMM YYYY (optional comma / time)
  m = v.match(/^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/);
  if (m) {
    const month = MONTH_NAMES[m[2].toLowerCase()];
    if (month) {
      return `${m[3]}-${month}-${m[1].padStart(2, "0")}`;
    }
  }

  return null;
}

export function parseTags(value: string | undefined): string[] {
  if (!value?.trim()) return [];
  return value
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
}

export function tryPoundsToPence(value: string | undefined): number | null {
  if (value == null || !String(value).trim()) return null;
  try {
    return poundsToPence(value);
  } catch {
    return null;
  }
}

/**
 * Combine money-out / money-in (or debit / credit) columns into signed pence.
 * Inflows positive, outflows negative.
 */
export function debitCreditToPence(
  moneyOut: string | undefined,
  moneyIn: string | undefined,
): number | null {
  const out = tryPoundsToPence(moneyOut);
  const inn = tryPoundsToPence(moneyIn);
  if (out == null && inn == null) return null;
  const outAbs = out == null ? 0 : Math.abs(out);
  const inAbs = inn == null ? 0 : Math.abs(inn);
  if (outAbs > 0 && inAbs > 0) {
    // Prefer the non-zero column that is actually filled; if both set, net them.
    return inAbs - outAbs;
  }
  if (outAbs > 0) return -outAbs;
  if (inAbs > 0) return inAbs;
  return 0;
}

export function contentHashExternalId(parts: {
  bookedAt: string;
  amountPence: number;
  counterparty: string | null;
  reference: string | null;
  description: string | null;
}): string {
  return createHash("sha256")
    .update(
      [
        parts.bookedAt,
        parts.amountPence,
        parts.counterparty ?? "",
        parts.reference ?? "",
        parts.description ?? "",
      ].join("|"),
    )
    .digest("hex")
    .slice(0, 32);
}

export function nativeExternalId(nativeId: string): string {
  const trimmed = nativeId.trim();
  if (!trimmed) {
    throw new Error("empty native id");
  }
  // Keep length bounded for the unique index; hash long ids.
  if (trimmed.length <= 64 && /^[A-Za-z0-9._:-]+$/.test(trimmed)) {
    return trimmed.slice(0, 64);
  }
  return createHash("sha256").update(trimmed).digest("hex").slice(0, 32);
}

export function resolveExternalId(
  nativeId: string | null | undefined,
  parts: {
    bookedAt: string;
    amountPence: number;
    counterparty: string | null;
    reference: string | null;
    description: string | null;
  },
): string {
  if (nativeId?.trim()) {
    try {
      return nativeExternalId(nativeId);
    } catch {
      /* fall through */
    }
  }
  return contentHashExternalId(parts);
}

export function isGbpCurrency(value: string | null | undefined): boolean {
  if (!value?.trim()) return true; // assume GBP when column missing
  const c = value.trim().toUpperCase();
  return c === "GBP" || c === "£" || c === "GBX";
}

export type CsvTable = {
  headers: string[];
  /** Original header labels (for UI mapping). */
  rawHeaders: string[];
  rows: string[][];
};

export function parseCsvTable(csvText: string): CsvTable {
  const lines = csvText
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .filter((l) => l.trim().length > 0);
  if (lines.length < 1) {
    return { headers: [], rawHeaders: [], rows: [] };
  }
  const rawHeaders = parseCsvLine(lines[0]);
  const headers = rawHeaders.map(normalizeHeader);
  const rows: string[][] = [];
  for (let i = 1; i < lines.length; i++) {
    rows.push(parseCsvLine(lines[i]));
  }
  return { headers, rawHeaders, rows };
}

export function headerIndex(headers: string[], names: string[]): number {
  return headers.findIndex((h) => names.includes(h));
}

export function requireHeaders(
  headers: string[],
  groups: string[][],
  bankLabel: string,
): void {
  for (const names of groups) {
    if (headerIndex(headers, names) < 0) {
      throw new Error(
        `This file does not look like a ${bankLabel} export. Check the bank in Settings, or choose Other for a custom mapping.`,
      );
    }
  }
}

export function rowToRaw(headers: string[], cols: string[]): Record<string, string> {
  const raw: Record<string, string> = {};
  headers.forEach((h, j) => {
    raw[h] = cols[j] ?? "";
  });
  return raw;
}

export function buildParsedRow(input: {
  bookedAt: string;
  amountPence: number;
  counterparty: string | null;
  reference: string | null;
  description: string | null;
  spendingCategory: string | null;
  tags: string[];
  raw: Record<string, string>;
  nativeId?: string | null;
  skipReason?: ParsedBankRow["skipReason"];
}): ParsedBankRow {
  const externalId = resolveExternalId(input.nativeId, {
    bookedAt: input.bookedAt,
    amountPence: input.amountPence,
    counterparty: input.counterparty,
    reference: input.reference,
    description: input.description,
  });
  return {
    externalId,
    bookedAt: input.bookedAt,
    amountPence: input.amountPence,
    counterparty: input.counterparty,
    reference: input.reference,
    description: input.description,
    spendingCategory: input.spendingCategory,
    tags: input.tags,
    raw: input.raw,
    skipReason: input.skipReason,
  };
}
