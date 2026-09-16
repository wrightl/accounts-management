/**
 * Starling CSV adapter — thin wrapper over the shared preset registry.
 * Kept so existing imports (`StarlingCsvAdapter`, `ParsedBankRow`) keep working.
 */
export type { ParsedBankRow, BankFeedAdapter } from "@/lib/bank/types";

import { createPresetAdapter } from "@/lib/bank/presets";
import type { BankFeedAdapter, ParsedBankRow } from "@/lib/bank/types";

export class StarlingCsvAdapter implements BankFeedAdapter {
  readonly name = "starling-csv";
  private readonly inner = createPresetAdapter("starling");

  parse(csvText: string): ParsedBankRow[] {
    return this.inner.parse(csvText);
  }
}
