import { formatIsoDateLong, formatIsoDateUk } from "@/lib/dates";
import { formatGBP } from "@/lib/money";
import { formatReimbursementRef } from "@/lib/references";
import { runChecks, type Check, type CheckItem } from "@/lib/year-end/checks";
import type {
  PackExpense,
  PackInvoice,
  PackMatch,
  YearEndData,
} from "@/lib/year-end/data";
import { NO_CATEGORY, WRITE_OFF_CATEGORY, type Figures, type Prepayment } from "@/lib/year-end/figures";
import {
  NOTHING_TO_REPORT,
  buildNotes,
  hasContent,
  type NoteResponses,
  type Notes,
} from "@/lib/year-end/notes";
import { TAB } from "@/lib/year-end/tabs";
import {
  NONE_IN_PERIOD,
  businessWord,
  expenseStatusKey,
  expenseStatusText,
  humanise,
} from "@/lib/year-end/labels";
import { periodLabel } from "@/lib/year-end/period";
import {
  Layout,
  bold,
  day,
  detailTab,
  heading,
  money,
  number,
  type Column,
  type DetailTab,
  type PackCell,
  type PackSheet,
  type Row,
} from "@/lib/year-end/sheets";

export { TAB };

/** Column widths of the Notes tab: a wide first column for sentences, then figures, then confirmations and explanations. */
const NOTES_COLUMN_WIDTHS = [64, 22, 24, 24, 26, 30, 36];

export type WorkbookOptions = {
  /** Include the VAT tab: the business is VAT registered and the plan has VAT export. */
  includeVat: boolean;
  /** The date of the export (YYYY-MM-DD). */
  exportedOn: string;
  /** What the owner has confirmed and explained for this period, by note item. */
  responses?: NoteResponses;
  /** Files written to the zip, so cells only link to ones that are there. */
  invoiceFile?: (invoiceId: string) => string | undefined;
  creditNoteFile?: (creditNoteId: string) => string | undefined;
  receiptFiles?: (expenseId: string) => string[];
};

export type Workbook = {
  sheets: PackSheet[];
  /** Tabs left out because they would be empty. */
  omitted: string[];
  checks: Check[];
  /** The Notes for the accountant tab as data, for the Year end page to preview. */
  notes: Notes;
};

const NOT_PROVIDED = "Not provided";

