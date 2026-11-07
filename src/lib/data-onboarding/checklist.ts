import type { DataOnboardingOverride, EntityType } from "@/db/schema";
import { addDays } from "@/lib/ledger/corporation-tax";
import { formatIsoDate, type DateFormat } from "@/lib/dates";
import { stepsFor, type StepDef, type StepId } from "./steps";

/** What the company's data says, read fresh each time the checklist is shown. */
export interface OnboardingFacts {
  /** Each bank account and the date of its earliest transaction. */
  bankAccounts: { name: string; firstBookedAt: string | null }[];
  clientCount: number;
  /** Invoices dated on or after the start date (all of them without one). */
  invoicesFromStart: number;
  /** Imported invoices dated before the start date. */
  importedInvoicesBeforeStart: number;
  committedInvoiceBatches: number;
  /** The newest invoice import still waiting for review. */
  draftInvoiceBatchId: string | null;
  /** Expenses dated on or after the start date (all of them without one). */
  expensesFromStart: number;
  openingBalancesAsAt: string | null;
  invoiceCutoverDate: string | null;
  totalShares: number | null;
  activeShareSum: number;
  financialYearEndMonth: number;
}

export interface OnboardingRecord {
  recordsStartDate: string | null;
  overrides: Record<string, DataOnboardingOverride>;
  lastStepId: string | null;
}

export type StepState = "todo" | "in_progress" | "done" | "skipped" | "not_applicable";

export interface ChecklistStep extends StepDef {
  state: StepState;
  source: "auto" | "manual";
  detail: string | null;
  /** A second place to go, such as a draft import or the invoice cutover. */
  extraLink: { label: string; href: string } | null;
}

export interface Checklist {
  steps: ChecklistStep[];
  resolvedCount: number;
  total: number;
  complete: boolean;
  /** Where Continue goes: the step last opened if it isn't finished, else the first open one. */
  continueStepId: StepId | null;
}

/** A bank account counts as covered when its statements start within a week of the start date. */
const BANK_COVERAGE_SLACK_DAYS = 7;

const RESOLVED: ReadonlySet<StepState> = new Set(["done", "skipped", "not_applicable"]);

export function isResolved(state: StepState): boolean {
  return RESOLVED.has(state);
}

type Auto = Pick<ChecklistStep, "state" | "detail" | "extraLink">;

const auto = (
  state: StepState,
  detail: string | null = null,
  extraLink: ChecklistStep["extraLink"] = null,
): Auto => ({ state, detail, extraLink });

function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

function bankStep(facts: OnboardingFacts, start: string | null, fmt: DateFormat): Auto {
  const accounts = facts.bankAccounts;
  if (accounts.length === 0) return auto("todo");
  const empty = accounts.filter((a) => !a.firstBookedAt);
  if (empty.length > 0) {
    return auto("in_progress", `No transactions yet in ${empty.map((a) => a.name).join(", ")}`);
  }
  const firsts = accounts.map((a) => a.firstBookedAt!);
  const earliest = firsts.reduce((a, b) => (a < b ? a : b));
  if (start) {
    const latestAllowed = addDays(start, BANK_COVERAGE_SLACK_DAYS);
    const late = accounts.find((a) => a.firstBookedAt! > latestAllowed);
    if (late) {
      return auto(
        "in_progress",
        `${late.name} starts ${formatIsoDate(late.firstBookedAt!, fmt)}, after your start date`,
      );
    }
  }
  return auto("done", `${plural(accounts.length, "account")} · from ${formatIsoDate(earliest, fmt)}`);
}

function invoicesStep(facts: OnboardingFacts): Auto {
  const draft = facts.draftInvoiceBatchId
    ? { label: "Review the import in progress", href: `/invoices/import/${facts.draftInvoiceBatchId}?from=setup` }
    : null;
  // Imported invoices before the start date belong to an earlier year, unless a cutover says so.
  const cutover =
    facts.importedInvoicesBeforeStart > 0 && !facts.invoiceCutoverDate
      ? { label: "Set the invoice cutover", href: "/reports#cutover" }
      : null;
  if (facts.committedInvoiceBatches > 0 || facts.invoicesFromStart > 0) {
    const detail = facts.invoicesFromStart > 0 ? plural(facts.invoicesFromStart, "invoice") : null;
    return auto("done", detail, draft ?? cutover);
  }
  if (draft) return auto("in_progress", "An import is waiting for review", draft);
  return auto("todo", null, cutover);
}

function autoState(id: StepId, facts: OnboardingFacts, start: string | null, fmt: DateFormat): Auto {
  switch (id) {
    case "start_date":
      return start ? auto("done", formatIsoDate(start, fmt)) : auto("todo");
    case "bank":
      return bankStep(facts, start, fmt);
    case "clients":
      return facts.clientCount > 0 ? auto("done", plural(facts.clientCount, "client")) : auto("todo");
    case "invoices":
      return invoicesStep(facts);
    case "expenses":
      return facts.expensesFromStart > 0
        ? auto("done", plural(facts.expensesFromStart, "expense"))
        : auto("todo");
    case "opening_balances":
      return facts.openingBalancesAsAt
        ? auto("done", `As at ${formatIsoDate(facts.openingBalancesAsAt, fmt)}`)
        : auto("todo");
    case "shareholders": {
      const total = facts.totalShares ?? 0;
      if (total > 0 && facts.activeShareSum === total) {
        return auto("done", `${plural(total, "share")} allocated`);
      }
      if (facts.activeShareSum > 0) {
        return auto("in_progress", `${facts.activeShareSum} of ${total || "?"} shares allocated`);
      }
      return auto("todo");
    }
  }
}

const MANUAL_DETAIL: Record<DataOnboardingOverride["state"], string> = {
  done: "Marked as done",
  skipped: "Skipped for now",
  not_applicable: "Doesn't apply",
};

export function buildChecklist(
  facts: OnboardingFacts,
  record: OnboardingRecord | null,
  entityType: EntityType | null,
  fmt: DateFormat,
): Checklist {
  const start = record?.recordsStartDate ?? null;
  const overrides = record?.overrides ?? {};
  const steps: ChecklistStep[] = stepsFor(entityType).map((def) => {
    const found = autoState(def.id, facts, start, fmt);
    const manual = overrides[def.id];
    // The data agreeing with a manual choice needs no label saying it was manual.
    if (manual && found.state !== "done") {
      return { ...def, ...found, state: manual.state, source: "manual", detail: MANUAL_DETAIL[manual.state] };
    }
    return { ...def, ...found, source: "auto" };
  });

  const open = steps.filter((s) => !isResolved(s.state));
  const last = open.find((s) => s.id === record?.lastStepId);
  return {
    steps,
    resolvedCount: steps.length - open.length,
    total: steps.length,
    complete: open.length === 0,
    continueStepId: (last ?? open[0])?.id ?? null,
  };
}
