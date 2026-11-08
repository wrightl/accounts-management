// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { PasswordSection } from "@/components/users/password-section";

const updatePassword = vi.fn();
let passwordEnabled = true;


// Focus and scroll on errors needs browser APIs jsdom lacks.
vi.mock("@/components/ui/focus-first-field-error", () => ({
  scheduleFocusFirstFieldError: vi.fn(),
}));
vi.mock("@clerk/nextjs", () => ({
  useUser: () => ({
    isLoaded: true,
    user: {
      passwordEnabled,
      primaryEmailAddress: { emailAddress: "a@example.com" },
      updatePassword,
    },
  }),
  // Pass straight through; Clerk would show its own prompt here.
  useReverification: (fn: (...args: unknown[]) => unknown) => fn,
}));
vi.mock("@clerk/nextjs/errors", () => ({
  isReverificationCancelledError: (err: unknown) =>
    (err as { cancelled?: boolean })?.cancelled === true,
}));

afterEach(() => {
  cleanup();
  updatePassword.mockReset();
  passwordEnabled = true;
});

function fill(label: string, value: string) {
  fireEvent.change(screen.getByLabelText(new RegExp(`^${label}`)), {
    target: { value },
  });
}

describe("PasswordSection", () => {
  it("changes the password with the current one and signs out other devices", async () => {
    updatePassword.mockResolvedValue({});
    render(<PasswordSection />);
    fill("Current password", "old-password");
    fill("New password", "new-password-1");
    fill("Confirm new password", "new-password-1");
    fireEvent.click(screen.getByRole("button", { name: "Change password" }));

    await screen.findByText("Password changed.");
    expect(updatePassword).toHaveBeenCalledWith({
      currentPassword: "old-password",
      newPassword: "new-password-1",
      signOutOfOtherSessions: true,
    });
  });

  it("keeps other devices signed in when the box is unticked", async () => {
    updatePassword.mockResolvedValue({});
    render(<PasswordSection />);
    fill("Current password", "old-password");
    fill("New password", "new-password-1");
    fill("Confirm new password", "new-password-1");
    fireEvent.click(screen.getByLabelText("Sign out of other devices"));
    fireEvent.click(screen.getByRole("button", { name: "Change password" }));

    await waitFor(() => expect(updatePassword).toHaveBeenCalled());
    expect(updatePassword.mock.calls[0][0].signOutOfOtherSessions).toBe(false);
  });

  it("sets a first password without asking for a current one", async () => {
    passwordEnabled = false;
    updatePassword.mockResolvedValue({});
    render(<PasswordSection />);
    expect(screen.queryByLabelText(/^Current password/)).toBeNull();
    fill("New password", "new-password-1");
    fill("Confirm new password", "new-password-1");
    fireEvent.click(screen.getByRole("button", { name: "Set password" }));

    await screen.findByText("Password set.");
    expect(updatePassword.mock.calls[0][0].currentPassword).toBeUndefined();
  });

  it("does not call Clerk when the passwords do not match", async () => {
    render(<PasswordSection />);
    fill("Current password", "old-password");
    fill("New password", "new-password-1");
    fill("Confirm new password", "new-password-2");
    fireEvent.click(screen.getByRole("button", { name: "Change password" }));

    await screen.findByText("Passwords do not match");
    expect(updatePassword).not.toHaveBeenCalled();
  });

  it("shows Clerk's message when the change is rejected", async () => {
    updatePassword.mockRejectedValue({
      errors: [{ longMessage: "Password is incorrect. Try again." }],
    });
    render(<PasswordSection />);
    fill("Current password", "wrong");
    fill("New password", "new-password-1");
    fill("Confirm new password", "new-password-1");
    fireEvent.click(screen.getByRole("button", { name: "Change password" }));

    await screen.findByText("Password is incorrect. Try again.");
  });

  it("stays quiet when the user cancels reverification", async () => {
    updatePassword.mockRejectedValue({ cancelled: true, message: "cancelled" });
    render(<PasswordSection />);
    fill("Current password", "old-password");
    fill("New password", "new-password-1");
    fill("Confirm new password", "new-password-1");
    fireEvent.click(screen.getByRole("button", { name: "Change password" }));

    await waitFor(() =>
      expect(
        (screen.getByRole("button", { name: "Change password" }) as HTMLButtonElement)
          .disabled,
      ).toBe(false),
    );
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByText("Password changed.")).toBeNull();
  });
});
