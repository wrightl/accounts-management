import { formatIsoDateUk } from "@/lib/dates";
import { formatGBP } from "@/lib/money";
import { formatExpenseRef } from "@/lib/references";
import type { Check } from "@/lib/year-end/checks";
import type { YearEndData } from "@/lib/year-end/data";
import type { Figures } from "@/lib/year-end/figures";
import { businessWord } from "@/lib/year-end/labels";
import { day, money, number, type Column, type PackCell, type Row } from "@/lib/year-end/sheets";
import { TAB } from "@/lib/year-end/tabs";

/** What the owner has said about one item, as stored. */
export type NoteResponse = {
  explanation: string | null;
  answer: boolean | null;
  /** The UK calendar date it was confirmed; null when it is not. */
  confirmedOn: string | null;
  /** The figure it was confirmed at. */
  confirmedValue: string | null;
  /** Why an earlier confirmation was removed. */
  clearedReason: string | null;
};

export type NoteResponses = ReadonlyMap<string, NoteResponse>;

/** One row of a note as the workbook writes it; the Year end page shows the same rows. */
export type NoteLine =
  | { kind: "text"; text: string }
  | { kind: "question"; text: string }
  /** What the business confirmed, answered or explained. */
  | { kind: "response"; text: string }
  | { kind: "figure"; label: string; value: PackCell; where?: string }
  | { kind: "table"; columns: Column[]; rows: Row[] };

/** Something the owner can confirm, explain or answer on the Year end page. */
export type NoteItem = {
  /** Identifies the stored response. Holds internal IDs, so it is never shown. */
  key: string;
  /** What it is, for the label beside its boxes. */
  label: string;
  /** Set when the item wants a tick: the wording of the tick box and the figure it vouches for. */
  confirm: { text: string; value: string } | null;
  /** The date a confirmation that still stands was given. */
  confirmedOn: string | null;
  /** Why an earlier confirmation no longer stands. */
  cleared: string | null;
  /** Whether a confirmation is stored that no longer stands, and so should be removed. */
  stale: boolean;
  explain: boolean;
  explanation: string | null;
  /** A yes/no question for the owner. */
  yesNo: string | null;
  answer: boolean | null;
};

export type Note = { lines: NoteLine[]; items: NoteItem[] };

export type NotesSection = { letter: string; title: string; notes: Note[] };

export type Notes = {
  sections: NotesSection[];
  /** Items that want a tick and have none that stands. */
  unconfirmed: number;
  /** The date of incorporation (or the date trading started) is not held, so section c cannot be worked out. */
  startDateMissing: boolean;
};

export const NOTHING_TO_REPORT = "Nothing to report";
export const NOT_CONFIRMED = "Not confirmed";
export const CLAIMED_ELSEWHERE_QUESTION =
  "Were any of these already claimed elsewhere, for example on a personal tax return?";
export const OPENING_QUESTION =
  "Does this agree with the amount owed in last year's accounts? If your figure is lower, the difference has not been claimed.";
export const EXPLANATION_HEADER = "Explanation from the business";

export function confirmedText(confirmedOn: string | null): string {
  return confirmedOn
    ? `Confirmed by the business on ${formatIsoDateUk(confirmedOn) ?? confirmedOn}`
    : NOT_CONFIRMED;
}

export function hasContent(section: NotesSection): boolean {
  return section.notes.some((n) => n.lines.length > 0);
}

export function allItems(notes: Notes): NoteItem[] {
  return notes.sections.flatMap((s) => s.notes.flatMap((n) => n.items));
}

const sum = <T,>(rows: readonly T[], value: (row: T) => number) =>
  rows.reduce((total, row) => total + value(row), 0);

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

/** Always shown, even at nil: the reader should see the figure, not a blank. */
const amount = (pence: number): PackCell => ({ v: pence, kind: "money" });

/**
 * The Notes for the accountant: facts and figures from the records the rest of
 * the workbook is built from, questions for the accountant, and what the owner
 * has confirmed or explained. No queries, and no advice.
 */
