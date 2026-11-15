import { describe, expect, it } from "vitest";
import { formatExpenseRef, formatReimbursementRef, parseRefSearch } from "@/lib/references";

describe("record references", () => {
  it("pads to four digits and grows past 9999", () => {
    expect(formatExpenseRef(1)).toBe("EXP-0001");
    expect(formatExpenseRef(197)).toBe("EXP-0197");
    expect(formatExpenseRef(9999)).toBe("EXP-9999");
    expect(formatExpenseRef(10000)).toBe("EXP-10000");
    expect(formatReimbursementRef(12)).toBe("REIMB-0012");
  });

  it("reads a reference or a bare number from a search", () => {
    for (const q of ["EXP-0197", "exp-197", "Exp0197", "EXP 197", " 197 ", "0197"]) {
      expect(parseRefSearch(q, "EXP"), q).toBe(197);
    }
    expect(parseRefSearch("REIMB-0012", "REIMB")).toBe(12);
    expect(parseRefSearch("12", "REIMB")).toBe(12);
  });

  it("ignores text that is not a reference", () => {
    for (const q of ["", "taxi", "EXP-", "EXP-0", "0", "REIMB-0012", "197a", "1.5", "-3"]) {
      expect(parseRefSearch(q, "EXP"), q).toBeNull();
    }
    expect(parseRefSearch("EXP-0197", "REIMB")).toBeNull();
  });
});
