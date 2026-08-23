/** Starling spending categories (SNAKE_CASE) plus common business values. */
export const BANK_SPENDING_CATEGORIES = [
  "ACCOUNTANCY_FEES",
  "ADMIN",
  "BUSINESS_ENTERTAINMENT",
  "CHARITY",
  "EQUIPMENT",
  "FOOD_AND_DRINK",
  "INSURANCE",
  "MARKETING",
  "OTHER",
  "PROFESSIONAL_SERVICES",
  "REVENUE",
  "SOFTWARE_AND_SUBSCRIPTIONS",
  "STAFF",
  "TAX",
  "TRAVEL",
  "WORKPLACE",
] as const;

export type BankSpendingCategory = (typeof BANK_SPENDING_CATEGORIES)[number];

export function isKnownBankCategory(value: string): value is BankSpendingCategory {
  return (BANK_SPENDING_CATEGORIES as readonly string[]).includes(value);
}

/** Human-readable label for a category value. */
export function formatBankCategory(value: string | null | undefined): string {
  if (!value) return "—";
  if (isKnownBankCategory(value)) {
    const words = value.split("_").map((w) => w.toLowerCase());
    if (words.length === 0) return "—";
    words[0] = words[0].charAt(0).toUpperCase() + words[0].slice(1);
    return words.join(" ");
  }
  return value;
}

/** Whether a value is a built-in or catalogued custom category. */
export function isSelectableBankCategory(
  value: string,
  customCategories: readonly string[],
): boolean {
  if (isKnownBankCategory(value)) return true;
  const lower = value.toLowerCase();
  return customCategories.some((c) => c.toLowerCase() === lower);
}

/** Built-in Starling categories plus catalogued custom labels for dropdowns. */
export function bankCategorySelectOptions(customCategories: readonly string[]): Array<{
  value: string;
  label: string;
}> {
  const builtins = BANK_SPENDING_CATEGORIES.map((c) => ({
    value: c,
    label: formatBankCategory(c),
  }));
  const custom = customCategories
    .filter((c) => !isKnownBankCategory(c))
    .map((c) => ({ value: c, label: formatBankCategory(c) }));
  return [...builtins, ...custom];
}
