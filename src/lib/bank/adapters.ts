import { createPresetAdapter } from "@/lib/bank/presets";
import { GenericCsvAdapter } from "@/lib/bank/generic-csv";
import {
  isPresetBankProviderId,
  type BankProviderId,
} from "@/lib/bank/providers";
import type { BankFeedAdapter, GenericCsvMapping } from "@/lib/bank/types";

export function getBankFeedAdapter(
  provider: BankProviderId,
  mapping?: GenericCsvMapping | null,
): BankFeedAdapter {
  if (provider === "other") {
    if (!mapping) {
      throw new Error(
        "Map the CSV columns for your bank before importing, or choose a known bank in Settings.",
      );
    }
    return new GenericCsvAdapter(mapping);
  }
  if (!isPresetBankProviderId(provider)) {
    throw new Error(`Unsupported bank provider: ${provider}`);
  }
  return createPresetAdapter(provider);
}
