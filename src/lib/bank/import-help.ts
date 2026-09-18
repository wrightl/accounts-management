/**
 * Client-safe bank import help and expected column labels.
 * Kept separate from presets.ts (which pulls in node:crypto via csv.ts).
 */

import type { PresetBankProviderId } from "@/lib/bank/providers";

/** One-liner: how to export a CSV from each bank. */
export const BANK_IMPORT_HELP: Record<PresetBankProviderId, string> = {
  starling:
    "Starling app or web → Account → Statements → Download CSV (Business).",
  monzo: "Monzo Business web → Statements → Download CSV.",
  revolut:
    "Revolut Business → Statements → Account statement → CSV (include Payment currency).",
  wise: "Wise → Account → Statements → Download CSV.",
  tide: "Tide app or web → Account → Export / Download CSV.",
  barclays: "Barclays Business → Statements → Download as CSV.",
  hsbc: "HSBC Business / Online Banking → Statements → Download CSV.",
  lloyds: "Lloyds Business → Statements → Download as CSV.",
  natwest: "NatWest Business → Statements → Download CSV.",
};

/** Human-readable expected columns for Settings / import help. */
export const BANK_EXPECTED_COLUMNS: Record<PresetBankProviderId, string[]> = {
  starling: ["Date", "Counter Party"],
  monzo: ["Date", "Amount", "Transaction ID"],
  revolut: ["Date completed (UTC)", "Amount", "Payment currency"],
  wise: ["Date", "Amount", "TransferWise ID"],
  tide: ["Date", "Amount", "Description"],
  barclays: ["Date"],
  hsbc: ["Date"],
  lloyds: ["Transaction Date"],
  natwest: ["Date"],
};

export function getImportHelp(provider: PresetBankProviderId): string {
  return BANK_IMPORT_HELP[provider];
}

export function getPresetExpectedColumns(
  provider: PresetBankProviderId,
): string[] {
  return BANK_EXPECTED_COLUMNS[provider];
}
