/**
 * Builds the demo company's books as plain rows, counted back from `today`.
 * Pure: no database, no clock. The same inputs always give the same rows.
 */
import { sterlingTotals } from "@/lib/currency";
import type {
  accountantQueries,
  accountantQueryMessages,
  auditLog,
  bankAccounts,
  bankSpendingCategories,
  bankTransactionLabels,
  bankTransactions,
  clients,
  companies,
  creditNoteLineItems,
  creditNotes,
  dataOnboarding,
  deadlineFilings,
  directorLoanEntries,
  dividendDeclarations,
  dividendPayouts,
  expenseLabels,
  expenses,
  inboundEmailJobs,
  invoiceLineItems,
  invoices,
  invoiceWriteOffs,
  labels,
  notifications,
  orderLineItems,
  orderPaymentMilestones,
  orders,
  payments,
  quoteDeclineReasonCategories,
  quoteLineItems,
  quotePaymentMilestones,
  quotes,
  quoteVersions,
  reconciliationMatches,
  recurringInvoices,
  reimbursementItems,
  reimbursements,
  sendJobs,
  shareholders,
  weeklyCloses,
  yearEndRuns,
} from "@/db/schema";
import { accountsDueDate, listDeadlines } from "@/lib/deadlines/calc";
import { formatInvoiceNumber } from "@/lib/invoices/numbering";
import { computeNextRunOn } from "@/lib/invoices/recurring";
import { buildReservesSchedule } from "@/lib/ledger/reserves";
import { ctPaymentDueDate } from "@/lib/ledger/corporation-tax";
import { invoiceTotals, type LineItem } from "@/lib/money";
import { vatDueDate, vatQuarterFor } from "@/lib/safe-to-pay/calc";
import { vatFromInclusiveGross } from "@/lib/vat";
import {
  DEMO_FY_END_MONTH,
  DEMO_VAT_QUARTER_END_MONTH,
  addDays,
  addMonths,
  at,
  dayOfMonth,
  daysBetween,
  demoRecordsStart,
  fyEnd,
  fyStart,
  lastWorkdayOfMonth,
  minDate,
  monthLabel,
  monthStarts,
  nextWorkday,
  previousWorkday,
  weekday,
} from "@/lib/demo/calendar";
import { createRandom, type Random } from "@/lib/demo/random";
import {
  ASSOCIATES_CATEGORY,
  DEMO_ASSOCIATES,
  DEMO_CLIENTS,
  DEMO_COMPANY,
  DEMO_DECLINE_REASONS,
  DEMO_DIRECTORS,
  DEMO_LABELS,
  DEMO_MEALS,
  DEMO_MONTHLY_BILLS,
  DEMO_OCCASIONAL,
  DEMO_PROJECTS,
  DEMO_SPECIALS,
  DEMO_TRAVEL,
  DEMO_TRIPS,
  SPENDING_CATEGORY,
  type DemoClientSpec,
  type DemoLabelKey,
  type ExpenseCategory,
} from "@/lib/demo/story";

type Row<T extends { $inferInsert: unknown }> = T["$inferInsert"];

export type DemoPeople = {
  /** The lead director: the demo's admin login. */
  leadId: string;
  /** The second director, who never signs in. */
  secondId: string;
  accountantId: string;
};

export type DemoInput = {
  companyId: string;
  /** YYYY-MM-DD; every date is counted back from here. */
  today: string;
  people: DemoPeople;
  /** Changes the story; leave it alone to get the usual one. */
  seed?: string;
};

/** A receipt image to draw for an expense. */
export type ReceiptSpec = {
  expenseId: string;
  supplier: string;
  description: string;
  date: string;
  amountPence: number;
  vatPence: number;
  vatRate: number;
  usdCents: number | null;
};

export type DemoBooks = {
  company: Partial<Row<typeof companies>>;
  /** First day of the records. */
  recordsStart: string;
  clients: Row<typeof clients>[];
  labels: Row<typeof labels>[];
  spendingCategories: Row<typeof bankSpendingCategories>[];
  declineReasons: Row<typeof quoteDeclineReasonCategories>[];
  quotes: Row<typeof quotes>[];
  quoteVersions: Row<typeof quoteVersions>[];
  quoteLineItems: Row<typeof quoteLineItems>[];
  quoteMilestones: Row<typeof quotePaymentMilestones>[];
  orders: Row<typeof orders>[];
  orderLineItems: Row<typeof orderLineItems>[];
  orderMilestones: Row<typeof orderPaymentMilestones>[];
  recurringInvoices: Row<typeof recurringInvoices>[];
  invoices: Row<typeof invoices>[];
  invoiceLineItems: Row<typeof invoiceLineItems>[];
  payments: Row<typeof payments>[];
  creditNotes: Row<typeof creditNotes>[];
  creditNoteLineItems: Row<typeof creditNoteLineItems>[];
  writeOffs: Row<typeof invoiceWriteOffs>[];
  sendJobs: Row<typeof sendJobs>[];
  inboundEmailJobs: Row<typeof inboundEmailJobs>[];
  expenses: Row<typeof expenses>[];
  expenseLabels: Row<typeof expenseLabels>[];
  receipts: ReceiptSpec[];
  reimbursements: Row<typeof reimbursements>[];
  reimbursementItems: Row<typeof reimbursementItems>[];
  bankAccounts: Row<typeof bankAccounts>[];
  bankTransactions: Row<typeof bankTransactions>[];
  bankTransactionLabels: Row<typeof bankTransactionLabels>[];
  reconciliationMatches: Row<typeof reconciliationMatches>[];
  shareholders: Row<typeof shareholders>[];
  dividendDeclarations: Row<typeof dividendDeclarations>[];
  dividendPayouts: Row<typeof dividendPayouts>[];
  directorLoanEntries: Row<typeof directorLoanEntries>[];
  deadlineFilings: Row<typeof deadlineFilings>[];
  yearEndRuns: Row<typeof yearEndRuns>[];
  weeklyCloses: Row<typeof weeklyCloses>[];
  accountantQueries: Row<typeof accountantQueries>[];
  accountantQueryMessages: Row<typeof accountantQueryMessages>[];
  notifications: Row<typeof notifications>[];
  auditLog: Row<typeof auditLog>[];
  dataOnboarding: Row<typeof dataOnboarding>;
  /** Next number per document kind and issue year. */
  documentSequences: Array<{ kind: "invoice" | "quote" | "order" | "credit_note"; year: number; nextSeq: number }>;
};

// --- Working types -----------------------------------------------------------

type Line = LineItem & {
  description: string;
  vatRate: number;
  discountPercent: number;
  expenseId?: string | null;
};

type ClientState = DemoClientSpec & { id: string; fromMonth: number; untilMonth: number };

type InvoiceDraft = {
  id: string;
  client: ClientState;
  issueDate: string;
  termsDays: number;
  dueDate: string;
  lines: Line[];
  status: "draft" | "sent" | "void";
  kind: "retainer" | "tm" | "milestone" | "special" | "interest";
  orderId?: string;
  milestoneId?: string;
  recurringId?: string;
  latePaymentForId?: string;
  notes?: string;
  /** Leave unpaid whatever the client's habit. */
  unpaid?: boolean;
  /** Pay this much (gross) on this date, leaving the rest owing. */
  partPayment?: { date: string; amountPence: number };
  // Filled in later.
  number: string;
  net: number;
  vat: number;
  gross: number;
  payDate: string | null;
  /** Paid into the bank but not yet recorded against the invoice. */
  unrecordedReceipt?: boolean;
  paidPence: number;
  settledOn: string | null;
};

type ExpenseDraft = {
  id: string;
  description: string;
  supplier: string;
  category: ExpenseCategory;
  spentAt: string;
  amountPence: number;
  vatRate: number;
  paidBy: "company" | "lead" | "second";
  /** How the company paid: card posts a day or two later; transfer the same day. */
  via: "card" | "transfer" | "direct_debit";
  clientId?: string;
  orderId?: string;
  billable?: boolean;
  mileageMiles?: number;
  usdCents?: number;
  coversFrom?: string;
  coversTo?: string;
  labels: DemoLabelKey[];
  notes?: string;
  pending?: { jobId: string; submittedBy: string };
  /** Spent in the last three weeks: may be unmatched in the bank. */
  recent?: "matched" | "suggested" | "unrecorded";
  status?: "company_paid" | "reimbursable" | "reimbursed" | "pending" | "recorded";
  noReceipt?: boolean;
};

type BankEvent = {
  date: string;
  account: "current" | "savings";
  amountPence: number;
  counterparty: string;
  reference: string;
  type: string;
  category: string | null;
  match?: Omit<Row<typeof reconciliationMatches>, "bankTransactionId">;
  labels?: DemoLabelKey[];
  suggestion?: { category: string; reason: string; source: "history" | "ai" };
  notes?: string;
  /** Sort tie-break within a day. */
  order: number;
};

const RECENT_DAYS = 21;

// --- Entry point -------------------------------------------------------------

export function generateDemoBooks(input: DemoInput): DemoBooks {
  return new DemoBuilder(input).build();
}

class DemoBuilder {
  private readonly rng: Random;
  private readonly ids: Random;
  private readonly today: string;
  private readonly companyId: string;
  private readonly people: DemoPeople;
  private readonly start: string;
  private readonly months: string[];
  private readonly openingAsAt: string;
  private readonly incorporatedOn: string;

  private clients: ClientState[] = [];
  private invoices: InvoiceDraft[] = [];
  private expenses: ExpenseDraft[] = [];
  private events: BankEvent[] = [];
  private labelIds = new Map<DemoLabelKey, string>();
  private eventOrder = 0;

  private readonly out: DemoBooks;

  constructor(input: DemoInput) {
    const seed = input.seed ?? "brightwater";
    this.rng = createRandom(`story:${seed}`);
    this.ids = createRandom(`ids:${input.companyId}:${input.today}:${seed}`);
    this.today = input.today;
    this.companyId = input.companyId;
    this.people = input.people;
    this.start = demoRecordsStart(input.today);
    this.months = monthStarts(this.start, input.today);
    this.openingAsAt = addDays(this.start, -1);
    this.incorporatedOn = addDays(addMonths(this.start, -11), 13);
    this.out = emptyBooks(this.start);
  }

  build(): DemoBooks {
    this.buildReferenceData();
    this.buildClients();
    this.buildRetainers();
    this.buildTimeAndMaterials();
    this.buildProjects();
    this.buildOpenQuotes();
    this.buildSpecialInvoices();
    this.buildExpenses();
    this.finaliseInvoices();
    this.settleInvoices();
    this.buildReimbursements();
    this.markRecentWindow();
    this.buildPayroll();
    this.buildTaxAndDividends();
    this.buildDirectorLoan();
    this.buildInterest();
    this.writeInvoices();
    this.writeExpenses();
    this.runBank();
    this.buildCompliance();
    this.buildActivity();
    this.buildCompany();
    this.out.documentSequences = this.sequences();
    return this.out;
  }

  // --- helpers ---------------------------------------------------------------

  private id(): string {
    return this.ids.uuid();
  }

  private monthIndex(date: string): number {
    return (
      (Number(date.slice(0, 4)) - Number(this.start.slice(0, 4))) * 12 +
      Number(date.slice(5, 7)) -
      Number(this.start.slice(5, 7))
    );
  }

  /** 0 at the start of the records, 1 today: drives growth. */
  private progress(date: string): number {
    const total = Math.max(1, daysBetween(this.start, this.today));
    return Math.min(1, Math.max(0, daysBetween(this.start, date) / total));
  }

  /** Day rate in pence, rising each April. */
  private dayRate(date: string): number {
    const years = Number(fyStart(date).slice(0, 4)) - Number(this.start.slice(0, 4));
    return 85_000 + years * 5_000;
  }

