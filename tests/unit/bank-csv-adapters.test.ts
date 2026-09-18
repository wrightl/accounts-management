import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { StarlingCsvAdapter } from "@/lib/bank/starling-csv";
import {
  createPresetAdapter,
  detectBankProvider,
  matchesPresetFingerprint,
} from "@/lib/bank/presets";
import { GenericCsvAdapter } from "@/lib/bank/generic-csv";
import { getBankFeedAdapter } from "@/lib/bank/adapters";
import {
  parseProviderFromLegacyName,
  bankLabel,
  resolveBankDisplayName,
} from "@/lib/bank/providers";
import { resolveBankFieldsFromForm } from "@/lib/bank/resolve-bank-fields";
import { parseBankDate, debitCreditToPence, parseCsvTable } from "@/lib/bank/csv";

function fixture(name: string): string {
  return readFileSync(
    join(process.cwd(), "tests/fixtures/bank", name),
    "utf8",
  );
}

describe("StarlingCsvAdapter", () => {
  it("parses a typical Starling CSV and dedupes via externalId", () => {
    const csv = fixture("starling.csv");

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
    expect(() => new StarlingCsvAdapter().parse("Foo,Bar\n1,2")).toThrow(
      /does not look like a Starling/,
    );
  });
});

describe("preset bank adapters", () => {
  it("parses Monzo CSV and prefers Transaction ID for externalId", () => {
    const csv = fixture("monzo.csv");
    const rows = createPresetAdapter("monzo").parse(csv);
    expect(rows).toHaveLength(2);
    expect(rows[0].externalId).toBe("tx_abc123");
    expect(rows[0].amountPence).toBe(-1250);
    expect(rows[0].counterparty).toBe("Coffee Shop");
    expect(rows[1].amountPence).toBe(10000);
  });

  it("skips non-GBP Revolut Business rows", () => {
    const csv = fixture("revolut-business.csv");
    const rows = createPresetAdapter("revolut").parse(csv);
    expect(rows).toHaveLength(2);
    expect(rows[0].skipReason).toBe("non_gbp");
    expect(rows[1].skipReason).toBeUndefined();
    expect(rows[1].amountPence).toBe(20000);
    expect(rows[1].externalId).toBe("rev2");
  });

  it("rejects plain Date/Amount files against Revolut Business fingerprint", () => {
    const csv = fixture("tide.csv");
    expect(() => createPresetAdapter("revolut").parse(csv)).toThrow(
      /does not look like a Revolut Business/,
    );
  });

  it("parses Wise with TransferWise ID", () => {
    const csv = [
      "TransferWise ID,Date,Amount,Currency,Payee Name,Reference",
      "tw-9,15/03/2026,-45.00,GBP,Supplier Co,INV-1",
    ].join("\n");
    const rows = createPresetAdapter("wise").parse(csv);
    expect(rows).toHaveLength(1);
    expect(rows[0].externalId).toBe("tw-9");
    expect(rows[0].counterparty).toBe("Supplier Co");
  });

  it("parses Tide signed amount", () => {
    const csv = fixture("tide.csv");
    const rows = createPresetAdapter("tide").parse(csv);
    expect(rows[0].amountPence).toBe(-90000);
  });

  it("parses Barclays money in / money out", () => {
    const csv = [
      "Date,Description,Money out,Money in",
      "15/03/2026,Card payment,25.00,",
      "16/03/2026,Faster payment,,150.00",
    ].join("\n");
    const rows = createPresetAdapter("barclays").parse(csv);
    expect(rows).toHaveLength(2);
    expect(rows[0].amountPence).toBe(-2500);
    expect(rows[1].amountPence).toBe(15000);
  });

  it("parses HSBC paid out / paid in", () => {
    const csv = [
      "Date,Description,Paid out,Paid in",
      "15/03/2026,DD British Gas,40.00,",
    ].join("\n");
    const rows = createPresetAdapter("hsbc").parse(csv);
    expect(rows[0].amountPence).toBe(-4000);
  });

  it("parses Lloyds debit / credit amounts", () => {
    const csv = [
      "Transaction Date,Transaction Description,Debit Amount,Credit Amount",
      "15/03/2026,TESCO STORES,18.40,",
      "16/03/2026,ACME LTD,,500.00",
    ].join("\n");
    const rows = createPresetAdapter("lloyds").parse(csv);
    expect(rows).toHaveLength(2);
    expect(rows[0].amountPence).toBe(-1840);
    expect(rows[0].counterparty).toBe("TESCO STORES");
    expect(rows[1].amountPence).toBe(50000);
  });

  it("parses NatWest Value column", () => {
    const csv = [
      "Date,Type,Description,Value",
      "15/03/2026,DPC,Payment to supplier,-75.00",
    ].join("\n");
    const rows = createPresetAdapter("natwest").parse(csv);
    expect(rows[0].amountPence).toBe(-7500);
  });

  it("rejects Lloyds file against Starling adapter", () => {
    const csv = [
      "Transaction Date,Transaction Description,Debit Amount,Credit Amount",
      "15/03/2026,TESCO,10.00,",
    ].join("\n");
    expect(() => createPresetAdapter("starling").parse(csv)).toThrow(
      /does not look like a Starling/,
    );
  });
});

