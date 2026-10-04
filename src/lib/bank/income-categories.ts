/** Built-in other-income categories (not stored in the catalog). */
export const BUILTIN_INCOME_CATEGORIES = [
  "Interest",
  "Grant",
  "Refund",
  "Other",
] as const;

export type BuiltinIncomeCategory = (typeof BUILTIN_INCOME_CATEGORIES)[number];

export type IncomeCategoryRow = {
  id: string;
  name: string;
  usageCount: number;
};

const MAX_CATEGORY_LENGTH = 120;

export function isBuiltinIncomeCategory(
  value: string,
): value is BuiltinIncomeCategory {
  return (BUILTIN_INCOME_CATEGORIES as readonly string[]).includes(value);
}

export function isBuiltinIncomeCategoryName(value: string): boolean {
  const lower = value.trim().toLowerCase();
  return BUILTIN_INCOME_CATEGORIES.some((c) => c.toLowerCase() === lower);
}

/** Trim and cap length; null when empty. */
export function normalizeIncomeCategoryName(
  value: string | null | undefined,
): string | null {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) return null;
  return trimmed.slice(0, MAX_CATEGORY_LENGTH);
}

export function incomeCategorySelectOptions(
  customCategories: readonly string[],
): Array<{ value: string; label: string }> {
  const builtins = BUILTIN_INCOME_CATEGORIES.map((c) => ({
    value: c,
    label: c,
  }));
  const custom = customCategories
    .filter((c) => !isBuiltinIncomeCategoryName(c))
    .map((c) => ({ value: c, label: c }));
  return [...builtins, ...custom];
}