  private clientActive(c: ClientState, m: number): boolean {
    return m >= c.fromMonth && m <= c.untilMonth;
  }

  private notAfterToday(date: string): string {
    return minDate(date, this.today);
  }

  private event(e: Omit<BankEvent, "order">) {
    if (e.date > this.today || e.date <= this.openingAsAt) return;
    this.events.push({ ...e, order: this.eventOrder++ });
  }

  private line(description: string, quantity: number, unitPricePence: number, discountPercent = 0): Line {
    return { description, quantity, unitPricePence, vatRate: 20, discountPercent };
  }

  // --- reference data ---------------------------------------------------------

  private buildReferenceData() {
    const c = this.companyId;
    const created = at(this.start, 9);
    for (const l of DEMO_LABELS) {
      const id = this.id();
      this.labelIds.set(l.key, id);
      this.out.labels.push({ id, companyId: c, name: l.name, color: l.color, createdAt: created });
    }
    this.out.spendingCategories.push({ id: this.id(), companyId: c, name: ASSOCIATES_CATEGORY, createdAt: created });
    for (const name of DEMO_DECLINE_REASONS) {
      this.out.declineReasons.push({ id: this.id(), companyId: c, name, createdAt: created });
    }
    this.out.bankAccounts.push(
      {
        id: this.id(),
        companyId: c,
        name: "Starling Business",
        provider: "starling",
        currency: "GBP",
        cardLast4s: ["4417", "9023"],
        openingBalancePence: DEMO_COMPANY.openingCurrentAccountPence,
        openingBalanceDate: this.openingAsAt,
        createdAt: created,
      },
      {
        id: this.id(),
        companyId: c,
        name: "Business Savings",
        provider: "other",
        currency: "GBP",
        openingBalancePence: DEMO_COMPANY.openingSavingsPence,
        openingBalanceDate: this.openingAsAt,
        createdAt: created,
      },
    );
    const lead = this.out.shareholders;
    lead.push(
      {
        id: this.id(),
        companyId: c,
        name: DEMO_DIRECTORS.lead.name,
        shareCount: DEMO_DIRECTORS.lead.shares,
        userId: this.people.leadId,
        createdAt: created,
      },
      {
        id: this.id(),
        companyId: c,
        name: DEMO_DIRECTORS.second.name,
        shareCount: DEMO_DIRECTORS.second.shares,
        userId: this.people.secondId,
        createdAt: created,
      },
    );
  }

  private buildClients() {
    const last = this.months.length - 1;
    const resolve = (v: { start: number } | { end: number }) =>
      Math.max(0, Math.min(last, "start" in v ? v.start : last - v.end));
    for (const spec of DEMO_CLIENTS) {
      const fromMonth = resolve(spec.from);
      const untilMonth = spec.until ? resolve(spec.until) : last;
      const client: ClientState = { ...spec, id: this.id(), fromMonth, untilMonth };
      this.clients.push(client);
      this.out.clients.push({
        id: client.id,
        companyId: this.companyId,
        name: spec.contact,
        companyName: spec.name,
        email: spec.email,
        addressLines: spec.address,
        notes: spec.notes ?? null,
        createdAt: at(this.months[fromMonth]!, 9),
      });
    }
  }

  private client(key: string): ClientState {
    const c = this.clients.find((x) => x.key === key);
    if (!c) throw new Error(`Unknown demo client ${key}`);
    return c;
  }

  private newInvoice(
    client: ClientState,
    issueDate: string,
    lines: Line[],
    kind: InvoiceDraft["kind"],
    extra: Partial<InvoiceDraft> = {},
  ): InvoiceDraft {
    const termsDays = extra.termsDays ?? client.termsDays;
    const draft: InvoiceDraft = {
      id: this.id(),
      client,
      issueDate,
      termsDays,
      dueDate: addDays(issueDate, termsDays),
      lines,
      status: "sent",
      kind,
      number: "",
      net: 0,
      vat: 0,
      gross: 0,
      payDate: null,
      paidPence: 0,
      settledOn: null,
      ...extra,
    };
    this.invoices.push(draft);
    return draft;
  }

  // --- sales --------------------------------------------------------------------

  private buildRetainers() {
    for (const client of this.clients) {
      if (!client.retainerPence) continue;
      const scheduleId = this.id();
      let count = 0;
      let lastIssue: string | null = null;
      let price = client.retainerPence;
      for (let m = client.fromMonth; m <= client.untilMonth; m++) {
        const month = this.months[m]!;
        const issue = dayOfMonth(month, 1);
        if (issue > this.today) break;
        const years = Number(fyStart(issue).slice(0, 4)) - Number(fyStart(this.months[client.fromMonth]!).slice(0, 4));
        price = Math.round((client.retainerPence * 1.05 ** years) / 1000) * 1000;
        this.newInvoice(client, issue, [this.line(`Monthly advisory retainer — ${monthLabel(month)}`, 1, price)], "retainer", {
          recurringId: scheduleId,
        });
        count++;
        lastIssue = issue;
      }
      const enabled = client.untilMonth === this.months.length - 1;
      const lastGeneratedAt = lastIssue ? at(lastIssue, 7) : null;
      this.out.recurringInvoices.push({
        id: scheduleId,
        companyId: this.companyId,
        clientId: client.id,
        name: `${client.name.replace(/ (Ltd|plc|LLP)$/, "")} retainer`,
        lineTemplate: [{ description: "Monthly advisory retainer", quantity: 1, unitPricePence: price, vatRate: 20, discountPercent: 0 }],
        notes: "Thank you for your continued business.",
        dayOfMonth: 1,
        onGenerate: "send",
        endsOn: enabled ? null : lastIssue,
        occurrenceCount: count,
        nextRunOn: enabled ? computeNextRunOn(1, this.today, lastGeneratedAt) : null,
        enabled,
        lastGeneratedAt,
        createdAt: at(this.months[client.fromMonth]!, 8),
      });
    }
  }

  private buildTimeAndMaterials() {
    const current = this.months.length - 1;
    for (const client of this.clients) {
      if (!client.timeAndMaterials) continue;
      for (let m = client.fromMonth; m <= client.untilMonth; m++) {
        const month = this.months[m]!;
        const growth = 0.65 + 0.4 * this.progress(month);
        const days = Math.max(1.5, Math.round(this.rng.int(4, 9) * growth * 2) / 2);
        const rate = this.dayRate(month);
        const discount = client.discountPercent ?? 0;
        const lines = [this.line(`Consultancy — ${monthLabel(month)}`, days, rate, discount)];
        if (this.rng.chance(0.25)) {
          lines.push(this.line("Workshop facilitation", 1, Math.round(rate * 1.2), discount));
        }
        if (m === current) {
          // This month's work is still being written up.
          if (client.key === "northbridge" || client.key === "kestrel") {
            this.newInvoice(client, this.today, lines, "tm", { status: "draft" });
          }
          continue;
        }
        this.newInvoice(client, lastWorkdayOfMonth(month), lines, "tm");
        // Associates deliver part of the work; they invoice early the next month.
        const associateDays = Math.round(days * 0.6 * 2) / 2;
        if (client.key !== "ashgrove" && associateDays >= 1) {
          const associate = DEMO_ASSOCIATES[(m + client.key.length) % DEMO_ASSOCIATES.length]!;
          this.expenses.push({
            id: this.id(),
            description: `Associate days — ${client.name} (${monthLabel(month)})`,
            supplier: associate,
            category: "Professional fees",
            spentAt: nextWorkday(dayOfMonth(addMonths(month, 1), 6)),
            amountPence: Math.round(associateDays * (50_000 + 2_500 * Math.floor(m / 12)) * 1.2),
            vatRate: 20,
            paidBy: "company",
            via: "transfer",
            clientId: client.id,
            labels: [],
          });
        }
      }
    }
  }

  private projectClients(m: number): ClientState[] {
    return this.clients.filter((c) => c.projects && this.clientActive(c, m));
  }

  private projectLines(client: ClientState, date: string, template: (typeof DEMO_PROJECTS)[number], scale: number): Line[] {
    const rate = this.dayRate(date);
    return template.lines.map(([description, days]) =>
      this.line(description, Math.max(1, Math.round(days * scale * 2) / 2), rate, client.discountPercent ?? 0),
    );
  }

  private quoteNumberless(
    client: ClientState,
    issueDate: string,
    lines: Line[],
    status: "draft" | "sent" | "accepted" | "declined",
    extra: Partial<Row<typeof quotes>> = {},
    milestones: Array<{ label: string; bp: number; dueInDays: number }> = [],
    versions: Line[][] = [],
  ): string {
    const id = this.id();
    const totals = invoiceTotals(lines);
    const validUntil = addDays(issueDate, 30);
    const allVersions = [...versions, lines];
    this.out.quotes.push({
      id,
      companyId: this.companyId,
      number: "",
      clientId: client.id,
      status,
      version: allVersions.length,
      issueDate,
      validUntil,
      notes: "Prices exclude VAT. Valid for 30 days.",
      ...sterlingTotals({ netPence: totals.netPence, vatPence: totals.vatPence, grossPence: totals.grossPence }),
      publicToken: status === "draft" ? null : this.ids.hex(48),
      sentAt: status === "draft" ? null : at(issueDate, 11),
      createdByUserId: this.people.leadId,
      createdAt: at(issueDate, 10),
      ...extra,
    });
    allVersions.forEach((v, i) => {
      const t = invoiceTotals(v);
      this.out.quoteVersions.push({
        id: this.id(),
        quoteId: id,
        version: i + 1,
        clientId: client.id,
        issueDate,
        validUntil,
        notes: "Prices exclude VAT. Valid for 30 days.",
        ...sterlingTotals({ netPence: t.netPence, vatPence: t.vatPence, grossPence: t.grossPence }),
        lines: v.map((l, position) => ({
          description: l.description,
          quantity: l.quantity,
          unitPricePence: l.unitPricePence,
          vatRate: l.vatRate,
          discountPercent: l.discountPercent,
          position,
        })),
        source: i === 0 ? "create" : "edit",
        createdByUserId: this.people.leadId,
        createdAt: at(addDays(issueDate, i * 2), 10 + i),
      });
    });
    lines.forEach((l, position) =>
      this.out.quoteLineItems.push({
        id: this.id(),
        quoteId: id,
        description: l.description,
        quantity: l.quantity,
        unitPricePence: l.unitPricePence,
        vatRate: l.vatRate,
        discountPercent: l.discountPercent,
        position,
      }),
    );
    milestones.forEach((ms, position) =>
      this.out.quoteMilestones.push({
        id: this.id(),
        quoteId: id,
        label: ms.label,
        percentBasisPoints: ms.bp,
        dueInDays: ms.dueInDays,
        position,
      }),
    );
    return id;
  }

