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
  /** Set when a row was skipped (e.g. non-GBP); not inserted. */
  skipReason?: "non_gbp";
}

export interface BankFeedAdapter {
  readonly name: string;
  parse(csvText: string): ParsedBankRow[];
}

/**
 * Column mapping for the generic (Other) CSV importer.
 * Values are normalized header strings from the uploaded file.
 */
export interface GenericCsvMapping {
  date: string;
  /** Signed amount column (mutually exclusive with moneyOut/moneyIn). */
  amount?: string | null;
  moneyOut?: string | null;
  moneyIn?: string | null;
  counterparty?: string | null;
  reference?: string | null;
  description?: string | null;
  category?: string | null;
  tags?: string | null;
  transactionId?: string | null;
  currency?: string | null;
}

export type BankParseResult = {
  rows: ParsedBankRow[];
  skippedNonGbp: number;
};
