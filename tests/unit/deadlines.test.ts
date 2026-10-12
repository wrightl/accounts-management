import { describe, expect, it } from "vitest";
import {
  accountsDueDate,
  ct600DueDate,
  deadlineStatus,
  listDeadlines,
  type DeadlineInputs,
} from "@/lib/deadlines/calc";
import { ctPaymentDueDate } from "@/lib/ledger/corporation-tax";

const ltd: DeadlineInputs = {
  entityType: "limited_company",
  financialYearEndMonth: 3,
  vatRegistered: false,
  vatQuarterEndMonth: 3,
  incorporatedOn: null,
  accountsDue: null,
  confirmationStatementDue: null,
};

describe("statutory due dates", () => {
  it("puts accounts 9 months after the year end, at a month end", () => {
    expect(accountsDueDate("2026-03-31")).toBe("2026-12-31");
    expect(accountsDueDate("2026-06-30")).toBe("2027-03-31");
    expect(accountsDueDate("2026-05-31")).toBe("2027-02-28");
  });

  it("makes corporation tax payable 9 months and a day after", () => {
    expect(ctPaymentDueDate("2026-03-31")).toBe("2027-01-01");
    expect(ctPaymentDueDate("2026-06-30")).toBe("2027-04-01");
    expect(ctPaymentDueDate("2026-12-31")).toBe("2027-10-01");
  });

  it("puts the CT600 12 months after", () => {
    expect(ct600DueDate("2026-03-31")).toBe("2027-03-31");
    expect(ct600DueDate("2027-02-28")).toBe("2028-02-29");
  });
});

describe("listDeadlines", () => {
  it("lists a March year end's Ltd deadlines in date order", () => {
    const list = listDeadlines(ltd, "2026-10-12", "2027-10-12");
    expect(list.map((d) => [d.kind, d.dueDate])).toEqual([
      ["annual_accounts", "2026-12-31"],
      ["ct_payment", "2027-01-01"],
      ["ct600", "2027-03-31"],
    ]);
    expect(list[0]!.period).toBe("Year ended 31 March 2026");
  });

  it("uses Companies House's accounts date for the first accounts", () => {
    const list = listDeadlines(
      { ...ltd, incorporatedOn: "2025-09-01", accountsDue: "2027-06-01" },
      "2026-10-12",
      "2027-10-12",
    );
    const accounts = list.filter((d) => d.kind === "annual_accounts");
    expect(accounts).toEqual([
      expect.objectContaining({ dueDate: "2027-06-01", source: "companies_house" }),
    ]);
  });

  it("skips year ends before incorporation", () => {
    const list = listDeadlines({ ...ltd, incorporatedOn: "2026-05-01" }, "2026-10-12", "2027-10-12");
    expect(list.some((d) => d.period === "Year ended 31 March 2026")).toBe(false);
  });

  it("repeats the confirmation statement yearly from Companies House's date", () => {
    const list = listDeadlines(
      { ...ltd, confirmationStatementDue: "2026-11-14" },
      "2026-10-12",
      "2028-01-01",
    ).filter((d) => d.kind === "confirmation_statement");
    expect(list.map((d) => [d.dueDate, d.source])).toEqual([
      ["2026-11-14", "companies_house"],
      ["2027-11-14", "calculated"],
    ]);
  });

  it("works the confirmation statement out from incorporation", () => {
    const list = listDeadlines(
      { ...ltd, incorporatedOn: "2019-05-01" },
      "2026-10-12",
      "2027-10-12",
    ).filter((d) => d.kind === "confirmation_statement");
    expect(list.map((d) => d.dueDate)).toEqual(["2027-05-15"]);
  });

  it("adds VAT returns for the quarter stagger", () => {
    const list = listDeadlines(
      { ...ltd, vatRegistered: true, vatQuarterEndMonth: 1 },
      "2026-10-12",
      "2027-03-01",
    ).filter((d) => d.kind === "vat_return");
    expect(list.map((d) => d.dueDate)).toEqual(["2026-12-07"]);
    expect(list[0]!.period).toBe("Quarter ended 31 October 2026");
  });

  it("gives sole traders Self Assessment dates instead of company ones", () => {
    const list = listDeadlines(
      { ...ltd, entityType: "sole_trader", incorporatedOn: "2019-05-01" },
      "2026-10-12",
      "2027-10-12",
    );
    expect(list.map((d) => [d.kind, d.dueDate, d.period])).toEqual([
      ["self_assessment", "2027-01-31", "Tax year 2025–26"],
      ["payment_on_account", "2027-07-31", "Tax year 2025–26"],
    ]);
  });
});

describe("deadlineStatus", () => {
  it("classifies by days left", () => {
    expect(deadlineStatus("2026-10-11", "2026-10-12", false)).toBe("overdue");
    expect(deadlineStatus("2026-10-11", "2026-10-12", true)).toBe("done");
    expect(deadlineStatus("2026-11-11", "2026-10-12", false)).toBe("due_soon");
    expect(deadlineStatus("2026-11-12", "2026-10-12", false)).toBe("upcoming");
  });
});
