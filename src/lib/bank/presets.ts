import {
  buildParsedRow,
  debitCreditToPence,
  headerIndex,
  isGbpCurrency,
  parseBankDate,
  parseCsvTable,
  parseTags,
  requireHeaders,
  rowToRaw,
  tryPoundsToPence,
} from "@/lib/bank/csv";
import type { BankFeedAdapter, ParsedBankRow } from "@/lib/bank/types";
import { bankLabel, type PresetBankProviderId } from "@/lib/bank/providers";

type AmountMode =
  | { kind: "signed"; aliases: string[] }
  | { kind: "debit_credit"; outAliases: string[]; inAliases: string[] }
  | {
      kind: "signed_or_debit_credit";
      signedAliases: string[];
      outAliases: string[];
      inAliases: string[];
    };

type PresetConfig = {
  provider: PresetBankProviderId;
  adapterName: string;
  /** Header groups that must each match at least one alias (fingerprint). */
  fingerprint: string[][];
  dateAliases: string[];
  amount: AmountMode;
  counterpartyAliases: string[];
  referenceAliases?: string[];
  descriptionAliases?: string[];
  /** Fallback description from type/narrative when description empty. */
  typeAliases?: string[];
  categoryAliases?: string[];
  tagsAliases?: string[];
  nativeIdAliases?: string[];
  currencyAliases?: string[];
  /** Prefer type column as description when no description (Starling). */
  preferTypeAsDescription?: boolean;
};

function resolveAmount(
  cols: string[],
  headers: string[],
  mode: AmountMode,
): number | null {
  if (mode.kind === "signed") {
    const idx = headerIndex(headers, mode.aliases);
    return idx < 0 ? null : tryPoundsToPence(cols[idx]);
  }
  if (mode.kind === "debit_credit") {
    const outIdx = headerIndex(headers, mode.outAliases);
    const inIdx = headerIndex(headers, mode.inAliases);
    return debitCreditToPence(
      outIdx >= 0 ? cols[outIdx] : undefined,
      inIdx >= 0 ? cols[inIdx] : undefined,
    );
  }
  // signed_or_debit_credit
  const signedIdx = headerIndex(headers, mode.signedAliases);
  if (signedIdx >= 0) {
    const signed = tryPoundsToPence(cols[signedIdx]);
    if (signed != null) return signed;
  }
  const outIdx = headerIndex(headers, mode.outAliases);
  const inIdx = headerIndex(headers, mode.inAliases);
  if (outIdx >= 0 || inIdx >= 0) {
    return debitCreditToPence(
      outIdx >= 0 ? cols[outIdx] : undefined,
      inIdx >= 0 ? cols[inIdx] : undefined,
    );
  }
  return null;
}

function cell(cols: string[], headers: string[], aliases: string[] | undefined): string {
  if (!aliases?.length) return "";
  const idx = headerIndex(headers, aliases);
  return idx < 0 ? "" : (cols[idx] ?? "").trim();
}

export class PresetCsvAdapter implements BankFeedAdapter {
  readonly name: string;
  private readonly config: PresetConfig;

  constructor(config: PresetConfig) {
    this.config = config;
    this.name = config.adapterName;
  }

