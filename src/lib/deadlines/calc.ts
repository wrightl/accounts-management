import { addDays, addMonths, ctPaymentDueDate } from "@/lib/ledger/corporation-tax";
import { vatDueDate, vatQuarterFor } from "@/lib/safe-to-pay/calc";
import { formatIsoDateLong } from "@/lib/dates";

export const DEADLINE_KINDS = [
  "confirmation_statement",
  "annual_accounts",
  "ct_payment",
  "ct600",
  "vat_return",
  "self_assessment",
  "payment_on_account",
] as const;

export type DeadlineKind = (typeof DEADLINE_KINDS)[number];

export function isDeadlineKind(value: unknown): value is DeadlineKind {
  return typeof value === "string" && (DEADLINE_KINDS as readonly string[]).includes(value);
}

export type Deadline = {
  kind: DeadlineKind;
  dueDate: string;
  label: string;
  /** The period the deadline is for, e.g. "Year ended 31 March 2026". */
  period: string | null;
  /** Who it goes to and what happens if it's late. */
  detail: string;
  /** Where the date came from: Companies House's record, or worked out here. */
  source: "companies_house" | "calculated";
};

export type DeadlineInputs = {
  entityType: "limited_company" | "sole_trader";
  financialYearEndMonth: number;
  vatRegistered: boolean;
  vatQuarterEndMonth: number;
  incorporatedOn: string | null;
  accountsDue: string | null;
  confirmationStatementDue: string | null;
};

export type DeadlineStatus = "done" | "overdue" | "due_soon" | "upcoming";

/** Deadlines this close are flagged as due soon. */
export const DUE_SOON_DAYS = 30;

function lastDayOfMonth(year: number, month: number): string {
  return new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
}

/** The last day of the month `months` after the month containing `iso`. */
function monthEndAfter(iso: string, months: number): string {
  const shifted = addMonths(`${iso.slice(0, 8)}01`, months);
  return lastDayOfMonth(Number(shifted.slice(0, 4)), Number(shifted.slice(5, 7)));
}

/** Annual accounts are due at Companies House 9 months after the year end. */
export function accountsDueDate(yearEnd: string): string {
  return monthEndAfter(yearEnd, 9);
}

/** The company tax return (CT600) is due 12 months after the accounting period. */
export function ct600DueDate(periodEnd: string): string {
  return monthEndAfter(periodEnd, 12);
}

/** A confirmation statement is due 14 days after its review date. */
export function confirmationStatementDueDate(reviewDate: string): string {
  return addDays(reviewDate, 14);
}

function yearEndsBetween(fyEndMonth: number, from: string, to: string): string[] {
  const ends: string[] = [];
  const first = Number(from.slice(0, 4)) - 1;
  const last = Number(to.slice(0, 4));
  for (let year = first; year <= last; year++) {
    const end = lastDayOfMonth(year, fyEndMonth);
    if (end >= from && end <= to) ends.push(end);
  }
  return ends;
}

function ltdDeadlines(inputs: DeadlineInputs, from: string, to: string): Deadline[] {
  const out: Deadline[] = [];

  // Year ends whose 12-month CT600 deadline could fall in the window.
  const ends = yearEndsBetween(inputs.financialYearEndMonth, addMonths(from, -13), to).filter(
    (end) => !inputs.incorporatedOn || end > inputs.incorporatedOn,
  );
  for (const end of ends) {
    const period = `Year ended ${formatIsoDateLong(end)}`;
    const accounts = accountsDueDate(end);
    // Companies House's own date wins up to and including its next deadline
    // (first accounts, or a shortened or extended year, differ from the rule).
    if (!inputs.accountsDue || accounts > inputs.accountsDue) {
      out.push({
        kind: "annual_accounts",
        dueDate: accounts,
        label: "Annual accounts to Companies House",
        period,
        detail: "Late filing penalties start at £150 and double if late two years running.",
        source: "calculated",
      });
    }
    out.push({
      kind: "ct_payment",
      dueDate: ctPaymentDueDate(end),
      label: "Pay corporation tax",
      period,
      detail: "Paid to HMRC before the return is due. HMRC charges interest from the day after.",
      source: "calculated",
    });
    out.push({
      kind: "ct600",
      dueDate: ct600DueDate(end),
      label: "Company tax return (CT600)",
      period,
      detail: "Filed with HMRC with your accounts and computations. £100 penalty if late.",
      source: "calculated",
    });
  }

  if (inputs.accountsDue) {
    const matching = ends.find((end) => accountsDueDate(end) === inputs.accountsDue);
    out.push({
      kind: "annual_accounts",
      dueDate: inputs.accountsDue,
      label: "Annual accounts to Companies House",
      period: matching ? `Year ended ${formatIsoDateLong(matching)}` : null,
      detail: "Late filing penalties start at £150 and double if late two years running.",
      source: "companies_house",
    });
  }

  const confirmationDetail =
    "Confirms your officers, shareholders and registered office. £50 fee; failing to file is an offence.";
  if (inputs.confirmationStatementDue) {
    for (let due = inputs.confirmationStatementDue; due <= to; due = addMonths(due, 12)) {
      out.push({
        kind: "confirmation_statement",
        dueDate: due,
        label: "Confirmation statement",
        period: null,
        detail: confirmationDetail,
        source: due === inputs.confirmationStatementDue ? "companies_house" : "calculated",
      });
    }
  } else if (inputs.incorporatedOn) {
    for (let years = 1; ; years++) {
      const review = addMonths(inputs.incorporatedOn, 12 * years);
      const due = confirmationStatementDueDate(review);
      if (due > to) break;
      out.push({
        kind: "confirmation_statement",
        dueDate: due,
        label: "Confirmation statement",
        period: `Review date ${formatIsoDateLong(review)}`,
        detail: confirmationDetail,
        source: "calculated",
      });
    }
  }

  return out;
}

