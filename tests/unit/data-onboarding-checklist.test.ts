import { describe, expect, it } from "vitest";
import {
  buildChecklist,
  type OnboardingFacts,
  type OnboardingRecord,
} from "@/lib/data-onboarding/checklist";
import type { StepId } from "@/lib/data-onboarding/steps";

const empty: OnboardingFacts = {
  bankAccounts: [],
  clientCount: 0,
  invoicesFromStart: 0,
  importedInvoicesBeforeStart: 0,
  committedInvoiceBatches: 0,
  draftInvoiceBatchId: null,
  expensesFromStart: 0,
  openingBalancesAsAt: null,
  invoiceCutoverDate: null,
  totalShares: null,
  activeShareSum: 0,
  financialYearEndMonth: 3,
};

const record = (over: Partial<OnboardingRecord> = {}): OnboardingRecord => ({
  recordsStartDate: "2025-04-01",
  overrides: {},
  lastStepId: null,
  ...over,
});

function step(facts: Partial<OnboardingFacts>, id: StepId, rec = record()) {
  const list = buildChecklist({ ...empty, ...facts }, rec, "limited_company", "iso");
  return list.steps.find((s) => s.id === id)!;
}

describe("buildChecklist", () => {
  it("leaves the limited-company steps out for a sole trader", () => {
    const list = buildChecklist(empty, record(), "sole_trader", "iso");
    expect(list.steps.map((s) => s.id)).toEqual([
      "start_date",
      "bank",
      "clients",
      "invoices",
      "expenses",
    ]);
    expect(list.total).toBe(5);
  });

  it("ticks off the start date once one is chosen", () => {
    expect(step({}, "start_date", record({ recordsStartDate: null })).state).toBe("todo");
    expect(step({}, "start_date")).toMatchObject({ state: "done", detail: "2025-04-01" });
  });

  describe("bank", () => {
    it("is to do with no accounts", () => {
      expect(step({}, "bank").state).toBe("todo");
    });

    it("is in progress while an account has no transactions", () => {
      const s = step(
        {
          bankAccounts: [
            { name: "Current", firstBookedAt: "2025-04-01" },
            { name: "Savings", firstBookedAt: null },
          ],
        },
        "bank",
      );
      expect(s).toMatchObject({ state: "in_progress", detail: "No transactions yet in Savings" });
    });

    it("flags an account whose statements start after the start date", () => {
      const s = step({ bankAccounts: [{ name: "Current", firstBookedAt: "2025-06-02" }] }, "bank");
      expect(s.state).toBe("in_progress");
      expect(s.detail).toBe("Current starts 2025-06-02, after your start date");
    });

    it("allows a week's slack for when statements begin", () => {
      const s = step({ bankAccounts: [{ name: "Current", firstBookedAt: "2025-04-08" }] }, "bank");
      expect(s).toMatchObject({ state: "done", detail: "1 account · from 2025-04-08" });
      expect(
        step({ bankAccounts: [{ name: "Current", firstBookedAt: "2025-04-09" }] }, "bank").state,
      ).toBe("in_progress");
    });

    it("is done for any statements when no start date is chosen", () => {
      const s = step(
        { bankAccounts: [{ name: "Current", firstBookedAt: "2026-01-10" }] },
        "bank",
        record({ recordsStartDate: null }),
      );
      expect(s.state).toBe("done");
    });
  });

  describe("invoices", () => {
    it("points to a draft import waiting for review", () => {
      const s = step({ draftInvoiceBatchId: "batch-1" }, "invoices");
      expect(s.state).toBe("in_progress");
      expect(s.extraLink?.href).toBe("/invoices/import/batch-1?from=setup");
    });

    it("is done once an import is committed", () => {
      expect(step({ committedInvoiceBatches: 1 }, "invoices").state).toBe("done");
      expect(step({ invoicesFromStart: 3 }, "invoices")).toMatchObject({
        state: "done",
        detail: "3 invoices",
      });
    });

    it("suggests a cutover when imported invoices predate the start date", () => {
      const s = step({ invoicesFromStart: 2, importedInvoicesBeforeStart: 4 }, "invoices");
      expect(s.extraLink?.href).toBe("/reports#cutover");
      const withCutover = step(
        { invoicesFromStart: 2, importedInvoicesBeforeStart: 4, invoiceCutoverDate: "2025-03-31" },
        "invoices",
      );
      expect(withCutover.extraLink).toBeNull();
    });
  });

  it("ticks off clients, expenses and opening balances from the data", () => {
    expect(step({ clientCount: 1 }, "clients")).toMatchObject({ state: "done", detail: "1 client" });
    expect(step({ expensesFromStart: 12 }, "expenses").state).toBe("done");
    expect(step({ openingBalancesAsAt: "2025-03-31" }, "opening_balances")).toMatchObject({
      state: "done",
      detail: "As at 2025-03-31",
    });
  });

  it("needs the share register to balance", () => {
    expect(step({ totalShares: 100, activeShareSum: 60 }, "shareholders").state).toBe("in_progress");
    expect(step({ totalShares: 100, activeShareSum: 100 }, "shareholders").state).toBe("done");
    expect(step({ totalShares: null, activeShareSum: 0 }, "shareholders").state).toBe("todo");
  });

  describe("manual choices", () => {
    const by = { at: "2026-11-06T10:00:00.000Z", byUserId: null };

    it("beat what the data says", () => {
      const s = step({}, "expenses", record({ overrides: { expenses: { state: "not_applicable", ...by } } }));
      expect(s).toMatchObject({ state: "not_applicable", source: "manual", detail: "Doesn't apply" });
    });

    it("are not labelled manual when the data says done anyway", () => {
      const s = step(
        { clientCount: 2 },
        "clients",
        record({ overrides: { clients: { state: "skipped", ...by } } }),
      );
      expect(s).toMatchObject({ state: "done", source: "auto" });
    });

    it("complete the checklist when every step is resolved", () => {
      const overrides = Object.fromEntries(
        ["bank", "clients", "invoices", "expenses"].map((id) => [id, { state: "skipped" as const, ...by }]),
      );
      const list = buildChecklist(empty, record({ overrides }), "sole_trader", "iso");
      expect(list).toMatchObject({ complete: true, resolvedCount: 5, continueStepId: null });
    });
  });

  describe("continueStepId", () => {
    it("goes to the first open step", () => {
      expect(buildChecklist(empty, record(), "limited_company", "iso").continueStepId).toBe("bank");
    });

    it("goes back to the step last opened while it is unfinished", () => {
      const list = buildChecklist(empty, record({ lastStepId: "expenses" }), "limited_company", "iso");
      expect(list.continueStepId).toBe("expenses");
    });

    it("moves on once the step last opened is done", () => {
      const list = buildChecklist(
        { ...empty, expensesFromStart: 1 },
        record({ lastStepId: "expenses" }),
        "limited_company",
        "iso",
      );
      expect(list.continueStepId).toBe("bank");
    });
  });
});
