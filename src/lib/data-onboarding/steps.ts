import type { EntityType } from "@/db/schema";
import type { Permission } from "@/lib/roles";

export const STEP_IDS = [
  "start_date",
  "bank",
  "clients",
  "invoices",
  "expenses",
  "opening_balances",
  "shareholders",
] as const;

export type StepId = (typeof STEP_IDS)[number];

export interface StepDef {
  id: StepId;
  title: string;
  /** One line on why the step matters. */
  why: string;
  /** Where the step is done; null when it is done on the checklist itself. */
  href: string | null;
  /** What someone needs to do the step. Pages enforce it; the checklist only labels it. */
  permission: Permission;
  ltdOnly?: boolean;
}

export const STEPS: readonly StepDef[] = [
  {
    id: "start_date",
    title: "Choose when your records start",
    why: "Usually the first day of your financial year. Everything else is loaded from this date.",
    href: null,
    permission: "accounts:write",
  },
  {
    id: "bank",
    title: "Import your bank statements",
    why: "A CSV for each account, from your start date. This drives cash, spending and reconciliation.",
    href: "/transactions?import=1&from=setup",
    permission: "accounts:write",
  },
  {
    id: "clients",
    title: "Add your clients",
    why: "Import them from a CSV, or they're created as you import invoices.",
    href: "/clients?import=1&from=setup",
    permission: "accounts:write",
  },
  {
    id: "invoices",
    title: "Import past invoices",
    why: "From a CSV or PDFs, so income and money owed are complete.",
    href: "/invoices/import?from=setup",
    permission: "accounts:write",
  },
  {
    id: "expenses",
    title: "Import past expenses",
    why: "Costs that aren't already on your bank statements, such as ones paid personally.",
    href: "/expenses?import=1&from=setup",
    permission: "accounts:write",
  },
  {
    id: "opening_balances",
    title: "Enter opening balances",
    why: "Reserves and director's loan balances from your last filed accounts.",
    href: "/reserves?from=setup#opening-balances",
    permission: "books:lock",
    ltdOnly: true,
  },
  {
    id: "shareholders",
    title: "Set up your shareholders",
    why: "So dividends split correctly across the share register.",
    href: "/shareholders?from=setup",
    permission: "accounts:write",
    ltdOnly: true,
  },
];

export function isStepId(value: unknown): value is StepId {
  return typeof value === "string" && (STEP_IDS as readonly string[]).includes(value);
}

export function stepsFor(entityType: EntityType | null): StepDef[] {
  return STEPS.filter((s) => !s.ltdOnly || entityType === "limited_company");
}

export function stepDef(id: StepId): StepDef {
  return STEPS.find((s) => s.id === id)!;
}