describe("detectBankProvider", () => {
  it("detects Starling uniquely", () => {
    const { headers } = parseCsvTable(fixture("starling.csv"));
    expect(detectBankProvider(headers)).toBe("starling");
    expect(matchesPresetFingerprint("starling", headers)).toBe(true);
  });

  it("detects Monzo uniquely", () => {
    const { headers } = parseCsvTable(fixture("monzo.csv"));
    expect(detectBankProvider(headers)).toBe("monzo");
  });

  it("detects Revolut Business uniquely", () => {
    const { headers } = parseCsvTable(fixture("revolut-business.csv"));
    expect(detectBankProvider(headers)).toBe("revolut");
  });

  it("returns null for unknown generic format", () => {
    const { headers } = parseCsvTable(fixture("generic.csv"));
    expect(detectBankProvider(headers)).toBeNull();
  });
});

describe("GenericCsvAdapter", () => {
  it("parses mapped debit/credit columns", () => {
    const csv = fixture("generic.csv");
    const rows = new GenericCsvAdapter({
      date: "Txn Date",
      moneyOut: "Out",
      moneyIn: "In",
      counterparty: "Narration",
    }).parse(csv);
    expect(rows).toHaveLength(2);
    expect(rows[0].amountPence).toBe(-1200);
    expect(rows[1].amountPence).toBe(9950);
  });

  it("is selected via getBankFeedAdapter for other", () => {
    const adapter = getBankFeedAdapter("other", {
      date: "Date",
      amount: "Amount",
    });
    expect(adapter.name).toBe("generic-csv");
  });
});

describe("bank catalog helpers", () => {
  it("parses legacy bank names", () => {
    expect(parseProviderFromLegacyName("Starling Bank")).toBe("starling");
    expect(parseProviderFromLegacyName("Monzo Business")).toBe("monzo");
    expect(parseProviderFromLegacyName("Metro Bank")).toBe("other");
  });

  it("resolves display names", () => {
    expect(bankLabel("lloyds")).toBe("Lloyds");
    expect(bankLabel("revolut")).toBe("Revolut Business");
    expect(resolveBankDisplayName("other", "Metro")).toBe("Metro");
  });

  it("validates settings bank fields", () => {
    expect(
      resolveBankFieldsFromForm({
        bankProvider: "starling",
        bankName: "",
        required: true,
      }),
    ).toEqual({
      ok: true,
      value: { bankProvider: "starling", bankName: "Starling Bank" },
    });

    expect(
      resolveBankFieldsFromForm({
        bankProvider: "other",
        bankName: "",
        required: true,
      }),
    ).toEqual({ ok: false, error: "Enter your bank name" });

    expect(
      resolveBankFieldsFromForm({
        bankProvider: "other",
        bankName: "Metro Bank",
        required: true,
      }),
    ).toEqual({
      ok: true,
      value: { bankProvider: "other", bankName: "Metro Bank" },
    });
  });
});

describe("csv helpers", () => {
  it("parses UK date formats", () => {
    expect(parseBankDate("15/03/2026")).toBe("2026-03-15");
    expect(parseBankDate("15-03-2026")).toBe("2026-03-15");
    expect(parseBankDate("15 Mar 2026")).toBe("2026-03-15");
    expect(parseBankDate("2026-03-15T10:00:00Z")).toBe("2026-03-15");
  });

  it("converts debit/credit to signed pence", () => {
    expect(debitCreditToPence("10.00", "")).toBe(-1000);
    expect(debitCreditToPence("", "25.50")).toBe(2550);
  });
});
