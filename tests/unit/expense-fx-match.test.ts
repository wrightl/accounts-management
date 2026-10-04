import { describe, expect, it, vi } from "vitest";
import {
  bankAmountWithinFxBand,
  buildFxMatchNote,
  expectedGbpPenceFromForeign,
  fetchBoeSeriesObservations,
  gbpAmountBand,
} from "@/lib/bank/fx";
import { scoreExpenseBankMatch } from "@/lib/bank/expense-match";

describe("FX amount helpers", () => {
  it("converts foreign amount using foreign-per-GBP quote", () => {
    // $100 at 1.27 USD/GBP → ~£78.74
    expect(expectedGbpPenceFromForeign(10000, 1.27)).toBe(7874);
  });

  it("builds an inclusive ±10% band", () => {
    const band = gbpAmountBand(7874);
    expect(band.minGbpPence).toBe(Math.floor(7874 * 0.9));
    expect(band.maxGbpPence).toBe(Math.ceil(7874 * 1.1));
    expect(bankAmountWithinFxBand(-8000, band)).toBe(true);
    expect(bankAmountWithinFxBand(-7000, band)).toBe(false);
    expect(bankAmountWithinFxBand(-9000, band)).toBe(false);
  });

  it("includes band edges", () => {
    const band = gbpAmountBand(10000);
    expect(bankAmountWithinFxBand(-band.minGbpPence, band)).toBe(true);
    expect(bankAmountWithinFxBand(-band.maxGbpPence, band)).toBe(true);
  });

  it("formats an FX match note", () => {
    const note = buildFxMatchNote(
      "USD",
      {
        expectedGbpPence: 7874,
        minGbpPence: 7086,
        maxGbpPence: 8662,
        rate: {
          currency: "USD",
          observationDate: "2026-04-01",
          foreignPerGbp: 1.27,
        },
      },
      -8000,
    );
    expect(note).toContain("FX USD");
    expect(note).toContain("1.27");
    expect(note).toContain("2026-04-01");
  });

  it("returns empty observations when BoE fetch fails", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error("network down"));
    const rows = await fetchBoeSeriesObservations(
      "XUDLUSD",
      "2026-04-01",
      "2026-04-03",
      fetchImpl,
    );
    expect(rows).toEqual([]);
  });

  it("parses BoE CSV observations", async () => {
    const csv = [
      "DATE,XUDLUSD",
      "01 Apr 2026,1.2700",
      "02 Apr 2026,1.2750",
    ].join("\n");
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => csv,
    });
    const rows = await fetchBoeSeriesObservations(
      "XUDLUSD",
      "2026-04-01",
      "2026-04-02",
      fetchImpl as unknown as typeof fetch,
    );
    expect(rows).toEqual([
      { observationDate: "2026-04-01", foreignPerGbp: 1.27 },
      { observationDate: "2026-04-02", foreignPerGbp: 1.275 },
    ]);
  });
});

describe("scoreExpenseBankMatch", () => {
  const tx = {
    amountPence: -8000,
    bookedAt: "2026-04-02",
    reference: null,
    description: "CARD PURCHASE",
    counterparty: "Starbucks Seattle",
  };

  it("matches sterling on exact pence within 90 days", () => {
    const breakdown = scoreExpenseBankMatch(
      tx,
      {
        amountPence: 8000,
        date: "2026-04-01",
        description: "Starbucks",
        detectedCurrency: null,
      },
      null,
    );
    expect(breakdown.total).toBeGreaterThanOrEqual(70);
  });

  it("rejects sterling amount mismatches", () => {
    const breakdown = scoreExpenseBankMatch(
      tx,
      {
        amountPence: 7999,
        date: "2026-04-01",
        description: "Starbucks",
        detectedCurrency: null,
      },
      null,
    );
    expect(breakdown.total).toBe(0);
  });

  it("matches foreign amounts inside the FX band and working-day window", () => {
    const band = {
      expectedGbpPence: 7874,
      minGbpPence: 7086,
      maxGbpPence: 8662,
      rate: {
        currency: "USD",
        observationDate: "2026-04-01",
        foreignPerGbp: 1.27,
      },
    };
    const breakdown = scoreExpenseBankMatch(
      tx,
      {
        amountPence: 10000,
        date: "2026-04-01",
        description: "Starbucks Seattle",
        detectedCurrency: "USD",
      },
      band,
    );
    expect(breakdown.total).toBeGreaterThanOrEqual(70);
  });

  it("rejects foreign amounts outside the FX band", () => {
    const band = {
      expectedGbpPence: 7874,
      minGbpPence: 7086,
      maxGbpPence: 8662,
      rate: {
        currency: "USD",
        observationDate: "2026-04-01",
        foreignPerGbp: 1.27,
      },
    };
    const breakdown = scoreExpenseBankMatch(
      { ...tx, amountPence: -5000 },
      {
        amountPence: 10000,
        date: "2026-04-01",
        description: "Starbucks",
        detectedCurrency: "USD",
      },
      band,
    );
    expect(breakdown.total).toBe(0);
  });

  it("rejects foreign matches outside three working days", () => {
    const band = {
      expectedGbpPence: 7874,
      minGbpPence: 7086,
      maxGbpPence: 8662,
      rate: {
        currency: "USD",
        observationDate: "2026-04-01",
        foreignPerGbp: 1.27,
      },
    };
    const breakdown = scoreExpenseBankMatch(
      { ...tx, bookedAt: "2026-04-10" },
      {
        amountPence: 10000,
        date: "2026-04-01",
        description: "Starbucks",
        detectedCurrency: "USD",
      },
      band,
    );
    expect(breakdown.total).toBe(0);
  });

  it("includes counterparty in the expense text haystack", () => {
    const withMerchant = scoreExpenseBankMatch(
      tx,
      {
        amountPence: 8000,
        date: "2026-04-02",
        description: "Starbucks Seattle coffee",
        detectedCurrency: null,
      },
      null,
    );
    const without = scoreExpenseBankMatch(
      { ...tx, counterparty: null },
      {
        amountPence: 8000,
        date: "2026-04-02",
        description: "Starbucks Seattle coffee",
        detectedCurrency: null,
      },
      null,
    );
    expect(withMerchant.paymentRefScore).toBeGreaterThan(without.paymentRefScore);
  });
});
