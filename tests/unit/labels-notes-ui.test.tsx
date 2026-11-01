/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Tooltip } from "@/components/ui/tooltip";
import { parseBankListParams, bankListHref } from "@/lib/bank/list-params";
import { expenseListHref, parseExpenseListParams } from "@/lib/expenses/list-params";
import { parseLabelIds } from "@/lib/labels/params";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";

afterEach(cleanup);

describe("parseLabelIds", () => {
  it("keeps valid ids and drops malformed or repeated ones", () => {
    expect(parseLabelIds(`${A},nope,${B},${A},,'; drop table`)).toEqual([A, B]);
    expect(parseLabelIds(undefined)).toEqual([]);
    expect(parseLabelIds([A, B])).toEqual([A, B]);
  });
});

describe("labels URL param", () => {
  it("round-trips through the bank and expense list URLs", () => {
    const bank = parseBankListParams({ labels: `${A},${B}` });
    expect(bank.labels).toEqual([A, B]);
    expect(bankListHref(bank)).toContain(`labels=${encodeURIComponent(`${A},${B}`)}`);
    expect(bankListHref(bank, { labels: [] })).toBe("/transactions");

    const expense = parseExpenseListParams({ labels: A });
    expect(expense.labels).toEqual([A]);
    expect(expenseListHref(expense)).toContain(`labels=${A}`);
  });
});

describe("Tooltip", () => {
  it("shows multi-line text with its line breaks kept, and hides on Escape", () => {
    vi.useFakeTimers();
    render(
      <Tooltip id="t" content={"line one\nline two"}>
        <button type="button">Note</button>
      </Tooltip>,
    );
    expect(screen.queryByRole("tooltip", { hidden: true })).toBeNull();

    fireEvent.mouseEnter(screen.getByText("Note").parentElement!);
    const tooltip = screen.getByRole("tooltip", { hidden: true });
    expect(tooltip.textContent).toBe("line one\nline two");
    expect(tooltip.className).toContain("whitespace-pre-wrap");

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("tooltip", { hidden: true })).toBeNull();

    fireEvent.mouseEnter(screen.getByText("Note").parentElement!);
    fireEvent.mouseLeave(screen.getByText("Note").parentElement!);
    act(() => {
      vi.runAllTimers();
    });
    expect(screen.queryByRole("tooltip", { hidden: true })).toBeNull();
    vi.useRealTimers();
  });
});
