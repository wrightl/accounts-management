/** Managed expense categories for consistent reporting. */
export const EXPENSE_CATEGORIES = [
  "Travel",
  "Meals",
  "Software",
  "Office",
  "Marketing",
  "Professional fees",
  "Equipment",
  "Training",
  "Other",
] as const;

export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

export function isExpenseCategory(value: string): value is ExpenseCategory {
  return (EXPENSE_CATEGORIES as readonly string[]).includes(value);
}

export type ExpenseStatus =
  | "pending"
  | "recorded"
  | "reimbursable"
  | "reimbursed"
  | "company_paid";

export function expenseStatusLabel(status: ExpenseStatus): string {
  switch (status) {
    case "pending":
      return "Pending review";
    case "recorded":
      return "Recorded";
    case "reimbursable":
      return "Reimbursable";
    case "reimbursed":
      return "Reimbursed";
    case "company_paid":
      return "Company paid";
  }
}