  /** A won project: quote, order, milestones and the invoices billed so far. */
  private project(client: ClientState, quoteDate: string, acceptAfterDays: number, scale: number, template = this.rng.pick(DEMO_PROJECTS)) {
    const lines = this.projectLines(client, quoteDate, template, scale);
    const acceptedOn = addDays(quoteDate, acceptAfterDays);
    const durationDays = Math.max(21, Math.round(lines.reduce((t, l) => t + l.quantity, 0) * 2.6));
    const plan = [
      { label: "Deposit on acceptance", bp: 3000, offset: 0 },
      { label: "Interim — analysis complete", bp: 4000, offset: Math.round(durationDays / 2) },
      { label: "Completion — final report", bp: 3000, offset: durationDays },
    ];
    const versions = this.rng.chance(0.2)
      ? [lines.map((l) => ({ ...l, quantity: l.quantity + 1 }))]
      : [];

    if (acceptedOn > this.today) {
      this.quoteNumberless(client, quoteDate, lines, "sent", { viewedAt: at(addDays(quoteDate, 1), 14) }, plan.map((p) => ({ label: p.label, bp: p.bp, dueInDays: p.offset })), versions);
      return;
    }

    const orderId = this.id();
    const quoteId = this.quoteNumberless(
      client,
      quoteDate,
      lines,
      "accepted",
      { orderId, acceptedAt: at(acceptedOn, 15), viewedAt: at(addDays(quoteDate, 1), 9), depositOnAccept: false },
      plan.map((p) => ({ label: p.label, bp: p.bp, dueInDays: p.offset })),
      versions,
    );
    const totals = invoiceTotals(lines);
    const milestones = plan.map((p, position) => ({
      id: this.id(),
      orderId,
      label: p.label,
      percentBasisPoints: p.bp,
      dueDate: nextWorkday(addDays(acceptedOn, p.offset)),
      position,
    }));
    let allBilled = true;
    for (const ms of milestones) {
      if (ms.dueDate > addDays(this.today, -3)) {
        allBilled = false;
        continue;
      }
      const gross = Math.round((totals.grossPence * ms.percentBasisPoints) / 10_000);
      const net = Math.round((gross * 100) / 120);
      this.newInvoice(client, ms.dueDate, [{ description: `${ms.label} — {order}`, quantity: 1, unitPricePence: net, vatRate: 20, discountPercent: 0 }], "milestone", {
        orderId,
        milestoneId: ms.id,
      });
    }
    this.out.orders.push({
      id: orderId,
      companyId: this.companyId,
      number: "",
      clientId: client.id,
      quoteId,
      status: allBilled ? "completed" : "active",
      issueDate: acceptedOn,
      notes: template.title,
      ...sterlingTotals({ netPence: totals.netPence, vatPence: totals.vatPence, grossPence: totals.grossPence }),
      createdByUserId: this.people.leadId,
      createdAt: at(acceptedOn, 16),
    });
    lines.forEach((l, position) =>
      this.out.orderLineItems.push({
        id: this.id(),
        orderId,
        description: l.description,
        quantity: l.quantity,
        unitPricePence: l.unitPricePence,
        vatRate: l.vatRate,
        discountPercent: l.discountPercent,
        position,
      }),
    );
    this.out.orderMilestones.push(...milestones);

    // Costs on the project: associates on bigger jobs, travel to the client.
    if (totals.netPence > 500_000) {
      const associate = this.rng.pick(DEMO_ASSOCIATES);
      const cost = Math.round((totals.netPence * this.rng.int(40, 52)) / 100);
      for (const ms of milestones.slice(1)) {
        const date = addDays(ms.dueDate, 6);
        this.expenses.push({
          id: this.id(),
          description: `Associate consultant — ${template.title}`,
          supplier: associate,
          category: "Professional fees",
          spentAt: date,
          amountPence: Math.round((cost / 2) * 1.2),
          vatRate: 20,
          paidBy: "company",
          via: "transfer",
          clientId: client.id,
          orderId,
          labels: [],
        });
      }
    }
    const trips = this.rng.int(1, 3);
    for (let t = 0; t < trips; t++) {
      const date = nextWorkday(addDays(acceptedOn, this.rng.int(3, durationDays)));
      const [supplier, description, category, min, max, vat] = this.rng.pick(DEMO_TRAVEL.slice(0, 3));
      this.expenses.push({
        id: this.id(),
        description: `${description} — ${client.name}`,
        supplier,
        category,
        spentAt: date,
        amountPence: this.rng.pence(min, max, 10),
        vatRate: vat,
        paidBy: this.rng.chance(0.6) ? "company" : this.rng.chance(0.6) ? "lead" : "second",
        via: "card",
        clientId: client.id,
        orderId,
        billable: true,
        labels: ["rechargeable"],
      });
    }
    return orderId;
  }

  private buildProjects() {
    for (let m = 0; m < this.months.length; m++) {
      const month = this.months[m]!;
      const rate = 0.5 + 0.45 * this.progress(month);
      const count = Math.floor(rate) + (this.rng.chance(rate - Math.floor(rate)) ? 1 : 0);
      const candidates = this.projectClients(m);
      for (let i = 0; i < count && candidates.length; i++) {
        const client = this.rng.pick(candidates);
        const quoteDate = nextWorkday(dayOfMonth(month, this.rng.int(2, 20)));
        if (quoteDate > addDays(this.today, -30)) continue;
        this.project(client, quoteDate, this.rng.int(5, 16), 0.8 + this.rng.next() * 0.8);
      }
      // Lost and lapsed quotes.
      if (candidates.length && this.rng.chance(0.4)) {
        const client = this.rng.pick(candidates);
        const issue = nextWorkday(dayOfMonth(month, this.rng.int(5, 25)));
        if (issue < addDays(this.today, -40)) {
          const template = this.rng.pick(DEMO_PROJECTS);
          const lines = this.projectLines(client, issue, template, 0.9 + this.rng.next() * 0.6);
          const reason = this.rng.pick(DEMO_DECLINE_REASONS);
          this.quoteNumberless(client, issue, lines, "declined", {
            declinedAt: at(addDays(issue, this.rng.int(8, 24)), 12),
            declinedReasonCategory: reason,
            declinedReasonNarrative: declineNarrative(reason),
            viewedAt: at(addDays(issue, 1), 10),
          });
        }
      } else if (candidates.length && this.rng.chance(0.08)) {
        const client = this.rng.pick(candidates);
        const issue = nextWorkday(dayOfMonth(month, 12));
        if (issue < addDays(this.today, -45)) {
          // Never answered: shows as expired.
          this.quoteNumberless(client, issue, this.projectLines(client, issue, this.rng.pick(DEMO_PROJECTS), 1), "sent");
        }
      }
    }

    // An order in flight with a milestone ready to bill this week.
    this.project(this.client("vantage"), addDays(this.today, -47), 7, 1.3, DEMO_PROJECTS[1]);
  }

  private buildOpenQuotes() {
    const t = this.today;
    const lines = (key: string, idx: number, scale: number) =>
      this.projectLines(this.client(key), t, DEMO_PROJECTS[idx]!, scale);
    const plan = [
      { label: "Deposit on acceptance", bp: 3000, dueInDays: 0 },
      { label: "Completion", bp: 7000, dueInDays: 45 },
    ];
    this.quoteNumberless(this.client("silverline"), addDays(t, -27), lines("silverline", 5, 1.1), "sent", { viewedAt: at(addDays(t, -25), 10) }, plan);
    this.quoteNumberless(this.client("oakfield"), addDays(t, -12), lines("oakfield", 9, 1.2), "sent", { viewedAt: at(addDays(t, -10), 15) }, plan, [lines("oakfield", 9, 1.5)]);
    this.quoteNumberless(this.client("pennant"), addDays(t, -5), lines("pennant", 3, 1), "sent", { depositOnAccept: true }, plan);
    this.quoteNumberless(this.client("meridian"), addDays(t, -1), lines("meridian", 6, 1.4), "draft");
  }

  /** Invoices that make the aged debtors, write-off and interest features show. */
  private buildSpecialInvoices() {
    const t = this.today;
    const rate = this.dayRate(t);
    const northbridge = this.client("northbridge");
    this.newInvoice(northbridge, previousWorkday(addDays(t, -100)), [this.line("Additional workshop days — housing strategy", 4, rate)], "special", {
      unpaid: true,
      notes: "Chased twice. Their payment run is under review.",
    });
    this.newInvoice(this.client("kestrel"), previousWorkday(addDays(t, -76)), [this.line("Consultancy — supplementary days", 3.5, rate)], "special", { unpaid: true });
    this.newInvoice(this.client("oakfield"), previousWorkday(addDays(t, -41)), [this.line("Governance review — additional session", 2, rate)], "special", { unpaid: true });
    const partial = this.newInvoice(northbridge, previousWorkday(addDays(t, -50)), [this.line("Tenant survey analysis", 8, rate)], "special");
    partial.partPayment = { date: previousWorkday(addDays(t, -12)), amountPence: 0 };
  }

  // --- expenses -----------------------------------------------------------------

  private buildExpenses() {
    const current = this.months.length - 1;
    for (let m = 0; m <= current; m++) {
      const month = this.months[m]!;
      const fyMonth = (Number(month.slice(5, 7)) + 12 - 4) % 12; // 0 = April
      for (const bill of DEMO_MONTHLY_BILLS) {
        if (bill.fromMonth != null && m < bill.fromMonth) continue;
        const usd = bill.usdCents;
        const amount = usd ? Math.round(usd / (1.24 + this.rng.next() * 0.08)) : bill.amountPence;
        this.expenses.push({
          id: this.id(),
          description: bill.description,
          supplier: bill.supplier,
          category: bill.category,
          spentAt: dayOfMonth(month, bill.day),
          amountPence: amount,
          vatRate: bill.vatRate,
          paidBy: "company",
          via: bill.category === "Office" || bill.category === "Professional fees" ? "direct_debit" : "card",
          usdCents: usd,
          labels: bill.category === "Software" ? ["subscription"] : [],
        });
      }
      const growth = 0.7 + 0.6 * this.progress(month);
      const travel = Math.round(this.rng.int(2, 4) * growth);
      for (let i = 0; i < travel; i++) {
        const [supplier, description, category, min, max, vat] = this.rng.pick(DEMO_TRAVEL);
        this.expenses.push({
          id: this.id(),
          description,
          supplier,
          category,
          spentAt: nextWorkday(dayOfMonth(month, this.rng.int(1, 28))),
          amountPence: this.rng.pence(min, max, 10),
          vatRate: vat,
          paidBy: this.rng.chance(0.65) ? "company" : this.rng.chance(0.6) ? "lead" : "second",
          via: "card",
          labels: [],
        });
      }
      const meals = this.rng.int(1, 3);
      for (let i = 0; i < meals; i++) {
        const [supplier, description, category, min, max, vat] = this.rng.pick(DEMO_MEALS);
        this.expenses.push({
          id: this.id(),
          description,
          supplier,
          category,
          spentAt: nextWorkday(dayOfMonth(month, this.rng.int(1, 28))),
          amountPence: this.rng.pence(min, max, 5),
          vatRate: vat,
          paidBy: this.rng.chance(0.6) ? "company" : "lead",
          via: "card",
          labels: description === "Client lunch" ? ["entertaining"] : [],
        });
      }
      for (const [supplier, description, category, min, max, vat] of DEMO_OCCASIONAL) {
        const p =
          supplier === "ProNetwork Ads" ? (m >= 6 ? 0.6 : 0) :
          category === "Training" ? 0.18 :
          supplier === "OfficeHub Supplies" ? 0.5 : 0.1;
        if (!this.rng.chance(p)) continue;
        this.expenses.push({
          id: this.id(),
          description,
          supplier,
          category,
          spentAt: nextWorkday(dayOfMonth(month, this.rng.int(2, 26))),
          amountPence: this.rng.pence(min, max, 100),
          vatRate: vat,
          paidBy: "company",
          via: "card",
          labels: [],
        });
      }
      // Mileage in the directors' own cars.
      const trips = this.rng.int(0, 2);
      for (let i = 0; i < trips; i++) {
        const [from, to, miles] = this.rng.pick(DEMO_TRIPS);
        const total = miles * 2;
        const lead = this.rng.chance(0.6);
        this.expenses.push({
          id: this.id(),
          description: `Mileage: ${from} to ${to} and back`,
          supplier: lead ? DEMO_DIRECTORS.lead.name : DEMO_DIRECTORS.second.name,
          category: "Travel",
          spentAt: nextWorkday(dayOfMonth(month, this.rng.int(2, 27))),
          amountPence: total * 45,
          vatRate: 0,
          paidBy: lead ? "lead" : "second",
          via: "card",
          mileageMiles: total,
          labels: [],
          noReceipt: true,
        });
      }
      // Once a year: insurance and hosting (prepayments), a conference stand.
      if (fyMonth === DEMO_SPECIALS.insurance.month) {
        const s = DEMO_SPECIALS.insurance;
        const spent = dayOfMonth(month, 9);
        this.expenses.push({
          id: this.id(), description: s.description, supplier: s.supplier, category: s.category,
          spentAt: spent, amountPence: s.amountPence, vatRate: s.vatRate, paidBy: "company", via: "direct_debit",
          coversFrom: spent, coversTo: addDays(addMonths(spent, 12), -1), labels: [],
        });
      }
      if (fyMonth === DEMO_SPECIALS.hosting.month) {
        const s = DEMO_SPECIALS.hosting;
        const spent = dayOfMonth(month, 14);
        this.expenses.push({
          id: this.id(), description: s.description, supplier: s.supplier, category: s.category,
          spentAt: spent, amountPence: s.amountPence, vatRate: s.vatRate, paidBy: "company", via: "card",
          coversFrom: spent, coversTo: addDays(addMonths(spent, 12), -1), labels: ["subscription"],
        });
      }
      if (fyMonth === 6) {
        const s = DEMO_SPECIALS.conference;
        this.expenses.push({
          id: this.id(), description: s.description, supplier: s.supplier, category: s.category,
          spentAt: nextWorkday(dayOfMonth(month, 16)), amountPence: s.amountPence, vatRate: s.vatRate,
          paidBy: "company", via: "transfer", labels: ["conference"],
        });
      }
      if (m % 13 === 4) {
        const s = DEMO_SPECIALS.laptop;
        this.expenses.push({
          id: this.id(), description: s.description, supplier: s.supplier, category: s.category,
          spentAt: nextWorkday(dayOfMonth(month, 11)), amountPence: s.amountPence, vatRate: s.vatRate,
          paidBy: "company", via: "card", labels: ["accountant"],
          notes: "Over the fixed asset threshold: claim capital allowances.",
        });
      }
      if (m % 9 === 7) {
        const s = DEMO_SPECIALS.monitor;
        this.expenses.push({
          id: this.id(), description: s.description, supplier: s.supplier, category: s.category,
          spentAt: nextWorkday(dayOfMonth(month, 19)), amountPence: s.amountPence, vatRate: s.vatRate,
          paidBy: "company", via: "card", labels: [],
        });
      }
    }

    // Recharge travel on the next milestone invoice for the order.
    for (const e of this.expenses) {
      if (!e.billable || !e.orderId || e.spentAt > this.today) continue;
      const next = this.invoices
        .filter((i) => i.orderId === e.orderId && i.issueDate >= addDays(e.spentAt, 2))
        .sort((a, b) => a.issueDate.localeCompare(b.issueDate))[0];
      if (!next) continue;
      const net = e.amountPence - vatFromInclusiveGross(e.amountPence, e.vatRate);
      next.lines.push({
        description: `Rechargeable expenses: ${e.description.split(" — ")[0]!.toLowerCase()} (${formatShortDate(e.spentAt)})`,
        quantity: 1,
        unitPricePence: net,
        vatRate: 20,
        discountPercent: 0,
        expenseId: e.id,
      });
    }

    this.expenses = this.expenses.filter((e) => e.spentAt <= this.today && e.spentAt > this.openingAsAt);
  }

