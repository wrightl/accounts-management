import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb, type TestDatabase } from "@/db/pglite";
import { setTestDb, type Database } from "@/db";
import {
  bankAccounts,
  companies,
  creditNotes,
  expenseReceipts,
  payments,
  yearEndRuns,
} from "@/db/schema";
import { addDays } from "@/lib/ledger/corporation-tax";
import { getStorage } from "@/lib/storage";
import {
  WORKBOOK_PATH,
  listStoreZipEntries,
  prepareYearEndPack,
  streamYearEndPack,
  toCsv,
  zipStoreStream,
  type ZipEntry,
} from "@/lib/year-end/pack";
import { recordYearEndRun, listYearEndRuns, yearStatus } from "@/lib/year-end/runs";
import { NONE_IN_PERIOD } from "@/lib/year-end/labels";
import { formatExpenseRef, formatReimbursementRef } from "@/lib/references";
import { inPeriod, type PackPeriod } from "@/lib/year-end/period";
import type { PackSheet } from "@/lib/year-end/sheets";
import { TAB } from "@/lib/year-end/workbook";
import { readStoreZipEntries } from "@/lib/zip/store";
import {
  LTD_YEAR,
  TAX_YEAR,
  allText,
  amount,
  column,
  edges,
  findSheet,
  formula,
  labelledRow,
  seedYearEnd,
  sum,
  value,
} from "./year-end-fixture";

vi.mock("server-only", () => ({}));

let ctx: Awaited<ReturnType<typeof createTestDb>>;
let db: TestDatabase;

beforeEach(async () => {
  ctx = await createTestDb();
  db = ctx.db;
  setTestDb(db as unknown as Database);
});

afterEach(async () => {
  setTestDb(null);
  await ctx.client.close();
});

