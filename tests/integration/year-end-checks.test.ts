import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb, type TestDatabase } from "@/db/pglite";
import { setTestDb, type Database } from "@/db";
import {
  clients,
  companies,
  expenseReceipts,
  expenses,
  invoices,
  payments,
  reconciliationMatches,
  reimbursements,
  shareholders,
} from "@/db/schema";
import { explainOwnerTransactions } from "@/lib/bank/queries";
import { addDays } from "@/lib/ledger/corporation-tax";
import { namesAnotherPeriod, runChecks, type Check } from "@/lib/year-end/checks";
import { prepareYearEndPack } from "@/lib/year-end/pack";
import type { PackPeriod } from "@/lib/year-end/period";
import { TAB } from "@/lib/year-end/workbook";
import { LTD_YEAR, TAX_YEAR, column, findSheet, seedYearEnd } from "./year-end-fixture";

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

async function checksFor(companyId: string, period: PackPeriod) {
  const pack = await prepareYearEndPack({ companyId, period, includeVat: true });
  const byKey = new Map(pack.checks.map((c) => [c.key, c]));
  const check = (key: string): Check => {
    const found = byKey.get(key);
    if (!found) throw new Error(`No check "${key}": ${[...byKey.keys()].join(", ")}`);
    return found;
  };
  return { pack, check, texts: (key: string) => check(key).items.map((i) => i.text) };
}

const limited = () => seedYearEnd(db, { entityType: "limited_company", period: LTD_YEAR });
const soleTrader = (accountingBasis: "cash" | "accruals" | null = "accruals") =>
  seedYearEnd(db, { entityType: "sole_trader", period: TAX_YEAR, accountingBasis });

describe("blocking checks", () => {
  it("passes when the limited company's details are all there", async () => {
    const { companyId } = await limited();
    const { check } = await checksFor(companyId, LTD_YEAR);
    expect(check("required-details")).toMatchObject({ blocking: true, items: [] });
  });

  it("blocks a limited company with no legal name, company number or bank opening balance", async () => {
    const seeded = await seedYearEnd(db, {
      entityType: "limited_company",
      period: LTD_YEAR,
      openingBalance: false,
    });
    await db
      .update(companies)
      .set({ legalName: " ", companyNumber: null })
      .where(eq(companies.id, seeded.companyId));
    const { check, texts } = await checksFor(seeded.companyId, LTD_YEAR);

    expect(check("required-details").blocking).toBe(true);
    expect(texts("required-details")).toEqual([
      "Legal name",
      "Company number",
      'Opening balance for the bank account "Main account"',
    ]);
    // Each one links to where it is fixed.
    expect(check("required-details").items.every((i) => i.href?.startsWith("/settings/business"))).toBe(true);
  });

  it("blocks a sole trader with no owner name, accounting basis or bank opening balance", async () => {
    const seeded = await seedYearEnd(db, {
      entityType: "sole_trader",
      period: TAX_YEAR,
      accountingBasis: null,
      openingBalance: false,
    });
    await db.update(companies).set({ legalName: "" }).where(eq(companies.id, seeded.companyId));
    const { texts } = await checksFor(seeded.companyId, TAX_YEAR);

    expect(texts("required-details")).toEqual([
      "Owner's name",
      "Accounting basis (cash basis or traditional accruals)",
      'Opening balance for the bank account "Main account"',
    ]);
  });

  it("is the only check that blocks", async () => {
    const { companyId } = await limited();
    const { pack } = await checksFor(companyId, LTD_YEAR);
    expect(pack.checks.filter((c) => c.blocking).map((c) => c.key)).toEqual(["required-details"]);
  });
});

describe("missing details", () => {
  it("reports a missing UTR, total shares and shareholder full names for a limited company", async () => {
    const { companyId } = await limited();
    await db.update(companies).set({ utr: null, totalShares: null }).where(eq(companies.id, companyId));
    await db.update(shareholders).set({ name: "Sam" }).where(eq(shareholders.companyId, companyId));
    const { check, texts } = await checksFor(companyId, LTD_YEAR);

    expect(check("missing-details").blocking).toBe(false);
    expect(texts("missing-details")).toEqual([
      "Company UTR",
      "Total shares in issue",
      'Shareholder "Sam" needs a full name',
    ]);
  });

  it("reports a missing UTR for a sole trader, with no share wording", async () => {
    const { companyId } = await soleTrader();
    await db.update(companies).set({ utr: null }).where(eq(companies.id, companyId));
    const { texts } = await checksFor(companyId, TAX_YEAR);
    expect(texts("missing-details")).toEqual(["Self Assessment UTR"]);
  });
});

