import { describe, expect, it } from "vitest";
import { hasReferenceRate, latePaymentCharge } from "@/lib/late-payment";

describe("debts older than the rate table", () => {
  it("has no reference rate before the table starts", () => {
    expect(hasReferenceRate("2022-12-30")).toBe(false);
    expect(hasReferenceRate("2022-12-31")).toBe(true);
  });

  it("gives no charge rather than using the wrong rate", () => {
    expect(
      latePaymentCharge({
        amountDuePence: 100_000,
        dueDate: "2020-01-01",
        asOf: "2026-01-01",
      }),
    ).toBeNull();
  });
});
