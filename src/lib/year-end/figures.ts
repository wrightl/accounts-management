import { formatExpenseRef } from "@/lib/references";
import type {
  PackBankTransaction,
  PackExpense,
  PackInvoice,
  PackPerson,
  PackReimbursement,
  YearEndData,
} from "@/lib/year-end/data";
import { inPeriod } from "@/lib/year-end/period";

export const NO_CATEGORY = "No category";
export const WRITE_OFF_CATEGORY = {
  bank_charges: "Bank charges on customer payments",
  bad_debt: "Bad debts",
} as const;

export function isPersonal(expense: PackExpense): boolean {
  return expense.status === "reimbursable" || expense.status === "reimbursed";
}

export type Debtor = {
  invoice: PackInvoice;
  balancePence: number;
  /** The date it was later settled in full; null while any of it is still owed. */
  paidOn: string | null;
};

/** An invoice the customer has paid more than they owe on (overpaid, or credited after payment), not refunded by the period end. */
export type CustomerCredit = {
  invoice: PackInvoice;
  /** Owed back to the customer at the period end (positive). */
  pence: number;
  /** The date it was later refunded in full; null while any of it is still owed back. */
  refundedOn: string | null;
};

export type PersonAmount ={ name: string; pence: number };

/** What one person is owed at the period end, by when the costs are dated. The three parts add up to the total. */
export type OwedSplit = {
  name: string;
  /** Dated before incorporation (or before a sole trader started trading). Nil when that date is not held. */
  beforeStartPence: number;
  /** Dated from that date on, but before the period start. */
  earlierPence: number;
  /** Dated in the period. */
  thisPeriodPence: number;
  totalPence: number;
};

/** The income category the bank screen offers for a grant. */
export const GRANT_CATEGORY = "Grant";

/** A cost with a covered period that runs outside the pack period, split by days. The three parts add up to the cost. */
export type Prepayment = {
  expense: PackExpense;
  /** The part covering time before the period start. */
  beforePence: number;
  /** The part covering time in the period. */
  inPeriodPence: number;
  /** The part covering time after the period end. */
  laterPence: number;
};

export type Figures = {
  /** Whether amounts are shown net of VAT with VAT columns. */
  vat: boolean;
  /** The stored reference of every expense the pack mentions, e.g. EXP-0007. */
  expenseRef: Map<string, string>;
  expenseNetPence: (expense: PackExpense) => number;
  /** When the business paid for it: the date cash basis counts it on. */
  expensePaidOn: (expense: PackExpense) => string | null;
  paidByOwner: (expense: PackExpense) => boolean;
  /** Expenses that count in this period's profit, on the pack's accounting basis. */
  periodExpenses: PackExpense[];
  /** Expenses dated in the period, whatever the basis. */
  spentInPeriod: PackExpense[];
  awaitingReimbursement: PackExpense[];
  /** Expenses dated in the period whose bank payment came after it. */
  paidFromBankLater: PackExpense[];
  otherIncome: PackBankTransaction[];
  unmatched: PackBankTransaction[];
  /** Balance owed on an invoice at the close of a date. */
  invoiceBalanceAt: (invoice: PackInvoice, date: string) => number;
  debtors: Debtor[];
  owedToCustomers: CustomerCredit[];
  pnl: {
    salesPence: number;
    creditNotesPence: number;
    cashReceivedPence: number;
    otherIncome: { category: string; pence: number }[];
    expenses: { category: string; pence: number }[];
    totalIncomePence: number;
    totalExpensesPence: number;
    profitPence: number;
  };
  possibleFixedAssets: PackExpense[];
  /** Spent in the period, covering time after its end. Empty on cash basis, which counts a cost when it is paid. */
  possiblePrepayments: Prepayment[];
  /** Spent before the period, covering time in it (and perhaps after it). Empty on cash basis. */
  prepaymentsBroughtForward: Prepayment[];
  /** The date of incorporation, or the date a sole trader started trading; null when not held. */
  startDate: string | null;
  /** Reimbursements paid in the period. A sole trader repaying themselves is drawings, so those are left out. */
  reimbursementRuns: PackReimbursement[];
  /** Expenses dated before the period that one of those reimbursements paid back. */
  reimbursedEarlier: { run: PackReimbursement; expense: PackExpense }[];
  /** `awaitingReimbursement` per person, split by when the costs are dated. */
  owedSplit: OwedSplit[];
  /** Other income recorded under the built-in Grant category. */
  grants: PackBankTransaction[];
  /** Limited company. */
  owedToPeople: PersonAmount[];
  directorsPay: { name: string; salaryPence: number; dividendsPence: number }[];
  /** Sole trader. */
  drawings: { label: string; pence: number }[];
  moneyPutIn: { label: string; pence: number }[];
  mileage: { journeys: number; miles: number; pence: number };
};