/** The whole workbook for a period: tabs in order, empty ones left out, with the checks it was built with. */
export function buildWorkbook(
  data: YearEndData,
  figures: Figures,
  options: WorkbookOptions,
): Workbook {
  const { period, company, isLimited } = data;
  const vat = figures.vat;
  const cash = data.basis === "cash";
  const business = businessWord(isLimited);
  const personName = (id: string | null | undefined) =>
    data.people.get(id ?? "")?.name ?? null;
  const ref = (expense: PackExpense) => figures.expenseRef.get(expense.id) ?? "";

  const periodRows = (layout: Layout) => {
    layout.add("Period start", day(period.from));
    layout.add("Period end", day(period.to));
  };

  // --- Sales invoices --------------------------------------------------------

  const settledOn = (invoice: PackInvoice) =>
    [
      ...invoice.payments.map((p) => p.receivedOn),
      ...invoice.credits.map((c) => c.issueDate),
      ...invoice.writeOffs.map((w) => w.writtenOffOn),
    ]
      .sort()
      .find((d) => figures.invoiceBalanceAt(invoice, d) <= 0) ?? null;

  const receivedBy = (invoice: PackInvoice, date: string) =>
    invoice.payments
      .filter((p) => p.receivedOn <= date)
      .reduce((total, p) => total + p.amountPence, 0);

  const salesRows: Row[] = [
    ...data.invoices.map((inv): Row => {
      const balance = figures.invoiceBalanceAt(inv, period.to);
      const file = options.invoiceFile?.(inv.id);
      return {
        date: day(inv.issueDate),
        type: "Invoice",
        number: file ? { v: inv.number, file } : inv.number,
        customer: inv.clientName,
        description: inv.lines.join("; "),
        due: day(inv.dueDate),
        net: money(inv.netPence),
        vat: vat ? money(inv.vatPence) : null,
        gross: vat ? money(inv.grossPence) : null,
        received: money(receivedBy(inv, period.to)),
        owed: money(Math.max(0, balance)),
        // Money owed back to the customer has its own column, never a negative debt.
        overpaid: balance < 0 ? money(-balance) : null,
        paidOn: day(settledOn(inv)),
      };
    }),
    ...data.creditNotes.map((note): Row => {
      const file = options.creditNoteFile?.(note.id);
      return {
        date: day(note.issueDate),
        type: "Credit note",
        number: file ? { v: note.number, file } : note.number,
        customer: note.clientName,
        description: `Credit against invoice ${note.invoiceNumber}: ${note.reason}`,
        net: money(-note.netPence),
        vat: vat ? money(-note.vatPence) : null,
        gross: vat ? money(-note.grossPence) : null,
      };
    }),
  ].sort(byDate);
  const sales = detailTab(
    TAB.sales,
    cash
      ? "Invoices and credit notes issued in the period, with what each line was for. On cash basis the profit and loss is taken from Payments received, not from this tab."
      : "Invoices and credit notes issued in the period, with what each line was for and when each was paid. Where a customer has paid more than they owe, the amount owed back to them has its own column.",
    [
      { key: "date", header: "Date issued" },
      { key: "type", header: "Type", keep: true },
      { key: "number", header: "Number" },
      { key: "customer", header: "Customer" },
      { key: "description", header: "What it was for" },
      { key: "due", header: "Due date" },
      { key: "net", header: vat ? "Net (£)" : "Amount (£)", total: true, keep: true },
      { key: "vat", header: "VAT (£)", total: true },
      { key: "gross", header: "Gross (£)", total: true },
      { key: "received", header: "Received by period end (£)", total: true },
      { key: "owed", header: "Owed by customer at period end (£)", total: true },
      { key: "overpaid", header: "Owed back to customer at period end (£)", total: true },
      { key: "paidOn", header: "Date paid in full" },
    ],
    salesRows,
  );

  // --- Payments received (cash basis) ------------------------------------------

  const received = detailTab(
    TAB.received,
    "Money received from customers in the period, and refunds paid back to them. This is the sales income on cash basis.",
    [
      { key: "date", header: "Date" },
      { key: "type", header: "Type" },
      { key: "invoice", header: "Invoice" },
      { key: "customer", header: "Customer" },
      { key: "amount", header: "Amount received (£)", total: true },
      { key: "vat", header: "VAT part (£)", total: true },
      { key: "net", header: vat ? "Net (£)" : "Counted as income (£)", total: true, keep: true },
      { key: "method", header: "How it was paid" },
      { key: "reference", header: "Reference" },
    ],
    data.cashReceipts.map((r): Row => ({
      date: day(r.date),
      type: r.kind === "payment" ? "Payment" : `Refund (credit note ${r.documentNumber})`,
      invoice: r.invoiceNumber,
      customer: r.clientName,
      amount: vat ? money(r.amountPence) : null,
      vat: vat ? money(r.amountPence - r.netPence) : null,
      net: money(r.netPence),
      method: humanise(r.method),
      reference: r.reference,
    })),
  );

  // --- Other income -------------------------------------------------------------

  const otherIncome = detailTab(
    TAB.otherIncome,
    "Money received that was not for an invoice, such as interest or grants, on the date it reached the bank.",
    [
      { key: "date", header: "Date" },
      { key: "account", header: "Bank account" },
      { key: "category", header: "Type of income", keep: true },
      { key: "from", header: "Received from" },
      { key: "note", header: "Note" },
      { key: "amount", header: "Amount (£)", total: true, keep: true },
    ],
    figures.otherIncome.map((tx): Row => {
      const match = tx.matches.find((m) => m.matchType === "other_income")!;
      return {
        date: day(tx.bookedAt),
        account: tx.bankAccountName,
        category: match.incomeCategory?.trim() || "Other",
        from: tx.counterparty,
        note: match.note,
        amount: money(tx.amountPence),
      };
    }),
  );

  // --- Expenses -----------------------------------------------------------------

  const receiptCell = (expense: PackExpense): PackCell => {
    const files = options.receiptFiles?.(expense.id) ?? [];
    if (files.length === 0) return null;
    const names = files.map((f) => f.slice(f.lastIndexOf("/") + 1)).join(", ");
    return { v: names, file: files[0] };
  };
  const expenseRows: Row[] = [
    ...figures.periodExpenses.map((e): Row => {
      const paidByOwner = figures.paidByOwner(e);
      return {
        date: day(e.spentAt),
        ref: ref(e),
        paid: cash ? day(figures.expensePaidOn(e)) : null,
        description: e.description,
        category: e.category ?? NO_CATEGORY,
        status: expenseStatusText(e.status, { isLimited, paidByOwner }),
        paidBy: paidByOwner ? null : e.status === "company_paid" ? null : personName(e.paidByUserId),
        gross: vat ? money(e.amountPence) : null,
        vat: vat ? money(e.vatPence) : null,
        net: money(figures.expenseNetPence(e)),
        miles: number(e.mileageMiles),
        rate: number(e.mileageMiles ? e.mileageRatePence : null),
        rebill: e.billable ? (e.billableClientName ?? "Yes") : null,
        coversFrom: day(e.coversFrom),
        coversTo: day(e.coversTo),
        notes: e.note,
        receipt: receiptCell(e),
      };
    }),
    // On cash basis an amount that was never received is not an expense.
    ...(cash
      ? []
      : data.writeOffs.map((w): Row => ({
          date: day(w.writtenOffOn),
          ref: w.invoiceNumber,
          description: `Unpaid balance of invoice ${w.invoiceNumber} (${w.clientName}) written off${w.note ? `: ${w.note}` : ""}`,
          category: WRITE_OFF_CATEGORY[w.kind],
          status: "Written off",
          gross: vat ? money(w.amountPence) : null,
          net: money(w.amountPence),
        }))),
  ].sort(byDate);
  const expenses = detailTab(
    TAB.expenses,
    cash
      ? `What the ${business} paid for in the period, by the date it was paid. The Ref matches the receipt file name.`
      : `What the ${business} spent in the period, by the date it was spent, and invoice balances written off. The Ref matches the receipt file name.`,
    [
      { key: "date", header: "Date spent" },
      { key: "ref", header: "Ref" },
      { key: "paid", header: "Date paid" },
      { key: "description", header: "Description" },
      { key: "category", header: "Category", keep: true },
      { key: "status", header: "How it was paid" },
      { key: "paidBy", header: "Paid by" },
      { key: "gross", header: "Amount paid (£)", total: true },
      { key: "vat", header: "VAT (£)", total: true },
      { key: "net", header: vat ? "Net (£)" : "Amount (£)", total: true, keep: true },
      { key: "miles", header: "Miles", total: true },
      { key: "rate", header: "Pence per mile" },
      { key: "rebill", header: "Recharged to" },
      { key: "coversFrom", header: "Covers from" },
      { key: "coversTo", header: "Covers to" },
      { key: "notes", header: "Notes" },
      { key: "receipt", header: "Receipt file" },
    ],
    expenseRows,
  );

  // --- Bank transactions --------------------------------------------------------

  const matchText = (match: PackMatch): string => {
    const label = (() => {
      switch (match.matchType) {
        case "invoice_payment":
          return match.invoiceNumber ? `Invoice ${match.invoiceNumber}` : "Invoice payment";
        case "expense": {
          const expense = data.expenses.get(match.expenseId ?? "");
          const expenseRef = expense ? ref(expense) : "";
          if (expenseRef) return `Expense ${expenseRef}`;
          return expense
            ? `Expense dated ${formatIsoDateUk(expense.spentAt) ?? "with no date"}, outside this period: ${expense.description}`
            : "Expense";
        }
        case "reimbursement": {
          const run = data.reimbursements.find((r) => r.id === match.reimbursementId);
          const payee = personName(run?.payeeUserId);
          const label = run ? `Reimbursement ${formatReimbursementRef(run.refNumber)}` : "Reimbursement";
          return payee ? `${label} to ${payee}` : label;
        }
        case "other_income":
          return `Other income: ${match.incomeCategory?.trim() || "Other"}`;
        case "transfer":
          return "Transfer between accounts";
        case "tax_or_loan":
          return "Tax or loan";
        case "drawings":
          return "Drawings";
        case "money_put_in":
          return "Money put in";
        case "salary": {
          const person = personName(match.personUserId);
          return person ? `Salary: ${person}` : "Salary";
        }
      }
    })();
    return match.note?.trim() ? `${label} (${match.note.trim()})` : label;
  };
  const running = new Map(data.bankAccounts.map((a) => [a.id, a.startBalancePence]));
  const bank = detailTab(
    TAB.bank,
    "Every bank transaction in the period, oldest first, with the running balance and what each was matched to.",
    [
      { key: "date", header: "Date" },
      { key: "account", header: "Bank account", keep: true },
      { key: "who", header: "Paid to or from" },
      { key: "reference", header: "Reference" },
      { key: "description", header: "Description" },
      { key: "category", header: "Category" },
      { key: "amount", header: "Amount (£)", total: true, keep: true },
      { key: "balance", header: "Balance (£)" },
      { key: "matched", header: "Matched to" },
      { key: "notes", header: "Notes" },
    ],
    data.bankTransactions.map((tx): Row => {
      const before = running.get(tx.bankAccountId);
      const balance = before == null ? null : before + tx.amountPence;
      running.set(tx.bankAccountId, balance);
      return {
        date: day(tx.bookedAt),
        account: tx.bankAccountName,
        who: tx.counterparty,
        reference: tx.reference,
        description: tx.description === tx.counterparty ? null : tx.description,
        category: tx.spendingCategory,
        amount: money(tx.amountPence),
        // Shown even at nil: a balance of zero is still a balance.
        balance: balance == null ? null : { v: balance, kind: "money" },
        matched: tx.matches.map(matchText).join("; "),
        notes: tx.note,
      };
    }),
  );

  // --- Reimbursements -----------------------------------------------------------

  // A sole trader repaying themselves is drawings, not a reimbursement.
  const runs = figures.reimbursementRuns;
  const reimbursementsSheet = (() => {
    if (runs.length === 0) return null;
    const layout = new Layout();
    const columns: Column[] = [
      { key: "paidOn", header: "Date paid", keep: true },
      { key: "run", header: "Ref", keep: true },
      { key: "payee", header: "Paid to" },
      { key: "reference", header: "Reference" },
      { key: "bank", header: "Date on bank statement" },
      { key: "ref", header: "Expense ref" },
      { key: "spent", header: "Date spent" },
      { key: "description", header: "Description" },
      { key: "amount", header: "Amount (£)", keep: true },
      { key: "note", header: "Note" },
    ];
    const rows: Row[] = runs.flatMap((run) => {
      const items = run.expenseIds.map((id) => data.expenses.get(id)!);
      return [
        {
          paidOn: { v: run.paidOn, kind: "date" },
          run: bold(formatReimbursementRef(run.refNumber)),
          payee: bold(personName(run.payeeUserId) ?? "Person not recorded"),
          reference: run.reference,
          bank: day(run.bank?.bookedAt),
          description: bold(`${items.length} ${items.length === 1 ? "expense" : "expenses"}`),
          amount: money(run.totalPence, { bold: true }),
        } satisfies Row,
        ...items.map((e): Row => ({
          ref: ref(e),
          spent: day(e.spentAt),
          description: e.description,
          amount: money(e.amountPence),
          note: e.spentAt && e.spentAt < period.from ? "Dated before this period" : null,
        })),
      ];
    });
    const table = layout.table(columns, rows);
    const paidOn = table.letter("paidOn")!;
    const amount = table.letter("amount")!;
    // Only a reimbursement's own row has a date paid, so this adds up the runs, not their items.
    layout.add(
      ...Array.from({ length: amount.charCodeAt(0) - 65 }, (_, i) => (i === 0 ? bold("Total reimbursed") : null)),
      money(runs.reduce((total, r) => total + r.totalPence, 0), {
        bold: true,
        formula: `SUMIF(${paidOn}${table.first}:${paidOn}${table.last},"<>",${amount}${table.first}:${amount}${table.last})`,
      }),
    );
    return layout.sheet(
      TAB.reimbursements,
      `Amounts paid back to people in the period for ${business} costs they paid personally, with the expenses each one covered.`,
      { freezeRows: 1 },
    );
  })();

  // --- Shareholders and dividends (limited company) -------------------------------

  const sharesSheet = (() => {
    if (!isLimited || (data.shareholders.length === 0 && data.dividends.length === 0)) return null;
    const layout = new Layout();
    layout.add(heading("Shareholders and dividends"));
    periodRows(layout);
    layout.gap();
    layout.add(bold("Shareholders at the date of export"));
    layout.add("Total shares in issue", data.totalShares ? number(data.totalShares) : NOT_PROVIDED);
    if (data.shareholders.length === 0) {
      layout.add(NONE_IN_PERIOD, number(0));
    } else {
      layout.table(
        [
          { key: "name", header: "Full name" },
          { key: "shares", header: "Shares held", total: true },
          { key: "percent", header: "Percentage held (%)", total: true },
        ],
        data.shareholders.map((s): Row => ({
          name: s.name,
          shares: number(s.shareCount),
          percent: number(s.percent == null ? null : Number(s.percent.toFixed(2))),
        })),
      );
    }
    layout.gap();
    layout.add(bold("Dividends declared in the period"));
    if (data.dividends.length === 0) {
      layout.add(NONE_IN_PERIOD, money(0));
    } else {
      layout.table(
        [
          { key: "date", header: "Date declared" },
          { key: "name", header: "Shareholder" },
          { key: "shares", header: "Shares held" },
          { key: "amount", header: "Amount (£)", total: true },
          { key: "notes", header: "Notes" },
        ],
        data.dividends.map((d): Row => ({
          date: day(d.declaredAt),
          name: d.shareholderName,
          shares: number(d.shareCount),
          amount: money(d.amountPence),
          notes: d.notes,
        })),
      );
    }
    return layout.sheet(
      TAB.shares,
      "Who holds the company's shares, and the dividends declared in the period.",
    );
  })();

  // --- Outside the period -----------------------------------------------------------

  const laterPayments = data.invoices.flatMap((invoice) =>
    invoice.payments
      .filter((p) => p.receivedOn > period.to)
      .map((payment) => ({ invoice, payment })),
  );
  const earlierItems = figures.reimbursedEarlier;
  const outsideSheet = (() => {
    const sections =
      laterPayments.length + earlierItems.length + figures.awaitingReimbursement.length + figures.paidFromBankLater.length;
    if (sections === 0) return null;
    const layout = new Layout();
    layout.add(heading("Outside the period"));
    periodRows(layout);
    layout.add(
      "These records are dated outside the period but explain balances at the period end. None of them is counted in the profit and loss.",
    );
    if (laterPayments.length > 0) {
      layout.gap();
      layout.add(bold("Payments received after the period end for invoices issued in the period"));
      layout.table(
        [
          { key: "date", header: "Date received" },
          { key: "invoice", header: "Invoice" },
          { key: "customer", header: "Customer" },
          { key: "amount", header: "Amount (£)", total: true },
        ],
        laterPayments
          .map(({ invoice, payment }): Row => ({
            date: day(payment.receivedOn),
            invoice: invoice.number,
            customer: invoice.clientName,
            amount: money(payment.amountPence),
          }))
          .sort(byDate),
      );
    }
    if (earlierItems.length > 0) {
      layout.gap();
      layout.add(bold("Reimbursed in the period for expenses dated before it"));
      layout.table(
        [
          { key: "date", header: "Date reimbursed" },
          { key: "payee", header: "Paid to" },
          { key: "ref", header: "Expense ref" },
          { key: "spent", header: "Date spent" },
          { key: "description", header: "Description" },
          { key: "amount", header: "Amount (£)", total: true },
        ],
        earlierItems.map(({ run, expense }): Row => ({
          date: day(run.paidOn),
          payee: personName(run.payeeUserId),
          ref: ref(expense),
          spent: day(expense.spentAt),
          description: expense.description,
          amount: money(expense.amountPence),
        })),
      );
    }
    if (figures.awaitingReimbursement.length > 0) {
      layout.gap();
      layout.add(bold("Expenses awaiting reimbursement at the period end"));
      layout.table(
        [
          { key: "spent", header: "Date spent" },
          { key: "ref", header: "Expense ref" },
          { key: "paidBy", header: "Paid by" },
          { key: "description", header: "Description" },
          { key: "amount", header: "Amount (£)", total: true },
          { key: "reimbursed", header: "Date later reimbursed" },
        ],
        figures.awaitingReimbursement.map((e): Row => ({
          spent: day(e.spentAt),
          ref: ref(e),
          paidBy: personName(e.paidByUserId) ?? "Person not recorded",
          description: e.description,
          amount: money(e.amountPence),
          reimbursed: day(e.reimbursementPaidOn),
        })),
      );
    }
    if (figures.paidFromBankLater.length > 0) {
      layout.gap();
      layout.add(bold("Bank payments made after the period end for expenses dated in the period"));
      layout.table(
        [
          { key: "date", header: "Date on bank statement" },
          { key: "ref", header: "Expense ref" },
          { key: "spent", header: "Date spent" },
          { key: "description", header: "Description" },
          { key: "amount", header: "Amount (£)", total: true },
        ],
        figures.paidFromBankLater.map((e): Row => ({
          date: day(e.bank!.bookedAt),
          ref: ref(e),
          spent: day(e.spentAt),
          description: e.description,
          amount: money(-e.bank!.amountPence),
        })),
      );
    }
    return layout.sheet(
      TAB.outside,
      "Records dated outside the period that explain balances at the period end. Not counted in the profit and loss.",
    );
  })();

  // --- Checks, with the summary figures tied back to their tabs ----------------------

  const ties: CheckItem[] = [];
  const tie = (label: string, summaryPence: number, detailPence: number, tab: string) => {
    if (summaryPence !== detailPence) {
      ties.push({
        text: `${label}: the summary shows ${formatGBP(summaryPence)} but the ${tab} tab adds up to ${formatGBP(detailPence)}`,
      });
    }
  };
  const pnl = figures.pnl;
  if (cash) {
    tie("Money received from customers", pnl.cashReceivedPence, received.total("net"), TAB.received);
  } else {
    tie("Sales invoices less credit notes", pnl.salesPence - pnl.creditNotesPence, sales.total("net"), TAB.sales);
  }
  tie(
    "Other income",
    pnl.otherIncome.reduce((total, r) => total + r.pence, 0),
    otherIncome.total("amount"),
    TAB.otherIncome,
  );
  for (const row of pnl.expenses) {
    tie(row.category, row.pence, expenses.totalWhere("net", "category", row.category), TAB.expenses);
  }
  tie("Total expenses", pnl.totalExpensesPence, expenses.total("net"), TAB.expenses);
  tie(
    "Bank movement in the period",
    data.bankAccounts.reduce((total, a) => total + a.movementPence, 0),
    bank.total("amount"),
    TAB.bank,
  );
  const checks = runChecks(data, figures, ties);

  // --- Notes for the accountant ---------------------------------------------------------

  const notes = buildNotes(data, figures, checks, options.responses ?? new Map());
  const notesSheet = (() => {
    const layout = new Layout();
    layout.add(heading(TAB.notes));
    periodRows(layout);
    layout.add(
      `What the ${business}'s records show, with questions for the accountant and what the ${business} has confirmed or explained. Every figure comes from the same records as the tab named beside it.`,
    );
    for (const section of notes.sections) {
      layout.gap();
      layout.add(bold(`${section.letter}. ${section.title}`));
      if (!hasContent(section)) {
        layout.add(NOTHING_TO_REPORT);
        continue;
      }
      for (const [i, note] of section.notes.filter((n) => n.lines.length > 0).entries()) {
        if (i > 0) layout.gap();
        for (const line of note.lines) {
          if (line.kind === "figure") layout.add(line.label, line.value, line.where ?? null);
          else if (line.kind === "table") layout.table(line.columns, line.rows);
          else if (line.kind === "question") layout.add(bold(`Question: ${line.text}`));
          else layout.add(line.text);
        }
      }
    }
    return layout.sheet(
      TAB.notes,
      `What the records show, questions for the accountant, what the ${business} has confirmed and explained, and the records the checks picked out. Read this first.`,
      { columnWidths: NOTES_COLUMN_WIDTHS },
    );
  })();

  // --- Profit and loss ----------------------------------------------------------------

  const pnlSheet = (() => {
    const layout = new Layout();
    layout.add(heading("Profit and loss"));
    periodRows(layout);
    layout.add(
      cash
        ? "These figures are on the cash basis: income counts on the date it was received and expenses on the date they were paid."
        : "These figures are on the accruals basis: sales count on the date the invoice was issued and expenses on the date they were incurred, whether or not money had moved.",
    );
    layout.add(
      `${vat ? "Amounts are shown before VAT." : `The ${business} is not VAT registered, so amounts include any VAT paid.`} Other income counts on the date it reached the bank.`,
    );
    layout.gap();
    layout.add(bold("Item"), bold("Amount (£)"), bold("Where the detail is"));

    const sumIf = (tab: DetailTab, whereKey: string, cell: string | null, literal?: string) => {
      const where = tab.range(whereKey);
      const amounts = tab.range(tab === otherIncome ? "amount" : "net");
      if (!where || !amounts) return undefined;
      // Exact match on the label, so a category can't act as a wildcard.
      return `SUMPRODUCT((${where}=${cell ?? `"${literal}"`})*${amounts})`;
    };

    layout.add(bold("Income"));
    const incomeFirst = layout.rows.length + 1;
    if (cash) {
      const range = received.range("net");
      layout.add(
        "Money received from customers",
        money(pnl.cashReceivedPence, { formula: range ? `SUM(${range})` : undefined }),
        received.sheet ? `${TAB.received} tab` : NONE_IN_PERIOD,
      );
    } else {
      layout.add(
        "Sales invoices",
        money(pnl.salesPence, { formula: sumIf(sales, "type", null, "Invoice") }),
        sales.sheet ? `${TAB.sales} tab` : NONE_IN_PERIOD,
      );
      if (pnl.creditNotesPence !== 0) {
        layout.add(
          "Less: credit notes",
          money(-pnl.creditNotesPence, { formula: sumIf(sales, "type", null, "Credit note") }),
          `${TAB.sales} tab`,
        );
      }
    }
    if (pnl.otherIncome.length > 0) {
      layout.add(bold("Other income, by type"));
      for (const row of pnl.otherIncome) {
        const r = layout.rows.length + 1;
        layout.add(
          row.category,
          money(row.pence, { formula: sumIf(otherIncome, "category", `$A${r}`) }),
          `${TAB.otherIncome} tab`,
        );
      }
    }
    const incomeLast = layout.rows.length;
    const totalIncome = layout.add(
      bold("Total income"),
      money(pnl.totalIncomePence, { bold: true, formula: `SUM(B${incomeFirst}:B${incomeLast})` }),
    );

    layout.gap();
    layout.add(bold("Expenses, by category"));
    const expenseFirst = layout.rows.length + 1;
    if (pnl.expenses.length === 0) layout.add(NONE_IN_PERIOD, money(0));
    for (const row of pnl.expenses) {
      const r = layout.rows.length + 1;
      layout.add(
        row.category,
        money(row.pence, { formula: sumIf(expenses, "category", `$A${r}`) }),
        `${TAB.expenses} tab`,
      );
    }
    const expenseLast = layout.rows.length;
    const totalExpenses = layout.add(
      bold("Total expenses"),
      money(pnl.totalExpensesPence, { bold: true, formula: `SUM(B${expenseFirst}:B${expenseLast})` }),
    );

    layout.gap();
    layout.add(
      bold("Profit (or loss) for the period"),
      money(pnl.profitPence, { bold: true, formula: `B${totalIncome}-B${totalExpenses}` }),
    );

    // Information for the accountant; the figures above are left as recorded.
    const carriedForwardPence = figures.possiblePrepayments.reduce((t, p) => t + p.laterPence, 0);
    const broughtForwardPence = figures.prepaymentsBroughtForward.reduce((t, p) => t + p.inPeriodPence, 0);
    if (carriedForwardPence !== 0 || broughtForwardPence !== 0) {
      layout.gap();
      layout.add(bold("Possible prepayment adjustments, not made in the figures above"));
      layout.add(
        "Each expense above counts in full on the date it was spent. These are the parts that cover time in a different period, split by days.",
      );
      if (carriedForwardPence !== 0) {
        layout.add(
          "Included in expenses above, but covering time after the period end",
          money(carriedForwardPence),
          `${TAB.position} tab`,
        );
      }
      if (broughtForwardPence !== 0) {
        layout.add(
          "Not in expenses above: spent in an earlier period, but covering time in this period",
          money(broughtForwardPence),
          `${TAB.position} tab`,
        );
      }
    }
    return layout.sheet(
      TAB.pnl,
      "Income by type, expenses by category and the profit for the period. Each figure adds up the matching detail tab.",
    );
  })();

  // --- Year-end position ----------------------------------------------------------------

  const positionSheet = (() => {
    const layout = new Layout();
    layout.add(heading("Year-end position"));
    periodRows(layout);

    const none = (cell: PackCell = money(0)) => layout.add(NONE_IN_PERIOD, cell);

    layout.gap();
    layout.add(bold("Bank balances"));
    const accounts = data.bankAccounts.filter((a) => a.startBalancePence != null);
    if (accounts.length === 0) {
      none();
    } else {
      layout.add(
        bold("Bank account"),
        bold("Balance at period start (£)"),
        bold("Money in (£)"),
        bold("Money out (£)"),
        bold("Balance at period end (£)"),
      );
      const account = bank.range("account");
      const amount = bank.range("amount");
      const uniqueNames = new Set(accounts.map((a) => a.name.toLowerCase())).size === accounts.length;
      const first = layout.rows.length + 1;
      for (const a of accounts) {
        const lines = data.bankTransactions.filter((t) => t.bankAccountId === a.id);
        const moneyIn = lines.filter((t) => t.amountPence > 0).reduce((t, x) => t + x.amountPence, 0);
        const moneyOut = lines.filter((t) => t.amountPence < 0).reduce((t, x) => t + x.amountPence, 0);
        const r = layout.rows.length + 1;
        const side = (sign: ">" | "<") =>
          account && amount && uniqueNames
            ? `SUMPRODUCT((${account}=$A${r})*(${amount}${sign}0)*${amount})`
            : undefined;
        layout.add(
          a.name,
          { v: a.startBalancePence, kind: "money" },
          { v: moneyIn, kind: "money", formula: side(">") },
          { v: moneyOut, kind: "money", formula: side("<") },
          { v: a.startBalancePence! + moneyIn + moneyOut, kind: "money", formula: `B${r}+C${r}+D${r}` },
        );
      }
      const last = layout.rows.length;
      layout.add(
        bold("Total"),
        ...["B", "C", "D", "E"].map((col, i): PackCell => ({
          v: accounts.reduce(
            (total, a) =>
              total +
              [
                a.startBalancePence!,
                data.bankTransactions.filter((t) => t.bankAccountId === a.id && t.amountPence > 0).reduce((t, x) => t + x.amountPence, 0),
                data.bankTransactions.filter((t) => t.bankAccountId === a.id && t.amountPence < 0).reduce((t, x) => t + x.amountPence, 0),
                a.startBalancePence! + a.movementPence,
              ][i]!,
            0,
          ),
          kind: "money",
          bold: true,
          formula: `SUM(${col}${first}:${col}${last})`,
        })),
      );
    }

    layout.gap();
    layout.add(bold("Invoices issued in the period and unpaid at the period end"));
    if (figures.debtors.length === 0) {
      none();
    } else {
      layout.table(
        [
          { key: "number", header: "Invoice" },
          { key: "date", header: "Date issued" },
          { key: "customer", header: "Customer" },
          { key: "total", header: "Invoice total (£)", total: true },
          { key: "owed", header: "Owed by customer at period end (£)", total: true },
          { key: "paidOn", header: "Date later paid" },
        ],
        figures.debtors.map(({ invoice, balancePence, paidOn }): Row => ({
          number: invoice.number,
          date: day(invoice.issueDate),
          customer: invoice.clientName,
          total: money(invoice.grossPence),
          owed: money(balancePence),
          paidOn: paidOn ? day(paidOn) : "Not yet paid in full",
        })),
      );
    }

    layout.gap();
    layout.add(
      bold("Amounts owed back to customers at the period end, on invoices issued in the period"),
    );
    if (figures.owedToCustomers.length === 0) {
      none();
    } else {
      layout.table(
        [
          { key: "number", header: "Invoice" },
          { key: "date", header: "Date issued" },
          { key: "customer", header: "Customer" },
          { key: "total", header: "Invoice total (£)", total: true },
          { key: "received", header: "Received by period end (£)", total: true },
          { key: "owed", header: "Owed back to customer (£)", total: true },
          { key: "refundedOn", header: "Date later refunded" },
        ],
        figures.owedToCustomers.map(({ invoice, pence, refundedOn }): Row => ({
          number: invoice.number,
          date: day(invoice.issueDate),
          customer: invoice.clientName,
          total: money(invoice.grossPence),
          received: money(receivedBy(invoice, period.to)),
          owed: money(pence),
          refundedOn: refundedOn ? day(refundedOn) : "Not yet refunded",
        })),
      );
      layout.add(
        "These customers have paid more than they owe: they overpaid, or a paid invoice was later credited. The amount is owed back to them (a creditor) and is not sales income.",
      );
    }

    layout.gap();
    layout.add(
      bold(
        `Possible fixed assets: equipment costing more than ${formatGBP(company.fixedAssetThresholdPence)}`,
      ),
    );
    if (figures.possibleFixedAssets.length === 0) {
      none();
    } else {
      layout.table(
        [
          { key: "ref", header: "Expense ref" },
          { key: "date", header: "Date spent" },
          { key: "description", header: "Description" },
          { key: "amount", header: vat ? "Net (£)" : "Amount (£)", total: true },
        ],
        figures.possibleFixedAssets.map((e): Row => ({
          ref: ref(e),
          date: day(e.spentAt),
          description: e.description,
          amount: money(figures.expenseNetPence(e)),
        })),
      );
    }

    layout.gap();
    if (cash) {
      layout.add(bold("Possible prepayments"));
      layout.add(
        "Not listed: on the cash basis a cost counts in full on the date it was paid, whatever period it covers.",
      );
    } else {
      const amountHeader = vat ? "Net (£)" : "Amount (£)";
      const prepaymentTable = (rows: Prepayment[]) =>
        layout.table(
          [
            { key: "ref", header: "Expense ref" },
            { key: "date", header: "Date spent" },
            { key: "description", header: "Description" },
            { key: "category", header: "Category" },
            { key: "amount", header: amountHeader, total: true },
            { key: "from", header: "Covers from" },
            { key: "to", header: "Covers to" },
            { key: "before", header: "Part before the period, by days (£)", total: true },
            { key: "within", header: "Part in the period, by days (£)", total: true },
            { key: "later", header: "Part after the period end, by days (£)", total: true },
            { key: "receipt", header: "Receipt file" },
          ],
          rows.map(({ expense: e, beforePence, inPeriodPence, laterPence }): Row => ({
            ref: ref(e),
            date: day(e.spentAt),
            description: e.description,
            category: e.category ?? NO_CATEGORY,
            amount: money(figures.expenseNetPence(e)),
            from: day(e.coversFrom ?? e.spentAt),
            to: day(e.coversTo),
            // Left blank, not nil, so the column drops out when no row needs it.
            before: beforePence === 0 ? null : money(beforePence),
            within: money(inPeriodPence),
            later: laterPence === 0 ? null : money(laterPence),
            receipt: receiptCell(e),
          })),
        );

      layout.add(bold("Possible prepayments: costs spent in the period that cover time after the period end"));
      if (figures.possiblePrepayments.length === 0) {
        none();
      } else {
        prepaymentTable(figures.possiblePrepayments);
        layout.add(
          `The whole cost is in this period's expenses on the ${TAB.pnl} tab. The part after the period end may belong to later periods.`,
        );
      }

      layout.gap();
      layout.add(bold("Prepayments brought forward: costs spent before the period that cover time in it"));
      if (figures.prepaymentsBroughtForward.length === 0) {
        none();
      } else {
        prepaymentTable(figures.prepaymentsBroughtForward);
        layout.add(
          `None of this cost is in this period's expenses on the ${TAB.pnl} tab: it was counted in full when it was spent. The part in the period may belong to this period, and any part after the period end to later ones.`,
        );
      }
    }

    const labelled = (title: string, rows: { label: string; pence: number }[], header: string) => {
      layout.gap();
      layout.add(bold(title));
      const shown = rows.filter((r) => r.pence !== 0);
      if (shown.length === 0) {
        none();
        return;
      }
      layout.table(
        [
          { key: "label", header },
          { key: "amount", header: "Amount (£)", total: true },
        ],
        shown.map((r): Row => ({ label: r.label, amount: money(r.pence) })),
      );
    };

    if (isLimited) {
      labelled(
        "Amounts owed to directors and employees for expenses not yet reimbursed at the period end",
        figures.owedToPeople.map((p) => ({ label: p.name, pence: p.pence })),
        "Person",
      );
      layout.gap();
      layout.add(bold("Directors' pay in the period"));
      if (figures.directorsPay.length === 0) {
        none();
      } else {
        layout.table(
          [
            { key: "name", header: "Person" },
            { key: "salary", header: "Salary (£)", total: true, keep: true },
            { key: "dividends", header: "Dividends (£)", total: true, keep: true },
            { key: "total", header: "Total (£)", total: true },
          ],
          figures.directorsPay.map((p, i): Row => {
            // Row numbers are known before the table is written: its header is the next row.
            const r = layout.rows.length + 2 + i;
            return {
              name: p.name,
              salary: { v: p.salaryPence, kind: "money" },
              dividends: { v: p.dividendsPence, kind: "money" },
              total: money(p.salaryPence + p.dividendsPence, { formula: `B${r}+C${r}` }),
            };
          }),
        );
        layout.add(
          "Salary is the amount paid from the bank and marked as salary in Alfa. Tax and National Insurance are not recorded in Alfa.",
        );
      }
    } else {
      labelled("Money the owner took out of the business (drawings)", figures.drawings, "How");
      labelled("Money the owner put into the business", figures.moneyPutIn, "How");
      layout.gap();
      layout.add(bold("Business mileage in the period"));
      if (figures.mileage.journeys === 0) {
        none(number(0));
      } else {
        layout.add("Journeys recorded", number(figures.mileage.journeys));
        layout.add("Miles", number(figures.mileage.miles));
        layout.add("Amount claimed (£)", money(figures.mileage.pence));
      }
    }
    return layout.sheet(
      TAB.position,
      isLimited
        ? "Bank balances, unpaid invoices, amounts owed back to customers, possible fixed assets and prepayments, amounts owed to people, and directors' pay."
        : `Bank balances, unpaid invoices, amounts owed back to customers, possible fixed assets${cash ? "" : " and prepayments"}, drawings, money put in, and mileage.`,
    );
  })();

  // --- VAT ----------------------------------------------------------------------------------

  const vatSheet = (() => {
    if (!options.includeVat || !vat) return null;
    const layout = new Layout();
    layout.add(heading("VAT"));
    periodRows(layout);
    layout.add("VAT registration number", company.vatNumber ?? NOT_PROVIDED);
    layout.gap();
    layout.add(bold("Item"), bold("Amount (£)"), bold("Where the detail is"));
    const salesVat = sales.range("vat");
    const expensesVat = expenses.range("vat");
    const onSales = layout.add(
      "VAT charged on sales, less credit notes",
      money(sales.total("vat"), { formula: salesVat ? `SUM(${salesVat})` : undefined }),
      `${TAB.sales} tab`,
    );
    const onPurchases = layout.add(
      "VAT paid on expenses",
      money(expenses.total("vat"), { formula: expensesVat ? `SUM(${expensesVat})` : undefined }),
      `${TAB.expenses} tab`,
    );
    layout.add(
      bold("Difference"),
      money(sales.total("vat") - expenses.total("vat"), { bold: true, formula: `B${onSales}-B${onPurchases}` }),
    );
    layout.gap();
    layout.add("These totals follow the records in this pack. They are not a VAT return.");
    return layout.sheet(TAB.vat, "VAT charged on sales and paid on expenses in the period.");
  })();

  // --- Order, and the cover ---------------------------------------------------------------------

  const ordered: [string, PackSheet | null, boolean][] = [
    [TAB.notes, notesSheet, true],
    [TAB.pnl, pnlSheet, true],
    [TAB.position, positionSheet, true],
    [TAB.vat, vatSheet, options.includeVat && vat],
    [TAB.sales, sales.sheet, true],
    [TAB.received, received.sheet, cash],
    [TAB.otherIncome, otherIncome.sheet, true],
    [TAB.expenses, expenses.sheet, true],
    [TAB.reimbursements, reimbursementsSheet, true],
    [TAB.bank, bank.sheet, true],
    [TAB.shares, sharesSheet, isLimited],
    [TAB.outside, outsideSheet, true],
  ];
  const included = ordered.flatMap(([, sheet]) => (sheet ? [sheet] : []));
  // Only tabs this kind of business could have had are listed as empty.
  const omitted = ordered.filter(([, sheet, applies]) => !sheet && applies).map(([name]) => name);

  const cover = new Layout();
  cover.add(heading(isLimited ? "Year-end accounts pack" : "Self Assessment year pack"));
  cover.add("Accounting period", periodLabel(period));
  periodRows(cover);
  cover.add("Date of export", day(options.exportedOn));
  cover.gap();
  const detail = (label: string, value: string | null | undefined) =>
    cover.add(label, value?.trim() ? value.trim().replace(/\s*\n\s*/g, ", ") : NOT_PROVIDED);
  if (isLimited) {
    detail("Legal name", company.legalName);
    detail("Company number", company.companyNumber);
    detail("Company UTR", company.utr);
    detail("Registered address", company.addressLines);
  } else {
    detail("Owner's name", company.legalName);
    detail("Trading name", company.name);
    detail("Business address", company.addressLines);
    detail("Self Assessment UTR", company.utr);
    cover.add(
      "Date trading started",
      company.tradingStartedOn ? day(company.tradingStartedOn) : NOT_PROVIDED,
    );
    cover.add(
      "Accounting basis",
      data.basis === "cash" ? "Cash basis" : data.basis === "accruals" ? "Traditional accruals" : NOT_PROVIDED,
    );
  }
  if (vat) detail("VAT registration number", company.vatNumber);
  detail("Contact email", company.email);

  cover.gap();
  cover.add(bold("Contents"));
  cover.add(bold("Tab"), bold("What it holds"));
  for (const sheet of included) cover.add(sheet.name, sheet.about);
  if (omitted.length > 0) {
    cover.gap();
    cover.add(bold(NONE_IN_PERIOD));
    for (const name of omitted) cover.add(name, NONE_IN_PERIOD);
  }

  cover.gap();
  cover.add(bold("Key"));
  cover.add(bold("Term"), bold("What it means"));
  for (const [term, meaning] of expenseStatusKey(isLimited)) cover.add(term, meaning);
  cover.add("Question", `On the ${TAB.notes} tab, something the accountant is asked to decide or check.`);
  cover.add(
    "Confirmed by the business",
    `On the ${TAB.notes} tab, a figure the ${business} ticked as checked on the date shown. "Not confirmed" means it has not been ticked, or the figure changed after it was.`,
  );
  cover.add("Ref", "A short reference for each expense. Its receipt file in the receipts folder has the same name.");
  cover.add("Matched to", "The invoice, expense or other record a bank transaction was reconciled against. Blank means nothing has been matched yet.");
  if (vat) cover.add("Net", "The amount before VAT.");
  cover.add("Possible fixed asset", `Equipment costing more than ${formatGBP(company.fixedAssetThresholdPence)}, listed for the accountant to decide how to treat.`);
  if (!cash) {
    cover.add("Possible prepayment", "A cost spent in the period that covers time after the period end, such as an annual subscription or an event held later.");
    cover.add("Prepayment brought forward", "A cost spent before the period that covers time in it.");
  }
  if (!isLimited) {
    cover.add("Drawings", "Money the owner took out of the business for themselves.");
    cover.add("Money put in", "The owner's own money paid into the business, including business costs they paid personally.");
  }
  cover.add(
    "Dates",
    `All dates are day/month/year. This pack was produced on ${formatIsoDateLong(options.exportedOn)} (${formatIsoDateUk(options.exportedOn)}).`,
  );

  return {
    sheets: [cover.sheet(TAB.cover, "The period, who the pack is for, and what each tab holds."), ...included],
    omitted,
    checks,
    notes,
  };
}

/** Rows oldest first by their `date` cell. */
function byDate(a: Row, b: Row): number {
  const value = (row: Row) => {
    const cell = row.date ?? row.spent;
    return cell != null && typeof cell !== "string" ? String(cell.v ?? "") : "";
  };
  return value(a).localeCompare(value(b));
}
