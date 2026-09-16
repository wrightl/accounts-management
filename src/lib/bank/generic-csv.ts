import {
  buildParsedRow,
  debitCreditToPence,
  normalizeHeader,
  parseBankDate,
  parseCsvTable,
  parseTags,
  rowToRaw,
  tryPoundsToPence,
} from "@/lib/bank/csv";
import type {
  BankFeedAdapter,
  GenericCsvMapping,
  ParsedBankRow,
} from "@/lib/bank/types";

function colByHeader(
  headers: string[],
  cols: string[],
  mappedHeader: string | null | undefined,
): string {
  if (!mappedHeader?.trim()) return "";
  const target = normalizeHeader(mappedHeader);
  const idx = headers.findIndex((h) => h === target);
  return idx < 0 ? "" : (cols[idx] ?? "").trim();
}

export class GenericCsvAdapter implements BankFeedAdapter {
  readonly name = "generic-csv";
  private readonly mapping: GenericCsvMapping;

  constructor(mapping: GenericCsvMapping) {
    this.mapping = mapping;
  }

  parse(csvText: string): ParsedBankRow[] {
    const { date, amount, moneyOut, moneyIn } = this.mapping;
    if (!date?.trim()) {
      throw new Error("Map a Date column before importing.");
    }
    const hasSigned = Boolean(amount?.trim());
    const hasSplit = Boolean(moneyOut?.trim() || moneyIn?.trim());
    if (!hasSigned && !hasSplit) {
      throw new Error(
        "Map either an Amount column, or Money out and Money in columns.",
      );
    }

    const { headers, rows } = parseCsvTable(csvText);
    if (headers.length === 0 || rows.length === 0) return [];

    const dateNorm = normalizeHeader(date);
    if (!headers.includes(dateNorm)) {
      throw new Error(
        `Mapped Date column "${date}" was not found in this file.`,
      );
    }

    const out: ParsedBankRow[] = [];
    for (const cols of rows) {
      const raw = rowToRaw(headers, cols);
      const bookedAt = parseBankDate(colByHeader(headers, cols, this.mapping.date));
      if (!bookedAt) continue;

      let amountPence: number | null = null;
      if (hasSigned) {
        amountPence = tryPoundsToPence(
          colByHeader(headers, cols, this.mapping.amount),
        );
      }
      if (amountPence == null && hasSplit) {
        amountPence = debitCreditToPence(
          colByHeader(headers, cols, this.mapping.moneyOut) || undefined,
          colByHeader(headers, cols, this.mapping.moneyIn) || undefined,
        );
      }
      if (amountPence == null) continue;

      const counterparty =
        colByHeader(headers, cols, this.mapping.counterparty) || null;
      const reference =
        colByHeader(headers, cols, this.mapping.reference) || null;
      const description =
        colByHeader(headers, cols, this.mapping.description) || null;
      const spendingCategory =
        colByHeader(headers, cols, this.mapping.category) || null;
      const tags = parseTags(colByHeader(headers, cols, this.mapping.tags));
      const nativeId =
        colByHeader(headers, cols, this.mapping.transactionId) || null;

      out.push(
        buildParsedRow({
          bookedAt,
          amountPence,
          counterparty,
          reference,
          description,
          spendingCategory,
          tags,
          raw,
          nativeId,
        }),
      );
    }
    return out;
  }
}

export function isGenericCsvMapping(
  value: unknown,
): value is GenericCsvMapping {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return typeof v.date === "string" && v.date.trim().length > 0;
}

export function parseGenericCsvMapping(
  raw: FormDataEntryValue | null,
): GenericCsvMapping | null {
  if (typeof raw !== "string" || !raw.trim()) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!isGenericCsvMapping(parsed)) return null;
    return {
      date: String(parsed.date),
      amount: parsed.amount ? String(parsed.amount) : null,
      moneyOut: parsed.moneyOut ? String(parsed.moneyOut) : null,
      moneyIn: parsed.moneyIn ? String(parsed.moneyIn) : null,
      counterparty: parsed.counterparty ? String(parsed.counterparty) : null,
      reference: parsed.reference ? String(parsed.reference) : null,
      description: parsed.description ? String(parsed.description) : null,
      category: parsed.category ? String(parsed.category) : null,
      tags: parsed.tags ? String(parsed.tags) : null,
      transactionId: parsed.transactionId
        ? String(parsed.transactionId)
        : null,
      currency: parsed.currency ? String(parsed.currency) : null,
    };
  } catch {
    return null;
  }
}