  // --- invoices --------------------------------------------------------------

  private finaliseInvoices() {
    this.invoices = this.invoices.filter((i) => i.issueDate <= this.today && i.issueDate > this.openingAsAt);
    this.invoices.sort((a, b) => a.issueDate.localeCompare(b.issueDate) || a.kind.localeCompare(b.kind));

    // A mistake, voided and raised again.
    const mistake = this.invoices.find((i) => i.kind === "tm" && i.client.key === "kestrel" && this.monthIndex(i.issueDate) >= 5);
    if (mistake) {
      const voided = this.newInvoice(mistake.client, mistake.issueDate, mistake.lines.map((l) => ({ ...l, unitPricePence: Math.round(l.unitPricePence * 0.9) })), "tm", {
        status: "void",
        notes: "Raised at last year's day rate in error. Replaced by the next invoice.",
      });
      this.invoices.pop();
      this.invoices.splice(this.invoices.indexOf(mistake), 0, voided);
    }

    const quotes = [...this.out.quotes].sort((a, b) => a.issueDate!.localeCompare(b.issueDate!)) as Array<{ number: string; issueDate: string }>;
    assignNumbers(quotes, "Q");
    const orders = [...this.out.orders].sort((a, b) => a.issueDate!.localeCompare(b.issueDate!)) as Array<{ number: string; issueDate: string }>;
    assignNumbers(orders, "O");
    const orderNumbers = new Map(this.out.orders.map((o) => [o.id!, o.number]));

    for (const inv of this.invoices) {
      for (const l of inv.lines) {
        if (inv.orderId) l.description = l.description.replace("{order}", orderNumbers.get(inv.orderId) ?? "");
      }
      this.total(inv);
    }
    const partial = this.invoices.find((i) => i.partPayment);
    if (partial?.partPayment) partial.partPayment.amountPence = Math.round(partial.gross / 2);
  }

  private total(inv: InvoiceDraft) {
    const t = invoiceTotals(inv.lines);
    inv.net = t.netPence;
    inv.vat = t.vatPence;
    inv.gross = t.grossPence;
  }

  private payDateFor(inv: InvoiceDraft): string {
    const habit = inv.client.habit;
    const offset =
      habit === "prompt" ? this.rng.int(-9, -1) : habit === "average" ? this.rng.int(-4, 9) : this.rng.int(3, 28);
    const earliest = addDays(inv.issueDate, 3);
    const d = addDays(inv.dueDate, offset);
    return nextWorkday(d < earliest ? earliest : d);
  }

  private settleInvoices() {
    const t = this.today;
    const ashgrove = this.client("ashgrove");
    const ashgroveInvoices = this.invoices.filter((i) => i.client.key === "ashgrove" && i.status === "sent");
    const badDebts = new Set(ashgroveInvoices.slice(-2).map((i) => i.id));

    // 1. When each invoice gets paid, by the client's habits.
    for (const inv of this.invoices) {
      if (inv.status !== "sent" || inv.unpaid || badDebts.has(inv.id)) continue;
      if (inv.partPayment) {
        inv.payDate = inv.partPayment.date;
        continue;
      }
      const payDate = this.payDateFor(inv);
      if (payDate <= t) inv.payDate = payDate;
    }

    // Two client payments arrived in the bank this week but aren't recorded yet.
    this.invoices
      .filter((i) => i.payDate && !i.partPayment && i.payDate >= addDays(t, -9))
      .sort((a, b) => b.payDate!.localeCompare(a.payDate!))
      .slice(0, 2)
      .forEach((i) => (i.unrecordedReceipt = true));

    // A late payer: claim statutory interest once.
    const late = this.invoices.find(
      (i) => i.client.key === "northbridge" && i.payDate && !i.partPayment && daysBetween(i.dueDate, i.payDate) >= 20 && i.issueDate < addDays(t, -150),
    );
    if (late) {
      const daysLate = daysBetween(late.dueDate, late.payDate!);
      const issue = nextWorkday(addDays(late.payDate!, 5));
      const interest = this.newInvoice(late.client, issue, [
        { description: `Statutory interest on {late} (${daysLate} days late at 12.75% a year)`, quantity: 1, unitPricePence: Math.round((late.gross * 0.1275 * daysLate) / 365), vatRate: 0, discountPercent: 0 },
        { description: "Fixed compensation (Late Payment of Commercial Debts Act 1998)", quantity: 1, unitPricePence: late.gross >= 1_000_000 ? 10_000 : 7_000, vatRate: 0, discountPercent: 0 },
      ], "interest", { latePaymentForId: late.id });
      this.total(interest);
      const pay = nextWorkday(addDays(issue, 26));
      if (pay <= t) interest.payDate = pay;
    }

    // 2. Number the invoices by issue date, once everything is raised.
    this.invoices.sort((a, b) => a.issueDate.localeCompare(b.issueDate));
    assignNumbers(this.invoices, DEMO_COMPANY.invoiceNumberPrefix);
    if (late) {
      for (const inv of this.invoices) {
        for (const l of inv.lines) l.description = l.description.replace("{late}", late.number);
      }
    }

    // 3. Credit notes, write-offs, payments and the money in the bank.
    const disputed = this.invoices.find(
      (i) => i.client.key === "copperfield" && i.kind === "tm" && i.payDate && !i.unrecordedReceipt && i.lines[0]!.quantity >= 5 && i.issueDate < addDays(t, -150),
    );
    let disputedCredit = 0;
    if (disputed) {
      disputedCredit = this.creditNote(disputed, addDays(disputed.issueDate, 12), [
        { description: "Credit for one day not delivered (workshop rescheduled by us)", quantity: 1, unitPricePence: disputed.lines[0]!.unitPricePence, vatRate: 20, discountPercent: 0 },
      ], "Client queried one day on the timesheet; agreed it wasn't delivered.");
    }
    const refunded = this.invoices.find(
      (i) => i.client.key === "meridian" && i.kind === "milestone" && i.payDate && !i.unrecordedReceipt && i.issueDate < addDays(t, -200),
    );
    if (refunded) {
      const cnDate = addDays(refunded.payDate!, 15);
      const gross = this.creditNote(refunded, cnDate, [
        { description: "Refund for cancelled final workshop", quantity: 1, unitPricePence: Math.round(refunded.net * 0.25), vatRate: 20, discountPercent: 0 },
      ], "Final workshop cancelled by the client at short notice; refunded as agreed.", true);
      this.event({
        date: nextWorkday(addDays(cnDate, 4)),
        account: "current",
        amountPence: -gross,
        counterparty: refunded.client.name,
        reference: `Refund ${refunded.number}`,
        type: "FASTER PAYMENT",
        category: "REVENUE",
        match: { matchType: "transfer", note: `Refund to client for the credit note on ${refunded.number}`, confirmed: true },
      });
    }
    const charged = this.invoices.find(
      (i) => i.client.key === "kestrel" && i.kind === "tm" && i.payDate && !i.unrecordedReceipt && this.monthIndex(i.issueDate) >= 12,
    );

    for (const inv of this.invoices) {
      if (!inv.payDate) continue;
      if (inv.partPayment) {
        this.addPayment(inv, inv.partPayment.date, inv.partPayment.amountPence);
        continue;
      }
      if (inv.unrecordedReceipt) {
        this.event({
          date: inv.payDate,
          account: "current",
          amountPence: inv.gross,
          counterparty: inv.client.name,
          reference: inv.number,
          type: "FASTER PAYMENT",
          category: "REVENUE",
          match: { matchType: "invoice_payment", invoiceId: inv.id, confirmed: false, note: `Amount and reference match ${inv.number}` },
        });
        continue;
      }
      let amount = inv.gross;
      if (inv === disputed) amount -= disputedCredit;
      if (inv === charged) {
        amount -= 1500;
        this.out.writeOffs.push({
          id: this.id(),
          companyId: this.companyId,
          invoiceId: inv.id,
          kind: "bank_charges",
          amountPence: 1500,
          amountMinor: 1500,
          writtenOffOn: inv.payDate,
          note: "Transfer fee deducted by the client's bank",
          createdByUserId: this.people.leadId,
          createdAt: at(inv.payDate, 16),
        });
      }
      this.addPayment(inv, inv.payDate, amount);
      inv.settledOn = inv.payDate;
    }

    // Ashgrove went into administration: write the last invoices off.
    const adminDate = addMonths(this.months[ashgrove.untilMonth]!, 4);
    for (const inv of this.invoices.filter((i) => badDebts.has(i.id))) {
      const on = nextWorkday(maxOf(adminDate, addDays(inv.dueDate, 90)));
      if (on > t) continue;
      this.out.writeOffs.push({
        id: this.id(),
        companyId: this.companyId,
        invoiceId: inv.id,
        kind: "bad_debt",
        amountPence: inv.gross,
        amountMinor: inv.gross,
        writtenOffOn: on,
        note: "Ashgrove Manufacturing entered administration; the administrators confirmed unsecured creditors will receive nothing.",
        createdByUserId: this.people.leadId,
        createdAt: at(on, 11),
      });
      inv.settledOn = on;
    }
  }

