// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { AlertProvider } from "@/components/ui/alert-dialog";
import { ExpenseForm } from "@/components/expenses/expense-form";
import { updateExpense, updateExpenseCoverDates } from "@/actions/expenses";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, refresh: vi.fn() }),
}));
vi.mock("@/actions/clients", () => ({ createClient: vi.fn() }));
vi.mock("@/actions/expenses", () => ({
  createExpense: vi.fn(),
  updateExpense: vi.fn(),
  updateExpenseCoverDates: vi.fn(),
  deleteExpense: vi.fn(),
  uploadReceipt: vi.fn(),
  approveExpense: vi.fn(),
  rejectExpense: vi.fn(),
  extractReceiptFields: vi.fn(),
  fetchExpenseExchangeRate: vi.fn(),
}));

const updateMock = vi.mocked(updateExpense);
const coverDatesMock = vi.mocked(updateExpenseCoverDates);

afterEach(() => {
  cleanup();
  push.mockReset();
  updateMock.mockReset();
  coverDatesMock.mockReset();
});

function renderForm() {
  const { container } = render(
    <AlertProvider>
      <ExpenseForm
        mode="edit"
        expense={{
          id: "e1",
          description: "Web hosting",
          category: "Software",
          spentAt: "2026-03-10",
          amountPence: 12000,
          status: "company_paid",
          billable: false,
          clientId: null,
          paidByUserId: null,
        }}
        founders={[]}
        clients={[]}
        canWrite
        defaultMileageRatePence={45}
      />
    </AlertProvider>,
  );
  return container.querySelector("form")!;
}

describe("the period an expense pays for", () => {
  it("fills in 12 months from the date spent, and saves the dates on their own", async () => {
    coverDatesMock.mockResolvedValue({ ok: true, id: "e1" });
    const form = renderForm();

    fireEvent.click(screen.getByRole("button", { name: "12 months from the date spent" }));
    expect((screen.getByLabelText("Covers from") as HTMLInputElement).value).toBe("2026-03-10");
    expect((screen.getByLabelText("Covers to") as HTMLInputElement).value).toBe("2027-03-09");

    fireEvent.submit(form);
    await waitFor(() => expect(push).toHaveBeenCalledWith("/expenses/e1"));
    // The full edit, which a locked period refuses, is not used.
    expect(coverDatesMock).toHaveBeenCalledWith("e1", { coversFrom: "2026-03-10", coversTo: "2027-03-09" });
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("uses the full edit when anything else changed too", async () => {
    updateMock.mockResolvedValue({ ok: true, id: "e1" });
    const form = renderForm();

    fireEvent.change(screen.getByLabelText("Covers to"), { target: { value: "2026-06-12" } });
    fireEvent.change(screen.getByLabelText(/description/i), { target: { value: "Hosting renewal" } });
    fireEvent.submit(form);

    await waitFor(() => expect(updateMock).toHaveBeenCalled());
    expect(coverDatesMock).not.toHaveBeenCalled();
  });

  it("refuses an end date before the start date without calling the server", async () => {
    const form = renderForm();

    fireEvent.change(screen.getByLabelText("Covers from"), { target: { value: "2026-06-12" } });
    fireEvent.change(screen.getByLabelText("Covers to"), { target: { value: "2026-06-01" } });
    fireEvent.submit(form);

    expect(await screen.findByText("Covers to must be on or after covers from")).toBeTruthy();
    expect(coverDatesMock).not.toHaveBeenCalled();
    expect(updateMock).not.toHaveBeenCalled();
  });
});
