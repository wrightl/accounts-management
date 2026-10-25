import { defineTableSort } from "@/lib/table-sort";

export const EXPENSE_SORT = defineTableSort({
  columns: ["date", "description", "category", "paidBy", "createdBy", "status", "amount"],
  fallback: { sort: "date", dir: "desc" },
  descFirst: ["date", "amount"],
});
export type ExpenseSortColumn = (typeof EXPENSE_SORT.columns)[number];