  private addPayment(inv: InvoiceDraft, date: string, amountPence: number) {
    const paymentId = this.id();
    this.out.payments.push({
      id: paymentId,
      invoiceId: inv.id,
      amountPence,
      amountMinor: amountPence,
      method: "Bank transfer",
      reference: inv.number,
      receivedAt: at(date, 10, 30),
    });
    inv.paidPence += amountPence;
    this.event({
      date,
      account: "current",
      amountPence,
      counterparty: inv.client.name,
      reference: this.rng.chance(0.7) ? inv.number : `Remittance ${inv.number}`,
      type: "FASTER PAYMENT",
      category: "REVENUE",
      match: { matchType: "invoice_payment", paymentId, invoiceId: inv.id, confirmed: true },
    });
  }

  private creditNote(inv: InvoiceDraft, issueDate: string, lines: Line[], reason: string, refund = false): number {
    const id = this.id();
    const t = invoiceTotals(lines);
    this.out.creditNotes.push({
      id,
      companyId: this.companyId,
      invoiceId: inv.id,
      clientId: inv.client.id,
      number: "",
      status: "issued",
      issueDate,
      reason,
      ...sterlingTotals({ netPence: t.netPence, vatPence: t.vatPence, grossPence: t.grossPence }),
      refundedPence: refund ? t.grossPence : 0,
      refundedAt: refund ? nextWorkday(addDays(issueDate, 4)) : null,
      refundReference: refund ? `Refund ${inv.number}` : null,
      sentAt: at(issueDate, 14),
      createdByUserId: this.people.leadId,
      createdAt: at(issueDate, 13),
    });
    lines.forEach((l, position) =>
      this.out.creditNoteLineItems.push({
        id: this.id(),
        creditNoteId: id,
        description: l.description,
        quantity: l.quantity,
        unitPricePence: l.unitPricePence,
        vatRate: l.vatRate,
        discountPercent: l.discountPercent,
        position,
      }),
    );
    return t.grossPence;
  }

  // --- reimbursements -----------------------------------------------------------

  /** The month whose claims are in a run still waiting to be paid: last month's in the first week. */
  private pendingRunMonth(): string {
    const current = this.months[this.months.length - 1]!;
    return Number(this.today.slice(8, 10)) <= 7 ? addMonths(current, -1) : current;
  }

  private buildReimbursements() {
    const currentMonth = this.months[this.months.length - 1]!;
    const pendingMonth = this.pendingRunMonth();
    // Always something in the waiting run.
    const [from, to, miles] = DEMO_TRIPS[1]!;
    const claimed = pendingMonth === currentMonth ? previousWorkday(addDays(this.today, -2)) : addDays(lastWorkdayOfMonth(pendingMonth), -3);
    this.expenses.push({
      id: this.id(), description: `Mileage: ${from} to ${to} and back`, supplier: DEMO_DIRECTORS.lead.name,
      category: "Travel", spentAt: claimed < pendingMonth ? pendingMonth : claimed, amountPence: miles * 2 * 45,
      vatRate: 0, paidBy: "lead", via: "card", mileageMiles: miles * 2, labels: [], noReceipt: true,
    });
    const people = [
      { key: "lead" as const, userId: this.people.leadId, name: DEMO_DIRECTORS.lead.name },
      { key: "second" as const, userId: this.people.secondId, name: DEMO_DIRECTORS.second.name },
    ];
    for (const month of this.months) {
      for (const p of people) {
        const items = this.expenses.filter(
          (e) => e.paidBy === p.key && e.spentAt.slice(0, 7) === month.slice(0, 7),
        );
        if (items.length === 0) continue;
        const total = items.reduce((s, e) => s + e.amountPence, 0);
        const runId = this.id();
        if (month === currentMonth || month === pendingMonth) {
          for (const e of items) e.status = "reimbursable";
          if (p.key !== "lead" || month !== pendingMonth) continue;
          // The lead's claims this month are in a run waiting to be paid.
          this.out.reimbursements.push({
            id: runId, companyId: this.companyId, payeeUserId: p.userId, status: "pending",
            totalPence: total, createdAt: at(addDays(this.today, -1), 9),
          });
          for (const e of items) this.out.reimbursementItems.push({ id: this.id(), reimbursementId: runId, expenseId: e.id });
          continue;
        }
        const paidOn = lastWorkdayOfMonth(month);
        for (const e of items) e.status = "reimbursed";
        this.out.reimbursements.push({
          id: runId, companyId: this.companyId, payeeUserId: p.userId, status: "paid",
          totalPence: total, reference: `Expenses ${monthLabel(month)}`, reimbursementDate: paidOn,
          createdAt: at(addDays(paidOn, -1), 9), paidAt: at(paidOn, 12),
        });
        for (const e of items) this.out.reimbursementItems.push({ id: this.id(), reimbursementId: runId, expenseId: e.id });
        this.event({
          date: paidOn, account: "current", amountPence: -total, counterparty: p.name,
          reference: `Expenses ${monthLabel(month)}`, type: "FASTER PAYMENT", category: "STAFF",
          match: { matchType: "reimbursement", reimbursementId: runId, confirmed: true },
        });
      }
    }
  }

  /** Last three weeks: some bank lines matched, some suggested, some not yet recorded. */
  private markRecentWindow() {
    const from = addDays(this.today, -RECENT_DAYS);
    const recentCard = this.expenses.filter(
      (e) => e.paidBy === "company" && e.spentAt >= from && !e.billable && !e.orderId,
    );
    recentCard.forEach((e, i) => {
      e.recent = i % 4 === 1 ? "suggested" : i % 4 === 3 && e.category !== "Office" ? "unrecorded" : "matched";
    });
    // Receipts emailed in this week, waiting for review.
    const pending: Array<[string, string, ExpenseCategory, number, string]> = [
      ["The Copper Kettle", "Client lunch — Silverline kick-off", "Meals", 6_840, "second"],
      ["RailPass UK", "Train to Cardiff — Northbridge board meeting", "Travel", 9_420, "lead"],
      ["OfficeHub Supplies", "Flip chart pads and markers", "Office", 3_699, "second"],
    ];
    pending.forEach(([supplier, description, category, amount, who], i) => {
      const jobId = this.id();
      const date = previousWorkday(addDays(this.today, -(i * 2 + 1)));
      this.expenses.push({
        id: this.id(), description, supplier, category, spentAt: date, amountPence: amount,
        vatRate: category === "Travel" ? 0 : 20,
        paidBy: who === "lead" ? "lead" : "company",
        via: "card", labels: [], status: "pending",
        pending: { jobId, submittedBy: who === "lead" ? this.people.leadId : this.people.secondId },
      });
    });
    // A few recent receipts are missing, for the year-end checks.
    this.expenses
      .filter((e) => e.spentAt >= addDays(this.today, -60) && !e.mileageMiles && e.category !== "Software")
      .slice(0, 5)
      .forEach((e) => (e.noReceipt = true));
    this.expenses = this.expenses.filter((e) => e.recent !== "unrecorded" || this.recordUnrecorded(e));
  }

  /** Put an unrecorded card spend in the bank only; returns false to drop the expense. */
  private recordUnrecorded(e: ExpenseDraft): boolean {
    this.event({
      date: this.cardPostDate(e),
      account: "current",
      amountPence: -e.amountPence,
      counterparty: e.supplier,
      reference: e.supplier.toUpperCase().slice(0, 18),
      type: "CARD PAYMENT",
      category: null,
      suggestion: {
        category: SPENDING_CATEGORY[e.category],
        reason: `You put earlier payments to ${e.supplier} in ${titleCase(SPENDING_CATEGORY[e.category])}`,
        source: "history",
      },
    });
    return false;
  }

  private cardPostDate(e: ExpenseDraft): string {
    if (e.via === "card") return nextWorkday(addDays(e.spentAt, (e.amountPence % 3) === 0 ? 1 : 2));
    return nextWorkday(e.spentAt);
  }

  // --- payroll, tax, dividends -----------------------------------------------------

  private buildPayroll() {
    for (const month of this.months) {
      const payday = previousWorkday(dayOfMonth(month, 25));
      for (const [userId, name] of [
        [this.people.leadId, DEMO_DIRECTORS.lead.name],
        [this.people.secondId, DEMO_DIRECTORS.second.name],
      ] as const) {
        this.event({
          date: payday, account: "current", amountPence: -104_750, counterparty: name,
          reference: "Salary", type: "FASTER PAYMENT", category: "STAFF",
          match: { matchType: "salary", personUserId: userId, confirmed: true, note: `Director's salary ${monthLabel(month)}` },
        });
      }
    }
  }

  /** Profit the way the app's P&L works it out, from the generated records. */
  private profit(from: string, to: string): number {
    const inRange = (d: string | null | undefined) => d != null && d >= from && d <= to;
    let p = 0;
    for (const i of this.invoices) if (i.status === "sent" && inRange(i.issueDate)) p += i.net;
    for (const c of this.out.creditNotes) if (inRange(c.issueDate)) p -= c.netPence ?? 0;
    for (const e of this.expenses) {
      if (e.status === "pending" || !inRange(e.spentAt)) continue;
      p -= e.amountPence - vatFromInclusiveGross(e.amountPence, e.vatRate);
    }
    for (const w of this.out.writeOffs) if (inRange(w.writtenOffOn)) p -= w.amountPence;
    p += this.interestBetween(from, to);
    return p;
  }

  private interestAmount(month: string): number {
    return 2_400 + this.monthIndex(month) * 260 + (this.monthIndex(month) * 37) % 300;
  }

  private interestDate(month: string): string {
    return nextWorkday(dayOfMonth(month, 1));
  }

  private interestBetween(from: string, to: string): number {
    let total = 0;
    for (const month of this.months) {
      const d = this.interestDate(month);
      if (d >= from && d <= to && d <= this.today) total += this.interestAmount(month);
    }
    return total;
  }

  private vatBetween(from: string, to: string): number {
    const inRange = (d: string | null | undefined) => d != null && d >= from && d <= to;
    let v = 0;
    for (const i of this.invoices) if (i.status === "sent" && inRange(i.issueDate)) v += i.vat;
    for (const c of this.out.creditNotes) if (inRange(c.issueDate)) v -= c.vatPence ?? 0;
    for (const e of this.expenses) {
      if (e.status === "pending" || !inRange(e.spentAt)) continue;
      v -= vatFromInclusiveGross(e.amountPence, e.vatRate);
    }
    return v;
  }

  private fyEnds(): string[] {
    const ends: string[] = [];
    for (let e = fyEnd(this.start); e < this.today; e = fyEnd(addDays(e, 1))) ends.push(e);
    return ends;
  }

