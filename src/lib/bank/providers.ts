/**
 * Shared UK bank catalog for Settings, onboarding, CSV import, and invoice display.
 * `bank_accounts.provider` and `companies.bank_provider` use these slugs.
 */

export const BANK_PROVIDERS = [
  { id: "starling", label: "Starling Bank" },
  { id: "monzo", label: "Monzo" },
  { id: "revolut", label: "Revolut" },
  { id: "wise", label: "Wise" },
  { id: "tide", label: "Tide" },
  { id: "barclays", label: "Barclays" },
  { id: "hsbc", label: "HSBC" },
  { id: "lloyds", label: "Lloyds" },
  { id: "natwest", label: "NatWest" },
  { id: "other", label: "Other" },
] as const;

export type BankProviderId = (typeof BANK_PROVIDERS)[number]["id"];

/** Preset CSV parsers — excludes `other` (uses the generic mapper). */
export type PresetBankProviderId = Exclude<BankProviderId, "other">;

const PROVIDER_IDS = new Set<string>(BANK_PROVIDERS.map((p) => p.id));

export function isBankProviderId(value: string): value is BankProviderId {
  return PROVIDER_IDS.has(value);
}

export function isPresetBankProviderId(value: string): value is PresetBankProviderId {
  return isBankProviderId(value) && value !== "other";
}

export function bankLabel(id: BankProviderId): string {
  return BANK_PROVIDERS.find((p) => p.id === id)?.label ?? id;
}

/**
 * Infer a provider slug from a legacy free-text `bank_name`.
 * Used for migration backfill and existing rows without `bank_provider`.
 */
export function parseProviderFromLegacyName(name: string | null | undefined): BankProviderId {
  if (!name?.trim()) return "other";
  const normalized = name
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/\bbank\b/g, "")
    .trim();

  for (const provider of BANK_PROVIDERS) {
    if (provider.id === "other") continue;
    const labelNorm = provider.label
      .toLowerCase()
      .replace(/\bbank\b/g, "")
      .trim();
    if (normalized === labelNorm || normalized === provider.id) {
      return provider.id;
    }
    // "Starling Business", "Monzo Business", etc.
    if (normalized.startsWith(labelNorm) || normalized.startsWith(provider.id)) {
      return provider.id;
    }
  }

  if (normalized.includes("starling")) return "starling";
  return "other";
}

/** Resolve display name for invoices / bank_accounts when provider is known. */
export function resolveBankDisplayName(
  provider: BankProviderId,
  customName?: string | null,
): string {
  if (provider === "other") {
    return customName?.trim() || "Other bank";
  }
  return bankLabel(provider);
}

export const BANK_PROVIDER_OPTIONS = BANK_PROVIDERS.map((p) => ({
  value: p.id,
  label: p.label,
}));
