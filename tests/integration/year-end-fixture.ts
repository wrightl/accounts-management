import type { TestDatabase } from "@/db/pglite";
import {
  bankAccounts,
  bankTransactions,
  clients,
  creditNotes,
  dividendDeclarations,
  dividendPayouts,
  expenses,
  invoiceLineItems,
  invoices,
  payments,
  reconciliationMatches,
  reimbursementItems,
  reimbursements,
  shareholders,
  users,
} from "@/db/schema";
import { addDays } from "@/lib/ledger/corporation-tax";
import { seedCompany } from "@/lib/test/seed-company";
import type { PackCell, PackSheet } from "@/lib/year-end/sheets";
import type { PackPeriod } from "@/lib/year-end/period";

export const LTD_YEAR: PackPeriod = { from: "2025-04-01", to: "2026-03-31" };
export const TAX_YEAR: PackPeriod = { from: "2025-04-06", to: "2026-04-05" };

/** The day before the period, its first day, its last day, and the day after. */
export function edges(period: PackPeriod): [string, string, string, string] {
  return [addDays(period.from, -1), period.from, period.to, addDays(period.to, 1)];
}

/** One distinct weight per edge, so a total shows exactly which dates it holds: in the period is 2 + 4. */
export const WEIGHTS = [1, 2, 4, 8] as const;

const noon = (date: string) => new Date(`${date}T12:00:00Z`);

let seedCount = 0;

export type Seeded = Awaited<ReturnType<typeof seedYearEnd>>;

/**
 * A business with one of every record type on each edge of the period, plus
 * the records each outside-period section needs.
 *
 * Invoices (net, no VAT): 100, 200, 400, 800 on the four edges.
 * Expenses paid by the business: 10, 20, 40, 80 on the four edges.
 * Other income (interest): 5, 10, 20, 40 on the four edges.
 */
