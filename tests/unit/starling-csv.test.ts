import { describe, it, expect } from "vitest";
import { StarlingCsvAdapter } from "@/lib/bank/starling-csv";

describe("StarlingCsvAdapter", () => {
  it("parses a typical Starling CSV and dedupes via externalId", () => {
    const csv = [
      "Date,Counter Party,Reference,Type,Amount,Balance",
      "15/03/2026,Acme Ltd,DD-2026-0001,FASTER PAYMENT,250.00,1250.00",
      "16/03/2026,Trainline,,CARD PAYMENT,-42.50,1207.50",
    ].join("\n");

    const adapter = new StarlingCsvAdapter();
    const rows = adapter.parse(csv);
    expect(rows).toHaveLength(2);
    expect(rows[0].bookedAt).toBe("2026-03-15");
    expect(rows[0].amountPence).toBe(25000);
    expect(rows[0].counterparty).toBe("Acme Ltd");
    expect(rows[0].externalId).toHaveLength(32);
    expect(rows[0].spendingCategory).toBeNull();
    expect(rows[0].tags).toEqual([]);
    expect(rows[1].amountPence).toBe(-4250);
  });

  it("parses spending category and tags from Starling export columns", () => {
    const csv = [
      "Date,Counter Party,Reference,Type,Amount (GBP),Balance (GBP),Spending Category,Notes,Tags",
      "07/01/2026,Starbucks,Starbucks 55686,CONTACTLESS,-10.15,2285.21,FOOD_AND_DRINK,,client-meeting",
      "02/04/2025,Squarespace,SQSP*,ONLINE PAYMENT,-8.40,703.50,SOFTWARE_AND_SUBSCRIPTIONS,,",
    ].join("\n");

    const rows = new StarlingCsvAdapter().parse(csv);
    expect(rows).toHaveLength(2);
    expect(rows[0].spendingCategory).toBe("FOOD_AND_DRINK");
    expect(rows[0].tags).toEqual(["client-meeting"]);
    expect(rows[1].spendingCategory).toBe("SOFTWARE_AND_SUBSCRIPTIONS");
    expect(rows[1].tags).toEqual([]);
  });

  it("does not include category or tags in externalId", () => {
    const base = [
      "Date,Counter Party,Reference,Type,Amount,Spending Category,Tags",
      "15/03/2026,Acme Ltd,DD-2026-0001,FASTER PAYMENT,250.00,TRAVEL,",
    ].join("\n");
    const withCategory = base.replace("TRAVEL,", "REVENUE,");
    const withTags = base.replace(",,", ",tag-a,");

    const adapter = new StarlingCsvAdapter();
    const a = adapter.parse(base)[0].externalId;
    const b = adapter.parse(withCategory)[0].externalId;
    const c = adapter.parse(withTags)[0].externalId;
    expect(a).toBe(b);
    expect(a).toBe(c);
  });

  it("throws when required columns are missing", () => {
    expect(() => new StarlingCsvAdapter().parse("Foo,Bar\n1,2")).toThrow(/Date and Amount/);
  });
});
