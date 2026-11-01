// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { AlertProvider } from "@/components/ui/alert-dialog";
import { ExpenseForm } from "@/components/expenses/expense-form";
import { createExpense } from "@/actions/expenses";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, refresh: vi.fn() }),
}));
vi.mock("@/actions/expenses", () => ({
  createExpense: vi.fn(),
  updateExpense: vi.fn(),
  deleteExpense: vi.fn(),
  uploadReceipt: vi.fn(),
  approveExpense: vi.fn(),
  rejectExpense: vi.fn(),
  extractReceiptFields: vi.fn(),
  fetchExpenseExchangeRate: vi.fn(),
}));

const createMock = vi.mocked(createExpense);
const returnHref = "/transactions?q=adobe&sort=amount&dir=asc&page=3&pageSize=50";

afterEach(() => {
  cleanup();
  push.mockReset();
  createMock.mockReset();
});

function submit(href: string | null) {
  const { container } = render(
    <AlertProvider>
      <ExpenseForm
        mode="create"
        founders={[]}
        clients={[]}
        canWrite
        defaultMileageRatePence={45}
        returnHref={href}
        fromBankTransaction={{
          id: "00000000-0000-4000-8000-000000000002",
          description: "Adobe",
          bookedAt: "2026-04-02",
          amountPence: 1500,
          summary: "2026-04-02 · £15.00 · Adobe",
        }}
      />
    </AlertProvider>,
  );
  fireEvent.submit(container.querySelector("form")!);
}

describe("saving a new expense started from the transactions list", () => {
  it("returns to the same list URL without scrolling to the top", async () => {
    createMock.mockResolvedValue({ ok: true, id: "e1" });
    submit(returnHref);
    await waitFor(() => expect(push).toHaveBeenCalledWith(returnHref, { scroll: false }));
  });

  it("stays on the expense when the bank link failed, so the error is seen", async () => {
    createMock.mockResolvedValue({ ok: true, id: "e1", bankLinkError: "Already linked" });
    submit(returnHref);
    await waitFor(() =>
      expect(push).toHaveBeenCalledWith("/expenses/e1?bankLinkFailed=Already%20linked"),
    );
  });

  it("opens the expense when it did not start from the list", async () => {
    createMock.mockResolvedValue({ ok: true, id: "e1" });
    submit(null);
    await waitFor(() => expect(push).toHaveBeenCalledWith("/expenses/e1"));
  });
});
