import { describe, expect, it } from "vitest";
import {
  dividendPaperworkFilename,
  dividendPerShareLabel,
  totalSharesFromPayouts,
} from "@/lib/dividends/paperwork";

describe("dividend paperwork helpers", () => {
  it("shows the rate per share to up to four decimal places", () => {
    expect(dividendPerShareLabel(1_000_000, 100)).toBe("£100.00");
    expect(dividendPerShareLabel(100_000, 3)).toBe("£333.3333");
    expect(dividendPerShareLabel(500, 1000)).toBe("£0.005");
    expect(dividendPerShareLabel(500, null)).toBeNull();
  });

  it("totals holdings only when every payout has one", () => {
    expect(totalSharesFromPayouts([{ shareCount: 60 }, { shareCount: 40 }])).toBe(100);
    expect(totalSharesFromPayouts([{ shareCount: 60 }, { shareCount: null }])).toBeNull();
    expect(totalSharesFromPayouts([])).toBeNull();
  });

  it("names the file by date", () => {
    expect(dividendPaperworkFilename("2026-10-12")).toBe(
      "dividend-2026-10-12-minutes-and-vouchers.pdf",
    );
  });
});
