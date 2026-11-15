import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";
import { createTestDb, type TestDatabase } from "@/db/pglite";
import { setTestDb, type Database } from "@/db";
import {
  companies,
  creditNotes,
  dividendDeclarations,
  dividendPayouts,
  expenses,
  payments,
  reconciliationMatches,
  yearEndResponses,
  yearEndRuns,
} from "@/db/schema";
import { todayIsoDate, formatIsoDateUk } from "@/lib/dates";
import { addDays } from "@/lib/ledger/corporation-tax";
import { formatExpenseRef } from "@/lib/references";
import { seedCompany } from "@/lib/test/seed-company";
import { buildXlsx } from "@/lib/xlsx/write";
import {
  CLAIMED_ELSEWHERE_QUESTION,
  LATE_ENTERED_QUESTION,
  NOTHING_TO_REPORT,
  NOT_CONFIRMED,
  OPENING_QUESTION,
  allItems,
  type NoteItem,
} from "@/lib/year-end/notes";
import { prepareYearEndPack } from "@/lib/year-end/pack";
import type { PackPeriod } from "@/lib/year-end/period";
import {
  clearStaleConfirmations,
  saveNoteResponses,
  type NoteEntry,
} from "@/lib/year-end/responses";
import { toXlsxSheets, type PackSheet } from "@/lib/year-end/sheets";
import { TAB } from "@/lib/year-end/workbook";
import { readStoreZipEntries } from "@/lib/zip/store";
import {
  LTD_YEAR,
  TAX_YEAR,
  allText,
  amount,
  findSheet,
  layoutTable,
  seedYearEnd,
  sum,
  value,
  type Seeded,
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

const noon = (date: string) => new Date(`${date}T12:00:00Z`);
const TODAY = todayIsoDate();
const CONFIRMED_TODAY = `Confirmed by the business on ${formatIsoDateUk(TODAY)}`;

async function packFor(companyId: string, period: PackPeriod) {
  const pack = await prepareYearEndPack({ companyId, period, includeVat: true });
  const sheets = pack.workbook.sheets;
  const notes = findSheet(sheets, TAB.notes);
  const items = new Map(allItems(pack.notes).map((i) => [i.key, i]));
  const item = (key: string): NoteItem => {
    const found = items.get(key);
    if (!found) throw new Error(`No note item "${key}": ${[...items.keys()].join(", ")}`);
    return found;
  };
  return { pack, sheets, notes, item, texts: allText(notes) };
}

/** Save what the owner would enter on the Year end page for these items; the rest are left as they are. */
async function respond(seeded: { companyId: string; owner: { id: string } }, period: PackPeriod, entries: Partial<NoteEntry>[]) {
  const { pack } = await packFor(seeded.companyId, period);
  await saveNoteResponses(
    seeded.companyId,
    period,
    pack.notes,
    entries.map((e) => ({ key: "", confirmed: false, explanation: "", answer: "", ...e })),
    seeded.owner.id,
  );
}

/** The rows of a section: from its heading to the next section's. */
function section(sheet: PackSheet, letter: string): string[] {
  const start = sheet.rows.findIndex((r) => String(value(r[0])).startsWith(`${letter}. `));
  if (start < 0) throw new Error(`No section ${letter}`);
  const rest = sheet.rows.slice(start + 1);
  const end = rest.findIndex((r) => /^[a-h]\. /.test(String(value(r[0]))));
  return (end < 0 ? rest : rest.slice(0, end)).flatMap((r) => r.map((c) => String(value(c) ?? "")));
}

/** Someone's cost paid personally, still to be paid back. */
async function owedExpense(seeded: Seeded, spentAt: string, amountPence: number, description: string) {
  const [expense] = await db
    .insert(expenses)
    .values({
      companyId: seeded.companyId,
      description,
      category: "Office",
      spentAt,
      amountPence,
      status: "reimbursable",
      paidByUserId: seeded.colleague.id,
    })
    .returning();
  return expense;
}

const limited = () => seedYearEnd(db, { entityType: "limited_company", period: LTD_YEAR });
const soleTrader = (accountingBasis: "cash" | "accruals" = "accruals") =>
  seedYearEnd(db, { entityType: "sole_trader", period: TAX_YEAR, accountingBasis });

const SPLIT_HEADERS = [
  "Person",
  "Dated before incorporation (£)",
  "Dated in earlier periods (£)",
  "Dated in this period (£)",
  "Total owed at period end (£)",
];

describe("the Notes for the accountant tab", () => {
  it("sits straight after the cover, replaces Items to review, and states the period at the top", async () => {
    const { companyId } = await limited();
    const { sheets, notes } = await packFor(companyId, LTD_YEAR);

    expect(sheets.map((s) => s.name).slice(0, 3)).toEqual([TAB.cover, TAB.notes, TAB.pnl]);
    expect(sheets.map((s) => s.name)).not.toContain("Items to review");
    expect(value(notes.rows[0]![0])).toBe("Notes for the accountant");
    expect(notes.rows[1]).toEqual(["Period start", { v: "2025-04-01", kind: "date" }]);
    expect(notes.rows[2]).toEqual(["Period end", { v: "2026-03-31", kind: "date" }]);

    const cover = findSheet(sheets, TAB.cover);
    expect(amount(cover, TAB.notes)).toBe(notes.about);
    expect(allText(cover).join("\n")).not.toContain("Items to review");
    expect(amount(cover, "Confirmed by the business")).toContain(TAB.notes);
    expect(amount(cover, "Question")).toContain(TAB.notes);
  });

  it("has its eight sections in order, and says Nothing to report where none apply", async () => {
    const company = await seedCompany(db, { companyNumber: "01234567", incorporatedOn: "2019-06-03" });
    const { notes } = await packFor(company.id, LTD_YEAR);

    const headings = notes.rows
      .map((r) => String(value(r[0]) ?? ""))
      .filter((t) => /^[a-h]\. /.test(t));
    expect(headings.map((h) => h[0])).toEqual(["a", "b", "c", "d", "e", "f", "g", "h"]);
    for (const letter of ["a", "b", "c", "d", "e", "h"]) {
      expect(section(notes, letter), letter).toEqual([NOTHING_TO_REPORT]);
    }
    // No pay or dividends is itself a statement, with its confirmation.
    expect(section(notes, "f")).toEqual([
      "No directors' pay and no dividends are recorded in Alfa for the period.",
      NOT_CONFIRMED,
    ]);
  });

  it("writes money as numbers, dates as dates, and no internal IDs", async () => {
    const seeded = await limited();
    const { notes, texts } = await packFor(seeded.companyId, LTD_YEAR);

    for (const text of texts) {
      expect(text).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
    }
    const owed = notes.rows.find((r) => value(r[0]) === "Still unpaid at the period end for costs dated before it")!;
    expect(owed[1]).toEqual({ v: 700, kind: "money" });
    expect(owed[2]).toBe(`${TAB.outside} tab`);
  });

  it("wraps text in fixed-width columns in the Excel file, so each note reads in full", async () => {
    const seeded = await limited();
    const { notes } = await packFor(seeded.companyId, LTD_YEAR);
    expect(notes.columnWidths?.[0]).toBeGreaterThanOrEqual(60);

    const parts = new Map(
      readStoreZipEntries(await buildXlsx(toXlsxSheets([notes]))).map(([name, data]) => [
        name,
        new TextDecoder().decode(data),
      ]),
    );
    const xml = parts.get("xl/worksheets/sheet1.xml")!;
    expect(xml).toContain(`<col min="1" max="1" width="${notes.columnWidths![0]}" customWidth="1"/>`);
    // The period start: a real date, in the wrapped twin of the dd/mm/yyyy style.
    expect(xml).toContain('<c r="B2" s="10"><v>45748</v></c>');
    // A long sentence gets a taller row instead of running off the column.
    expect(xml).toMatch(/<row r="4" ht="\d+" customHeight="1">/);
    expect(parts.get("xl/styles.xml")).toContain('<alignment wrapText="1" vertical="top"/>');
  });
});

describe("figures in the notes equal the rest of the workbook", () => {
  it("limited company: every section's figure matches the tab it names", async () => {
    const seeded = await limited();
    const { companyId, client, bankLine } = seeded;
    const first = LTD_YEAR.from;
    await db.update(companies).set({ incorporatedOn: "2019-06-03" }).where(eq(companies.id, companyId));
    // A possible fixed asset, a prepayment, a grant and an overpayment.
    await db.insert(expenses).values([
      { companyId, description: "Laptop", category: "Equipment", spentAt: addDays(first, 9), amountPence: 120_000, status: "company_paid" },
      {
        companyId,
        description: "Annual insurance",
        category: "Office",
        spentAt: addDays(first, 200),
        amountPence: 36_500,
        status: "company_paid",
        coversFrom: addDays(first, 200),
        coversTo: addDays(first, 564),
      },
    ]);
    const grant = await bankLine(addDays(first, 15), 250_000, "Leeds City Council");
    await db.insert(reconciliationMatches).values({
      bankTransactionId: grant.id,
      matchType: "other_income",
      incomeCategory: "Grant",
      note: "Shopfront improvement scheme",
      confirmed: true,
    });
    await db.insert(payments).values({
      invoiceId: seeded.edgeInvoices[2]!.id,
      amountPence: 41_000,
      receivedAt: noon(LTD_YEAR.to),
      method: "bank_transfer",
    });
    expect(client.id).toBeTruthy();

    const { pack, sheets, notes } = await packFor(companyId, LTD_YEAR);
    const position = findSheet(sheets, TAB.position);
    const outside = findSheet(sheets, TAB.outside);
    const pnl = findSheet(sheets, TAB.pnl);

    // a. Amounts owed: each person's total is the Year-end position's.
    const split = layoutTable(notes, SPLIT_HEADERS);
    const owedOnPosition = layoutTable(position, ["Person", "Amount (£)"]);
    expect(split.rows.map((r) => [r.Person, r["Total owed at period end (£)"]])).toEqual(
      owedOnPosition.rows.map((r) => [r.Person, r["Amount (£)"]]),
    );
    expect(split.total!["Total owed at period end (£)"]).toBe(owedOnPosition.total!["Amount (£)"]);

    // b. Opening position: reimbursed for earlier costs plus still unpaid for earlier costs.
    const reimbursedEarlier = layoutTable(outside, ["Date reimbursed", "Paid to", "Expense ref"]);
    const awaiting = layoutTable(outside, ["Date spent", "Expense ref", "Paid by"]);
    const unpaidEarlier = sum(
      awaiting.rows.filter((r) => String(r["Date spent"]) < first).map((r) => r["Amount (£)"]!),
    );
    expect(amount(notes, "Reimbursed during the period for costs dated before it")).toBe(
      reimbursedEarlier.total!["Amount (£)"],
    );
    expect(amount(notes, "Still unpaid at the period end for costs dated before it")).toBe(unpaidEarlier);
    expect(amount(notes, "Owed at the period start for costs dated before it")).toBe(1_500 + 700);
    expect(allText(notes)).toContain(`Question: ${OPENING_QUESTION}`);

    // d. Bank: the balances on the Year-end position.
    const bankNote = layoutTable(notes, ["Bank account", "Balance at period start (£)"]);
    const bankOnPosition = layoutTable(position, ["Bank account", "Balance at period start (£)"]);
    expect(bankNote.rows.map((r) => [r["Bank account"], r["Balance at period start (£)"], r["Balance at period end (£)"]])).toEqual(
      bankOnPosition.rows
        .filter((r) => r["Bank account"] !== "Total")
        .map((r) => [r["Bank account"], r["Balance at period start (£)"], r["Balance at period end (£)"]]),
    );

    // e. Customers: unpaid invoices and amounts owed back.
    const debtorsNote = layoutTable(notes, ["Invoice", "Customer", "Owed by customer at period end (£)"]);
    const debtors = layoutTable(position, ["Invoice", "Date issued", "Customer", "Invoice total (£)"]);
    expect(debtorsNote.rows.map((r) => [r.Invoice, r["Owed by customer at period end (£)"], r["Date later paid"]])).toEqual(
      debtors.rows.map((r) => [r.Invoice, r["Owed by customer at period end (£)"], r["Date later paid"]]),
    );
    expect(debtorsNote.total!["Owed by customer at period end (£)"]).toBe(
      debtors.total!["Owed by customer at period end (£)"],
    );
    const overpaidNote = layoutTable(notes, ["Invoice", "Customer", "Owed back to customer (£)"]);
    const overpaid = layoutTable(position, ["Invoice", "Date issued", "Customer", "Invoice total (£)"], 1);
    expect(overpaidNote.rows.map((r) => [r.Invoice, r["Owed back to customer (£)"]])).toEqual(
      overpaid.rows.map((r) => [r.Invoice, r["Owed back to customer (£)"]]),
    );
    expect(overpaidNote.rows).toHaveLength(1);
    expect(overpaidNote.rows[0]!["Confirmed as a real overpayment"]).toBe(NOT_CONFIRMED);

    // f. Fixed assets, prepayments, grants and pay.
    const assets = layoutTable(position, ["Expense ref", "Date spent", "Description", "Amount (£)"]);
    expect(amount(notes, "Number of possible fixed assets")).toBe(assets.rows.length);
    expect(amount(notes, "Total cost")).toBe(assets.total!["Amount (£)"]);
    expect(amount(notes, "Spent in the period, covering time after the period end")).toBe(
      amount(pnl, "Included in expenses above, but covering time after the period end"),
    );
    const grants = layoutTable(notes, ["Date received", "Received from", "Amount (£)"]);
    const otherIncome = findSheet(sheets, TAB.otherIncome);
    const grantRows = otherIncome.rows.filter((r) => r.some((c) => value(c) === "Grant"));
    expect(grants.rows).toEqual([
      {
        "Date received": addDays(first, 15),
        "Received from": "Leeds City Council",
        "Amount (£)": 250_000,
        "What it was for (note on the bank transaction)": "Shopfront improvement scheme",
      },
    ]);
    expect(grantRows).toHaveLength(1);
    expect(grantRows[0]!.map(value)).toContain(250_000);
    const payNote = layoutTable(notes, ["Person", "Salary (£)", "Dividends (£)", "Total (£)"]);
    const payOnPosition = layoutTable(position, ["Person", "Salary (£)", "Dividends (£)", "Total (£)"]);
    expect(payNote).toEqual(payOnPosition);

    // g. Record-keeping gaps: one row per check with records, and every record beneath.
    const failing = pack.checks.filter((c) => c.items.length > 0);
    const summary = layoutTable(notes, ["What the check found", "Number of records"]);
    expect(summary.rows.map((r) => [r["What the check found"], r["Number of records"]])).toEqual(
      failing.map((c) => [c.title, c.items.length]),
    );
    const noReceipt = pack.checks.find((c) => c.key === "expenses-no-receipt")!;
    expect(summary.rows.find((r) => r["What the check found"] === noReceipt.title)!["Total value (£)"]).toBe(
      sum(noReceipt.items.map((i) => i.pence!)),
    );
    expect(layoutTable(notes, ["What to check", "Record"]).rows).toHaveLength(
      sum(failing.map((c) => c.items.length)),
    );
  });

  it("sole trader: drawings and money put in match the Year-end position", async () => {
    const seeded = await soleTrader();
    const { sheets, notes } = await packFor(seeded.companyId, TAX_YEAR);
    const position = findSheet(sheets, TAB.position);

    expect(amount(notes, "Drawings: money the owner took out of the business")).toBe(
      layoutTable(position, ["How", "Amount (£)"]).total!["Amount (£)"],
    );
    expect(amount(notes, "Money the owner put into the business")).toBe(
      layoutTable(position, ["How", "Amount (£)"], 1).total!["Amount (£)"],
    );
  });
});

describe("amounts owed, split by when the costs are dated", () => {
  it("adds up to the Year-end position per person across the incorporation date and both ends of the period", async () => {
    const seeded = await limited();
    const incorporatedOn = "2024-06-10";
    await db.update(companies).set({ incorporatedOn }).where(eq(companies.id, seeded.companyId));
    await owedExpense(seeded, addDays(incorporatedOn, -1), 100, "Day before incorporation");
    await owedExpense(seeded, incorporatedOn, 200, "On the incorporation date");
    await owedExpense(seeded, addDays(LTD_YEAR.from, -1), 400, "Day before the period");
    await owedExpense(seeded, LTD_YEAR.from, 800, "First day of the period");
    await owedExpense(seeded, LTD_YEAR.to, 1_600, "Last day of the period");
    await owedExpense(seeded, addDays(LTD_YEAR.to, 1), 3_200, "Day after the period");

    const { sheets, notes } = await packFor(seeded.companyId, LTD_YEAR);
    const split = layoutTable(notes, SPLIT_HEADERS);

    // The fixture's own unpaid cost (£7.00) is dated five days before the period.
    expect(split.rows).toEqual([
      {
        Person: "Jo Field",
        "Dated before incorporation (£)": 100,
        "Dated in earlier periods (£)": 200 + 400 + 700,
        "Dated in this period (£)": 800 + 1_600,
        "Total owed at period end (£)": 100 + 200 + 400 + 700 + 800 + 1_600,
      },
    ]);
    expect(amount(findSheet(sheets, TAB.position), "Jo Field")).toBe(3_800);

    // c. Costs dated before incorporation, with the earliest date and the question for the business.
    expect(amount(notes, "Date of incorporation")).toBe(incorporatedOn);
    expect(amount(notes, "Earliest date of these costs")).toBe(addDays(incorporatedOn, -1));
    expect(amount(notes, "Reimbursed in the period")).toBe(0);
    expect(amount(notes, "Still owed at the period end")).toBe(100);
    expect(section(notes, "c")).toContain(`${CLAIMED_ELSEWHERE_QUESTION} The business answered: not answered.`);
  });

  it("still adds up when the business was incorporated part way through the period", async () => {
    const seeded = await limited();
    const incorporatedOn = addDays(LTD_YEAR.from, 30);
    await db.update(companies).set({ incorporatedOn }).where(eq(companies.id, seeded.companyId));
    await owedExpense(seeded, addDays(incorporatedOn, -1), 100, "Day before incorporation");
    await owedExpense(seeded, incorporatedOn, 200, "On the incorporation date");

    const { sheets, notes } = await packFor(seeded.companyId, LTD_YEAR);
    const [row] = layoutTable(notes, SPLIT_HEADERS).rows;

    expect(row).toMatchObject({
      "Dated before incorporation (£)": 700 + 100,
      "Dated in earlier periods (£)": 0,
      "Dated in this period (£)": 200,
      "Total owed at period end (£)": 1_000,
    });
    expect(amount(findSheet(sheets, TAB.position), "Jo Field")).toBe(1_000);
  });

  it("says so when the incorporation date is missing, and keeps the total", async () => {
    const seeded = await limited();
    const { pack, notes, texts } = await packFor(seeded.companyId, LTD_YEAR);

    expect(pack.notes.startDateMissing).toBe(true);
    expect(texts.join("\n")).toContain("date of incorporation has not been entered in Alfa");
    const table = layoutTable(notes, ["Person", "Dated in earlier periods (£)"]);
    expect(table.rows[0]).toMatchObject({
      "Dated in earlier periods (£)": 700,
      "Total owed at period end (£)": 700,
    });
  });
});

describe("expenses entered late", () => {
  const late = (notes: PackSheet) => layoutTable(notes, ["Expense ref", "Date spent", "Date entered"]);

  async function lateExpense(seeded: Seeded, spentAt: string, createdAt: Date) {
    // Everything the fixture dated before the period was entered before it.
    await db
      .update(expenses)
      .set({ createdAt: noon("2025-01-15") })
      .where(eq(expenses.companyId, seeded.companyId));
    const [expense] = await db
      .insert(expenses)
      .values({
        companyId: seeded.companyId,
        description: "Old software invoice",
        category: "Software",
        spentAt,
        amountPence: 4_200,
        status: "company_paid",
        createdAt,
      })
      .returning();
    return expense;
  }

  it("with no earlier export on record, sums up those dated before the period and entered after it started, with one question", async () => {
    const seeded = await limited();
    await lateExpense(seeded, "2025-02-10", noon("2025-05-02"));
    await db.insert(expenses).values(
      ["2024-11-03", "2025-03-01"].map((spentAt) => ({
        companyId: seeded.companyId,
        description: "Old hosting invoice",
        category: "Software",
        spentAt,
        amountPence: 1_000,
        status: "company_paid" as const,
        createdAt: noon("2025-05-02"),
      })),
    );
    const { notes, texts, pack } = await packFor(seeded.companyId, LTD_YEAR);

    // No row and no explanation box for each expense: one item covers them all.
    expect(() => late(notes)).toThrow();
    expect(texts).not.toContain("Old software invoice");
    const keys = allItems(pack.notes).map((i) => i.key);
    expect(keys.filter((k) => k.startsWith("late"))).toEqual(["late-entered"]);

    const b = section(notes, "b");
    expect(b).toEqual(
      expect.arrayContaining([
        "3 expenses are dated before the period start and were entered in Alfa on or after it. No earlier pack export is recorded, so Alfa cannot tell whether earlier accounts included them. They are not counted in this period's profit and loss.",
        `${LATE_ENTERED_QUESTION} The business answered: not answered.`,
      ]),
    );
    const figure = (label: string) => {
      const row = notes.rows.find((r) => value(r[0]) === label);
      if (!row) throw new Error(`No figure "${label}"`);
      return row.slice(1).map((c) => value(c)).find((v) => v != null && v !== "");
    };
    expect(figure("Number of expenses")).toBe(3);
    expect(figure("Total of these expenses")).toBe(6_200);
    expect(figure("Earliest date spent")).toBe("2024-11-03");
    expect(figure("Latest date spent")).toBe("2025-03-01");
  });

  it("shows the owner's one answer about them in the workbook", async () => {
    const seeded = await limited();
    await lateExpense(seeded, "2025-02-10", noon("2025-05-02"));
    await respond(seeded, LTD_YEAR, [
      { key: "late-entered", answer: "yes", explanation: "Earlier years' records, loaded when we moved to Alfa" },
    ]);

    expect(section((await packFor(seeded.companyId, LTD_YEAR)).notes, "b")).toEqual(
      expect.arrayContaining([
        `${LATE_ENTERED_QUESTION} The business answered: yes.`,
        "Explanation from the business: Earlier years' records, loaded when we moved to Alfa",
      ]),
    );
  });

  it("lists one entered after the earlier period's pack was exported, and not one entered before it", async () => {
    const seeded = await limited();
    const expense = await lateExpense(seeded, "2025-02-10", noon("2025-03-20"));
    const exportEarlierYear = (exportedAt: Date) =>
      db
        .insert(yearEndRuns)
        .values({ companyId: seeded.companyId, periodFrom: "2024-04-01", periodTo: "2025-03-31", exportedAt })
        .onConflictDoUpdate({
          target: [yearEndRuns.companyId, yearEndRuns.periodFrom, yearEndRuns.periodTo],
          set: { exportedAt },
        });

    // Entered before the period started, so the fallback basis would not list it.
    await exportEarlierYear(noon("2025-03-10"));
    const after = await packFor(seeded.companyId, LTD_YEAR);
    expect(late(after.notes).rows).toMatchObject([
      {
        "Expense ref": formatExpenseRef(expense.refNumber),
        "Why it is listed": "Entered after an earlier pack was exported on 10/03/2025",
      },
    ]);

    await exportEarlierYear(noon("2025-06-01"));
    const before = await packFor(seeded.companyId, LTD_YEAR);
    expect(before.texts).not.toContain("Old software invoice");
  });

  it("never lists another business's expenses or uses its exports", async () => {
    const seeded = await limited();
    await lateExpense(seeded, "2025-02-10", noon("2025-05-02"));
    const other = await seedCompany(db, { companyNumber: "07654321", slug: "other-co" });
    await db.insert(yearEndRuns).values({
      companyId: other.id,
      periodFrom: "2024-04-01",
      periodTo: "2025-03-31",
      exportedAt: noon("2025-12-01"),
    });

    // The other business's export is not used: the expense stays in the summary, not the list.
    const own = await packFor(seeded.companyId, LTD_YEAR);
    expect(own.item("late-entered").yesNo).toBe(LATE_ENTERED_QUESTION);
    expect(own.texts).not.toContain("Old software invoice");
    const others = await packFor(other.id, LTD_YEAR);
    expect(others.texts).not.toContain("Old software invoice");
    expect(allItems(others.pack.notes).some((i) => i.key.startsWith("late"))).toBe(false);
  });
});

describe("the owner's confirmations and explanations", () => {
  it("appear in the workbook beside their item and persist between exports", async () => {
    const seeded = await limited();
    const { companyId, account } = seeded;
    await db.update(companies).set({ incorporatedOn: "2025-03-30" }).where(eq(companies.id, companyId));
    await respond(seeded, LTD_YEAR, [
      { key: `bank-close:${account.id}`, confirmed: true },
      { key: `bank:${account.id}`, explanation: "  Statement 14 has the closing balance  " },
      { key: "owed:jo field", explanation: "Jo is paid back each quarter" },
      { key: "pre-start-claimed", answer: "no", explanation: "Nothing claimed personally" },
      { key: "check:expenses-no-receipt", explanation: "Receipts were lost in the office move" },
      { key: "general", explanation: "We moved office in May." },
    ]);

    for (const round of [1, 2]) {
      const { notes, pack } = await packFor(companyId, LTD_YEAR);
      const bank = layoutTable(notes, ["Bank account", "Balance at period start (£)"]).rows[0]!;
      expect(bank, `export ${round}`).toMatchObject({
        "Period start balance checked against a statement": NOT_CONFIRMED,
        "Period end balance checked against a statement": CONFIRMED_TODAY,
        "Explanation from the business": "Statement 14 has the closing balance",
      });
      expect(layoutTable(notes, ["Person", "Dated before incorporation (£)"]).rows[0]).toMatchObject({
        "Explanation from the business": "Jo is paid back each quarter",
      });
      expect(section(notes, "c")).toEqual(
        expect.arrayContaining([
          `${CLAIMED_ELSEWHERE_QUESTION} The business answered: no.`,
          "Explanation from the business: Nothing claimed personally",
        ]),
      );
      const gaps = layoutTable(notes, ["What the check found", "Number of records"]).rows;
      expect(gaps.find((r) => r["What the check found"] === "Expenses with no receipt")).toMatchObject({
        "Explanation from the business": "Receipts were lost in the office move",
      });
      expect(section(notes, "h")).toEqual(["We moved office in May."]);
      // The pay table is shown, so only the opening bank balance still wants a tick.
      expect(pack.notes.unconfirmed).toBe(1);
    }
  });

  it("clears a confirmation when its figure changes, and says why", async () => {
    const seeded = await limited();
    const { companyId, account } = seeded;
    const key = `bank-close:${account.id}`;
    await respond(seeded, LTD_YEAR, [{ key, confirmed: true }]);
    const confirmed = await packFor(companyId, LTD_YEAR);
    expect(confirmed.item(key).confirmedOn).toBe(TODAY);
    const closing = Number(confirmed.item(key).confirm!.value);

    // A transaction imported later moves the closing balance.
    await seeded.bankLine("2025-09-01", -5_000, "Late import");
    const changed = await packFor(companyId, LTD_YEAR);
    expect(changed.item(key)).toMatchObject({ confirmedOn: null, stale: true });
    expect(changed.item(key).cleared).toContain("so the confirmation was removed");
    expect(changed.item(key).cleared).toContain("£");
    expect(Number(changed.item(key).confirm!.value)).toBe(closing - 5_000);
    expect(
      layoutTable(changed.notes, ["Bank account", "Balance at period start (£)"]).rows[0]![
        "Period end balance checked against a statement"
      ],
    ).toBe(NOT_CONFIRMED);
    expect(changed.pack.notes.unconfirmed).toBe(confirmed.pack.notes.unconfirmed + 1);

    // Opening the year or exporting removes the stored tick and keeps the reason.
    expect(await clearStaleConfirmations(companyId, LTD_YEAR, changed.pack.notes)).toBe(1);
    const [stored] = await db
      .select()
      .from(yearEndResponses)
      .where(and(eq(yearEndResponses.companyId, companyId), eq(yearEndResponses.itemKey, key)));
    expect(stored).toMatchObject({ confirmedAt: null, confirmedValue: null });
    expect(stored!.clearedReason).toContain("so the confirmation was removed");
    const cleared = await packFor(companyId, LTD_YEAR);
    expect(cleared.item(key)).toMatchObject({ confirmedOn: null, stale: false });
    expect(cleared.item(key).cleared).toBe(stored!.clearedReason);

    // Confirming the new figure settles it.
    await respond(seeded, LTD_YEAR, [{ key, confirmed: true }]);
    expect((await packFor(companyId, LTD_YEAR)).item(key)).toMatchObject({
      confirmedOn: TODAY,
      cleared: null,
      stale: false,
    });
  });

  it("clears the confirmation of an overpayment when the amount owed back changes", async () => {
    const seeded = await limited();
    const invoice = seeded.edgeInvoices[2]!;
    await db.insert(payments).values({
      invoiceId: invoice.id,
      amountPence: 41_000,
      receivedAt: noon(LTD_YEAR.to),
      method: "bank_transfer",
    });
    const key = `overpayment:${invoice.id}`;
    await respond(seeded, LTD_YEAR, [{ key, confirmed: true, explanation: "Paid twice by mistake" }]);
    const overpaid = (notes: PackSheet) =>
      layoutTable(notes, ["Invoice", "Customer", "Owed back to customer (£)"]).rows[0]!;
    expect(overpaid((await packFor(seeded.companyId, LTD_YEAR)).notes)).toMatchObject({
      "Owed back to customer (£)": 1_000,
      "Confirmed as a real overpayment": CONFIRMED_TODAY,
      "Explanation from the business": "Paid twice by mistake",
    });

    await db.insert(creditNotes).values({
      companyId: seeded.companyId,
      invoiceId: invoice.id,
      clientId: seeded.client.id,
      number: "CN-9",
      issueDate: addDays(LTD_YEAR.from, 30),
      reason: "Goodwill",
      netPence: 500,
      vatPence: 0,
      grossPence: 500,
    });
    const after = await packFor(seeded.companyId, LTD_YEAR);
    expect(overpaid(after.notes)).toMatchObject({
      "Owed back to customer (£)": 1_500,
      "Confirmed as a real overpayment": NOT_CONFIRMED,
      // The explanation is the owner's own words, so it stays.
      "Explanation from the business": "Paid twice by mistake",
    });
    expect(after.item(key).cleared).toBe(
      "The figure was £10.00 when you confirmed it and is now £15.00, so the confirmation was removed.",
    );
  });

  it("clears the confirmation that there was no pay or dividends once some is recorded", async () => {
    const company = await seedCompany(db, { companyNumber: "01234567", slug: "no-pay-co" });
    const [owner] = await db
      .insert((await import("@/db/schema")).users)
      .values({ companyId: company.id, email: "owner@example.com", name: "Pat Owner", role: "admin" })
      .returning();
    const seeded = { companyId: company.id, owner };
    await respond(seeded, LTD_YEAR, [{ key: "pay", confirmed: true }]);
    const none = await packFor(company.id, LTD_YEAR);
    expect(section(none.notes, "f")).toEqual([
      "No directors' pay and no dividends are recorded in Alfa for the period.",
      CONFIRMED_TODAY,
    ]);
    expect(none.pack.notes.unconfirmed).toBe(0);

    const [declaration] = await db
      .insert(dividendDeclarations)
      .values({ companyId: company.id, declaredAt: "2025-10-01", totalPence: 50_000 })
      .returning();
    await db.insert(dividendPayouts).values({
      declarationId: declaration.id,
      shareholderName: "Pat Owner",
      shareCount: 100,
      amountPence: 50_000,
    });
    const paid = await packFor(company.id, LTD_YEAR);
    expect(paid.item("pay")).toMatchObject({ confirm: null, confirmedOn: null, stale: true });
    expect(paid.item("pay").cleared).toContain("Pay or dividends are now recorded");
    expect(paid.texts).not.toContain(CONFIRMED_TODAY);
  });

  it("keeps each business's and each period's answers apart", async () => {
    const seeded = await limited();
    const other = await limited();
    await respond(seeded, LTD_YEAR, [{ key: "general", explanation: "Only for Northwind, this year" }]);

    expect((await packFor(other.companyId, LTD_YEAR)).texts).not.toContain("Only for Northwind, this year");
    const nextYear = { from: "2026-04-01", to: "2027-03-31" };
    expect((await packFor(seeded.companyId, nextYear)).texts).not.toContain("Only for Northwind, this year");
    expect((await packFor(seeded.companyId, LTD_YEAR)).texts).toContain("Only for Northwind, this year");
  });

  it("ignores a tick for an item that takes none, and an entry for an item that is not in the notes", async () => {
    const seeded = await limited();
    await respond(seeded, LTD_YEAR, [
      { key: "general", confirmed: true, answer: "yes", explanation: "Hello" },
      { key: "bank-close:not-a-real-account", confirmed: true },
    ]);
    const rows = await db
      .select()
      .from(yearEndResponses)
      .where(eq(yearEndResponses.companyId, seeded.companyId));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ itemKey: "general", confirmedAt: null, answer: null, explanation: "Hello" });
  });
});