export function buildNotes(
  data: YearEndData,
  figures: Figures,
  checks: Check[],
  responses: NoteResponses,
): Notes {
  const { period, company, isLimited } = data;
  const business = businessWord(isLimited);
  const start = figures.startDate;
  const startEvent = isLimited ? "incorporation" : "trading started";
  const startLabel = isLimited ? "Date of incorporation" : "Date trading started";

  const item = (
    key: string,
    label: string,
    options: {
      /** The tick box wording and the amount (in pence) it vouches for. */
      confirm?: { text: string; pence: number };
      /** Why a stored confirmation no longer applies, when the item no longer wants one. */
      lapsed?: string;
      explain?: boolean;
      yesNo?: string;
    },
  ): NoteItem => {
    const stored = responses.get(key);
    const confirm = options.confirm
      ? { text: options.confirm.text, value: String(options.confirm.pence) }
      : null;
    const stands = confirm != null && stored?.confirmedOn != null && stored.confirmedValue === confirm.value;
    const stale = stored?.confirmedOn != null && !stands;
    const cleared = stands
      ? null
      : stale
        ? confirm
          ? `The figure was ${formatGBP(Number(stored.confirmedValue))} when you confirmed it and is now ${formatGBP(options.confirm!.pence)}, so the confirmation was removed.`
          : (options.lapsed ?? "The figure this confirmed is no longer in the pack, so the confirmation was removed.")
        : confirm
          ? (stored?.clearedReason ?? null)
          : null;
    return {
      key,
      label,
      confirm,
      confirmedOn: stands ? stored.confirmedOn : null,
      cleared,
      stale,
      explain: options.explain ?? false,
      explanation: options.explain ? (stored?.explanation?.trim() || null) : null,
      yesNo: options.yesNo ?? null,
      answer: options.yesNo ? (stored?.answer ?? null) : null,
    };
  };

  /** What the owner said about an item that is not a row of a table. */
  const responseLines = (i: NoteItem): NoteLine[] => [
    ...(i.confirm ? [{ kind: "response", text: confirmedText(i.confirmedOn) } as const] : []),
    ...(i.yesNo
      ? [
          {
            kind: "response",
            text: `${i.yesNo} The business answered: ${i.answer == null ? "not answered" : i.answer ? "yes" : "no"}.`,
          } as const,
        ]
      : []),
    ...(i.explanation
      ? [{ kind: "response", text: `${EXPLANATION_HEADER}: ${i.explanation}` } as const]
      : []),
  ];
  const explanationColumn: Column = { key: "explanation", header: EXPLANATION_HEADER };

  // --- a. Amounts owed to people ----------------------------------------------------

  const owedNotes: Note[] = [];
  if (figures.owedSplit.length > 0) {
    const items = figures.owedSplit.map((p) =>
      item(`owed:${p.name.toLowerCase()}`, p.name, { explain: true }),
    );
    owedNotes.push({
      lines: [
        {
          kind: "text",
          text: isLimited
            ? "These directors and employees paid company costs personally and had not been paid back at the period end. Each person's amount is split by when the costs are dated."
            : "These people paid business costs personally and had not been paid back at the period end. Each person's amount is split by when the costs are dated. Costs the owner paid personally are left out: they are counted as money the owner put into the business.",
        },
        ...(start
          ? []
          : [
              {
                kind: "text",
                text: `The ${startLabel.toLowerCase()} has not been entered in Alfa, so any costs dated before it are shown under earlier periods.`,
              } as const,
            ]),
        {
          kind: "table",
          columns: [
            { key: "name", header: "Person" },
            ...(start
              ? [{ key: "before", header: `Dated before ${startEvent} (£)`, total: true, keep: true }]
              : []),
            { key: "earlier", header: "Dated in earlier periods (£)", total: true, keep: true },
            { key: "current", header: "Dated in this period (£)", total: true, keep: true },
            { key: "total", header: "Total owed at period end (£)", total: true, keep: true },
            explanationColumn,
          ],
          rows: figures.owedSplit.map((p, i): Row => ({
            name: p.name,
            before: amount(p.beforeStartPence),
            earlier: amount(p.earlierPence),
            current: amount(p.thisPeriodPence),
            total: amount(p.totalPence),
            explanation: items[i]!.explanation,
          })),
        },
        {
          kind: "text",
          text: isLimited
            ? `Each person's total is on the ${TAB.position} tab, and each expense is listed on the ${TAB.outside} tab.`
            : `Each expense is listed on the ${TAB.outside} tab.`,
        },
      ],
      items,
    });
  }

  // --- b. Position at the start of the period -----------------------------------------

  const openingNotes: Note[] = [];
  const reimbursedEarlierPence = sum(figures.reimbursedEarlier, (r) => r.expense.amountPence);
  const unpaidEarlier = figures.awaitingReimbursement.filter((e) => e.spentAt! < period.from);
  const unpaidEarlierPence = sum(unpaidEarlier, (e) => e.amountPence);
  if (figures.reimbursedEarlier.length > 0 || unpaidEarlier.length > 0) {
    const opening = item("opening-owed", "Amount owed at the period start", { explain: true });
    openingNotes.push({
      lines: [
        {
          kind: "text",
          text: `At the period start the ${business} owed people for costs dated before it${isLimited ? "" : " (the owner's own costs are left out)"}. The amount is what was reimbursed during the period for those earlier costs, plus what was still unpaid for them at the period end.`,
        },
        {
          kind: "figure",
          label: "Reimbursed during the period for costs dated before it",
          value: amount(reimbursedEarlierPence),
          where: `${TAB.outside} tab`,
        },
        {
          kind: "figure",
          label: "Still unpaid at the period end for costs dated before it",
          value: amount(unpaidEarlierPence),
          where: `${TAB.outside} tab`,
        },
        {
          kind: "figure",
          label: "Owed at the period start for costs dated before it",
          value: money(reimbursedEarlierPence + unpaidEarlierPence, { bold: true }),
        },
        { kind: "question", text: OPENING_QUESTION },
        ...responseLines(opening),
      ],
      items: [opening],
    });
  }
  if (data.lateExpenses.length > 0) {
    const items = data.lateExpenses.map((e) =>
      item(`late:${e.id}`, `${formatExpenseRef(e.refNumber)} · ${e.description}`, { explain: true }),
    );
    const byExport = data.lateExpenses.some((e) => e.afterExportOn != null);
    const byPeriodStart = data.lateExpenses.some((e) => e.afterExportOn == null);
    openingNotes.push({
      lines: [
        {
          kind: "text",
          text: "These expenses are dated before the period start but were entered in Alfa late, so an earlier pack did not include them. They are not counted in this period's profit and loss.",
        },
        ...(byExport
          ? [
              {
                kind: "text",
                text: "Where an earlier pack's export is on record, an expense is listed when it was entered after that export.",
              } as const,
            ]
          : []),
        ...(byPeriodStart
          ? [
              {
                kind: "text",
                text: byExport
                  ? "For the others no earlier export date is recorded, so the basis used is: dated before the period start and entered on or after it."
                  : "No earlier export date is recorded, so the basis used is: expenses dated before the period start that were entered on or after it.",
              } as const,
            ]
          : []),
        {
          kind: "table",
          columns: [
            { key: "ref", header: "Expense ref" },
            { key: "spent", header: "Date spent" },
            { key: "entered", header: "Date entered" },
            { key: "description", header: "Description" },
            { key: "amount", header: "Amount (£)", total: true, keep: true },
            { key: "basis", header: "Why it is listed" },
            explanationColumn,
          ],
          rows: data.lateExpenses.map((e, i): Row => ({
            ref: formatExpenseRef(e.refNumber),
            spent: day(e.spentAt),
            entered: day(e.enteredOn),
            description: e.description,
            amount: amount(e.amountPence),
            basis: e.afterExportOn
              ? `Entered after an earlier pack was exported on ${formatIsoDateUk(e.afterExportOn)}`
              : "Entered on or after the period start",
            explanation: items[i]!.explanation,
          })),
        },
        { kind: "question", text: "Were these costs included in the accounts for the period they are dated in?" },
      ],
      items,
    });
  }

  // --- c. Costs dated before incorporation or trading start -----------------------------

  const beforeStartNotes: Note[] = [];
  if (start) {
    const reimbursed = figures.reimbursedEarlier.filter((r) => r.expense.spentAt! < start);
    const owed = figures.awaitingReimbursement.filter((e) => e.spentAt! < start);
    const dates = [...reimbursed.map((r) => r.expense.spentAt!), ...owed.map((e) => e.spentAt!)].sort();
    if (dates.length > 0) {
      const claimed = item("pre-start-claimed", "Already claimed elsewhere", {
        yesNo: CLAIMED_ELSEWHERE_QUESTION,
        explain: true,
      });
      beforeStartNotes.push({
        lines: [
          {
            kind: "text",
            text: isLimited
              ? "People paid these costs personally before the company was incorporated."
              : "People other than the owner paid these costs personally before the business started trading.",
          },
          { kind: "figure", label: startLabel, value: day(start) },
          { kind: "figure", label: "Earliest date of these costs", value: day(dates[0]) },
          {
            kind: "figure",
            label: "Reimbursed in the period",
            value: amount(sum(reimbursed, (r) => r.expense.amountPence)),
            where: `${TAB.reimbursements} tab`,
          },
          {
            kind: "figure",
            label: "Still owed at the period end",
            value: amount(sum(owed, (e) => e.amountPence)),
            where: `${TAB.outside} tab`,
          },
          {
            kind: "question",
            text: isLimited
              ? "How should costs dated before incorporation be treated?"
              : "How should costs dated before trading started be treated?",
          },
          ...responseLines(claimed),
        ],
        items: [claimed],
      });
    }
  } else if (figures.reimbursedEarlier.length > 0 || figures.awaitingReimbursement.length > 0) {
    beforeStartNotes.push({
      lines: [
        {
          kind: "text",
          text: `The ${startLabel.toLowerCase()} has not been entered in Alfa, so costs dated before it cannot be picked out here.`,
        },
      ],
      items: [],
    });
  }

  // --- d. Bank ------------------------------------------------------------------------------

  const bankNotes: Note[] = [];
  const accounts = data.bankAccounts.filter((a) => a.startBalancePence != null);
  if (accounts.length > 0) {
    const rows = accounts.map((a) => {
      const opening = a.startBalancePence!;
      const closing = opening + a.movementPence;
      return {
        account: a,
        opening,
        closing,
        open: item(`bank-open:${a.id}`, `${a.name}: balance at period start`, {
          confirm: { text: "I have checked this balance against a bank statement", pence: opening },
        }),
        close: item(`bank-close:${a.id}`, `${a.name}: balance at period end`, {
          confirm: { text: "I have checked this balance against a bank statement", pence: closing },
        }),
        note: item(`bank:${a.id}`, a.name, { explain: true }),
      };
    });
    bankNotes.push({
      lines: [
        {
          kind: "text",
          text: `Opening and closing balances for each bank account. Alfa works them out from one statement balance the ${business} entered and the bank transactions it holds, so each is shown with whether the ${business} has checked it against a statement.`,
        },
        {
          kind: "table",
          columns: [
            { key: "name", header: "Bank account" },
            { key: "opening", header: "Balance at period start (£)", total: true, keep: true },
            { key: "openingConfirmed", header: "Period start balance checked against a statement" },
            { key: "closing", header: "Balance at period end (£)", total: true, keep: true },
            { key: "closingConfirmed", header: "Period end balance checked against a statement" },
            explanationColumn,
          ],
          rows: rows.map((r): Row => ({
            name: r.account.name,
            opening: amount(r.opening),
            openingConfirmed: confirmedText(r.open.confirmedOn),
            closing: amount(r.closing),
            closingConfirmed: confirmedText(r.close.confirmedOn),
            explanation: r.note.explanation,
          })),
        },
        {
          kind: "text",
          text: `The balances are on the ${TAB.position} tab and every transaction is on the ${TAB.bank} tab.`,
        },
      ],
      items: rows.flatMap((r) => [r.open, r.close, r.note]),
    });
  }

  // --- e. Customers ---------------------------------------------------------------------------

  const customerNotes: Note[] = [];
  if (figures.debtors.length > 0) {
    const n = figures.debtors.length;
    customerNotes.push({
      lines: [
        {
          kind: "text",
          text: `${n} ${plural(n, "invoice", "invoices")} issued in the period ${plural(n, "was", "were")} unpaid at the period end. Invoices issued in earlier periods are not included.`,
        },
        {
          kind: "table",
          columns: [
            { key: "number", header: "Invoice" },
            { key: "customer", header: "Customer" },
            { key: "owed", header: "Owed by customer at period end (£)", total: true, keep: true },
            { key: "paidOn", header: "Date later paid" },
          ],
          rows: figures.debtors.map(({ invoice, balancePence, paidOn }): Row => ({
            number: invoice.number,
            customer: invoice.clientName,
            owed: amount(balancePence),
            paidOn: paidOn ? day(paidOn) : "Not yet paid in full",
          })),
        },
        { kind: "text", text: `The same invoices are on the ${TAB.position} tab.` },
      ],
      items: [],
    });
  }
  if (figures.owedToCustomers.length > 0) {
    const items = figures.owedToCustomers.map(({ invoice, pence }) =>
      item(`overpayment:${invoice.id}`, `${invoice.number} · ${invoice.clientName}`, {
        confirm: { text: "This is a real overpayment, owed back to the customer", pence },
        explain: true,
      }),
    );
    const n = figures.owedToCustomers.length;
    customerNotes.push({
      lines: [
        {
          kind: "text",
          text: `On ${n} ${plural(n, "invoice", "invoices")} issued in the period the customer had paid more than they owed at the period end: they overpaid, or a paid invoice was later credited.`,
        },
        {
          kind: "table",
          columns: [
            { key: "number", header: "Invoice" },
            { key: "customer", header: "Customer" },
            { key: "owed", header: "Owed back to customer (£)", total: true, keep: true },
            { key: "refundedOn", header: "Date later refunded" },
            { key: "confirmed", header: "Confirmed as a real overpayment" },
            explanationColumn,
          ],
          rows: figures.owedToCustomers.map(({ invoice, pence, refundedOn }, i): Row => ({
            number: invoice.number,
            customer: invoice.clientName,
            owed: amount(pence),
            refundedOn: refundedOn ? day(refundedOn) : "Not yet refunded",
            confirmed: confirmedText(items[i]!.confirmedOn),
            explanation: items[i]!.explanation,
          })),
        },
        { kind: "text", text: `The same amounts are on the ${TAB.position} tab.` },
        {
          kind: "question",
          text: "Should these amounts be shown as owed to customers at the period end?",
        },
      ],
      items,
    });
  }

  // --- f. Items for the accountant's judgement ---------------------------------------------------

  const judgementNotes: Note[] = [];
  if (figures.possibleFixedAssets.length > 0) {
    const n = figures.possibleFixedAssets.length;
    const fixedAssets = item("fixed-assets", "Possible fixed assets", { explain: true });
    judgementNotes.push({
      lines: [
        {
          kind: "text",
          text: `The ${business} bought equipment costing more than ${formatGBP(company.fixedAssetThresholdPence)} an item in the period.`,
        },
        { kind: "figure", label: "Number of possible fixed assets", value: number(n) },
        {
          kind: "figure",
          label: figures.vat ? "Total cost, before VAT" : "Total cost",
          value: amount(sum(figures.possibleFixedAssets, figures.expenseNetPence)),
          where: `${TAB.position} tab`,
        },
        { kind: "question", text: "Should any of these be treated as fixed assets?" },
        ...responseLines(fixedAssets),
      ],
      items: [fixedAssets],
    });
  }
  const carriedForwardPence = sum(figures.possiblePrepayments, (p) => p.laterPence);
  const broughtForwardPence = sum(figures.prepaymentsBroughtForward, (p) => p.inPeriodPence);
  if (carriedForwardPence !== 0 || broughtForwardPence !== 0) {
    const prepayments = item("prepayments", "Costs covering time in another period", { explain: true });
    judgementNotes.push({
      lines: [
        {
          kind: "text",
          text: "Some costs cover time in a different period from the one they were spent in. Each counts in full on the date it was spent, and the parts below are split by days.",
        },
        {
          kind: "figure",
          label: "Spent in the period, covering time after the period end",
          value: amount(carriedForwardPence),
          where: `${TAB.position} tab`,
        },
        {
          kind: "figure",
          label: "Spent in an earlier period, covering time in this period",
          value: amount(broughtForwardPence),
          where: `${TAB.position} tab`,
        },
        { kind: "question", text: "Should the accounts be adjusted for either amount?" },
        ...responseLines(prepayments),
      ],
      items: [prepayments],
    });
  }
  if (figures.grants.length > 0) {
    const items = figures.grants.map((tx) =>
      item(`grant:${tx.id}`, `Grant of ${formatGBP(tx.amountPence)} from ${tx.counterparty ?? "an unnamed payer"}`, {
        explain: true,
      }),
    );
    const n = figures.grants.length;
    judgementNotes.push({
      lines: [
        {
          kind: "text",
          text: `${n} ${plural(n, "grant was", "grants were")} received in the period and counted as other income.`,
        },
        {
          kind: "table",
          columns: [
            { key: "date", header: "Date received" },
            { key: "from", header: "Received from" },
            { key: "amount", header: "Amount (£)", total: true, keep: true },
            { key: "note", header: "What it was for (note on the bank transaction)" },
            explanationColumn,
          ],
          rows: figures.grants.map((tx, i): Row => ({
            date: day(tx.bookedAt),
            from: tx.counterparty,
            amount: amount(tx.amountPence),
            note:
              tx.matches.find((m) => m.matchType === "other_income")?.note?.trim() ||
              "No note recorded",
            explanation: items[i]!.explanation,
          })),
        },
        { kind: "text", text: `Each one is on the ${TAB.otherIncome} tab.` },
        { kind: "question", text: "How should each grant be treated?" },
      ],
      items,
    });
  }
  if (isLimited) {
    const none = figures.directorsPay.length === 0;
    const pay = item("pay", "Directors' pay and dividends", {
      confirm: none
        ? { text: "There was no directors' pay and there were no dividends in the period", pence: 0 }
        : undefined,
      lapsed:
        "Pay or dividends are now recorded for this period, so the confirmation that there were none was removed.",
      explain: true,
    });
    judgementNotes.push({
      lines: none
        ? [
            {
              kind: "text",
              text: "No directors' pay and no dividends are recorded in Alfa for the period.",
            },
            ...responseLines(pay),
          ]
        : [
            {
              kind: "text",
              text: "Directors' pay and dividends recorded for the period. Salary is the amount paid from the bank and marked as salary in Alfa; tax and National Insurance are not recorded in Alfa.",
            },
            {
              kind: "table",
              columns: [
                { key: "name", header: "Person" },
                { key: "salary", header: "Salary (£)", total: true, keep: true },
                { key: "dividends", header: "Dividends (£)", total: true, keep: true },
                { key: "total", header: "Total (£)", total: true, keep: true },
              ],
              rows: figures.directorsPay.map((p): Row => ({
                name: p.name,
                salary: amount(p.salaryPence),
                dividends: amount(p.dividendsPence),
                total: amount(p.salaryPence + p.dividendsPence),
              })),
            },
            {
              kind: "text",
              text: `The same figures are on the ${TAB.position} tab, and each dividend is on the ${TAB.shares} tab.`,
            },
            ...responseLines(pay),
          ],
      items: [pay],
    });
  } else {
    const drawingsPence = sum(figures.drawings, (r) => r.pence);
    const putInPence = sum(figures.moneyPutIn, (r) => r.pence);
    const noDrawings = figures.drawings.every((r) => r.pence === 0);
    const noMoneyPutIn = figures.moneyPutIn.every((r) => r.pence === 0);
    const pay = item("pay", "Drawings and money put in", {
      confirm: noDrawings
        ? { text: "The owner took no drawings in the period", pence: 0 }
        : undefined,
      lapsed:
        "Drawings are now recorded for this period, so the confirmation that there were none was removed.",
      explain: true,
    });
    judgementNotes.push({
      lines: [
        noDrawings
          ? { kind: "text", text: "No drawings are recorded in Alfa for the period." }
          : {
              kind: "figure",
              label: "Drawings: money the owner took out of the business",
              value: amount(drawingsPence),
              where: `${TAB.position} tab`,
            },
        noMoneyPutIn
          ? { kind: "text", text: "No money put into the business by the owner is recorded in Alfa for the period." }
          : {
              kind: "figure",
              label: "Money the owner put into the business",
              value: amount(putInPence),
              where: `${TAB.position} tab`,
            },
        ...responseLines(pay),
      ],
      items: [pay],
    });
  }

  // --- g. Record-keeping gaps ---------------------------------------------------------------------

  const gapNotes: Note[] = [];
  const failing = checks.filter((c) => c.items.length > 0);
  if (failing.length > 0) {
    const items = failing.map((c) => item(`check:${c.key}`, c.title, { explain: true }));
    gapNotes.push({
      lines: [
        {
          kind: "text",
          text: "Alfa's checks picked out these records for a second look. They are counted in the figures as they stand; nothing has been changed.",
        },
        {
          kind: "table",
          columns: [
            { key: "check", header: "What the check found" },
            { key: "count", header: "Number of records", total: true, keep: true },
            { key: "total", header: "Total value (£)" },
            explanationColumn,
          ],
          rows: failing.map((c, i): Row => ({
            check: c.title,
            count: number(c.items.length),
            // Only where every record has an amount, so the total is never a part-total.
            total: c.items.every((x) => x.pence != null)
              ? amount(sum(c.items, (x) => x.pence!))
              : null,
            explanation: items[i]!.explanation,
          })),
        },
        { kind: "text", text: "Each record the checks found:" },
        {
          kind: "table",
          columns: [
            { key: "check", header: "What to check" },
            { key: "item", header: "Record" },
          ],
          rows: failing.flatMap((c) => c.items.map((x): Row => ({ check: c.title, item: x.text }))),
        },
      ],
      items,
    });
  }

  // --- h. Anything else from the business -----------------------------------------------------------

  const general = item("general", "Anything else the accountant should know", { explain: true });
  const generalNotes: Note[] = [
    {
      lines: general.explanation ? [{ kind: "text", text: general.explanation }] : [],
      items: [general],
    },
  ];

  const sections: NotesSection[] = [
    {
      letter: "a",
      title: isLimited
        ? "Amounts owed to directors and employees for unreimbursed expenses at the period end"
        : "Amounts owed to people for unreimbursed expenses at the period end",
      notes: owedNotes,
    },
    { letter: "b", title: "Position at the start of the period", notes: openingNotes },
    {
      letter: "c",
      title: isLimited ? "Costs dated before incorporation" : "Costs dated before trading started",
      notes: beforeStartNotes,
    },
    { letter: "d", title: "Bank", notes: bankNotes },
    { letter: "e", title: "Customers", notes: customerNotes },
    { letter: "f", title: "Items for the accountant's judgement", notes: judgementNotes },
    { letter: "g", title: "Record-keeping gaps", notes: gapNotes },
    { letter: "h", title: "Anything else from the business", notes: generalNotes },
  ];

  const notes: Notes = { sections, unconfirmed: 0, startDateMissing: start == null };
  notes.unconfirmed = allItems(notes).filter((i) => i.confirm && !i.confirmedOn).length;
  return notes;
}