describe("bank checks", () => {
  it("lists bank transactions in the period with no confirmed match", async () => {
    const seeded = await limited();
    await seeded.bankLine("2025-07-01", -1_234, "Mystery Ltd");
    await seeded.bankLine(addDays(LTD_YEAR.to, 1), -999, "Next year");
    const suggested = await seeded.bankLine("2025-08-01", -2_000, "Suggested only");
    await db.insert(reconciliationMatches).values({
      bankTransactionId: suggested.id,
      matchType: "expense",
      expenseId: seeded.edgeExpenses[1]!.id,
      confirmed: false,
    });
    const { check, texts } = await checksFor(seeded.companyId, LTD_YEAR);

    expect(texts("bank-unmatched")).toEqual([
      "01/07/2025 · Mystery Ltd · -£12.34",
      "01/08/2025 · Suggested only · -£20.00",
    ]);
    expect(check("bank-unmatched").items[0]!.href).toBe("/transactions?from=2025-07-01&to=2025-07-01");
  });

  it("lists invoice payments not linked to a bank transaction", async () => {
    const seeded = await limited();
    const before = await checksFor(seeded.companyId, LTD_YEAR);
    expect(before.texts("payments-unlinked")).toHaveLength(2);

    const [payment] = await db
      .select()
      .from(payments)
      .where(eq(payments.amountPence, 7_000));
    const credit = await seeded.bankLine(addDays(LTD_YEAR.from, 40), 7_000, "Acme Trading");
    await db.insert(reconciliationMatches).values({
      bankTransactionId: credit.id,
      matchType: "invoice_payment",
      paymentId: payment!.id,
      confirmed: true,
    });
    const after = await checksFor(seeded.companyId, LTD_YEAR);
    expect(after.texts("payments-unlinked")).toEqual([
      expect.stringContaining("INV-2 · Acme Trading · £100.00"),
    ]);
    expect(after.check("payments-unlinked").items[0]!.href).toBe(`/invoices/${seeded.edgeInvoices[1]!.id}`);
  });

  it("lists invoices with money owed back to the customer at the period end", async () => {
    const seeded = await limited();
    const before = await checksFor(seeded.companyId, LTD_YEAR);
    expect(before.check("owed-to-customers")).toMatchObject({ blocking: false, items: [] });

    await db.insert(payments).values({
      invoiceId: seeded.edgeInvoices[2]!.id,
      amountPence: 41_000,
      receivedAt: new Date(`${LTD_YEAR.to}T12:00:00Z`),
      method: "bank_transfer",
    });
    const { check, pack } = await checksFor(seeded.companyId, LTD_YEAR);
    expect(check("owed-to-customers")).toMatchObject({
      blocking: false,
      items: [
        {
          text: "INV-3 · Acme Trading · £10.00 owed back",
          href: `/invoices/${seeded.edgeInvoices[2]!.id}`,
        },
      ],
    });
    expect(check("owed-to-customers").title).not.toContain("money received");
    expect(column(findSheet(pack.workbook.sheets, TAB.review), "Record")).toContain(
      "INV-3 · Acme Trading · £10.00 owed back",
    );
  });

  it("on cash basis, says the amount owed back is included in money received", async () => {
    const seeded = await soleTrader("cash");
    await db.insert(payments).values({
      invoiceId: seeded.edgeInvoices[2]!.id,
      amountPence: 41_000,
      receivedAt: new Date(`${TAX_YEAR.to}T12:00:00Z`),
      method: "bank_transfer",
    });
    const { check } = await checksFor(seeded.companyId, TAX_YEAR);
    expect(check("owed-to-customers").items).toHaveLength(1);
    expect(check("owed-to-customers").title).toContain("(the amount is included in money received)");
  });

  it("lists matched pairs where the amounts differ", async () => {
    const seeded = await limited();
    const [payment] = await db.select().from(payments).where(eq(payments.amountPence, 7_000));
    const credit = await seeded.bankLine(addDays(LTD_YEAR.from, 40), 6_950, "Acme Trading");
    const debit = await seeded.bankLine(addDays(LTD_YEAR.from, 2), -1_900, "Trainline");
    await db.insert(reconciliationMatches).values([
      { bankTransactionId: credit.id, matchType: "invoice_payment", paymentId: payment!.id, confirmed: true },
      { bankTransactionId: debit.id, matchType: "expense", expenseId: seeded.edgeExpenses[1]!.id, confirmed: true },
    ]);
    const { texts } = await checksFor(seeded.companyId, LTD_YEAR);

    expect(texts("amount-differences")).toEqual([
      expect.stringContaining("Invoice payment INV-2: £70.00 recorded, £69.50 on the bank line"),
      expect.stringContaining("(Train ticket 2): £20.00 recorded, £19.00 on the bank line"),
    ]);
  });

  it("finds nothing to report when matched amounts agree", async () => {
    const { companyId } = await limited();
    const { texts } = await checksFor(companyId, LTD_YEAR);
    expect(texts("amount-differences")).toEqual([]);
    expect(texts("bank-unmatched")).toEqual([]);
  });

  it("lists invoices paid by the same payer under different client names", async () => {
    const seeded = await limited();
    const [other] = await db
      .insert(clients)
      .values({ companyId: seeded.companyId, name: "Pat", companyName: "ACME Trading Limited" })
      .returning();
    const [invoice] = await db
      .insert(invoices)
      .values({
        companyId: seeded.companyId,
        clientId: other!.id,
        number: "INV-9",
        status: "paid",
        issueDate: "2025-09-01",
        netPence: 5_000,
        grossPence: 5_000,
      })
      .returning();
    const [second] = await db
      .insert(payments)
      .values({ invoiceId: invoice!.id, amountPence: 5_000, receivedAt: new Date("2025-09-10T12:00:00Z") })
      .returning();
    const [first] = await db.select().from(payments).where(eq(payments.amountPence, 7_000));
    for (const [payment, amountPence, date] of [
      [first!, 7_000, addDays(LTD_YEAR.from, 40)],
      [second!, 5_000, "2025-09-10"],
    ] as const) {
      const line = await seeded.bankLine(date, amountPence, "ACME TRADING");
      await db.insert(reconciliationMatches).values({
        bankTransactionId: line.id,
        matchType: "invoice_payment",
        paymentId: payment.id,
        confirmed: true,
      });
    }
    const { texts } = await checksFor(seeded.companyId, LTD_YEAR);

    expect(texts("client-names")).toEqual([
      'Payments from "ACME TRADING" are against invoices for Acme Trading and ACME Trading Limited',
    ]);
  });
});