function vatDeadlines(firstQuarterEndMonth: number, from: string, to: string): Deadline[] {
  const out: Deadline[] = [];
  // Quarters ending up to ~2 months before the window can fall due inside it.
  let quarter = vatQuarterFor(addMonths(from, -3), firstQuarterEndMonth);
  while (quarter.end <= to) {
    const due = vatDueDate(quarter.end);
    if (due >= from && due <= to) {
      out.push({
        kind: "vat_return",
        dueDate: due,
        label: "VAT return and payment",
        period: `Quarter ended ${formatIsoDateLong(quarter.end)}`,
        detail: "Filed through Making Tax Digital software. Late returns score penalty points.",
        source: "calculated",
      });
    }
    quarter = vatQuarterFor(addDays(quarter.end, 1), firstQuarterEndMonth);
  }
  return out;
}

function selfAssessmentDeadlines(from: string, to: string): Deadline[] {
  const out: Deadline[] = [];
  for (let year = Number(from.slice(0, 4)) - 1; year <= Number(to.slice(0, 4)); year++) {
    // Tax year ending 5 April `year`.
    const taxYear = `Tax year ${year - 1}–${String(year).slice(2)}`;
    out.push({
      kind: "self_assessment",
      dueDate: `${year + 1}-01-31`,
      label: "Self Assessment return and payment",
      period: taxYear,
      detail: "Online return, balancing payment and first payment on account for the next year.",
      source: "calculated",
    });
    out.push({
      kind: "payment_on_account",
      dueDate: `${year + 1}-07-31`,
      label: "Second payment on account",
      period: taxYear,
      detail: "Only if your last tax bill was over £1,000 and less than 80% was taxed at source.",
      source: "calculated",
    });
  }
  return out.filter((d) => d.dueDate >= from && d.dueDate <= to);
}

/** Statutory deadlines due between `from` and `to` inclusive, soonest first. */
export function listDeadlines(inputs: DeadlineInputs, from: string, to: string): Deadline[] {
  const all = [
    ...(inputs.entityType === "limited_company"
      ? ltdDeadlines(inputs, from, to)
      : selfAssessmentDeadlines(from, to)),
    ...(inputs.vatRegistered ? vatDeadlines(inputs.vatQuarterEndMonth, from, to) : []),
  ];
  return all
    .filter((d) => d.dueDate >= from && d.dueDate <= to)
    .sort(
      (a, b) =>
        a.dueDate.localeCompare(b.dueDate) ||
        DEADLINE_KINDS.indexOf(a.kind) - DEADLINE_KINDS.indexOf(b.kind),
    );
}

export function deadlineStatus(dueDate: string, today: string, done: boolean): DeadlineStatus {
  if (done) return "done";
  if (dueDate < today) return "overdue";
  if (dueDate <= addDays(today, DUE_SOON_DAYS)) return "due_soon";
  return "upcoming";
}

/** Stable key for a deadline, matching a `deadline_filings` row. */
export function deadlineKey(d: { kind: string; dueDate: string }): string {
  return `${d.kind}:${d.dueDate}`;
}
