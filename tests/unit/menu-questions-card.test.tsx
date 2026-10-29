// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MenuQuestionsCard } from "@/components/menu/menu-questions-card";
import { answerMenuQuestions, skipMenuQuestions } from "@/actions/menu";
import { bundlesFor } from "@/lib/menu/features";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh }),
}));
vi.mock("@/components/ui/toast-store", () => ({ toast: vi.fn() }));
vi.mock("@/actions/menu", () => ({
  answerMenuQuestions: vi.fn(async () => ({ ok: true, id: "u1" })),
  skipMenuQuestions: vi.fn(async () => ({ ok: true, id: "u1" })),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("menu questions card", () => {
  it("leaves out the limited-company question for a sole trader", () => {
    render(<MenuQuestionsCard bundles={bundlesFor("sole_trader")} />);
    expect(screen.getByText(/quotes or estimates/)).toBeTruthy();
    expect(screen.queryByText(/dividends or a director's loan/)).toBeNull();
  });

  it("sends the chosen answers, then refreshes", async () => {
    render(<MenuQuestionsCard bundles={bundlesFor("limited_company")} />);
    const quotes = screen.getByRole("group", { name: /quotes or estimates/ });
    fireEvent.click(quotes.querySelector<HTMLInputElement>('input[value="yes"]')!);
    fireEvent.click(screen.getByRole("button", { name: "Set up my menu" }));

    await waitFor(() => expect(refresh).toHaveBeenCalled());
    const formData = vi.mocked(answerMenuQuestions).mock.calls[0]![0];
    expect(formData.get("menu_quotes")).toBe("yes");
    expect(formData.get("menu_payingYourself")).toBe("yes");
    expect(formData.get("menu_planning")).toBe("no");
  });

  it("keeps everything when skipped", async () => {
    render(<MenuQuestionsCard bundles={bundlesFor("limited_company")} />);
    fireEvent.click(screen.getByRole("button", { name: "Show me everything" }));
    await waitFor(() => expect(skipMenuQuestions).toHaveBeenCalledOnce());
    expect(answerMenuQuestions).not.toHaveBeenCalled();
  });

  it("shows the error when saving fails", async () => {
    vi.mocked(skipMenuQuestions).mockResolvedValueOnce({ ok: false, error: "Try later." });
    render(<MenuQuestionsCard bundles={bundlesFor("limited_company")} />);
    fireEvent.click(screen.getByRole("button", { name: "Show me everything" }));
    expect((await screen.findByRole("alert")).textContent).toBe("Try later.");
    expect(refresh).not.toHaveBeenCalled();
  });
});