describe("expense checks", () => {
  it("lists expenses with no category, with no receipt, and naming another month", async () => {
    const seeded = await limited();
    const [hosting] = await db
      .insert(expenses)
      .values({
        companyId: seeded.companyId,
        description: "March hosting",
        category: null,
        spentAt: "2025-04-10",
        amountPence: 1_200,
        status: "company_paid",
      })
      .returning();
    await db.insert(expenseReceipts).values({
      expenseId: hosting!.id,
      blobPath: "receipts/hosting.pdf",
      filename: "hosting.pdf",
    });
    // A mileage claim has no receipt to attach.
    await db.insert(expenses).values({
      companyId: seeded.companyId,
      description: "Client visit",
      category: "Travel",
      spentAt: "2025-05-01",
      amountPence: 4_500,
      status: "company_paid",
      mileageMiles: 100,
      mileageRatePence: 45,
    });
    const { check, texts } = await checksFor(seeded.companyId, LTD_YEAR);

    expect(texts("expenses-uncategorised")).toEqual([
      expect.stringContaining("10/04/2025 · March hosting · £12.00"),
    ]);
    expect(texts("expenses-other-period")).toEqual([expect.stringContaining("March hosting")]);
    const noReceipt = texts("expenses-no-receipt").join("\n");
    expect(noReceipt).toContain("Train ticket 2");
    expect(noReceipt).not.toContain("March hosting");
    expect(noReceipt).not.toContain("Client visit");
    // Only expenses in the period are checked.
    expect(noReceipt).not.toContain("Train ticket 1");
    expect(noReceipt).not.toContain("Train ticket 4");
    expect(check("expenses-uncategorised").items[0]!.href).toBe(`/expenses/${hosting!.id}`);
  });

  it("lists a reimbursement whose total differs from its expenses", async () => {
    const seeded = await limited();
    expect((await checksFor(seeded.companyId, LTD_YEAR)).texts("reimbursement-items")).toEqual([]);

    await db.update(reimbursements).set({ totalPence: 4_100 }).where(eq(reimbursements.id, seeded.run.id));
    const { check, texts } = await checksFor(seeded.companyId, LTD_YEAR);
    expect(texts("reimbursement-items")).toEqual([
      expect.stringContaining("£41.00 paid, but its expenses add up to £40.00"),
    ]);
    expect(check("reimbursement-items").items[0]!.href).toBe(`/reimbursements/${seeded.run.id}`);
  });

  it("on cash basis, lists expenses with no bank payment to date them by", async () => {
    const { companyId } = await soleTrader("cash");
    const { texts } = await checksFor(companyId, TAX_YEAR);
    expect(texts("expenses-no-bank-date")).toEqual([expect.stringContaining("Train ticket 2")]);

    const accruals = await soleTrader("accruals");
    const other = await prepareYearEndPack({ companyId: accruals.companyId, period: TAX_YEAR, includeVat: true });
    expect(other.checks.map((c) => c.key)).not.toContain("expenses-no-bank-date");
  });
});

