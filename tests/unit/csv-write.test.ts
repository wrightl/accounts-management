import { describe, expect, it, vi } from "vitest";
import { csvCell, neutraliseFormula } from "@/lib/csv/write";
import { toCsv } from "@/lib/reports/accountant-pack";

vi.mock("server-only", () => ({}));

describe("csvCell", () => {
  it.each([
    ["=HYPERLINK(\"https://evil.example\",\"Click\")", "\"'=HYPERLINK(\"\"https://evil.example\"\",\"\"Click\"\")\""],
    ["+44 20 7946 0958", "'+44 20 7946 0958"],
    ["-2+3+cmd|' /C calc'!A0", "'-2+3+cmd|' /C calc'!A0"],
    ["@SUM(A1:A9)", "'@SUM(A1:A9)"],
    ["\t=1+1", "'\t=1+1"],
  ])("keeps %j from running as a formula", (value, expected) => {
    expect(csvCell(value)).toBe(expected);
  });

  it.each(["-12.50", "12.50", "+3", "0", "2026-04-05", "Coffee - team", ""])(
    "leaves %j as it is",
    (value) => {
      expect(csvCell(value)).toBe(value);
    },
  );

  it("still quotes commas, quotes and line breaks", () => {
    expect(csvCell("a,b")).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell("one\r\ntwo")).toBe('"one\r\ntwo"');
  });

  it("is what the accountant pack writes", () => {
    const csv = toCsv(["payee", "amount"], [["=WEBSERVICE(\"https://evil.example\")", "-40.00"]]);
    expect(csv.split("\n")[1]).toBe("\"'=WEBSERVICE(\"\"https://evil.example\"\")\",-40.00");
  });

  it("neutralises without quoting, for writers that always quote", () => {
    expect(neutraliseFormula("=1+1")).toBe("'=1+1");
    expect(neutraliseFormula("-1.00")).toBe("-1.00");
  });
});
