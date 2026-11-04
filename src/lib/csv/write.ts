/**
 * Spreadsheets run a cell that starts with one of these as a formula. Payees,
 * bank references and client names come from outside the company, so a value
 * like `=HYPERLINK(...)` mustn't run when the accountant opens the export.
 */
const FORMULA_START = /^[=+\-@\t\r]/;

/** Amounts such as -12.50 start with a minus but are plain numbers, not formulas. */
const PLAIN_NUMBER = /^[+-]?\d+(?:\.\d+)?$/;

/**
 * Text a spreadsheet would read as a formula, with a leading apostrophe so it
 * stays text. Excel hides the apostrophe; everything else is left as it is.
 */
export function neutraliseFormula(value: string): string {
  return FORMULA_START.test(value) && !PLAIN_NUMBER.test(value) ? `'${value}` : value;
}

/** One CSV cell: formulas neutralised, quoted when it holds a comma, quote or line break. */
export function csvCell(value: string): string {
  const safe = neutraliseFormula(value);
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}
