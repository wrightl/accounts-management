// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { AlertProvider } from "@/components/ui/alert-dialog";
import { ExpenseForm } from "@/components/expenses/expense-form";
import {
  ExpenseAmountCard,
  ExpenseSummaryProvider,
  ExpenseTitle,
} from "@/components/expenses/expense-summary";
import { fetchExpenseExchangeRate } from "@/actions/expenses";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
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

const rateMock = vi.mocked(fetchExpenseExchangeRate);

// jsdom has no layout, so the listbox's scroll-to-highlighted call is a no-op here.
Element.prototype.scrollIntoView = () => {};

afterEach(() => {
  cleanup();
  rateMock.mockReset();
});

const saved = {
  id: "00000000-0000-4000-8000-000000000001",
  description: "Train to Leeds",
  category: null,
  spentAt: "2026-04-02",
  amountPence: 1500,
  status: "recorded",
  source: "manual",
  billable: false,
  clientId: null,
  paidByUserId: null,
};

/** The header and form as the expense page lays them out. */
function renderExpensePage(expense: Parameters<typeof ExpenseForm>[0]["expense"] = saved) {
  render(
    <AlertProvider>
      <ExpenseSummaryProvider
        initialDescription={expense!.description}
        initialPence={expense!.amountPence}
        initialOriginal={null}
      >
        <ExpenseTitle fallback={expense!.description} />
        <ExpenseAmountCard />
        <ExpenseForm
          mode="edit"
          expense={expense}
          founders={[]}
          clients={[]}
          canWrite
          defaultMileageRatePence={45}
        />
      </ExpenseSummaryProvider>
    </AlertProvider>,
  );
}

function type(label: RegExp, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

/** Pick an option in the app's listbox Select. */
function choose(label: RegExp, option: string) {
  fireEvent.click(screen.getByLabelText(label));
  fireEvent.click(screen.getByRole("option", { name: option }));
}

const title = () => screen.getByRole("heading", { level: 1 }).textContent;

describe("expense page header", () => {
  it("shows the description as you type, and the saved one when it's blank", () => {
    renderExpensePage();
    expect(title()).toBe("Train to Leeds");

    type(/^Description/, "Train to York");
    expect(title()).toBe("Train to York");

    type(/^Description/, "  ");
    expect(title()).toBe("Train to Leeds");
  });

  it("shows the amount as you type, and a dash when it isn't a number", () => {
    renderExpensePage();
    expect(screen.getByText("£15.00")).toBeTruthy();

    type(/^Amount \(£\)/, "42.10");
    expect(screen.getByText("£42.10")).toBeTruthy();

    type(/^Amount \(£\)/, "abc");
    expect(screen.getByText("—")).toBeTruthy();
  });
});

describe("foreign currency amounts", () => {
  it("converts at the Bank of England rate until the GBP amount is typed over", async () => {
    rateMock.mockResolvedValue({ ok: true, foreignPerGbp: 1.25, observationDate: "2026-04-01" });
    renderExpensePage();

    // The amount already typed carries across as the dollar amount.
    choose(/^Currency/, "USD");
    expect((screen.getByLabelText(/^Amount \(US\$\)/) as HTMLInputElement).value).toBe("15");
    expect(await screen.findByText("£12.00")).toBeTruthy();
    expect(screen.getByText("US$15.00 paid")).toBeTruthy();
    expect(rateMock).toHaveBeenCalledWith("USD", "2026-04-02");

    type(/^Amount \(US\$\)/, "20");
    expect(screen.getByText("£16.00")).toBeTruthy();
    expect((screen.getByLabelText(/^Amount in GBP/) as HTMLInputElement).value).toBe("16");

    type(/^Amount in GBP/, "16.20");
    expect(screen.getByText("£16.20")).toBeTruthy();
    expect(screen.getByText(/The Bank of England rate is £1 = 1.25 USD/)).toBeTruthy();

    // A new foreign amount recalculates the GBP amount.
    type(/^Amount \(US\$\)/, "25");
    expect(screen.getByText("£20.00")).toBeTruthy();
  });

  it("asks for the GBP amount when there's no exchange rate", async () => {
    rateMock.mockResolvedValue({ ok: false, error: "No USD exchange rate available" });
    renderExpensePage();

    choose(/^Currency/, "USD");
    expect(await screen.findByText(/No USD exchange rate is available/)).toBeTruthy();
    expect((screen.getByLabelText(/^Amount in GBP/) as HTMLInputElement).value).toBe("");
    expect(screen.getByText("—")).toBeTruthy();
  });

  it("opens a saved foreign expense with its own GBP amount, not a fresh conversion", async () => {
    rateMock.mockResolvedValue({ ok: true, foreignPerGbp: 1.25, observationDate: "2026-04-01" });
    renderExpensePage({
      ...saved,
      amountPence: 1620,
      detectedCurrency: "USD",
      originalAmountMinor: 2000,
    });

    expect(await screen.findByText(/The Bank of England rate is/)).toBeTruthy();
    expect((screen.getByLabelText(/^Amount in GBP/) as HTMLInputElement).value).toBe("16.2");
  });
});