  private buildTaxAndDividends() {
    const t = this.today;
    // VAT: each finished quarter, paid a few days before it's due.
    for (let q = vatQuarterFor(this.start, DEMO_VAT_QUARTER_END_MONTH); q.end < t; q = vatQuarterFor(addDays(q.end, 1), DEMO_VAT_QUARTER_END_MONTH)) {
      const due = vatDueDate(q.end);
      const paid = previousWorkday(addDays(due, -3));
      if (paid > t) continue;
      const amount = this.vatBetween(q.start, q.end);
      this.event({
        date: paid, account: "current", amountPence: -amount, counterparty: "HMRC VAT",
        reference: `${DEMO_COMPANY.vatNumber.replace(/\s/g, "")} ${q.end.slice(0, 7)}`, type: "FASTER PAYMENT", category: "TAX",
        match: { matchType: "tax_or_loan", confirmed: true, note: `VAT return for the quarter ended ${q.end}` },
      });
      this.out.deadlineFilings.push({
        id: this.id(), companyId: this.companyId, kind: "vat_return", dueDate: due, filedOn: paid,
        filedByUserId: this.people.leadId, createdAt: at(paid, 11),
      });
    }

    // Dividends twice a year, sized from the reserves at the time.
    const declared: Array<{ date: string; amount: number }> = [];
    const years = () => {
      const out: Array<{ start: string; end: string }> = [];
      for (let s = this.start; s <= t; s = addDays(fyEnd(s), 1)) out.push({ start: s, end: fyEnd(s) });
      return out;
    };
    const reservesAt = (date: string): number => {
      const ys = years().filter((y) => y.start <= date);
      const schedule = buildReservesSchedule({
        openingReservesPence: DEMO_COMPANY.openingReservesPence,
        years: ys.map((y) => {
          const current = date <= y.end;
          return {
            start: y.start,
            end: y.end,
            profitPence: this.profit(y.start, current ? date : y.end),
            dividendsPence: declared.filter((d) => d.date >= y.start && d.date <= y.end).reduce((s, d) => s + d.amount, 0),
            current,
          };
        }),
      });
      return schedule[schedule.length - 1]!.closingReservesPence;
    };
    for (const month of this.months) {
      const fyMonth = (Number(month.slice(5, 7)) + 12 - 4) % 12;
      if (fyMonth !== 5 && fyMonth !== 11) continue;
      const date = lastWorkdayOfMonth(month);
      if (date >= t) continue;
      const available = reservesAt(date);
      const share = fyMonth === 5 ? 0.4 : 0.5;
      const amount = Math.floor((available * share) / 100_000) * 100_000;
      if (amount <= 0) continue;
      declared.push({ date, amount });
      const declId = this.id();
      this.out.dividendDeclarations.push({
        id: declId, companyId: this.companyId, declaredAt: date, totalPence: amount,
        notes: fyMonth === 5 ? "Interim dividend" : "Year-end interim dividend",
        availableReservesPence: available, createdAt: at(date, 15),
      });
      const payOn = nextWorkday(addDays(date, 1));
      for (const [i, sh] of this.out.shareholders.entries()) {
        const portion = i === 0 ? Math.round((amount * DEMO_DIRECTORS.lead.shares) / 100) : amount - Math.round((amount * DEMO_DIRECTORS.lead.shares) / 100);
        this.out.dividendPayouts.push({
          id: this.id(), declarationId: declId, shareholderId: sh.id!, shareholderName: sh.name,
          shareCount: sh.shareCount, amountPence: portion, createdAt: at(date, 15),
        });
        this.event({
          date: payOn, account: "current", amountPence: -portion, counterparty: sh.name,
          reference: "Dividend", type: "FASTER PAYMENT", category: "OTHER",
          match: { matchType: "transfer", confirmed: true, note: `Dividend declared ${date}` },
        });
      }
    }

    // Corporation tax for each finished year, paid before the deadline.
    const finished = this.fyEnds();
    const schedule = buildReservesSchedule({
      openingReservesPence: DEMO_COMPANY.openingReservesPence,
      years: finished.map((end) => {
        const start = fyStart(end);
        return {
          start, end, profitPence: this.profit(start, end),
          dividendsPence: declared.filter((d) => d.date >= start && d.date <= end).reduce((s, d) => s + d.amount, 0),
          current: false,
        };
      }),
    });
    for (const year of schedule) {
      const due = ctPaymentDueDate(year.end);
      const paid = previousWorkday(addDays(due, -12));
      if (paid > t || year.tax.taxPence <= 0) continue;
      this.event({
        date: paid, account: "current", amountPence: -year.tax.taxPence, counterparty: "HMRC Corporation Tax",
        reference: `${DEMO_COMPANY.companyNumber} CT ${year.end.slice(0, 4)}`, type: "FASTER PAYMENT", category: "TAX",
        match: { matchType: "tax_or_loan", confirmed: true, note: `Corporation tax for the year ended ${year.end}` },
      });
    }
  }

  private buildDirectorLoan() {
    const c = this.companyId;
    this.out.directorLoanEntries.push({
      id: this.id(), companyId: c, directorUserId: this.people.leadId, kind: "opening",
      entryDate: this.openingAsAt, amountPence: 185_000,
      description: "Expenses paid personally before the year end, not yet repaid",
      createdByUserId: this.people.leadId, createdAt: at(this.start, 10),
    });
    const month = this.months[Math.max(0, this.months.length - 14)]!;
    const drawn = nextWorkday(dayOfMonth(month, 10));
    const repaid = nextWorkday(addDays(drawn, 45));
    for (const [kind, date, amount] of [["drawing", drawn, -300_000], ["paid_in", repaid, 300_000]] as const) {
      if (date > this.today) continue;
      this.out.directorLoanEntries.push({
        id: this.id(), companyId: c, directorUserId: this.people.secondId, kind, entryDate: date,
        amountPence: Math.abs(amount),
        description: kind === "drawing" ? "Short-term loan for a house deposit" : "Loan repaid in full",
        createdByUserId: this.people.leadId, createdAt: at(date, 12),
      });
      this.event({
        date, account: "current", amountPence: amount, counterparty: DEMO_DIRECTORS.second.name,
        reference: kind === "drawing" ? "Director loan" : "Loan repayment", type: "FASTER PAYMENT", category: "OTHER",
        match: { matchType: "transfer", confirmed: true, note: `Director's loan — ${kind === "drawing" ? "drawing" : "repayment"}` },
      });
    }
  }

  private buildInterest() {
    for (const month of this.months) {
      this.event({
        date: this.interestDate(month), account: "savings", amountPence: this.interestAmount(month),
        counterparty: "Business Savings", reference: "Interest", type: "INTEREST", category: null,
        match: { matchType: "other_income", incomeCategory: "Interest", confirmed: true, note: `Savings interest ${monthLabel(addMonths(month, -1))}` },
      });
    }
    // A refund nobody has explained yet: the accountant has asked about it.
    this.event({
      date: previousWorkday(addDays(this.today, -6)), account: "current", amountPence: 8_640,
      counterparty: "Skyway Airlines", reference: "REFUND 7731-22", type: "CARD REFUND", category: null,
    });
  }

  // --- write rows ---------------------------------------------------------------

  private writeInvoices() {
    const t = this.today;
    for (const inv of this.invoices) {
      const sent = inv.status !== "draft";
      const settled = inv.settledOn != null;
      this.out.invoices.push({
        id: inv.id,
        companyId: this.companyId,
        number: inv.number,
        clientId: inv.client.id,
        status: inv.status === "sent" && settled ? "paid" : inv.status,
        currency: "GBP",
        issueDate: inv.issueDate,
        dueDate: inv.dueDate,
        notes: inv.notes ?? null,
        ...sterlingTotals({ netPence: inv.net, vatPence: inv.vat, grossPence: inv.gross }),
        createdByUserId: this.people.leadId,
        createdAt: at(inv.issueDate, 8, 30),
        sentAt: sent ? at(inv.issueDate, 9, 15) : null,
        paidAt: settled ? at(inv.settledOn!, 10, 30) : null,
        orderId: inv.orderId ?? null,
        paymentMilestoneId: inv.milestoneId ?? null,
        latePaymentForInvoiceId: inv.latePaymentForId ?? null,
        recurringInvoiceId: inv.recurringId ?? null,
        viewedAt: sent && addDays(inv.issueDate, 1) <= t ? at(addDays(inv.issueDate, 1), 11) : null,
        source: "alfa",
        chaseEnabled: true,
      });
      inv.lines.forEach((l, position) =>
        this.out.invoiceLineItems.push({
          id: this.id(),
          invoiceId: inv.id,
          description: l.description,
          quantity: l.quantity,
          unitPricePence: l.unitPricePence,
          vatRate: l.vatRate,
          discountPercent: l.discountPercent,
          position,
          expenseId: l.expenseId ?? null,
        }),
      );
      // Send and reminder history for the last couple of months.
      if (sent && inv.status !== "void" && inv.issueDate >= addDays(t, -60)) {
        this.out.sendJobs.push({
          id: this.id(), companyId: this.companyId, kind: "invoice_send", invoiceId: inv.id,
          actorUserId: inv.kind === "retainer" ? null : this.people.leadId, status: "sent", attempts: 1,
          createdAt: at(inv.issueDate, 9, 14), sentAt: at(inv.issueDate, 9, 15),
        });
        if (!settled) {
          for (const step of [-3, 1, 7, 14]) {
            const on = addDays(inv.dueDate, step);
            if (on > addDays(t, -1)) continue;
            this.out.sendJobs.push({
              id: this.id(), companyId: this.companyId, kind: "invoice_remind", invoiceId: inv.id,
              status: "sent", attempts: 1, reminderStep: step, createdAt: at(on, 7), sentAt: at(on, 7, 5),
            });
          }
        }
      }
    }
    // Credit notes: numbered by date.
    const cns = [...this.out.creditNotes].sort((a, b) => a.issueDate.localeCompare(b.issueDate));
    const seq = new Map<number, number>();
    for (const cn of cns) {
      const y = Number(cn.issueDate.slice(0, 4));
      const n = (seq.get(y) ?? 0) + 1;
      seq.set(y, n);
      cn.number = formatInvoiceNumber("CN", y, n);
    }
  }

