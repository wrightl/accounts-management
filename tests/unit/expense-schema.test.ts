import { describe, it, expect } from "vitest";
import { FORM_FIELD_ERROR_SUMMARY } from "@/lib/validation/field-errors";
import { parseExpenseInput } from "@/lib/expenses/schema";

describe("parseExpenseInput", () => {
  it("returns fieldErrors for missing amount and status", () => {
    const result = parseExpenseInput({
      description: "Taxi",
      category: "",
      spentAt: "2026-01-15",
      amountPounds: "",
      status: "",
      billable: "",
      billableClientId: "",
      paidByUserId: "",
      useMileage: "",
      mileageMiles: "",
      mileageRatePence: "",
      vatRate: "0",
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe(FORM_FIELD_ERROR_SUMMARY);
    expect(result.fieldErrors.status).toBe("Select a status");
  });

  it("resolves mileage amount when useMileage is set", () => {
    const result = parseExpenseInput({
      description: "Client visit",
      category: "Travel",
      spentAt: "2026-01-15",
      amountPounds: "",
      status: "recorded",
      billable: "",
      billableClientId: "",
      paidByUserId: "",
      useMileage: "true",
      mileageMiles: "10",
      mileageRatePence: "45",
      vatRate: "0",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.amountPence).toBe(450);
    expect(result.data.resolvedMileageMiles).toBe(10);
    expect(result.data.resolvedMileageRatePence).toBe(45);
  });

  it("accepts empty optional category and positive amount", () => {
    const result = parseExpenseInput({
      description: "Taxi",
      category: "",
      spentAt: "2026-01-15",
      amountPounds: "12.50",
      status: "recorded",
      billable: "",
      billableClientId: "",
      paidByUserId: "",
      useMileage: "",
      mileageMiles: "",
      mileageRatePence: "",
      vatRate: "20",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.category).toBe("");
    expect(result.data.amountPence).toBe(1250);
  });
});
