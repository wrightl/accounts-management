// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ForgotPasswordForm } from "@/components/auth/forgot-password-form";

const push = vi.fn();

// Focus and scroll on errors needs browser APIs jsdom lacks.
vi.mock("@/components/ui/focus-first-field-error", () => ({
  scheduleFocusFirstFieldError: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, refresh: vi.fn() }),
}));

type Result = { error: unknown };
const ok: Result = { error: null };

const signIn = {
  status: "needs_identifier" as string,
  create: vi.fn<(p: unknown) => Promise<Result>>(),
  reset: vi.fn(async () => ok),
  finalize: vi.fn<(p: unknown) => Promise<Result>>(),
  resetPasswordEmailCode: {
    sendCode: vi.fn<() => Promise<Result>>(),
    verifyCode: vi.fn<(p: unknown) => Promise<Result>>(),
    submitPassword: vi.fn<(p: unknown) => Promise<Result>>(),
  },
};

vi.mock("@clerk/nextjs", () => ({
  useSignIn: () => ({ signIn, errors: {}, fetchStatus: "idle" }),
}));

beforeEach(() => {
  signIn.status = "needs_identifier";
  signIn.create.mockResolvedValue(ok);
  signIn.resetPasswordEmailCode.sendCode.mockResolvedValue(ok);
  signIn.resetPasswordEmailCode.verifyCode.mockImplementation(async () => {
    signIn.status = "needs_new_password";
    return ok;
  });
  signIn.resetPasswordEmailCode.submitPassword.mockImplementation(async () => {
    signIn.status = "complete";
    return ok;
  });
  signIn.finalize.mockImplementation(async (params) => {
    const { navigate } = params as {
      navigate: (a: { decorateUrl: (u: string) => string }) => void;
    };
    navigate({ decorateUrl: (u) => u });
    return ok;
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function fill(label: string, value: string) {
  fireEvent.change(screen.getByLabelText(new RegExp(`^${label}`)), {
    target: { value },
  });
}

async function requestCode(email = "a@example.com") {
  fill("Email", email);
  fireEvent.click(screen.getByRole("button", { name: "Send reset code" }));
  await screen.findByLabelText(/^Reset code/);
}

function submitReset(code = "123456", password = "new-password-1") {
  fill("Reset code", code);
  fill("New password", password);
  fill("Confirm new password", password);
  fireEvent.click(screen.getByRole("button", { name: "Reset password" }));
}

describe("ForgotPasswordForm", () => {
  it("resets the password and signs the user in", async () => {
    render(<ForgotPasswordForm />);
    await requestCode();
    expect(signIn.create).toHaveBeenCalledWith({ identifier: "a@example.com" });

    submitReset();
    await waitFor(() => expect(push).toHaveBeenCalledWith("/dashboard"));
    expect(signIn.resetPasswordEmailCode.verifyCode).toHaveBeenCalledWith({
      code: "123456",
    });
    expect(signIn.resetPasswordEmailCode.submitPassword).toHaveBeenCalledWith({
      password: "new-password-1",
      signOutOfOtherSessions: true,
    });
  });

  it("does not reveal that an email has no account", async () => {
    signIn.create.mockResolvedValue({ error: { code: "form_identifier_not_found" } });
    render(<ForgotPasswordForm />);
    await requestCode("nobody@example.com");
    expect(signIn.resetPasswordEmailCode.sendCode).not.toHaveBeenCalled();

    submitReset();
    expect(
      (await screen.findAllByText("That code is not right or has expired")).length,
    ).toBeGreaterThan(0);
    expect(signIn.resetPasswordEmailCode.verifyCode).not.toHaveBeenCalled();
  });

  it("shows the same message for a wrong code on a real account", async () => {
    signIn.resetPasswordEmailCode.verifyCode.mockResolvedValue({
      error: { code: "form_code_incorrect", message: "Incorrect code" },
    });
    render(<ForgotPasswordForm />);
    await requestCode();
    submitReset();
    expect(
      (await screen.findAllByText("That code is not right or has expired")).length,
    ).toBeGreaterThan(0);
    expect(screen.queryByText("Incorrect code")).toBeNull();
  });

  it("skips the code check when retrying after a rejected password", async () => {
    signIn.resetPasswordEmailCode.submitPassword.mockResolvedValueOnce({
      error: { longMessage: "This password has been found in a data breach." },
    });
    render(<ForgotPasswordForm />);
    await requestCode();
    submitReset();
    expect(
      (await screen.findAllByText("This password has been found in a data breach."))
        .length,
    ).toBeGreaterThan(0);

    submitReset("123456", "another-password-2");
    await waitFor(() => expect(push).toHaveBeenCalledWith("/dashboard"));
    expect(signIn.resetPasswordEmailCode.verifyCode).toHaveBeenCalledTimes(1);
  });

  it("sends the user to sign in when a second factor is still needed", async () => {
    signIn.resetPasswordEmailCode.submitPassword.mockImplementation(async () => {
      signIn.status = "needs_second_factor";
      return ok;
    });
    render(<ForgotPasswordForm />);
    await requestCode();
    submitReset();

    const link = await screen.findByRole("link", { name: "Go to sign in" });
    expect(link.getAttribute("href")).toBe("/sign-in");
    expect(signIn.finalize).not.toHaveBeenCalled();
  });
});