  private writeExpenses() {
    const c = this.companyId;
    const sorted = [...this.expenses].sort((a, b) => a.spentAt.localeCompare(b.spentAt));
    const people = { lead: this.people.leadId, second: this.people.secondId };
    for (const e of sorted) {
      const status =
        e.status ??
        (e.paidBy === "company" ? "company_paid" : "reimbursable");
      const vat = vatFromInclusiveGross(e.amountPence, e.vatRate);
      const paidByUserId = e.paidBy === "company" ? null : people[e.paidBy];
      this.out.expenses.push({
        id: e.id,
        companyId: c,
        description: e.description,
        category: e.category,
        spentAt: e.spentAt,
        amountPence: e.amountPence,
        vatRate: e.vatRate,
        vatPence: vat,
        status,
        source: e.pending ? "email" : "manual",
        billable: e.billable ?? false,
        clientId: e.clientId ?? null,
        orderId: e.orderId ?? null,
        paidByUserId,
        submittedByUserId: e.pending?.submittedBy ?? paidByUserId ?? this.people.leadId,
        mileageMiles: e.mileageMiles ?? null,
        mileageRatePence: e.mileageMiles ? 45 : null,
        detectedCurrency: e.usdCents ? "USD" : null,
        originalAmountMinor: e.usdCents ?? null,
        statedPaymentSource: e.pending ? (e.paidBy === "company" ? "company" : "personal") : null,
        statedPaymentSourceVia: e.pending ? "email" : null,
        receiptCardLast4: e.pending && e.paidBy === "company" ? "4417" : null,
        notes: e.notes ?? null,
        coversFrom: e.coversFrom ?? null,
        coversTo: e.coversTo ?? null,
        inboundEmailJobId: e.pending?.jobId ?? null,
        createdByUserId: e.pending ? null : paidByUserId ?? this.people.leadId,
        createdAt: at(e.spentAt, 18),
      });
      for (const key of e.labels) {
        this.out.expenseLabels.push({ id: this.id(), expenseId: e.id, labelId: this.labelIds.get(key)! });
      }
      if (!e.noReceipt && !e.mileageMiles) {
        this.out.receipts.push({
          expenseId: e.id,
          supplier: e.supplier,
          description: e.description,
          date: e.spentAt,
          amountPence: e.amountPence,
          vatPence: vat,
          vatRate: e.vatRate,
          usdCents: e.usdCents ?? null,
        });
      }
      if (e.pending) {
        this.out.inboundEmailJobs.push({
          id: e.pending.jobId,
          companyId: c,
          resendEmailId: `demo-${c}-${e.id}`,
          fromEmail: e.pending.submittedBy === this.people.leadId ? "sam@brightwater-advisory.example.com" : DEMO_DIRECTORS.second.email,
          toEmail: "receipts@inbound.example.com",
          subject: `Receipt: ${e.description}`,
          status: "processed",
          expenseId: e.id,
          attempts: 1,
          createdAt: at(e.spentAt, 19),
          processedAt: at(e.spentAt, 19, 2),
          bodyText: `Receipt attached for ${e.description.toLowerCase()}.${e.paidBy === "company" ? " Paid on the company card." : " I paid for this myself."}`,
        });
      }
      // Company payments reach the bank.
      if (status === "company_paid" || (status === "pending" && e.paidBy === "company")) {
        const posted = this.cardPostDate(e);
        const matched = status === "company_paid" && e.recent !== "suggested";
        const type = e.via === "card" ? "CARD PAYMENT" : e.via === "direct_debit" ? "DIRECT DEBIT" : "FASTER PAYMENT";
        this.event({
          date: posted,
          account: "current",
          amountPence: -e.amountPence,
          counterparty: e.supplier,
          reference: e.via === "transfer" ? e.description.slice(0, 18) : e.supplier.toUpperCase().slice(0, 18),
          type,
          category: e.category === "Professional fees" && e.via === "transfer" && e.orderId ? ASSOCIATES_CATEGORY : SPENDING_CATEGORY[e.category],
          labels: e.labels.filter((l) => l === "subscription" || l === "conference"),
          match:
            status === "pending" ? undefined :
            matched ? { matchType: "expense", expenseId: e.id, confirmed: true } :
            { matchType: "expense", expenseId: e.id, confirmed: false, note: posted === e.spentAt ? "Same amount, same day" : "Same amount, card payment posted a day later" },
        });
      }
    }
    // One AI-suggested match for the bookkeeper page.
    const aiCandidate = [...this.events].reverse().find((ev) => ev.match?.matchType === "expense" && ev.match.confirmed === false);
    if (aiCandidate?.match) {
      aiCandidate.match.note = `AI: The receipt from ${aiCandidate.counterparty} shows the same total and a card ending 4417.`;
    }
    // An email that didn't become an expense. (Not a failed one: those show on
    // the platform's health counts.)
    const rejectedOn = previousWorkday(addDays(this.today, -4));
    this.out.inboundEmailJobs.push({
      id: this.id(), companyId: c, resendEmailId: `demo-${c}-rejected`, fromEmail: "offers@unknown-sender.example.com",
      toEmail: "receipts@inbound.example.com", subject: "Exclusive offer for your business", status: "rejected",
      attempts: 1, lastError: "Sender is not a member of this company.",
      createdAt: at(rejectedOn, 13), processedAt: at(rejectedOn, 13, 1),
      bodyText: "Save 40% on office furniture this week only.",
    });
  }

  // --- the bank ------------------------------------------------------------------

  private runBank() {
    const [current, savings] = this.out.bankAccounts;
    const balance: Record<BankEvent["account"], number> = { current: DEMO_COMPANY.openingCurrentAccountPence, savings: DEMO_COMPANY.openingSavingsPence };
    const ordered = [...this.events].sort((a, b) => a.date.localeCompare(b.date) || a.order - b.order);
    const final: BankEvent[] = [];
    let i = 0;
    for (let day = addDays(this.openingAsAt, 1); day <= this.today; day = addDays(day, 1)) {
      const todays: BankEvent[] = [];
      while (i < ordered.length && ordered[i]!.date === day) todays.push(ordered[i++]!);
      final.push(...todays);
      // Keep the current account between about £25k and £85k by moving money to
      // and from savings. A top-up goes in first thing, before the day's payments.
      const net = { current: 0, savings: 0 };
      let lowest = balance.current;
      for (const e of [...todays].sort((a, b) => b.amountPence - a.amountPence)) {
        net[e.account] += e.amountPence;
        if (e.account === "current") lowest = Math.min(lowest, balance.current + net.current);
      }
      const isMonthEnd = day === lastWorkdayOfMonth(day) && weekday(day) !== 0 && weekday(day) !== 6;
      let move = 0;
      let first = false;
      if (lowest < 2_500_000 && balance.savings > 1_000_000) {
        move = -Math.min(balance.savings - 500_000, Math.ceil((4_000_000 - lowest) / 500_000) * 500_000);
        first = true;
      } else if (isMonthEnd && balance.current + net.current > 8_500_000) {
        move = Math.floor((balance.current + net.current - 5_500_000) / 500_000) * 500_000;
      }
      balance.current += net.current;
      balance.savings += net.savings;
      if (move !== 0) {
        const order = first ? -1 : this.eventOrder++;
        final.push(
          {
            date: day, account: "current", amountPence: -move, counterparty: "Business Savings",
            reference: move > 0 ? "To savings" : "From savings", type: "TRANSFER", category: null,
            match: { matchType: "transfer", confirmed: true, note: move > 0 ? "Surplus cash to savings" : "Topping up the current account" },
            order,
          },
          {
            date: day, account: "savings", amountPence: move, counterparty: "Starling Business",
            reference: move > 0 ? "From current account" : "To current account", type: "TRANSFER", category: null,
            match: { matchType: "transfer", confirmed: true, note: move > 0 ? "Surplus cash from current account" : "Back to the current account" },
            order: order + 0.5,
          },
        );
        balance.current -= move;
        balance.savings += move;
      }
    }

    const running: Record<BankEvent["account"], number> = { current: DEMO_COMPANY.openingCurrentAccountPence, savings: DEMO_COMPANY.openingSavingsPence };
    // Within a day: top-ups first, then money in, then money out.
    final.sort(
      (a, b) =>
        a.date.localeCompare(b.date) ||
        Number(b.order < 0) - Number(a.order < 0) ||
        Number(b.amountPence > 0) - Number(a.amountPence > 0) ||
        a.order - b.order,
    );
    final.forEach((e, n) => {
      running[e.account] += e.amountPence;
      const id = this.id();
      const accountId = e.account === "current" ? current!.id! : savings!.id!;
      this.out.bankTransactions.push({
        id,
        bankAccountId: accountId,
        externalId: `demo-${String(n + 1).padStart(5, "0")}`,
        bookedAt: e.date,
        amountPence: e.amountPence,
        counterparty: e.counterparty,
        reference: e.reference,
        description: e.type,
        spendingCategory: e.amountPence < 0 ? e.category : e.category ?? null,
        suggestedCategory: e.suggestion?.category ?? null,
        suggestedCategoryReason: e.suggestion?.reason ?? null,
        suggestedCategorySource: e.suggestion?.source ?? null,
        notes: e.notes ?? null,
        raw: {
          Date: `${e.date.slice(8, 10)}/${e.date.slice(5, 7)}/${e.date.slice(0, 4)}`,
          "Counter Party": e.counterparty,
          Reference: e.reference,
          Type: e.type,
          "Amount (GBP)": (e.amountPence / 100).toFixed(2),
          "Balance (GBP)": (running[e.account] / 100).toFixed(2),
        },
        createdAt: new Date(at(e.date, 6).getTime() + n * 1000),
      });
      if (e.match) this.out.reconciliationMatches.push({ id: this.id(), bankTransactionId: id, ...e.match, createdAt: at(e.date, 17) });
      for (const key of e.labels ?? []) {
        this.out.bankTransactionLabels.push({ id: this.id(), bankTransactionId: id, labelId: this.labelIds.get(key)! });
      }
    });
  }

  // --- compliance, activity, company ------------------------------------------------

  private accountsDue(): string {
    for (let e = this.openingAsAt; ; e = fyEnd(addDays(e, 1))) {
      const due = accountsDueDate(e);
      if (due >= this.today) return due;
    }
  }

  private confirmationStatementDue(): string {
    for (let years = 1; ; years++) {
      const due = addDays(addMonths(this.incorporatedOn, 12 * years), 14);
      if (due >= this.today) return due;
    }
  }

  private buildCompliance() {
    const t = this.today;
    const all = listDeadlines(
      {
        entityType: "limited_company",
        financialYearEndMonth: DEMO_FY_END_MONTH,
        vatRegistered: false,
        vatQuarterEndMonth: DEMO_VAT_QUARTER_END_MONTH,
        incorporatedOn: this.incorporatedOn,
        accountsDue: null,
        confirmationStatementDue: null,
      },
      this.start,
      addDays(t, -1),
    );
    const ctPaid = new Map(
      this.events.filter((e) => e.counterparty === "HMRC Corporation Tax").map((e) => [e.reference.slice(-4), e.date]),
    );
    for (const d of all) {
      const filedOn =
        d.kind === "ct_payment" ? ctPaid.get(String(Number(d.dueDate.slice(0, 4)) - 1)) ?? previousWorkday(addDays(d.dueDate, -12)) :
        previousWorkday(addDays(d.dueDate, -(5 + (Number(d.dueDate.slice(8, 10)) % 20))));
      this.out.deadlineFilings.push({
        id: this.id(), companyId: this.companyId, kind: d.kind, dueDate: d.dueDate, filedOn,
        filedByUserId: d.kind === "confirmation_statement" ? this.people.leadId : this.people.accountantId,
        createdAt: at(filedOn, 15),
      });
    }

    let locked: string | null = null;
    for (const end of this.fyEnds()) {
      const reviewed = addMonths(end, 2);
      if (reviewed > t) continue;
      const filed = accountsDueDate(end) < t;
      if (filed) locked = end;
      this.out.yearEndRuns.push({
        id: this.id(), companyId: this.companyId, periodFrom: fyStart(end), periodTo: end,
        reviewedAt: at(reviewed, 10), outstandingChecks: filed ? 0 : 3,
        exportedAt: filed ? at(addDays(reviewed, 10), 16) : null,
        exportedByUserId: filed ? this.people.leadId : null,
      });
    }
    this.out.company.booksLockedThrough = locked;
  }

