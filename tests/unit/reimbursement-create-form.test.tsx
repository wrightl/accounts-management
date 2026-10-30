// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { CreateReimbursementForm } from "@/components/reimbursements/create-form";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("@/actions/reimbursements", () => ({
  createReimbursementRun: vi.fn(),
}));

// jsdom has no layout, so the listbox's scroll-to-highlighted call is a no-op here.
Element.prototype.scrollIntoView = () => {};

afterEach(cleanup);

const founders = [
  { id: "founder-a", name: "Founder A", email: "a@example.com" },
  { id: "founder-b", name: "Founder B", email: "b@example.com" },
];
const expenses = [
  {
    id: "expense-1",
    description: "Train to Leeds",
    amountPence: 1500,
    spentAt: "2026-04-02",
    paidByUserId: "founder-a",
  },
  {
    id: "expense-2",
    description: "Lunch",
    amountPence: 900,
    spentAt: "2026-04-03",
    paidByUserId: "founder-a",
  },
];

function renderForm(initialExpenseId?: string) {
  render(
    <CreateReimbursementForm
      founders={founders}
      expenses={expenses}
      initialPayeeUserId="founder-a"
      initialExpenseId={initialExpenseId}
    />,
  );
}

/** Pick an option in the app's listbox Select. */
function choosePayee(option: string) {
  fireEvent.click(screen.getByLabelText(/Payee/));
  fireEvent.click(screen.getByRole("option", { name: option }));
}

function checkboxes() {
  return screen.getAllByRole<HTMLInputElement>("checkbox").map((box) => box.checked);
}

describe("CreateReimbursementForm preselection", () => {
  it("ticks the expense it was opened from and totals it", () => {
    renderForm("expense-1");

    expect(checkboxes()).toEqual([true, false]);
    expect(screen.getByText("Total: £15.00")).toBeTruthy();
  });

  it("ticks nothing without an expense", () => {
    renderForm();

    expect(checkboxes()).toEqual([false, false]);
    expect(screen.getByText("Total: £0.00")).toBeTruthy();
  });

  it("clears the preselected expense when the payee changes", () => {
    renderForm("expense-1");

    choosePayee("Founder B");
    expect(screen.getByText("No reimbursable expenses for this founder.")).toBeTruthy();
    choosePayee("Founder A");

    expect(checkboxes()).toEqual([false, false]);
    expect(screen.getByText("Total: £0.00")).toBeTruthy();
  });
});
