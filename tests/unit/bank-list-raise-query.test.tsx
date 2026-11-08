// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { BankTransactionTable } from "@/components/bank/bank-list";
import { parseBankListParams } from "@/lib/bank/list-params";
import type { BankTransactionListItem } from "@/lib/bank/queries";

vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));
vi.mock("@/components/bank/bank-ui", () => ({
  CategoryCell: () => null,
  ReconciliationCell: () => null,
}));
vi.mock("@/components/labels/row-labels", () => ({ RowLabels: () => null }));
vi.mock("@/components/bank/bank-selection", () => ({
  RowSelectCheckbox: () => null,
  SelectAllCheckbox: () => null,
}));
vi.mock("@/components/labels/row-note", () => ({ RowNote: () => null }));
vi.mock("@/components/queries/raise-query-button", () => ({
  RaiseQueryDialog: () => null,
}));

const row = {
  id: "tx1",
  bookedAt: "2026-03-02",
  counterparty: "Acme",
  labels: [],
  tags: [],
  notes: null,
} as unknown as BankTransactionListItem;

function renderTable(canRaiseQuery: boolean) {
  render(
    <BankTransactionTable
      params={parseBankListParams({})}
      rows={[row]}
      customCategories={[]}
      incomeCategories={[]}
      allLabels={[]}
      canWrite={false}
      canRaiseQuery={canRaiseQuery}
    />,
  );
}

afterEach(cleanup);

describe("raising a query from the transactions table", () => {
  it("puts the icon in the column before the date", () => {
    renderTable(true);
    const cell = screen.getByRole("button", { name: "Raise a query" }).closest("td");
    expect(cell?.cellIndex).toBe(0);
    expect(cell?.parentElement?.children[1].textContent).toMatch(/2026|Mar|02/);
  });

  it("leaves it out for people who can't raise queries", () => {
    renderTable(false);
    expect(screen.queryByRole("button", { name: "Raise a query" })).toBeNull();
  });
});