async function collect(stream: ReadableStream<Uint8Array>) {
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function workbookFor(companyId: string, period: PackPeriod, includeVat = true) {
  const pack = await prepareYearEndPack({ companyId, period, includeVat });
  return { ...pack, sheets: pack.workbook.sheets };
}

/** Dates in a column, which must all fall inside the period. */
function expectDatesInPeriod(sheet: PackSheet, header: string, period: PackPeriod) {
  const dates = column(sheet, header);
  expect(dates.length).toBeGreaterThan(0);
  for (const date of dates) expect(inPeriod(String(date), period)).toBe(true);
}

/** The reference stored on a seeded expense. */
const exp = (expense: { refNumber: number }) => formatExpenseRef(expense.refNumber);

const OWED_BACK = "Owed back to customer at period end (£)";

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

/** No tab is empty, and no column is empty, all zeros or an internal ID. */
function expectNoEmptyOrIdColumns(sheets: PackSheet[]) {
  for (const sheet of sheets) {
    expect(sheet.rows.length, `${sheet.name} has rows`).toBeGreaterThan(0);
    for (const text of allText(sheet)) expect(text).not.toMatch(UUID);
    if (sheet.layout) continue;
    for (const [i, header] of sheet.headers.entries()) {
      expect(header, `${sheet.name} header`).not.toMatch(/(^|\s|_)id$/i);
      const filled = sheet.rows.some((r) => {
        const v = value(r[i]);
        return v != null && v !== "" && v !== 0;
      });
      expect(filled, `${sheet.name} › ${header} has a value`).toBe(true);
    }
  }
}

describe("limited company, 1 April 2025 to 31 March 2026", () => {
  it("puts the tabs in order and states the period on the cover and every summary tab", async () => {
    const { companyId } = await seedYearEnd(db, { entityType: "limited_company", period: LTD_YEAR });
    const { sheets, workbook } = await workbookFor(companyId, LTD_YEAR);

    expect(sheets.map((s) => s.name)).toEqual([
      TAB.cover,
      TAB.pnl,
      TAB.position,
      TAB.review,
      TAB.sales,
      TAB.otherIncome,
      TAB.expenses,
      TAB.reimbursements,
      TAB.bank,
      TAB.shares,
      TAB.outside,
    ]);
    expect(workbook.omitted).toEqual([]);

    for (const name of [TAB.cover, TAB.pnl, TAB.position, TAB.shares, TAB.outside]) {
      const sheet = findSheet(sheets, name);
      expect(amount(sheet, "Period start")).toBe("2025-04-01");
      expect(amount(sheet, "Period end")).toBe("2026-03-31");
    }
    const cover = findSheet(sheets, TAB.cover);
    expect(amount(cover, "Accounting period")).toBe("1 April 2025 to 31 March 2026");
    expect(amount(cover, "Legal name")).toBe("Northwind Studio Ltd");
    expect(amount(cover, "Company number")).toBe("01234567");
    expect(amount(cover, "Company UTR")).toBe("1234567890");
    expect(amount(cover, "Registered address")).toBe("1 High Street, Leeds");
    expect(amount(cover, "Contact email")).toBe("accounts@example.com");
    // The contents list has a line for every other tab.
    for (const sheet of sheets.slice(1)) expect(amount(cover, sheet.name)).toBe(sheet.about);
  });

  it("counts only records dated in the period, and every P&L figure ties to its detail tab", async () => {
    const { companyId } = await seedYearEnd(db, { entityType: "limited_company", period: LTD_YEAR });
    const { sheets } = await workbookFor(companyId, LTD_YEAR);
    const pnl = findSheet(sheets, TAB.pnl);
    const sales = findSheet(sheets, TAB.sales);
    const expenses = findSheet(sheets, TAB.expenses);
    const otherIncome = findSheet(sheets, TAB.otherIncome);

    // Invoices on the first and last day (200 + 400); the days either side are left out.
    expect(amount(pnl, "Sales invoices")).toBe(60_000);
    expect(amount(pnl, "Less: credit notes")).toBe(-3_000);
    expect(amount(pnl, "Interest")).toBe(3_000);
    expect(amount(pnl, "Total income")).toBe(60_000);
    expect(amount(pnl, "Travel")).toBe(6_000);
    expect(amount(pnl, "Office")).toBe(2_500);
    expect(amount(pnl, "Total expenses")).toBe(8_500);
    expect(amount(pnl, "Profit (or loss) for the period")).toBe(51_500);

    expect(column(sales, "Number")).toEqual(["INV-2", "CN-1", "INV-3"]);
    expectDatesInPeriod(sales, "Date issued", LTD_YEAR);
    expectDatesInPeriod(expenses, "Date spent", LTD_YEAR);
    expectDatesInPeriod(otherIncome, "Date", LTD_YEAR);
    expectDatesInPeriod(findSheet(sheets, TAB.bank), "Date", LTD_YEAR);

    expect(sum(column(sales, "Amount (£)"))).toBe(60_000 - 3_000);
    expect(sum(column(otherIncome, "Amount (£)"))).toBe(3_000);
    expect(sum(column(expenses, "Amount (£)"))).toBe(8_500);
    expect(value(sales.totals![sales.headers.indexOf("Amount (£)")])).toBe(57_000);
    expect(value(expenses.totals![expenses.headers.indexOf("Amount (£)")])).toBe(8_500);

    // Totals are formulas over the detail tab, so the accountant can trace them.
    expect(formula(labelledRow(pnl, "Sales invoices")[1])).toContain("'Sales invoices'!");
    expect(formula(labelledRow(pnl, "Travel")[1])).toContain("'Expenses'!");
    expect(formula(labelledRow(pnl, "Interest")[1])).toContain("'Other income'!");
    expect(formula(sales.totals![sales.headers.indexOf("Amount (£)")])).toBe("SUM(G2:G4)");
  });

  it("merges line descriptions into the sales tab and shows when each invoice was paid", async () => {
    const seeded = await seedYearEnd(db, { entityType: "limited_company", period: LTD_YEAR });
    const { sheets } = await workbookFor(seeded.companyId, LTD_YEAR);
    const sales = findSheet(sheets, TAB.sales);

    expect(column(sales, "What it was for")).toEqual([
      "Design work 2",
      "Credit against invoice INV-2: Agreed discount",
      "Design work 3",
    ]);
    expect(column(sales, "Owed by customer at period end (£)")).toEqual([10_000, null, 40_000]);
    expect(column(sales, "Date paid in full")).toEqual([seeded.laterPaidOn, null, null]);
    // Nobody is owed money back, so that column is left off.
    expect(sales.headers).not.toContain(OWED_BACK);
  });

  it("shows an overpayment as an amount owed back to the customer, never as a negative debt", async () => {
    const seeded = await seedYearEnd(db, { entityType: "limited_company", period: LTD_YEAR });
    const last = LTD_YEAR.to;
    // 410 received against the 400 invoice issued on the last day.
    await db.insert(payments).values({
      invoiceId: seeded.edgeInvoices[2]!.id,
      amountPence: 41_000,
      receivedAt: new Date(`${last}T12:00:00Z`),
      method: "bank_transfer",
    });
    const { sheets } = await workbookFor(seeded.companyId, LTD_YEAR);
    const sales = findSheet(sheets, TAB.sales);
    const position = findSheet(sheets, TAB.position);

    expect(column(sales, "Received by period end (£)")).toEqual([7_000, null, 41_000]);
    expect(column(sales, "Owed by customer at period end (£)")).toEqual([10_000, null, 0]);
    expect(column(sales, OWED_BACK)).toEqual([null, null, 1_000]);
    expect(column(sales, "Date paid in full")).toEqual([seeded.laterPaidOn, null, last]);

    // Off the unpaid invoices and into its own section.
    expect(labelledRow(position, "INV-3").map(value)).toEqual([
      "INV-3",
      last,
      "Acme Trading",
      40_000,
      41_000,
      1_000,
      "Not yet refunded",
    ]);
    // The sales income is the invoices, not the money received.
    expect(amount(findSheet(sheets, TAB.pnl), "Sales invoices")).toBe(60_000);
  });

  it("shows a credit on a paid invoice as owed back until the refund is paid", async () => {
    const seeded = await seedYearEnd(db, { entityType: "limited_company", period: LTD_YEAR });
    const last = LTD_YEAR.to;
    const invoice = seeded.edgeInvoices[2]!;
    await db.insert(payments).values({
      invoiceId: invoice.id,
      amountPence: 40_000,
      receivedAt: new Date(`${last}T12:00:00Z`),
      method: "bank_transfer",
    });
    const refundedOn = addDays(last, 10);
    const [note] = await db
      .insert(creditNotes)
      .values({
        companyId: seeded.companyId,
        invoiceId: invoice.id,
        clientId: seeded.client.id,
        number: "CN-9",
        issueDate: last,
        reason: "Work not needed",
        netPence: 5_000,
        vatPence: 0,
        grossPence: 5_000,
        refundedPence: 5_000,
        refundedAt: refundedOn,
      })
      .returning();

    const later = await workbookFor(seeded.companyId, LTD_YEAR);
    expect(labelledRow(findSheet(later.sheets, TAB.position), "INV-3").map(value)).toEqual([
      "INV-3",
      last,
      "Acme Trading",
      40_000,
      40_000,
      5_000,
      refundedOn,
    ]);

    // Refunded by the period end: nothing is owed back.
    await db.update(creditNotes).set({ refundedAt: last }).where(eq(creditNotes.id, note!.id));
    const { sheets } = await workbookFor(seeded.companyId, LTD_YEAR);
    const position = findSheet(sheets, TAB.position);
    const owedBack = position.rows.findIndex((r) =>
      String(value(r[0])).startsWith("Amounts owed back to customers"),
    );
    expect(position.rows[owedBack + 1]!.map(value)).toEqual([NONE_IN_PERIOD, 0]);
    expect(findSheet(sheets, TAB.sales).headers).not.toContain(OWED_BACK);
  });

  it("reconciles the bank: opening balance plus the period's transactions equals the closing balance", async () => {
    const { companyId } = await seedYearEnd(db, { entityType: "limited_company", period: LTD_YEAR });
    const { sheets } = await workbookFor(companyId, LTD_YEAR);
    const position = findSheet(sheets, TAB.position);
    const bank = findSheet(sheets, TAB.bank);

    // 1,000 on the statement ten days before, plus 5 of interest the day before the period.
    const [, start, moneyIn, moneyOut, end] = labelledRow(position, "Main account").map(value);
    expect(start).toBe(100_500);
    expect(moneyIn).toBe(3_000);
    expect(moneyOut).toBe(-3_500);
    expect(end).toBe(100_000);
    expect(Number(start) + sum(column(bank, "Amount (£)"))).toBe(end);
    expect(column(bank, "Balance (£)").at(-1)).toBe(end);
    expect(formula(labelledRow(position, "Main account")[4])).toMatch(/^B\d+\+C\d+\+D\d+$/);

    // Oldest first.
    const dates = column(bank, "Date").map(String);
    expect(dates).toEqual([...dates].sort());
    expect(column(bank, "Matched to")).toEqual([
      "Other income: Interest",
      "Expense dated 31/03/2025, outside this period: Train ticket 1",
      "Salary: Jo Field",
      "Other income: Interest",
    ]);
  });

  it("shows the year-end position: debtors, amounts owed to people, and directors' pay", async () => {
    const seeded = await seedYearEnd(db, { entityType: "limited_company", period: LTD_YEAR });
    const { sheets } = await workbookFor(seeded.companyId, LTD_YEAR);
    const position = findSheet(sheets, TAB.position);

    expect(labelledRow(position, "INV-2").map(value)).toEqual([
      "INV-2",
      "2025-04-01",
      "Acme Trading",
      20_000,
      10_000,
      seeded.laterPaidOn,
    ]);
    expect(value(labelledRow(position, "INV-3")[5])).toBe("Not yet paid in full");

    // Stamps bought before the period and still not paid back at its end.
    const owedHeading = position.rows.findIndex((r) =>
      String(value(r[0])).startsWith("Amounts owed to directors and employees"),
    );
    expect(position.rows[owedHeading + 2]!.map(value)).toEqual(["Jo Field", 700]);

    const payHeading = position.rows.findIndex((r) => value(r[0]) === "Directors' pay in the period");
    expect(position.rows.slice(payHeading + 2, payHeading + 4).map((r) => r.map(value))).toEqual([
      ["Jo Field", 2_500, 0, 2_500],
      // Dividends declared on the first and last day (400 + 800).
      ["Sam Carter", 0, 120_000, 120_000],
    ]);

    // Nothing over the threshold, and nothing flagged as covering a later period.
    const text = position.rows.map((r) => value(r[0]));
    const fixedAssets = text.findIndex((t) => String(t).startsWith("Possible fixed assets"));
    expect(position.rows[fixedAssets + 1]!.map(value)).toEqual([NONE_IN_PERIOD, 0]);
  });

  it("lists possible fixed assets over the threshold and possible prepayments", async () => {
    const seeded = await seedYearEnd(db, { entityType: "limited_company", period: LTD_YEAR });
    const { expenses } = await import("@/db/schema");
    await db.insert(expenses).values([
      {
        companyId: seeded.companyId,
        description: "Laptop",
        category: "Equipment",
        spentAt: "2025-06-01",
        amountPence: 25_001,
        status: "company_paid",
      },
      {
        companyId: seeded.companyId,
        description: "Keyboard",
        category: "Equipment",
        spentAt: "2025-06-02",
        amountPence: 25_000,
        status: "company_paid",
      },
      {
        companyId: seeded.companyId,
        description: "Insurance",
        category: "Professional fees",
        spentAt: "2026-01-01",
        amountPence: 36_500,
        status: "company_paid",
        coversFrom: "2026-01-01",
        coversTo: "2026-12-31",
      },
    ]);
    const { sheets } = await workbookFor(seeded.companyId, LTD_YEAR);
    const position = findSheet(sheets, TAB.position);
    const descriptions = position.rows.map((r) => value(r[2]));

    expect(descriptions).toContain("Laptop");
    expect(descriptions).not.toContain("Keyboard");
    const insurance = position.rows.find((r) => value(r[2]) === "Insurance")!;
    // 275 of the 365 days covered fall after 31 March; the other 90 are in the period.
    expect(insurance.map(value).slice(3)).toEqual([
      "Professional fees",
      36_500,
      "2026-01-01",
      "2026-12-31",
      9_000,
      27_500,
    ]);
  });

  it("carries a prepayment forward at one year end and brings it forward in the next year's pack", async () => {
    const seeded = await seedYearEnd(db, { entityType: "limited_company", period: LTD_YEAR });
    const { expenses } = await import("@/db/schema");
    await db.insert(expenses).values([
      {
        companyId: seeded.companyId,
        description: "Web hosting",
        category: "Software",
        spentAt: "2026-03-10",
        amountPence: 12_000,
        status: "company_paid",
        coversFrom: "2026-03-10",
        coversTo: "2027-03-09",
      },
      {
        companyId: seeded.companyId,
        description: "Conference ticket",
        category: "Travel",
        spentAt: "2026-03-15",
        amountPence: 30_000,
        status: "company_paid",
        coversFrom: "2026-06-12",
        coversTo: "2026-06-12",
      },
    ]);
    const rowsOf = (sheet: PackSheet) => sheet.rows.map((r) => r.map(value));
    const tableUnder = (rows: unknown[][], title: string) => {
      const start = rows.findIndex((r) => String(r[0]).startsWith(title));
      expect(start, title).toBeGreaterThanOrEqual(0);
      return rows.slice(start + 1);
    };

    // The year they were paid in: 22 of hosting's 365 days fall in it, and none of the event.
    const paidYear = await workbookFor(seeded.companyId, LTD_YEAR);
    const carried = tableUnder(rowsOf(findSheet(paidYear.sheets, TAB.position)), "Possible prepayments");
    expect(carried[0]!.slice(5)).toEqual([
      "Covers from",
      "Covers to",
      "Part in the period, by days (£)",
      "Part after the period end, by days (£)",
    ]);
    expect(carried.find((r) => r[2] === "Web hosting")!.slice(3)).toEqual([
      "Software", 12_000, "2026-03-10", "2027-03-09", 723, 11_277,
    ]);
    expect(carried.find((r) => r[2] === "Conference ticket")!.slice(3)).toEqual([
      "Travel", 30_000, "2026-06-12", "2026-06-12", 0, 30_000,
    ]);
    const paidPnl = findSheet(paidYear.sheets, TAB.pnl);
    expect(amount(paidPnl, "Included in expenses above, but covering time after the period end")).toBe(41_277);
    expect(allText(paidPnl).join("\n")).not.toContain("Not in expenses above");

    // The year after: neither is an expense of it, but both are brought forward.
    const nextYear = { from: "2026-04-01", to: "2027-03-31" };
    const next = await workbookFor(seeded.companyId, nextYear);
    const brought = tableUnder(rowsOf(findSheet(next.sheets, TAB.position)), "Prepayments brought forward");
    expect(brought[0]!.slice(5)).toEqual([
      "Covers from",
      "Covers to",
      "Part before the period, by days (£)",
      "Part in the period, by days (£)",
    ]);
    expect(brought.find((r) => r[2] === "Web hosting")!.slice(3)).toEqual([
      "Software", 12_000, "2026-03-10", "2027-03-09", 723, 11_277,
    ]);
    expect(brought.find((r) => r[2] === "Conference ticket")!.slice(3)).toEqual([
      "Travel", 30_000, "2026-06-12", "2026-06-12", null, 30_000,
    ]);
    const nextPnl = findSheet(next.sheets, TAB.pnl);
    expect(
      amount(nextPnl, "Not in expenses above: spent in an earlier period, but covering time in this period"),
    ).toBe(41_277);
    const nextExpenses = next.sheets.find((s) => s.name === TAB.expenses);
    expect(nextExpenses ? column(nextExpenses, "Description") : []).not.toContain("Web hosting");
  });

  it("splits a cost that spans three periods into before, in and after, adding up to the cost", async () => {
    const seeded = await seedYearEnd(db, { entityType: "limited_company", period: LTD_YEAR });
    const { expenses } = await import("@/db/schema");
    await db.insert(expenses).values({
      companyId: seeded.companyId,
      description: "Two-year licence",
      category: "Software",
      spentAt: "2025-01-01",
      amountPence: 73_000,
      status: "company_paid",
      coversFrom: "2025-01-01",
      coversTo: "2026-12-31",
    });
    const { sheets } = await workbookFor(seeded.companyId, LTD_YEAR);
    const licence = findSheet(sheets, TAB.position).rows.find((r) => value(r[2]) === "Two-year licence")!;
    // 730 days at £1 a day: 90 before 1 April 2025, 365 in the year, 275 after 31 March 2026.
    expect(licence.map(value).slice(3)).toEqual([
      "Software", 73_000, "2025-01-01", "2026-12-31", 9_000, 36_500, 27_500,
    ]);
  });

  it("lists a reimbursement with its items beneath it, including one dated before the period", async () => {
    const seeded = await seedYearEnd(db, { entityType: "limited_company", period: LTD_YEAR });
    const { sheets } = await workbookFor(seeded.companyId, LTD_YEAR);
    const sheet = findSheet(sheets, TAB.reimbursements);

    expect(sheet.rows.map((r) => r.map(value))).toEqual([
      ["Date paid", "Ref", "Paid to", "Reference", "Expense ref", "Date spent", "Description", "Amount (£)", "Note"],
      [seeded.reimbursedOn, formatReimbursementRef(seeded.run.refNumber), "Jo Field", "RB-1", null, null, "2 expenses", 4_000, null],
      [null, null, null, null, exp(seeded.reimbursedEarlier), addDays(LTD_YEAR.from, -20), "Printer paper", 1_500, "Dated before this period"],
      [null, null, null, null, exp(seeded.reimbursedInPeriod), addDays(LTD_YEAR.from, 5), "Desk lamp", 2_500, null],
      ["Total reimbursed", null, null, null, null, null, null, 4_000],
    ]);
    expect(sheet.freezeRows).toBe(1);
  });

  it("keeps records dated outside the period in their own sections, out of the P&L", async () => {
    const seeded = await seedYearEnd(db, { entityType: "limited_company", period: LTD_YEAR });
    const { sheets } = await workbookFor(seeded.companyId, LTD_YEAR);
    const outside = findSheet(sheets, TAB.outside);
    const rows = outside.rows.map((r) => r.map(value));
    const section = (title: string) => {
      const start = rows.findIndex((r) => r[0] === title);
      expect(start, title).toBeGreaterThanOrEqual(0);
      const end = rows.findIndex((r, i) => i > start && r.length === 0);
      return rows.slice(start + 2, end < 0 ? undefined : end);
    };

    expect(section("Payments received after the period end for invoices issued in the period")).toEqual([
      [seeded.laterPaidOn, "INV-2", "Acme Trading", 10_000],
      ["Total", null, null, 10_000],
    ]);
    expect(section("Reimbursed in the period for expenses dated before it")).toEqual([
      [seeded.reimbursedOn, "Jo Field", exp(seeded.reimbursedEarlier), addDays(LTD_YEAR.from, -20), "Printer paper", 1_500],
      ["Total", null, null, null, null, 1_500],
    ]);
    expect(section("Expenses awaiting reimbursement at the period end")).toEqual([
      [addDays(LTD_YEAR.from, -5), exp(seeded.awaiting), "Jo Field", "Stamps", 700],
      ["Total", null, null, null, 700],
    ]);
    expect(section("Bank payments made after the period end for expenses dated in the period")).toEqual([
      [addDays(LTD_YEAR.to, 3), exp(seeded.edgeExpenses[2]!), LTD_YEAR.to, "Train ticket 3", 4_000],
      ["Total", null, null, null, 4_000],
    ]);

    // None of them reached the expenses tab or the P&L.
    const expenseDescriptions = column(findSheet(sheets, TAB.expenses), "Description");
    expect(expenseDescriptions).not.toContain("Printer paper");
    expect(expenseDescriptions).not.toContain("Stamps");
  });

  it("lists shareholders with shares and percentage held, and dividends declared in the period", async () => {
    const { companyId } = await seedYearEnd(db, { entityType: "limited_company", period: LTD_YEAR });
    const { sheets } = await workbookFor(companyId, LTD_YEAR);
    const shares = findSheet(sheets, TAB.shares);
    const rows = shares.rows.map((r) => r.map(value));

    expect(amount(shares, "Total shares in issue")).toBe(100);
    expect(rows).toContainEqual(["Sam Carter", 100, 100]);
    expect(rows).toContainEqual(["2025-04-01", "Sam Carter", 100, 40_000]);
    expect(rows).toContainEqual(["2026-03-31", "Sam Carter", 100, 80_000]);
    expect(rows.flat()).not.toContain("2025-03-31");
    expect(rows.flat()).not.toContain("2026-04-01");
  });

  it("has no empty tab, and no column that is empty, all zeros or an internal ID", async () => {
    const { companyId } = await seedYearEnd(db, { entityType: "limited_company", period: LTD_YEAR });
    const { sheets } = await workbookFor(companyId, LTD_YEAR);
    expectNoEmptyOrIdColumns(sheets);
  });

  it("leaves out empty tabs and lists them on the cover", async () => {
    const { seedCompany } = await import("@/lib/test/seed-company");
    const company = await seedCompany(db, { companyNumber: "01234567" });
    const { sheets, workbook } = await workbookFor(company.id, LTD_YEAR);

    expect(sheets.map((s) => s.name)).toEqual([TAB.cover, TAB.pnl, TAB.position, TAB.review]);
    expect(workbook.omitted).toEqual([
      TAB.sales,
      TAB.otherIncome,
      TAB.expenses,
      TAB.reimbursements,
      TAB.bank,
      TAB.shares,
      TAB.outside,
    ]);
    const cover = findSheet(sheets, TAB.cover);
    for (const name of workbook.omitted) expect(amount(cover, name)).toBe(NONE_IN_PERIOD);
    // Nothing owed and no bank: each position section still shows a nil.
    const position = findSheet(sheets, TAB.position);
    expect(position.rows.filter((r) => value(r[0]) === NONE_IN_PERIOD).length).toBeGreaterThanOrEqual(6);
  });

  it("includes VAT columns and the VAT tab only when the business is VAT registered", async () => {
    const { companyId } = await seedYearEnd(db, { entityType: "limited_company", period: LTD_YEAR });
    const plain = await workbookFor(companyId, LTD_YEAR);
    expect(plain.sheets.map((s) => s.name)).not.toContain(TAB.vat);
    expect(findSheet(plain.sheets, TAB.sales).headers).not.toContain("VAT (£)");

    await db
      .update(companies)
      .set({ vatRegistered: true, vatNumber: "GB123456789" })
      .where(eq(companies.id, companyId));
    const { expenses, invoices } = await import("@/db/schema");
    await db.update(invoices).set({ vatPence: 100, grossPence: 20_100 }).where(eq(invoices.number, "INV-2"));
    await db.update(expenses).set({ vatPence: 50 }).where(eq(expenses.description, "Train ticket 2"));

    const registered = await workbookFor(companyId, LTD_YEAR);
    expect(registered.sheets.map((s) => s.name).slice(0, 4)).toEqual([
      TAB.cover,
      TAB.pnl,
      TAB.position,
      TAB.vat,
    ]);
    const vat = findSheet(registered.sheets, TAB.vat);
    expect(amount(vat, "VAT charged on sales, less credit notes")).toBe(100);
    expect(amount(vat, "VAT paid on expenses")).toBe(50);
    expect(findSheet(registered.sheets, TAB.sales).headers).toEqual(
      expect.arrayContaining(["Net (£)", "VAT (£)", "Gross (£)"]),
    );
    // Expenses are counted before VAT once registered.
    expect(amount(findSheet(registered.sheets, TAB.pnl), "Travel")).toBe(5_950);

    // The plan has no VAT export: no VAT tab, even when registered.
    const noPlan = await workbookFor(companyId, LTD_YEAR, false);
    expect(noPlan.sheets.map((s) => s.name)).not.toContain(TAB.vat);
  });
});

describe("sole trader, 6 April 2025 to 5 April 2026", () => {
  it.each(["accruals", "cash"] as const)(
    "has no company, shareholder, dividend or director wording on %s",
    async (accountingBasis) => {
      const { companyId } = await seedYearEnd(db, {
        entityType: "sole_trader",
        period: TAX_YEAR,
        accountingBasis,
      });
      const { sheets } = await workbookFor(companyId, TAX_YEAR);

      expect(sheets.map((s) => s.name)).not.toContain(TAB.shares);
      for (const sheet of sheets) {
        for (const text of allText(sheet)) {
          expect(text, `${sheet.name}: ${text}`).not.toMatch(/company|shareholder|dividend|director/i);
        }
      }
      expectNoEmptyOrIdColumns(sheets);

      const cover = findSheet(sheets, TAB.cover);
      expect(amount(cover, "Accounting period")).toBe("6 April 2025 to 5 April 2026");
      expect(amount(cover, "Owner's name")).toBe("Sam Carter");
      expect(amount(cover, "Trading name")).toBe("Carter Design");
      expect(amount(cover, "Business address")).toBe("1 High Street, Leeds");
      expect(amount(cover, "Self Assessment UTR")).toBe("1234567890");
      expect(amount(cover, "Date trading started")).toBe("2020-01-06");
      expect(amount(cover, "Accounting basis")).toBe(
        accountingBasis === "cash" ? "Cash basis" : "Traditional accruals",
      );
    },
  );

  it("on accruals, counts invoices by issue date and expenses by spend date", async () => {
    const { companyId } = await seedYearEnd(db, {
      entityType: "sole_trader",
      period: TAX_YEAR,
      accountingBasis: "accruals",
    });
    const { sheets } = await workbookFor(companyId, TAX_YEAR);
    const pnl = findSheet(sheets, TAB.pnl);
    const expenses = findSheet(sheets, TAB.expenses);
    const sales = findSheet(sheets, TAB.sales);

    expect(amount(pnl, "Sales invoices")).toBe(60_000);
    expect(amount(pnl, "Less: credit notes")).toBe(-3_000);
    expect(amount(pnl, "Interest")).toBe(3_000);
    // Travel on the first and last day, the desk lamp, and the owner's notebook.
    expect(amount(pnl, "Total expenses")).toBe(9_400);
    expect(amount(pnl, "Profit (or loss) for the period")).toBe(50_600);

    expectDatesInPeriod(sales, "Date issued", TAX_YEAR);
    expectDatesInPeriod(expenses, "Date spent", TAX_YEAR);
    expect(sum(column(sales, "Amount (£)"))).toBe(57_000);
    expect(sum(column(expenses, "Amount (£)"))).toBe(9_400);
    expect(sheets.map((s) => s.name)).not.toContain(TAB.received);
  });

  it("on cash basis, counts income when received and expenses when paid", async () => {
    const seeded = await seedYearEnd(db, {
      entityType: "sole_trader",
      period: TAX_YEAR,
      accountingBasis: "cash",
    });
    const { sheets } = await workbookFor(seeded.companyId, TAX_YEAR);
    const pnl = findSheet(sheets, TAB.pnl);
    const received = findSheet(sheets, TAB.received);
    const expenses = findSheet(sheets, TAB.expenses);
    const [before, first, last] = edges(TAX_YEAR);

    // Payments received on the first and last day (20 + 40) and one mid-period (70).
    expect(amount(pnl, "Money received from customers")).toBe(13_000);
    expect(amount(pnl, "Interest")).toBe(3_000);
    expect(amount(pnl, "Total expenses")).toBe(7_900);
    expect(amount(pnl, "Profit (or loss) for the period")).toBe(8_100);
    expect(formula(labelledRow(pnl, "Money received from customers")[1])).toContain(
      "'Payments received'!",
    );

    expectDatesInPeriod(received, "Date", TAX_YEAR);
    expect(column(received, "Date")).toEqual([first, addDays(first, 40), last]);
    expect(sum(column(received, "Counted as income (£)"))).toBe(13_000);

    expectDatesInPeriod(expenses, "Date paid", TAX_YEAR);
    expect(sum(column(expenses, "Amount (£)"))).toBe(7_900);
    const byDescription = new Map(
      column(expenses, "Description").map((d, i) => [d, column(expenses, "Date paid")[i]]),
    );
    // Spent the day before the period, paid from the bank in it.
    expect(byDescription.get("Train ticket 1")).toBe(addDays(first, 1));
    expect(column(expenses, "Date spent")).toContain(before);
    // Paid back to a colleague in the period, whenever it was spent.
    expect(byDescription.get("Printer paper")).toBe(seeded.reimbursedOn);
    // The owner's own spending counts on the day they spent it.
    expect(byDescription.get("Notebook")).toBe(addDays(first, 7));
    // Spent on the last day but paid from the bank after it: next period's expense.
    expect(byDescription.has("Train ticket 3")).toBe(false);
    // Not yet paid back, so not yet paid by the business.
    expect(byDescription.has("Stamps")).toBe(false);
  });

  it("on cash basis, lists no prepayments and says why", async () => {
    const seeded = await seedYearEnd(db, {
      entityType: "sole_trader",
      period: TAX_YEAR,
      accountingBasis: "cash",
    });
    const { expenses } = await import("@/db/schema");
    await db.insert(expenses).values([
      {
        companyId: seeded.companyId,
        description: "Insurance",
        spentAt: "2026-01-01",
        amountPence: 36_500,
        status: "company_paid",
        coversFrom: "2026-01-01",
        coversTo: "2026-12-31",
      },
      {
        companyId: seeded.companyId,
        description: "Earlier licence",
        spentAt: "2025-01-01",
        amountPence: 73_000,
        status: "company_paid",
        coversFrom: "2025-01-01",
        coversTo: "2026-12-31",
      },
    ]);
    const { sheets } = await workbookFor(seeded.companyId, TAX_YEAR);
    const position = allText(findSheet(sheets, TAB.position)).join("\n");

    expect(position).toContain("Not listed: on the cash basis");
    expect(position).not.toContain("Insurance");
    expect(position).not.toContain("Earlier licence");
    expect(position).not.toContain("brought forward");
    expect(allText(findSheet(sheets, TAB.pnl)).join("\n")).not.toContain("prepayment");
    expect(allText(findSheet(sheets, TAB.cover)).join("\n")).not.toContain("prepayment");
  });

  it("totals drawings, money put in and mileage, and treats the owner's spending as money put in", async () => {
    const seeded = await seedYearEnd(db, {
      entityType: "sole_trader",
      period: TAX_YEAR,
      accountingBasis: "accruals",
    });
    const { expenses } = await import("@/db/schema");
    await db.insert(expenses).values({
      companyId: seeded.companyId,
      description: "Client visit",
      category: "Travel",
      spentAt: "2025-09-01",
      amountPence: 4_500,
      status: "reimbursable",
      paidByUserId: seeded.owner.id,
      mileageMiles: 100,
      mileageRatePence: 45,
    });
    const { sheets } = await workbookFor(seeded.companyId, TAX_YEAR);
    const position = findSheet(sheets, TAB.position);

    expect(amount(position, "Taken from the business bank account")).toBe(2_000);
    // The notebook and the mileage claim, both paid personally by the owner.
    expect(amount(position, "Business expenses the owner paid personally")).toBe(5_400);
    expect(amount(position, "Journeys recorded")).toBe(1);
    expect(amount(position, "Miles")).toBe(100);
    expect(amount(position, "Amount claimed (£)")).toBe(4_500);

    // The owner is never listed as owed money.
    const outside = findSheet(sheets, TAB.outside);
    expect(outside.rows.flat().map(value)).not.toContain("Notebook");
    const statuses = column(findSheet(sheets, TAB.expenses), "How it was paid");
    expect(statuses).toContain("Paid personally by the owner");
    expect(statuses).toContain("Paid by business");
  });

  it("leaves a reimbursement paid to the owner off the reimbursements tab, as drawings", async () => {
    const seeded = await seedYearEnd(db, {
      entityType: "sole_trader",
      period: TAX_YEAR,
      accountingBasis: "accruals",
    });
    const { reimbursements } = await import("@/db/schema");
    await db.insert(reimbursements).values({
      companyId: seeded.companyId,
      payeeUserId: seeded.owner.id,
      status: "paid",
      totalPence: 900,
      paidAt: new Date("2025-10-01T12:00:00Z"),
    });
    const { sheets } = await workbookFor(seeded.companyId, TAX_YEAR);

    const paidTo = findSheet(sheets, TAB.reimbursements).rows.map((r) => value(r[2]));
    expect(paidTo).toContain("Jo Field");
    expect(paidTo).not.toContain("Sam Carter");
    expect(amount(findSheet(sheets, TAB.position), "Reimbursements paid to the owner")).toBe(900);
  });
});

describe("streamYearEndPack", () => {
  async function seedWithReceipt() {
    const seeded = await seedYearEnd(db, { entityType: "limited_company", period: LTD_YEAR });
    const bytes = new TextEncoder().encode("receipt");
    await getStorage().put("receipts/a.jpg", Buffer.from(bytes), "image/jpeg");
    await db.insert(expenseReceipts).values([
      { expenseId: seeded.edgeExpenses[1]!.id, blobPath: "receipts/a.jpg", filename: "IMG 0042.JPG" },
      { expenseId: seeded.edgeExpenses[1]!.id, blobPath: "receipts/a.jpg", filename: "page2.jpg" },
      { expenseId: seeded.edgeExpenses[2]!.id, blobPath: "receipts/gone.pdf", filename: "ticket.pdf" },
    ]);
    return seeded;
  }

  it("zips the workbook with receipts named by expense reference and invoices by number", async () => {
    const { companyId, edgeExpenses } = await seedWithReceipt();
    const withReceipts = exp(edgeExpenses[1]!);
    const pack = await streamYearEndPack({ companyId, period: LTD_YEAR, includeVat: true });
    if (!pack.ok) throw new Error("blocked");
    const zip = await collect(pack.stream);
    const entries = listStoreZipEntries(zip);

    expect(pack.filename).toBe("year-end-pack-2025-04-01_2026-03-31.zip");
    expect(entries).toEqual(
      expect.arrayContaining([
        WORKBOOK_PATH,
        "README.txt",
        "invoices/INV-2.pdf",
        "invoices/INV-3.pdf",
        "credit-notes/CN-1.pdf",
        `receipts/${withReceipts}.jpg`,
        `receipts/${withReceipts}-2.jpg`,
      ]),
    );
    expect(entries).not.toContain("invoices/INV-1.pdf");
    expect(entries.filter((e) => e.startsWith("receipts/"))).toHaveLength(2);

    const text = (name: string) => new TextDecoder().decode(entry(zip, name));
    expect(text("README.txt")).toContain("Accounting period: 1 April 2025 to 31 March 2026");
    expect(text("README.txt")).toContain(`Receipt for ${exp(edgeExpenses[2]!)} (Train ticket 3) could not be included`);

    const parts = new Map(
      readStoreZipEntries(entry(zip, WORKBOOK_PATH)).map(([name, data]) => [
        name,
        new TextDecoder().decode(data),
      ]),
    );
    const names = [...parts.get("xl/workbook.xml")!.matchAll(/<sheet name="([^"]+)"/g)].map((m) => m[1]);
    expect(names.slice(0, 5)).toEqual([TAB.cover, TAB.pnl, TAB.position, TAB.review, TAB.sales]);

    const salesXml = parts.get(`xl/worksheets/sheet${names.indexOf(TAB.sales) + 1}.xml`)!;
    // 1 April 2025 as a real Excel date, styled dd/mm/yyyy, with no time part.
    expect(salesXml).toContain('<c r="A2" s="3"><v>45748</v></c>');
    expect(salesXml).toContain("<f>SUM(G2:G4)</f><v>570</v>");
    expect(salesXml).toContain('state="frozen"');
    expect(parts.get("xl/styles.xml")).toContain('formatCode="dd/mm/yyyy"');

    const expensesXml = parts.get(`xl/worksheets/sheet${names.indexOf(TAB.expenses) + 1}.xml`)!;
    expect(expensesXml).toContain(`${withReceipts}.jpg, ${withReceipts}-2.jpg`);
  });

  it("gives every record the same reference and receipt file name after an older expense is added", async () => {
    const { companyId, edgeExpenses } = await seedWithReceipt();
    const exportPack = async () => {
      const pack = await streamYearEndPack({ companyId, period: LTD_YEAR, includeVat: true });
      if (!pack.ok) throw new Error("blocked");
      const receipts = listStoreZipEntries(await collect(pack.stream)).filter((e) => e.startsWith("receipts/"));
      const { sheets } = await workbookFor(companyId, LTD_YEAR);
      const expenseTab = findSheet(sheets, TAB.expenses);
      const refs = column(expenseTab, "Ref");
      const descriptions = column(expenseTab, "Description");
      return {
        receipts,
        expenseRefs: new Map(descriptions.map((d, i) => [String(d), String(refs[i])])),
        dates: column(expenseTab, "Date spent").map(String),
        reimbursements: findSheet(sheets, TAB.reimbursements).rows.map((r) => r.map(value)),
        outside: findSheet(sheets, TAB.outside).rows.map((r) => r.map(value)),
        matched: column(findSheet(sheets, TAB.bank), "Matched to"),
      };
    };

    const before = await exportPack();
    expect(before.expenseRefs.size).toBeGreaterThan(1);

    // Dated on the first day of the period, so it sorts ahead of everything already there.
    const { expenses } = await import("@/db/schema");
    const [older] = await db
      .insert(expenses)
      .values({
        companyId,
        description: "Old receipt found later",
        category: "Office",
        spentAt: LTD_YEAR.from,
        amountPence: 1_234,
        status: "company_paid",
      })
      .returning();
    const after = await exportPack();

    // The new record takes the next number. The tab stays in date order, so it is not at the end.
    expect(older.refNumber).toBeGreaterThan(Math.max(...edgeExpenses.map((e) => e.refNumber)));
    expect(after.expenseRefs.get("Old receipt found later")).toBe(exp(older));
    expect(after.dates).toEqual([...after.dates].sort());
    expect([...after.expenseRefs.keys()].at(-1)).not.toBe("Old receipt found later");

    // Nothing that was already there moved.
    expect(after.expenseRefs.size).toBe(before.expenseRefs.size + 1);
    for (const [description, ref] of before.expenseRefs) {
      expect(after.expenseRefs.get(description), description).toBe(ref);
    }
    expect(after.receipts).toEqual(before.receipts);
    expect(after.reimbursements).toEqual(before.reimbursements);
    expect(after.outside).toEqual(before.outside);
    expect(after.matched).toEqual(before.matched);
  });

  it("writes one CSV per tab in the CSV version", async () => {
    const { companyId } = await seedWithReceipt();
    const pack = await streamYearEndPack({ companyId, period: LTD_YEAR, includeVat: true, format: "csv" });
    if (!pack.ok) throw new Error("blocked");
    const zip = await collect(pack.stream);
    const entries = listStoreZipEntries(zip);

    expect(pack.filename).toBe("year-end-pack-2025-04-01_2026-03-31-csv.zip");
    expect(entries).not.toContain(WORKBOOK_PATH);
    expect(entries).toEqual(
      expect.arrayContaining(["csv/01-cover.csv", "csv/02-profit-and-loss.csv", "csv/05-sales-invoices.csv"]),
    );
    const sales = new TextDecoder().decode(entry(zip, "csv/05-sales-invoices.csv")).split("\n");
    expect(sales[0]).toContain("Date issued,Type,Number,Customer");
    expect(sales[1]).toContain("01/04/2025,Invoice,INV-2,Acme Trading,Design work 2");
    expect(sales.at(-1)).toMatch(/^Total,.*570\.00/);
  });

  it("refuses to produce a pack while a blocking detail is missing", async () => {
    const { companyId } = await seedYearEnd(db, {
      entityType: "limited_company",
      period: LTD_YEAR,
      openingBalance: false,
    });
    const pack = await streamYearEndPack({ companyId, period: LTD_YEAR, includeVat: true });

    expect(pack).toEqual({
      ok: false,
      blockers: [expect.objectContaining({ text: 'Opening balance for the bank account "Main account"' })],
    });
  });

  it("works out the opening balance from a statement dated after the period starts", async () => {
    const { companyId, account } = await seedYearEnd(db, { entityType: "limited_company", period: LTD_YEAR });
    // The balance at the end of the period, entered instead of one before it.
    await db
      .update(bankAccounts)
      .set({ openingBalancePence: 100_000, openingBalanceDate: LTD_YEAR.to })
      .where(eq(bankAccounts.id, account.id));
    const { sheets } = await workbookFor(companyId, LTD_YEAR);

    expect(labelledRow(findSheet(sheets, TAB.position), "Main account").map(value)).toEqual([
      "Main account",
      100_500,
      3_000,
      -3_500,
      100_000,
    ]);
  });
});

describe("year-end runs", () => {
  it("moves a year from not started, to checks outstanding, to exported", async () => {
    const seeded = await seedYearEnd(db, { entityType: "limited_company", period: LTD_YEAR });
    const run = async () =>
      (await listYearEndRuns(seeded.companyId)).find((r) => r.periodFrom === LTD_YEAR.from);

    expect(yearStatus(await run())).toBe("not_started");
    await recordYearEndRun(seeded.companyId, LTD_YEAR, 3);
    expect(yearStatus(await run())).toBe("checks_outstanding");
    await recordYearEndRun(seeded.companyId, LTD_YEAR, 0);
    expect(yearStatus(await run())).toBe("ready");
    await recordYearEndRun(seeded.companyId, LTD_YEAR, 2, seeded.owner.id);
    expect(yearStatus(await run())).toBe("exported");
    expect((await run())?.exportedAt).toBeInstanceOf(Date);
    // One row per period, however many times it is reviewed.
    expect(await db.select().from(yearEndRuns)).toHaveLength(1);
  });
});

describe("zipStoreStream", () => {
  async function* zipEntries(entries: Record<string, ZipEntry>): AsyncGenerator<[string, ZipEntry]> {
    yield* Object.entries(entries);
  }

  it("round-trips text and binary entries", async () => {
    const pdf = new TextEncoder().encode("%PDF-1.4 test");
    const zip = await collect(zipStoreStream(zipEntries({ "hello.txt": "hello", "bin/test.pdf": pdf })));

    expect(listStoreZipEntries(zip)).toEqual(["hello.txt", "bin/test.pdf"]);
    expect(entry(zip, "bin/test.pdf")).toEqual(pdf);
  });

  it("fails the stream when an entry fails, rather than ending as a valid zip", async () => {
    async function* failing(): AsyncGenerator<[string, ZipEntry]> {
      yield ["first.txt", "first"];
      throw new Error("storage down");
    }
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(collect(zipStoreStream(failing()))).rejects.toThrow("storage down");

    expect(logged).toHaveBeenCalledWith(
      "Year-end pack stream failed:",
      expect.objectContaining({ message: "storage down" }),
    );
    logged.mockRestore();
  });
});

describe("toCsv", () => {
  it("escapes commas and quotes", () => {
    const csv = toCsv([
      ["a", "b"],
      ["1", 'say "hi"'],
      ["2", "a,b"],
    ]);
    expect(csv).toContain('"say ""hi"""');
    expect(csv).toContain('"a,b"');
  });
});

function entry(zip: Uint8Array, target: string): Uint8Array {
  const found = readStoreZipEntries(zip).find(([name]) => name === target);
  if (!found) throw new Error(`Entry not found: ${target}`);
  return found[1];
}
