import { createHash } from "node:crypto";
import { poundsToPence } from "@/lib/money";

/**
 * Starling business CSV adapter seam.
 * Typical columns: Date, Counter Party, Reference, Type, Amount, Balance
 * (Amount in pounds, negative = money out).
 */
export interface ParsedBankRow {
  externalId: string;
  bookedAt: string;
  amountPence: number;
  counterparty: string | null;
  reference: string | null;
  description: string | null;
  spendingCategory: string | null;
  tags: string[];
  raw: Record<string, string>;
}

export interface BankFeedAdapter {
  readonly name: string;
  parse(csvText: string): ParsedBankRow[];
}

function parseCsvLine(line: string): string[] {
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

function normalizeHeader(h: string): string {
  return h.trim().toLowerCase().replace(/\s+/g, " ");
}

function parseStarlingDate(value: string): string | null {
  const v = value.trim();
  // ISO or YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}/.test(v)) return v.slice(0, 10);
  // DD/MM/YYYY
  const m = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) {
    return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  }
  return null;
}

function parseTags(value: string | undefined): string[] {
  if (!value?.trim()) return [];
  return value
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
}

export class StarlingCsvAdapter implements BankFeedAdapter {
  readonly name = "starling-csv";

  parse(csvText: string): ParsedBankRow[] {
    const lines = csvText
      .replace(/^\uFEFF/, "")
      .split(/\r?\n/)
      .filter((l) => l.trim().length > 0);
    if (lines.length < 2) return [];

    const headers = parseCsvLine(lines[0]).map(normalizeHeader);
    const idx = (names: string[]) =>
      headers.findIndex((h) => names.includes(h));

    const dateIdx = idx(["date", "transaction date", "created"]);
    const amountIdx = idx(["amount", "amount (gbp)", "value"]);
    const counterpartyIdx = idx(["counter party", "counterparty", "name"]);
    const referenceIdx = idx(["reference", "payment reference"]);
    const typeIdx = idx(["type", "transaction type"]);
    const descIdx = idx(["description", "narrative"]);
    const categoryIdx = idx(["spending category", "category"]);
    const tagsIdx = idx(["tags"]);

    if (dateIdx < 0 || amountIdx < 0) {
      throw new Error(
        "CSV must include Date and Amount columns (Starling export format)",
      );
    }

    const rows: ParsedBankRow[] = [];
    for (let i = 1; i < lines.length; i++) {
      const cols = parseCsvLine(lines[i]);
      const raw: Record<string, string> = {};
      headers.forEach((h, j) => {
        raw[h] = cols[j] ?? "";
      });

      const bookedAt = parseStarlingDate(cols[dateIdx] ?? "");
      if (!bookedAt) continue;

      let amountPence: number;
      try {
        amountPence = poundsToPence(cols[amountIdx] ?? "0");
      } catch {
        continue;
      }

      const counterparty = cols[counterpartyIdx]?.trim() || null;
      const reference = cols[referenceIdx]?.trim() || null;
      const description =
        cols[descIdx]?.trim() ||
        cols[typeIdx]?.trim() ||
        null;
      const spendingCategory = cols[categoryIdx]?.trim() || null;
      const tags = parseTags(cols[tagsIdx]);

      const externalId = createHash("sha256")
        .update(
          [bookedAt, amountPence, counterparty ?? "", reference ?? "", description ?? ""].join("|"),
        )
        .digest("hex")
        .slice(0, 32);

      rows.push({
        externalId,
        bookedAt,
        amountPence,
        counterparty,
        reference,
        description,
        spendingCategory,
        tags,
        raw,
      });
    }
    return rows;
  }
}

export function getBankFeedAdapter(): BankFeedAdapter {
  return new StarlingCsvAdapter();
}
