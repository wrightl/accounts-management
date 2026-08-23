import { describe, expect, it } from "vitest";
import {
  expenseImportHasErrors,
  parseExpenseImportCsv,
} from "@/lib/expenses/import-csv";

const founders = [
  { id: "f1", name: "Lee", email: "lee@example.com" },
  { id: "f2", name: "Alex", email: "alex@example.com" },
];

describe("parseExpenseImportCsv", () => {
  it("parses valid rows with amount", () => {
    const csv = [
      "date,description,amount_gbp,category,paid_by,status",
      "2026-04-01,Train ticket,45.00,Travel,lee@example.com,reimbursable",
    ].join("\n");
    const rows = parseExpenseImportCsv(csv, founders);
    expect(rows).toHaveLength(1);
    expect(rows[0].errors).toHaveLength(0);
    expect(rows[0].amountPence).toBe(4500);
    expect(rows[0].paidByUserId).toBe("f1");
    expect(rows[0].status).toBe("reimbursable");
  });

  it("parses mileage rows without amount_gbp", () => {
    const csv = [
      "date,description,miles,paid_by",
      "2026-04-02,Site visit,84,lee@example.com",
    ].join("\n");
    const rows = parseExpenseImportCsv(csv, founders, 45);
    expect(rows[0].errors).toHaveLength(0);
    expect(rows[0].amountPence).toBe(3780);
    expect(rows[0].mileageMiles).toBe(84);
    expect(rows[0].description).toContain("84 miles @ 45p/mi");
  });

  it("flags unknown paid_by in preview", () => {
    const csv = [
      "date,description,amount_gbp,paid_by",
      "2026-04-01,Supplies,10.00,unknown@example.com",
    ].join("\n");
    const rows = parseExpenseImportCsv(csv, founders);
    expect(rows[0].errors.some((e) => e.includes("Unknown paid_by"))).toBe(true);
    expect(expenseImportHasErrors(rows)).toBe(true);
  });
});