  private buildActivity() {
    const t = this.today;
    const c = this.companyId;
    // Weekly closes: every Monday for the last twelve weeks.
    let monday = addDays(t, -((weekday(t) + 6) % 7));
    if (monday === t) monday = addDays(monday, -7);
    for (let k = 0; k < 12; k++, monday = addDays(monday, -7)) {
      this.out.weeklyCloses.push({
        id: this.id(), companyId: c, closedByUserId: k % 3 === 2 ? this.people.secondId : this.people.leadId,
        closedAt: at(monday, 9, 30), bankReconciledThrough: addDays(monday, -3),
        snapshot: { bank: k % 4, receipts: k % 3 === 0 ? 1 : 0, overdue: 1 + (k % 3), milestones: k % 5 === 1 ? 1 : 0, reimbursements: k % 2 },
      });
    }

    // Accountant queries.
    const laptop = this.expenses.find((e) => e.description === DEMO_SPECIALS.laptop.description && e.spentAt < addDays(t, -60));
    const badDebt = this.out.writeOffs.find((w) => w.kind === "bad_debt");
    const skyway = previousWorkday(addDays(t, -6));
    const threads: Array<{
      subject: string; status: "open" | "closed"; recordKind: string | null; recordId: string | null; recordLabel: string | null;
      day: string; messages: Array<[string, string]>;
    }> = [];
    if (laptop) {
      threads.push({
        subject: "Laptop purchase — capital allowance", status: "closed", recordKind: "expense", recordId: laptop.id,
        recordLabel: `${laptop.supplier} — ${laptop.description}`, day: addDays(laptop.spentAt, 20),
        messages: [
          [this.people.accountantId, "This laptop is over the £250 threshold. Is it used only for the business? If so I'll claim it under the annual investment allowance rather than as an expense."],
          [this.people.leadId, "Yes, business use only. It's for our new associate's onboarding kit."],
          [this.people.accountantId, "Thanks, AIA it is. Closing this one."],
        ],
      });
    }
    if (badDebt) {
      const inv = this.invoices.find((i) => i.id === badDebt.invoiceId);
      threads.push({
        subject: "Ashgrove bad debt — VAT relief", status: "closed", recordKind: "invoice", recordId: badDebt.invoiceId,
        recordLabel: inv?.number ?? null, day: addDays(badDebt.writtenOffOn, 7),
        messages: [
          [this.people.accountantId, "Now this is written off and over six months past due, we can reclaim the VAT on the next return. I'll add it to the adjustments."],
          [this.people.leadId, "Great, thanks Jordan. The administrators' letter is in the shared folder."],
        ],
      });
    }
    threads.push({
      subject: "£86.40 credit from Skyway Airlines", status: "open", recordKind: "bank_transaction", recordId: null,
      recordLabel: "Skyway Airlines £86.40", day: addDays(skyway, 2),
      messages: [[this.people.accountantId, "There's a refund from Skyway Airlines this week. Which expense does it relate to? I can't see a flight booked recently."]],
    });
    for (const th of threads) {
      if (th.day > t) continue;
      const qid = this.id();
      const closedAt = th.status === "closed" ? at(addDays(th.day, th.messages.length), 16) : null;
      this.out.accountantQueries.push({
        id: qid, companyId: c, subject: th.subject, status: th.status, recordKind: th.recordKind, recordId: th.recordId,
        recordLabel: th.recordLabel, raisedByUserId: this.people.accountantId, closedAt,
        createdAt: at(th.day, 10), updatedAt: closedAt ?? at(th.day, 10),
      });
      th.messages.forEach(([author, body], n) =>
        this.out.accountantQueryMessages.push({ id: this.id(), companyId: c, queryId: qid, authorUserId: author, body, createdAt: at(addDays(th.day, n), 10 + n) }),
      );
    }

    // Notifications for the lead director.
    const overdue = this.invoices.filter((i) => i.status === "sent" && !i.settledOn && i.dueDate < t).slice(-2);
    const accepted = this.out.quotes.filter((q) => q.status === "accepted").at(-1);
    const notes: Array<[string, string, string, string | null, number, boolean]> = [
      ...overdue.map((i, n) => ["invoice.overdue", `Invoice ${i.number} is overdue`, `${i.client.name} owes ${gbp(i.gross - i.paidPence)}.`, `/invoices/${i.id}`, n + 1, n > 0] as [string, string, string, string, number, boolean]),
      ["quote.accepted", `Quote ${accepted?.number ?? ""} accepted`, "The client accepted online. An order has been created.", accepted ? `/quotes/${accepted.id}` : null, 9, true],
      ["expense.inbound.processed", "Receipt received by email", "A receipt emailed in is waiting for review.", "/expenses?status=pending", 1, false],
      ["accountant_query.raised", "New question from your accountant", "£86.40 credit from Skyway Airlines", "/queries", 4, false],
      ["deadline.upcoming", "VAT return due soon", "Your next VAT return and payment are coming up.", "/deadlines", 6, true],
      ["close.weekly", "Time to close the week", "A few bank transactions and receipts need a look.", "/close", 2, false],
      ["invoice.paid", "Payment received", "Harbor Point Logistics paid their retainer invoice.", "/invoices", 12, true],
      ["recurring.due.3d", "Retainers go out in 3 days", "Three monthly retainers will be sent automatically.", "/recurring-invoices", 14, true],
    ];
    notes.forEach(([type, title, body, href, daysAgo, read], n) => {
      const when = at(addDays(t, -daysAgo), 7, 30);
      this.out.notifications.push({
        id: this.id(), companyId: c, userId: this.people.leadId, type, title, body, href,
        dedupeKey: `demo:${n}`, readAt: read ? at(addDays(t, -daysAgo), 12) : null, createdAt: when,
      });
    });

    // A light audit trail of recent work.
    const recent = this.invoices.filter((i) => i.issueDate >= addDays(t, -30) && i.status !== "void");
    for (const inv of recent) {
      this.out.auditLog.push({
        id: this.id(), companyId: c, actorUserId: inv.kind === "retainer" ? null : this.people.leadId,
        action: inv.status === "draft" ? "invoice.create" : "invoice.send", entityType: "invoice", entityId: inv.id,
        meta: { number: inv.number }, createdAt: at(inv.issueDate, 9, 15),
      });
    }
    for (const p of this.out.payments.filter((p) => (p.receivedAt as Date) >= at(addDays(t, -30)))) {
      this.out.auditLog.push({
        id: this.id(), companyId: c, actorUserId: this.people.secondId, action: "payment.record", entityType: "invoice",
        entityId: p.invoiceId, meta: { amountPence: p.amountPence }, createdAt: new Date((p.receivedAt as Date).getTime() + 3_600_000),
      });
    }
    for (const e of this.out.expenses.filter((e) => e.spentAt! >= addDays(t, -14) && e.status !== "pending")) {
      this.out.auditLog.push({
        id: this.id(), companyId: c, actorUserId: e.createdByUserId ?? this.people.leadId, action: "expense.create",
        entityType: "expense", entityId: e.id!, meta: { description: e.description }, createdAt: at(e.spentAt!, 18),
      });
    }

    this.out.dataOnboarding = {
      companyId: c, status: "completed", recordsStartDate: this.start, overrides: {},
      startedAt: at(this.start, 9), completedAt: at(addDays(this.start, 21), 16), updatedAt: at(addDays(this.start, 21), 16),
    };
  }

  private buildCompany() {
    this.out.company = {
      ...this.out.company,
      entityType: "limited_company",
      name: DEMO_COMPANY.name,
      legalName: DEMO_COMPANY.legalName,
      companyNumber: DEMO_COMPANY.companyNumber,
      vatNumber: DEMO_COMPANY.vatNumber,
      vatRegistered: true,
      defaultVatRate: 20,
      addressLines: DEMO_COMPANY.addressLines,
      email: DEMO_COMPANY.email,
      bankProvider: "starling",
      bankName: DEMO_COMPANY.bankName,
      bankAccountName: DEMO_COMPANY.bankAccountName,
      sortCode: DEMO_COMPANY.sortCode,
      accountNumber: DEMO_COMPANY.accountNumber,
      financialYearEndMonth: DEMO_FY_END_MONTH,
      vatQuarterEndMonth: DEMO_VAT_QUARTER_END_MONTH,
      invoiceNumberPrefix: DEMO_COMPANY.invoiceNumberPrefix,
      quoteNumberPrefix: "Q",
      orderNumberPrefix: "O",
      creditNoteNumberPrefix: "CN",
      invoicePaymentTermsDays: DEMO_COMPANY.invoicePaymentTermsDays,
      openingCashPence: null,
      openingCashAsAt: null,
      totalShares: DEMO_DIRECTORS.lead.shares + DEMO_DIRECTORS.second.shares,
      invoiceCutoverDate: null,
      openingBalancesAsAt: this.openingAsAt,
      openingReservesPence: DEMO_COMPANY.openingReservesPence,
      associatedCompanies: 0,
      aiAssistantEnabled: true,
      remindersEnabled: true,
      latePaymentCharges: true,
      safeToPayBufferMonths: 2,
      incorporatedOn: this.incorporatedOn,
      directorNames: `${DEMO_DIRECTORS.lead.name}\n${DEMO_DIRECTORS.second.name}`,
      accountsDue: this.accountsDue(),
      confirmationStatementDue: this.confirmationStatementDue(),
      companiesHouseSyncedAt: at(addDays(this.today, -3), 6),
      // Deadlines worked out before the company "joined" are hidden, so it joined when the records start.
      createdAt: at(this.start, 9),
    };
  }

  private sequences(): DemoBooks["documentSequences"] {
    const out: DemoBooks["documentSequences"] = [];
    const add = (kind: DemoBooks["documentSequences"][number]["kind"], numbers: string[]) => {
      const highest = new Map<number, number>();
      for (const n of numbers) {
        const [, year, seq] = n.split("-");
        highest.set(Number(year), Math.max(highest.get(Number(year)) ?? 0, Number(seq)));
      }
      for (const [year, seq] of highest) out.push({ kind, year, nextSeq: seq + 1 });
    };
    add("invoice", this.out.invoices.map((i) => i.number));
    add("quote", this.out.quotes.map((q) => q.number));
    add("order", this.out.orders.map((o) => o.number));
    add("credit_note", this.out.creditNotes.map((c) => c.number));
    return out;
  }
}

// --- small helpers ---------------------------------------------------------------

function emptyBooks(start: string): DemoBooks {
  return {
    company: {},
    recordsStart: start,
    clients: [], labels: [], spendingCategories: [], declineReasons: [],
    quotes: [], quoteVersions: [], quoteLineItems: [], quoteMilestones: [],
    orders: [], orderLineItems: [], orderMilestones: [], recurringInvoices: [],
    invoices: [], invoiceLineItems: [], payments: [], creditNotes: [], creditNoteLineItems: [], writeOffs: [],
    sendJobs: [], inboundEmailJobs: [], expenses: [], expenseLabels: [], receipts: [],
    reimbursements: [], reimbursementItems: [], bankAccounts: [], bankTransactions: [], bankTransactionLabels: [],
    reconciliationMatches: [], shareholders: [], dividendDeclarations: [], dividendPayouts: [], directorLoanEntries: [],
    deadlineFilings: [], yearEndRuns: [], weeklyCloses: [], accountantQueries: [], accountantQueryMessages: [],
    notifications: [], auditLog: [],
    dataOnboarding: { companyId: "" },
    documentSequences: [],
  };
}

function declineNarrative(reason: (typeof DEMO_DECLINE_REASONS)[number]): string {
  switch (reason) {
    case "Price":
      return "Budget was cut for this year; they asked us to re-quote in the new financial year.";
    case "Timing":
      return "They want to wait until their new director starts.";
    case "Went with another supplier":
      return "Chose a larger firm already on their framework agreement.";
    case "Scope changed":
      return "The board narrowed the scope to an internal review.";
  }
}

function formatShortDate(iso: string): string {
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
}

function titleCase(value: string): string {
  const words = value.split("_").map((w) => w.toLowerCase());
  words[0] = words[0]!.charAt(0).toUpperCase() + words[0]!.slice(1);
  return words.join(" ");
}

function gbp(pence: number): string {
  return `£${(pence / 100).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function maxOf(a: string, b: string): string {
  return a > b ? a : b;
}

/** Give each document `{prefix}-{year}-{n}` in the order given, a series per issue year. */
function assignNumbers<T extends { number: string; issueDate: string }>(items: T[], prefix: string) {
  const seq = new Map<number, number>();
  for (const item of items) {
    const year = Number(item.issueDate.slice(0, 4));
    const n = (seq.get(year) ?? 0) + 1;
    seq.set(year, n);
    item.number = formatInvoiceNumber(prefix, year, n);
  }
}