export async function seedYearEnd(
  db: TestDatabase,
  options: {
    entityType: "limited_company" | "sole_trader";
    period: PackPeriod;
    accountingBasis?: "cash" | "accruals" | null;
    openingBalance?: boolean;
  },
) {
  const { period } = options;
  const limited = options.entityType === "limited_company";
  const [before, first, last, after] = edges(period);

  const company = await seedCompany(db, {
    entityType: options.entityType,
    name: limited ? "Northwind Studio" : "Carter Design",
    legalName: limited ? "Northwind Studio Ltd" : "Sam Carter",
    companyNumber: limited ? "01234567" : null,
    utr: "1234567890",
    addressLines: "1 High Street\nLeeds",
    email: "accounts@example.com",
    financialYearEndMonth: 3,
    yearEndOnFifthApril: !limited,
    accountingBasis: limited ? null : (options.accountingBasis ?? null),
    tradingStartedOn: limited ? null : "2020-01-06",
    totalShares: limited ? 100 : null,
    // Unique, so one test can seed the same kind of business twice.
    slug: `year-end-${++seedCount}`,
  });
  const companyId = company.id;

  const [owner] = await db
    .insert(users)
    .values({ companyId, email: "sam@example.com", name: "Sam Carter", role: "admin" })
    .returning();
  const [colleague] = await db
    .insert(users)
    .values({ companyId, email: "jo@example.com", name: "Jo Field", role: "user" })
    .returning();
  const [client] = await db
    .insert(clients)
    .values({ companyId, name: "Alex Reed", companyName: "Acme Trading" })
    .returning();

  const [account] = await db
    .insert(bankAccounts)
    .values({
      companyId,
      name: "Main account",
      provider: "other",
      ...(options.openingBalance === false
        ? {}
        : { openingBalancePence: 100_000, openingBalanceDate: addDays(period.from, -10) }),
    })
    .returning();

  let txCount = 0;
  const bankLine = async (bookedAt: string, amountPence: number, counterparty: string) => {
    const [tx] = await db
      .insert(bankTransactions)
      .values({
        bankAccountId: account.id,
        externalId: `tx-${++txCount}`,
        bookedAt,
        amountPence,
        counterparty,
      })
      .returning();
    return tx;
  };

  // --- One of each record type on each edge -----------------------------------

  const edgeInvoices = [];
  const edgeExpenses = [];
  for (const [i, date] of [before, first, last, after].entries()) {
    const w = WEIGHTS[i]!;
    const [invoice] = await db
      .insert(invoices)
      .values({
        companyId,
        clientId: client.id,
        number: `INV-${i + 1}`,
        status: "sent",
        issueDate: date,
        dueDate: addDays(date, 14),
        netPence: 10_000 * w,
        vatPence: 0,
        grossPence: 10_000 * w,
      })
      .returning();
    await db.insert(invoiceLineItems).values({
      invoiceId: invoice.id,
      description: `Design work ${i + 1}`,
      quantity: 1,
      unitPricePence: 10_000 * w,
    });
    edgeInvoices.push(invoice);

    const [expense] = await db
      .insert(expenses)
      .values({
        companyId,
        description: `Train ticket ${i + 1}`,
        category: "Travel",
        spentAt: date,
        amountPence: 1_000 * w,
        status: "company_paid",
      })
      .returning();
    edgeExpenses.push(expense);

    const interest = await bankLine(date, 500 * w, "Bank interest");
    await db.insert(reconciliationMatches).values({
      bankTransactionId: interest.id,
      matchType: "other_income",
      incomeCategory: "Interest",
      confirmed: true,
    });

    if (limited) {
      const [declaration] = await db
        .insert(dividendDeclarations)
        .values({ companyId, declaredAt: date, totalPence: 20_000 * w })
        .returning();
      await db.insert(dividendPayouts).values({
        declarationId: declaration.id,
        shareholderName: "Sam Carter",
        shareCount: 100,
        amountPence: 20_000 * w,
      });
    }
  }
  if (limited) {
    await db
      .insert(shareholders)
      .values({ companyId, name: "Sam Carter", shareCount: 100, userId: owner.id });
  }

  // --- Credit notes: one in the period, one the day after ------------------------

  for (const [i, [date, netPence]] of (
    [
      [addDays(first, 20), 3_000],
      [after, 5_000],
    ] as const
  ).entries()) {
    await db.insert(creditNotes).values({
      companyId,
      invoiceId: edgeInvoices[1]!.id,
      clientId: client.id,
      number: `CN-${i + 1}`,
      issueDate: date,
      reason: "Agreed discount",
      netPence,
      vatPence: 0,
      grossPence: netPence,
    });
  }

  // --- Payments ---------------------------------------------------------------------
  // On the invoice issued the day before the period: one on each edge (10, 20, 40, 8).
  for (const [i, date] of [before, first, last, after].entries()) {
    await db.insert(payments).values({
      invoiceId: edgeInvoices[0]!.id,
      amountPence: [1_000, 2_000, 4_000, 800][i]!,
      receivedAt: noon(date),
      method: "bank_transfer",
    });
  }
  // On the invoice issued on the first day (200, less a 30 credit note): 70 in
  // the period and 100 after it, so 100 is owed at the period end.
  await db.insert(payments).values({
    invoiceId: edgeInvoices[1]!.id,
    amountPence: 7_000,
    receivedAt: noon(addDays(first, 40)),
    method: "bank_transfer",
  });
  const laterPaidOn = addDays(last, 20);
  await db.insert(payments).values({
    invoiceId: edgeInvoices[1]!.id,
    amountPence: 10_000,
    receivedAt: noon(laterPaidOn),
    method: "bank_transfer",
  });

  // --- Expenses paid personally, and a reimbursement paid in the period ------------------

  const personal = async (
    description: string,
    spentAt: string,
    amountPence: number,
    paidByUserId: string,
    status: "reimbursable" | "reimbursed",
  ) => {
    const [expense] = await db
      .insert(expenses)
      .values({ companyId, description, category: "Office", spentAt, amountPence, status, paidByUserId })
      .returning();
    return expense;
  };
  const reimbursedEarlier = await personal("Printer paper", addDays(first, -20), 1_500, colleague.id, "reimbursed");
  const reimbursedInPeriod = await personal("Desk lamp", addDays(first, 5), 2_500, colleague.id, "reimbursed");
  const awaiting = await personal("Stamps", addDays(first, -5), 700, colleague.id, "reimbursable");
  const reimbursedOn = addDays(first, 30);
  const [run] = await db
    .insert(reimbursements)
    .values({
      companyId,
      payeeUserId: colleague.id,
      status: "paid",
      totalPence: 4_000,
      reference: "RB-1",
      paidAt: noon(reimbursedOn),
    })
    .returning();
  await db.insert(reimbursementItems).values([
    { reimbursementId: run.id, expenseId: reimbursedEarlier.id },
    { reimbursementId: run.id, expenseId: reimbursedInPeriod.id },
  ]);
  // A sole trader's own spending is money put in, not a debt.
  const ownerPaid = limited
    ? null
    : await personal("Notebook", addDays(first, 7), 900, owner.id, "reimbursable");

  // --- Bank payments matched to expenses ------------------------------------------------------
  // The expense dated the day before the period was paid from the bank in it,
  // and the one dated the last day was paid from the bank after it.
  const paidEarlierExpense = await bankLine(addDays(first, 1), -1_000, "Trainline");
  const paidLater = await bankLine(addDays(last, 3), -4_000, "Trainline");
  await db.insert(reconciliationMatches).values([
    {
      bankTransactionId: paidEarlierExpense.id,
      matchType: "expense",
      expenseId: edgeExpenses[0]!.id,
      confirmed: true,
    },
    {
      bankTransactionId: paidLater.id,
      matchType: "expense",
      expenseId: edgeExpenses[2]!.id,
      confirmed: true,
    },
  ]);

  // --- Pay: salary for a limited company, drawings for a sole trader -------------------------------
  const pay = await bankLine(addDays(first, 60), limited ? -2_500 : -2_000, limited ? "Jo Field" : "Transfer out");
  await db.insert(reconciliationMatches).values({
    bankTransactionId: pay.id,
    matchType: limited ? "salary" : "drawings",
    personUserId: limited ? colleague.id : null,
    confirmed: true,
  });

  return {
    company,
    companyId,
    period,
    owner,
    colleague,
    client,
    account,
    edgeInvoices,
    edgeExpenses,
    reimbursedEarlier,
    reimbursedInPeriod,
    awaiting,
    ownerPaid,
    run,
    reimbursedOn,
    laterPaidOn,
    bankLine,
  };
}