describe("sole trader transfers", () => {
  it("lists transfers and payments naming the owner that are not marked as drawings or money put in", async () => {
    const seeded = await soleTrader();
    const transfer = await seeded.bankLine("2025-07-01", -5_000, "Savings pot");
    await db.insert(reconciliationMatches).values({
      bankTransactionId: transfer.id,
      matchType: "transfer",
      confirmed: true,
    });
    await seeded.bankLine("2025-08-01", 3_000, "S CARTER", );
    await seeded.bankLine("2025-08-02", 3_000, "SAM CARTER");
    const { texts, pack } = await checksFor(seeded.companyId, TAX_YEAR);

    expect(texts("owner-transfers")).toEqual([
      "01/07/2025 · Savings pot · -£50.00",
      "02/08/2025 · SAM CARTER · £30.00",
    ]);
    // The drawings already marked in the fixture are not listed.
    expect(texts("owner-transfers").join()).not.toContain("Transfer out");

    // A limited company has no such check.
    const ltd = await limited();
    const other = await prepareYearEndPack({ companyId: ltd.companyId, period: LTD_YEAR, includeVat: true });
    expect(other.checks.map((c) => c.key)).not.toContain("owner-transfers");
    expect(pack.checks.map((c) => c.key)).toContain("owner-transfers");
  });

  it("only lets a sole trader mark money out as drawings and money in as money put in", async () => {
    const seeded = await soleTrader();
    const out = await seeded.bankLine("2025-07-01", -5_000, "Sam Carter");
    const incoming = await seeded.bankLine("2025-07-02", 5_000, "Sam Carter");

    await expect(
      explainOwnerTransactions(seeded.companyId, [out.id], { matchType: "money_put_in" }),
    ).rejects.toThrow("Only money coming in");
    await expect(
      explainOwnerTransactions(seeded.companyId, [incoming.id], { matchType: "drawings" }),
    ).rejects.toThrow("Only money going out");
    await expect(
      explainOwnerTransactions(seeded.companyId, [out.id], { matchType: "salary", personUserId: seeded.owner.id }),
    ).rejects.toThrow("only for limited companies");

    await explainOwnerTransactions(seeded.companyId, [out.id], { matchType: "drawings" });
    await explainOwnerTransactions(seeded.companyId, [incoming.id], { matchType: "money_put_in" });
    const { pack, texts } = await checksFor(seeded.companyId, TAX_YEAR);
    expect(texts("owner-transfers")).toEqual([]);
    expect(texts("bank-unmatched")).toEqual([]);
    expect(pack.figures.drawings[0]).toEqual({ label: "Taken from the business bank account", pence: 7_000 });
    expect(pack.figures.moneyPutIn[0]).toEqual({ label: "Paid into the business bank account", pence: 5_000 });
  });

  it("never reads, clears or explains another business's bank transactions", async () => {
    const seeded = await soleTrader();
    const other = await limited();
    const theirs = await other.bankLine("2025-07-01", -5_000, "Someone else");
    await db.insert(reconciliationMatches).values({
      bankTransactionId: theirs.id,
      matchType: "expense",
      expenseId: other.edgeExpenses[1]!.id,
      confirmed: false,
    });
    const mine = await seeded.bankLine("2025-07-01", -5_000, "Sam Carter");

    await expect(
      explainOwnerTransactions(seeded.companyId, [mine.id, theirs.id], { matchType: "drawings" }),
    ).rejects.toThrow("Bank transaction not found");
    const left = await db
      .select()
      .from(reconciliationMatches)
      .where(eq(reconciliationMatches.bankTransactionId, theirs.id));
    expect(left).toEqual([expect.objectContaining({ matchType: "expense", confirmed: false })]);
  });

  it("only lets a limited company mark money out as salary, to a named person", async () => {
    const seeded = await limited();
    const out = await seeded.bankLine("2025-07-01", -3_000, "Sam Carter");

    await expect(
      explainOwnerTransactions(seeded.companyId, [out.id], { matchType: "drawings" }),
    ).rejects.toThrow("only for sole traders");
    await expect(
      explainOwnerTransactions(seeded.companyId, [out.id], { matchType: "salary" }),
    ).rejects.toThrow("Choose who the salary was paid to");

    await explainOwnerTransactions(seeded.companyId, [out.id], {
      matchType: "salary",
      personUserId: seeded.owner.id,
    });
    const { pack } = await checksFor(seeded.companyId, LTD_YEAR);
    expect(pack.figures.directorsPay).toContainEqual({
      name: "Sam Carter",
      salaryPence: 3_000,
      dividendsPence: 120_000,
    });
  });
});

