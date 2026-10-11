import { describe, expect, it } from "vitest";
import { profitabilityPeriod } from "@/lib/profitability/period";
import {
  expenseCostPence,
  margin,
  rebillLineDescription,
  rebillPricePence,
  toRebillOptions,
} from "@/lib/profitability/rebill";

describe("rebill pricing", () => {
  const train = { amountPence: 12_000, vatPence: 2_000 };

  it("recharges net when VAT registered and gross otherwise", () => {
    expect(rebillPricePence(train, true)).toBe(10_000);
    expect(rebillPricePence(train, false)).toBe(12_000);
    expect(expenseCostPence(train)).toBe(10_000);
  });

  it("describes the line with the date", () => {
    expect(rebillLineDescription({ description: "Train to site", spentAt: "2026-10-02" })).toBe(
      "Train to site (02/10/2026)",
    );
    expect(rebillLineDescription({ description: "Taxi", spentAt: null })).toBe("Taxi");
  });

  it("builds picker rows", () => {
    expect(
      toRebillOptions([
        {
          id: "e1",
          clientId: "c1",
          description: "Train",
          spentAt: null,
          orderNumber: "ORD-1",
          amountPence: 12_000,
          pricePence: 10_000,
        },
      ]),
    ).toEqual([
      {
        id: "e1",
        clientId: "c1",
        lineDescription: "Train",
        detail: "Paid £120.00 · order ORD-1",
        pricePounds: "100",
        priceFormatted: "£100.00",
      },
    ]);
  });
});

describe("margin", () => {
  it("gives the share of revenue, or null with no revenue", () => {
    expect(margin(110_000, 40_000)).toEqual({
      revenuePence: 110_000,
      costPence: 40_000,
      marginPence: 70_000,
      marginPercent: 64,
    });
    expect(margin(0, 5_000).marginPercent).toBeNull();
  });
});

describe("profitabilityPeriod", () => {
  it("defaults to this financial year", () => {
    expect(profitabilityPeriod(undefined, 3, "2026-10-11")).toMatchObject({
      key: "fy",
      from: "2026-04-01",
      to: "2027-03-31",
    });
  });

  it("covers last financial year and all time", () => {
    expect(profitabilityPeriod("last", 3, "2026-10-11")).toMatchObject({
      from: "2025-04-01",
      to: "2026-03-31",
    });
    expect(profitabilityPeriod("all", 3, "2026-10-11")).toMatchObject({ from: null, to: null });
  });
});