const sum = <T,>(rows: readonly T[], value: (row: T) => number) =>
  rows.reduce((total, row) => total + value(row), 0);

function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

function byCategory<T>(rows: readonly T[], category: (row: T) => string, pence: (row: T) => number) {
  const totals = new Map<string, number>();
  for (const row of rows) totals.set(category(row), (totals.get(category(row)) ?? 0) + pence(row));
  return [...totals].map(([name, total]) => ({ category: name, pence: total }));
}

/** Everything the workbook and the checks work out from the loaded records. No queries. */
export function deriveFigures(data: YearEndData): Figures {
  const { period, company, isLimited, owner } = data;
  const vat = company.vatRegistered;
  const cash = data.basis === "cash";
  const all = [...data.expenses.values()];

  const expenseNetPence = (e: PackExpense) => (vat ? e.amountPence - e.vatPence : e.amountPence);
  const paidByOwner = (e: PackExpense) =>
    owner !== null && isPersonal(e) && e.paidByUserId === owner.id;
  const expensePaidOn = (e: PackExpense) => {
    if (e.bank) return e.bank.bookedAt;
    if (isPersonal(e)) return paidByOwner(e) ? e.spentAt : e.reimbursementPaidOn;
    return e.spentAt;
  };

  const spentInPeriod = all.filter((e) => inPeriod(e.spentAt, period));
  const periodExpenses = cash ? all.filter((e) => inPeriod(expensePaidOn(e), period)) : spentInPeriod;
  const awaitingReimbursement = all.filter(
    (e) =>
      isPersonal(e) &&
      !paidByOwner(e) &&
      e.spentAt != null &&
      e.spentAt <= period.to &&
      (e.reimbursementPaidOn == null || e.reimbursementPaidOn > period.to),
  );
  const paidFromBankLater = spentInPeriod.filter((e) => e.bank && e.bank.bookedAt > period.to);

  /** Spent before the period, with a covered period that runs into it: a prepayment brought forward. */
  const coversIntoPeriod = (e: PackExpense) =>
    e.spentAt != null &&
    e.spentAt < period.from &&
    e.coversTo != null &&
    e.coversTo >= period.from &&
    (e.coversFrom ?? e.spentAt) <= e.coversTo;

  const reimbursed = new Set(data.reimbursements.flatMap((r) => r.expenseIds));
  const mentioned = new Set([
    ...periodExpenses,
    ...spentInPeriod,
    ...awaitingReimbursement,
    ...all.filter((e) => reimbursed.has(e.id)),
    ...(cash ? [] : all.filter(coversIntoPeriod)),
  ]);
  const expenseRef = new Map(
    all.filter((e) => mentioned.has(e)).map((e) => [e.id, formatExpenseRef(e.refNumber)]),
  );

  const otherIncome = data.bankTransactions.filter((t) =>
    t.matches.some((m) => m.matchType === "other_income"),
  );
  const unmatched = data.bankTransactions.filter((t) => t.matches.length === 0);

  const invoiceBalanceAt = (inv: PackInvoice, date: string) =>
    inv.grossPence -
    sum(inv.credits.filter((c) => c.issueDate <= date), (c) => c.grossPence) -
    sum(inv.writeOffs.filter((w) => w.writtenOffOn <= date), (w) => w.amountPence) -
    sum(inv.payments.filter((p) => p.receivedOn <= date), (p) => p.amountPence) +
    sum(inv.credits.filter((c) => c.refundedAt != null && c.refundedAt <= date), (c) => c.refundedPence);

  const debtors: Debtor[] = data.invoices.flatMap((invoice) => {
    const balancePence = invoiceBalanceAt(invoice, period.to);
    if (balancePence <= 0) return [];
    const later = [
      ...invoice.payments.map((p) => p.receivedOn),
      ...invoice.credits.map((c) => c.issueDate),
      ...invoice.writeOffs.map((w) => w.writtenOffOn),
    ]
      .filter((d) => d > period.to)
      .sort();
    const paidOn = later.find((d) => invoiceBalanceAt(invoice, d) <= 0) ?? null;
    return [{ invoice, balancePence, paidOn }];
  });

  const owedToCustomers: CustomerCredit[] = data.invoices.flatMap((invoice) => {
    const balancePence = invoiceBalanceAt(invoice, period.to);
    if (balancePence >= 0) return [];
    const refundedOn =
      invoice.credits
        .flatMap((c) => (c.refundedAt != null && c.refundedAt > period.to ? [c.refundedAt] : []))
        .sort()
        .find((d) => invoiceBalanceAt(invoice, d) >= 0) ?? null;
    return [{ invoice, pence: -balancePence, refundedOn }];
  });

  // --- Profit and loss -------------------------------------------------------

  const salesPence = sum(data.invoices, (i) => i.netPence);
  const creditNotesPence = sum(data.creditNotes, (c) => c.netPence);
  const cashReceivedPence = sum(data.cashReceipts, (r) => r.netPence);
  const otherIncomeRows = byCategory(
    otherIncome,
    (t) => t.matches.find((m) => m.matchType === "other_income")?.incomeCategory?.trim() || "Other",
    (t) => t.amountPence,
  );
  const expenseRows = [
    ...byCategory(periodExpenses, (e) => e.category ?? NO_CATEGORY, expenseNetPence),
    // On cash basis an amount that was never received is not an expense.
    ...(cash ? [] : byCategory(data.writeOffs, (w) => WRITE_OFF_CATEGORY[w.kind], (w) => w.amountPence)),
  ].sort((a, b) => a.category.localeCompare(b.category));
  const totalIncomePence =
    (cash ? cashReceivedPence : salesPence - creditNotesPence) + sum(otherIncomeRows, (r) => r.pence);
  const totalExpensesPence = sum(expenseRows, (r) => r.pence);

  // --- Year-end position -----------------------------------------------------

  const possibleFixedAssets = spentInPeriod.filter(
    (e) => e.category === "Equipment" && expenseNetPence(e) > company.fixedAssetThresholdPence,
  );
  const prepayment = (e: PackExpense): Prepayment => {
    const net = expenseNetPence(e);
    const from = e.coversFrom ?? e.spentAt!;
    const to = e.coversTo!;
    const days = daysBetween(from, to) + 1;
    if (days <= 0) return { expense: e, beforePence: 0, inPeriodPence: net, laterPence: 0 };
    const beforeDays = from < period.from ? Math.min(days, daysBetween(from, period.from)) : 0;
    const laterDays = to > period.to ? Math.min(days, daysBetween(period.to, to)) : 0;
    const beforePence = Math.round((net * beforeDays) / days);
    const laterPence = Math.round((net * laterDays) / days);
    // The remainder, so the three parts always add up to the cost.
    return { expense: e, beforePence, inPeriodPence: net - beforePence - laterPence, laterPence };
  };
  // Cash basis counts a cost when it is paid, so there is nothing to move between periods.
  const possiblePrepayments = cash
    ? []
    : spentInPeriod.filter((e) => e.coversTo != null && e.coversTo > period.to).map(prepayment);
  const prepaymentsBroughtForward = cash
    ? []
    : all.filter(coversIntoPeriod).map(prepayment);

  const nameOf = (id: string | null, fallback: string) => data.people.get(id ?? "")?.name ?? fallback;
  const byPerson = (rows: PersonAmount[]) => {
    const totals = new Map<string, number>();
    for (const row of rows) totals.set(row.name, (totals.get(row.name) ?? 0) + row.pence);
    return [...totals]
      .map(([name, pence]) => ({ name, pence }))
      .sort((a, b) => a.name.localeCompare(b.name));
  };

  const owedToPeople = byPerson(
    awaitingReimbursement.map((e) => ({
      name: nameOf(e.paidByUserId, "Person not recorded"),
      pence: e.amountPence,
    })),
  );

  const startDate = isLimited ? company.incorporatedOn : company.tradingStartedOn;
  const reimbursementRuns = data.reimbursements.filter(
    (r) => isLimited || r.payeeUserId !== owner?.id,
  );
  const reimbursedEarlier = reimbursementRuns.flatMap((run) =>
    run.expenseIds
      .map((id) => data.expenses.get(id)!)
      .filter((e) => e.spentAt != null && e.spentAt < period.from)
      .map((expense) => ({ run, expense })),
  );
  // Each expense lands in exactly one part, so the parts add up to owedToPeople.
  const owedSplit: OwedSplit[] = owedToPeople.map(({ name, pence }) => {
    const theirs = awaitingReimbursement.filter(
      (e) => nameOf(e.paidByUserId, "Person not recorded") === name,
    );
    const beforeStart = (e: PackExpense) => startDate != null && e.spentAt! < startDate;
    const part = (keep: (e: PackExpense) => boolean) => sum(theirs.filter(keep), (e) => e.amountPence);
    return {
      name,
      beforeStartPence: part(beforeStart),
      earlierPence: part((e) => !beforeStart(e) && e.spentAt! < period.from),
      thisPeriodPence: part((e) => !beforeStart(e) && e.spentAt! >= period.from),
      totalPence: pence,
    };
  });
  const grants = otherIncome.filter((t) =>
    t.matches.some(
      (m) =>
        m.matchType === "other_income" &&
        m.incomeCategory?.trim().toLowerCase() === GRANT_CATEGORY.toLowerCase(),
    ),
  );

  const matchesOf = (type: string) =>
    data.bankTransactions.flatMap((t) =>
      t.matches.filter((m) => m.matchType === type).map((m) => ({ tx: t, match: m })),
    );

  const shareholderPerson = new Map<string, PackPerson | undefined>(
    data.shareholders.map((s) => [s.id, s.userId ? data.people.get(s.userId) : undefined]),
  );
  const salary = byPerson(
    matchesOf("salary").map(({ tx, match }) => ({
      name: nameOf(match.personUserId, "Person not recorded"),
      pence: -tx.amountPence,
    })),
  );
  const dividendsByName = byPerson(
    data.dividends.map((d) => ({
      name: shareholderPerson.get(d.shareholderId ?? "")?.name ?? d.shareholderName,
      pence: d.amountPence,
    })),
  );
  const payNames = [...new Set([...salary, ...dividendsByName].map((r) => r.name))].sort();
  const directorsPay = payNames.map((name) => ({
    name,
    salaryPence: salary.find((r) => r.name === name)?.pence ?? 0,
    dividendsPence: dividendsByName.find((r) => r.name === name)?.pence ?? 0,
  }));

  const ownerReimbursed = data.reimbursements.filter((r) => owner && r.payeeUserId === owner.id);
  const drawings = isLimited
    ? []
    : [
        { label: "Taken from the business bank account", pence: -sum(matchesOf("drawings"), (m) => m.tx.amountPence) },
        { label: "Reimbursements paid to the owner", pence: sum(ownerReimbursed, (r) => r.totalPence) },
      ];
  const moneyPutIn = isLimited
    ? []
    : [
        { label: "Paid into the business bank account", pence: sum(matchesOf("money_put_in"), (m) => m.tx.amountPence) },
        {
          label: "Business expenses the owner paid personally",
          pence: sum(spentInPeriod.filter(paidByOwner), (e) => e.amountPence),
        },
      ];

  const journeys = spentInPeriod.filter((e) => e.mileageMiles != null && e.mileageMiles > 0);
  const mileage = {
    journeys: journeys.length,
    miles: sum(journeys, (e) => e.mileageMiles ?? 0),
    pence: sum(journeys, (e) => e.amountPence),
  };

  return {
    vat,
    expenseRef,
    expenseNetPence,
    expensePaidOn,
    paidByOwner,
    periodExpenses,
    spentInPeriod,
    awaitingReimbursement,
    paidFromBankLater,
    otherIncome,
    unmatched,
    invoiceBalanceAt,
    debtors,
    owedToCustomers,
    pnl: {
      salesPence,
      creditNotesPence,
      cashReceivedPence,
      otherIncome: otherIncomeRows.sort((a, b) => a.category.localeCompare(b.category)),
      expenses: expenseRows,
      totalIncomePence,
      totalExpensesPence,
      profitPence: totalIncomePence - totalExpensesPence,
    },
    possibleFixedAssets,
    possiblePrepayments,
    prepaymentsBroughtForward,
    startDate,
    reimbursementRuns,
    reimbursedEarlier,
    owedSplit,
    grants,
    owedToPeople,
    directorsPay,
    drawings,
    moneyPutIn,
    mileage,
  };
}