describe("summary ties and the Items to review tab", () => {
  it("finds every summary figure equal to its detail tab", async () => {
    const { companyId } = await limited();
    const { texts } = await checksFor(companyId, LTD_YEAR);
    expect(texts("summary-ties")).toEqual([]);
  });

  it("reports a summary figure that does not equal its detail tab", async () => {
    const { companyId } = await limited();
    const { pack } = await checksFor(companyId, LTD_YEAR);
    const checks = runChecks(pack.data, pack.figures, [
      { text: "Travel: the summary shows £60.00 but the Expenses tab adds up to £61.00" },
    ]);
    expect(checks.find((c) => c.key === "summary-ties")).toMatchObject({
      blocking: false,
      items: [{ text: expect.stringContaining("Travel") }],
    });
  });

  it("writes every item the checks found to the Items to review tab", async () => {
    const seeded = await limited();
    await seeded.bankLine("2025-07-01", -1_234, "Mystery Ltd");
    const { pack } = await checksFor(seeded.companyId, LTD_YEAR);
    const review = findSheet(pack.workbook.sheets, TAB.review);
    const expected = pack.checks.flatMap((c) => c.items.map((i) => [c.title, i.text]));

    expect(expected.length).toBeGreaterThan(0);
    expect(review.headers).toEqual(["What to check", "Record"]);
    expect(column(review, "What to check").map((check, i) => [check, column(review, "Record")[i]])).toEqual(
      expected,
    );
    expect(column(review, "Record")).toContain("01/07/2025 · Mystery Ltd · -£12.34");
  });
});

describe("namesAnotherPeriod", () => {
  it.each([
    ["March hosting", "2025-04-10", true],
    ["March hosting", "2025-03-28", false],
    ["Hosting Mar 2025", "2025-03-28", false],
    ["Hosting Mar 2025", "2026-03-28", true],
    ["Annual licence 2024", "2025-04-10", true],
    ["Annual licence 2025", "2025-04-10", false],
    // "may" as an ordinary word is not the month.
    ["Parts that may be returned", "2025-04-10", false],
    ["May subscription", "2025-04-10", true],
    ["Sept invoice from supplier", "2025-10-02", true],
    ["Train to Leeds", "2025-04-10", false],
    ["Room 2025 hire", "2025-04-10", false],
  ])("%s spent %s → %s", (description, spentAt, expected) => {
    expect(namesAnotherPeriod(description, spentAt)).toBe(expected);
  });
});