  parse(csvText: string): ParsedBankRow[] {
    const { headers, rows } = parseCsvTable(csvText);
    if (headers.length === 0 || rows.length === 0) return [];

    const label = bankLabel(this.config.provider);
    requireHeaders(headers, this.config.fingerprint, label);

    // Amount fingerprint: ensure we can resolve amount mode columns
    if (this.config.amount.kind === "signed") {
      requireHeaders(headers, [this.config.amount.aliases], label);
    } else if (this.config.amount.kind === "debit_credit") {
      const hasOut = headerIndex(headers, this.config.amount.outAliases) >= 0;
      const hasIn = headerIndex(headers, this.config.amount.inAliases) >= 0;
      if (!hasOut && !hasIn) {
        requireHeaders(headers, [this.config.amount.outAliases], label);
      }
    } else {
      const hasSigned = headerIndex(headers, this.config.amount.signedAliases) >= 0;
      const hasOut = headerIndex(headers, this.config.amount.outAliases) >= 0;
      const hasIn = headerIndex(headers, this.config.amount.inAliases) >= 0;
      if (!hasSigned && !hasOut && !hasIn) {
        requireHeaders(headers, [this.config.amount.signedAliases], label);
      }
    }

    const out: ParsedBankRow[] = [];
    for (const cols of rows) {
      const raw = rowToRaw(headers, cols);
      const bookedAt = parseBankDate(cell(cols, headers, this.config.dateAliases));
      if (!bookedAt) continue;

      const currency = cell(cols, headers, this.config.currencyAliases);
      if (!isGbpCurrency(currency || null)) {
        out.push(
          buildParsedRow({
            bookedAt,
            amountPence: 0,
            counterparty: null,
            reference: null,
            description: null,
            spendingCategory: null,
            tags: [],
            raw,
            skipReason: "non_gbp",
          }),
        );
        continue;
      }

      const amountPence = resolveAmount(cols, headers, this.config.amount);
      if (amountPence == null) continue;

      const counterparty =
        cell(cols, headers, this.config.counterpartyAliases) || null;
      const reference = cell(cols, headers, this.config.referenceAliases) || null;
      const desc =
        cell(cols, headers, this.config.descriptionAliases) ||
        (this.config.preferTypeAsDescription
          ? cell(cols, headers, this.config.typeAliases)
          : "") ||
        null;
      const spendingCategory =
        cell(cols, headers, this.config.categoryAliases) || null;
      const tags = parseTags(cell(cols, headers, this.config.tagsAliases));
      const nativeId = cell(cols, headers, this.config.nativeIdAliases) || null;

      out.push(
        buildParsedRow({
          bookedAt,
          amountPence,
          counterparty,
          reference,
          description: desc,
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

const PRESETS: Record<PresetBankProviderId, PresetConfig> = {
  starling: {
    provider: "starling",
    adapterName: "starling-csv",
    fingerprint: [["date", "transaction date", "created"]],
    dateAliases: ["date", "transaction date", "created"],
    amount: {
      kind: "signed",
      aliases: ["amount", "amount (gbp)", "value"],
    },
    counterpartyAliases: ["counter party", "counterparty", "name"],
    referenceAliases: ["reference", "payment reference"],
    descriptionAliases: ["description", "narrative"],
    typeAliases: ["type", "transaction type"],
    categoryAliases: ["spending category", "category"],
    tagsAliases: ["tags"],
    preferTypeAsDescription: true,
  },
  monzo: {
    provider: "monzo",
    adapterName: "monzo-csv",
    fingerprint: [
      ["date", "date & time", "created"],
      ["amount"],
    ],
    dateAliases: ["date", "date & time", "created", "time"],
    amount: { kind: "signed", aliases: ["amount"] },
    counterpartyAliases: ["name", "merchant", "counterparty", "description"],
    referenceAliases: ["notes", "reference"],
    descriptionAliases: ["description", "notes"],
    categoryAliases: ["category"],
    tagsAliases: ["tags"],
    nativeIdAliases: ["transaction id", "id"],
    currencyAliases: ["currency", "local currency"],
  },
  revolut: {
    provider: "revolut",
    adapterName: "revolut-csv",
    fingerprint: [
      [
        "date completed (utc)",
        "date completed",
        "completed date",
        "date started (utc)",
        "date",
      ],
      ["amount"],
    ],
    dateAliases: [
      "date completed (utc)",
      "date completed",
      "completed date",
      "date started (utc)",
      "date started",
      "date",
    ],
    amount: { kind: "signed", aliases: ["amount"] },
    counterpartyAliases: ["description", "payer", "beneficiary"],
    referenceAliases: ["reference"],
    descriptionAliases: ["description", "type"],
    nativeIdAliases: ["id", "transaction id"],
    currencyAliases: ["payment currency", "currency", "orig currency"],
  },
  wise: {
    provider: "wise",
    adapterName: "wise-csv",
    fingerprint: [["date", "created on"], ["amount", "amount (total)", "total"]],
    dateAliases: ["date", "created on", "finished on"],
    amount: {
      kind: "signed",
      aliases: ["amount", "amount (total)", "total", "source amount"],
    },
    counterpartyAliases: ["payee name", "payer name", "description", "merchant"],
    referenceAliases: ["reference", "payment reference"],
    descriptionAliases: ["description", "transfer reference"],
    nativeIdAliases: ["transferwise id", "transaction id", "id"],
    currencyAliases: ["currency", "source currency", "target currency"],
  },
  tide: {
    provider: "tide",
    adapterName: "tide-csv",
    fingerprint: [["date", "transaction date"], ["amount"]],
    dateAliases: ["date", "transaction date"],
    amount: { kind: "signed", aliases: ["amount"] },
    counterpartyAliases: ["description", "counterparty", "merchant"],
    referenceAliases: ["reference"],
    descriptionAliases: ["description", "type"],
    categoryAliases: ["category"],
  },
  barclays: {
    provider: "barclays",
    adapterName: "barclays-csv",
    fingerprint: [["date", "transaction date"]],
    dateAliases: ["date", "transaction date"],
    amount: {
      kind: "signed_or_debit_credit",
      signedAliases: ["amount"],
      outAliases: ["money out", "debit", "paid out", "out"],
      inAliases: ["money in", "credit", "paid in", "in"],
    },
    counterpartyAliases: ["description", "memo", "narrative"],
    referenceAliases: ["reference"],
    descriptionAliases: ["description", "memo", "narrative"],
  },
  hsbc: {
    provider: "hsbc",
    adapterName: "hsbc-csv",
    fingerprint: [["date", "transaction date"]],
    dateAliases: ["date", "transaction date"],
    amount: {
      kind: "debit_credit",
      outAliases: ["paid out", "money out", "debit", "out"],
      inAliases: ["paid in", "money in", "credit", "in"],
    },
    counterpartyAliases: ["description", "narrative", "payment type"],
    referenceAliases: ["reference"],
    descriptionAliases: ["description", "narrative"],
    typeAliases: ["payment type", "type"],
  },
  lloyds: {
    provider: "lloyds",
    adapterName: "lloyds-csv",
    fingerprint: [["transaction date", "date"]],
    dateAliases: ["transaction date", "date"],
    amount: {
      kind: "debit_credit",
      outAliases: ["debit amount", "debit", "out", "money out"],
      inAliases: ["credit amount", "credit", "in", "money in"],
    },
    counterpartyAliases: [
      "transaction description",
      "description",
      "narrative",
    ],
    referenceAliases: ["transaction reference", "reference"],
    descriptionAliases: ["transaction description", "description"],
    typeAliases: ["transaction type", "type"],
  },
  natwest: {
    provider: "natwest",
    adapterName: "natwest-csv",
    fingerprint: [["date", "transaction date"]],
    dateAliases: ["date", "transaction date"],
    amount: {
      kind: "signed_or_debit_credit",
      signedAliases: ["value", "amount"],
      outAliases: ["paid out", "money out", "debit", "out"],
      inAliases: ["paid in", "money in", "credit", "in"],
    },
    counterpartyAliases: ["description", "narrative"],
    referenceAliases: ["reference"],
    descriptionAliases: ["description", "narrative"],
    typeAliases: ["type", "transaction type"],
  },
};

export function createPresetAdapter(provider: PresetBankProviderId): PresetCsvAdapter {
  return new PresetCsvAdapter(PRESETS[provider]);
}
