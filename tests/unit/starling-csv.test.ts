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
    expect(rows[1].amountPence).toBe(-4250);
  });

  it("throws when required columns are missing", () => {
    expect(() => new StarlingCsvAdapter().parse("Foo,Bar\n1,2")).toThrow(/Date and Amount/);
  });
});