describe("sole trader notes", () => {
  it.each(["accruals", "cash"] as const)(
    "have no director, dividend or incorporation wording anywhere in the workbook on %s",
    async (basis) => {
      const seeded = await soleTrader(basis);
      await owedExpense(seeded, "2019-12-20", 300, "Before trading started");
      const { sheets, notes } = await packFor(seeded.companyId, TAX_YEAR);

      for (const sheet of sheets) {
        for (const text of allText(sheet)) {
          expect(text, `${sheet.name}: ${text}`).not.toMatch(/director|dividend|incorporat|company/i);
        }
      }
      expect(section(notes, "c")).toContain("Question: How should costs dated before trading started be treated?");
      expect(amount(notes, "Date trading started")).toBe("2020-01-06");
    },
  );

  it("leave the owner out of amounts owed, and add up to the unpaid costs on Outside the period", async () => {
    const seeded = await soleTrader();
    const { sheets, notes, texts } = await packFor(seeded.companyId, TAX_YEAR);

    const split = layoutTable(notes, ["Person", "Dated before trading started (£)"]);
    // The owner's own £9.00 notebook is money put in, not a debt.
    expect(split.rows.map((r) => r.Person)).toEqual(["Jo Field"]);
    expect(split.rows[0]).toMatchObject({
      "Dated before trading started (£)": 0,
      "Dated in earlier periods (£)": 700,
      "Dated in this period (£)": 0,
      "Total owed at period end (£)": 700,
    });
    const awaiting = layoutTable(findSheet(sheets, TAB.outside), ["Date spent", "Expense ref", "Paid by"]);
    expect(split.total!["Total owed at period end (£)"]).toBe(awaiting.total!["Amount (£)"]);
    expect(texts.join("\n")).toContain("Costs the owner paid personally are left out");
  });

  it("state when there were no drawings, with a confirmation", async () => {
    const company = await seedCompany(db, {
      entityType: "sole_trader",
      legalName: "Sam Carter",
      accountingBasis: "accruals",
      tradingStartedOn: "2020-01-06",
      slug: "quiet-sole-trader",
    });
    const { notes, item } = await packFor(company.id, TAX_YEAR);

    expect(section(notes, "f")).toEqual([
      "No drawings are recorded in Alfa for the period.",
      "No money put into the business by the owner is recorded in Alfa for the period.",
      NOT_CONFIRMED,
    ]);
    expect(item("pay").confirm?.text).toBe("The owner took no drawings in the period");
  });
});