// --- Reading the workbook model -------------------------------------------------------------------

export function value(cell: PackCell | undefined): string | number | null {
  if (cell == null) return null;
  return typeof cell === "string" ? cell : cell.v;
}

export function formula(cell: PackCell | undefined): string | undefined {
  return cell != null && typeof cell !== "string" ? cell.formula : undefined;
}

export function findSheet(sheets: PackSheet[], name: string): PackSheet {
  const sheet = sheets.find((s) => s.name === name);
  if (!sheet) throw new Error(`No "${name}" tab. Tabs: ${sheets.map((s) => s.name).join(", ")}`);
  return sheet;
}

/** A table tab's column by its header. */
export function column(sheet: PackSheet, header: string): (string | number | null)[] {
  const index = sheet.headers.indexOf(header);
  if (index < 0) throw new Error(`No "${header}" column on ${sheet.name}: ${sheet.headers.join(", ")}`);
  return sheet.rows.map((r) => value(r[index]));
}

/** The row of a layout tab whose first cell is `label`. */
export function labelledRow(sheet: PackSheet, label: string): PackCell[] {
  const row = sheet.rows.find((r) => value(r[0]) === label);
  if (!row) throw new Error(`No "${label}" row on ${sheet.name}`);
  return row;
}

/** The amount beside a label on a layout tab. */
export function amount(sheet: PackSheet, label: string): string | number | null {
  return value(labelledRow(sheet, label)[1]);
}

/** Every piece of text in a sheet: headers, cells and totals. */
export function allText(sheet: PackSheet): string[] {
  return [
    sheet.name,
    sheet.about,
    ...sheet.headers,
    ...[...sheet.rows, ...(sheet.totals ? [sheet.totals] : [])].flatMap((r) =>
      r.map((c) => String(value(c) ?? "")),
    ),
  ];
}

export const sum = (values: (string | number | null)[]) =>
  values.reduce<number>((total, v) => total + (typeof v === "number" ? v : 0), 0);

/**
 * A table inside a layout tab, found by its header row: its rows keyed by
 * header, up to its totals row or the next blank row. `nth` picks a later
 * table with the same headers.
 */
export function layoutTable(sheet: PackSheet, headers: string[], nth = 0) {
  const starts = sheet.rows.flatMap((r, i) =>
    headers.every((h, c) => value(r[c]) === h) ? [i] : [],
  );
  const start = starts[nth];
  if (start == null) {
    throw new Error(`No table starting "${headers.join(" | ")}" on ${sheet.name}`);
  }
  const names = sheet.rows[start]!.map((c) => String(value(c)));
  const record = (r: PackCell[]) =>
    Object.fromEntries(names.map((name, c) => [name, value(r[c])])) as Record<
      string,
      string | number | null
    >;
  const rows: Record<string, string | number | null>[] = [];
  let total: Record<string, string | number | null> | null = null;
  for (const r of sheet.rows.slice(start + 1)) {
    if (r.length === 0) break;
    if (value(r[0]) === "Total") {
      total = record(r);
      break;
    }
    rows.push(record(r));
  }
  return { rows, total };
}
