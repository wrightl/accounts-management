import { afterEach, describe, expect, it, vi } from "vitest";

const getCurrentUser = vi.fn();
const isPlatformAdmin = vi.fn();

vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
}));
vi.mock("@/lib/auth", () => ({ getCurrentUser: () => getCurrentUser() }));
vi.mock("@/lib/platform", () => ({
  isPlatformAdmin: (u: unknown) => isPlatformAdmin(u),
}));
vi.mock("@/components/auth/forgot-password-form", () => ({
  ForgotPasswordForm: () => null,
}));

const { default: ForgotPasswordPage } = await import("@/app/forgot-password/page");

afterEach(() => vi.clearAllMocks());

describe("/forgot-password", () => {
  it("renders the form for signed-out visitors", async () => {
    getCurrentUser.mockResolvedValue(null);
    await expect(ForgotPasswordPage()).resolves.toBeTruthy();
  });

  it("sends signed-in users to their profile", async () => {
    getCurrentUser.mockResolvedValue({ userId: "u1" });
    isPlatformAdmin.mockReturnValue(false);
    await expect(ForgotPasswordPage()).rejects.toThrow("REDIRECT:/profile#password");
  });

  it("sends platform operators to the platform profile", async () => {
    getCurrentUser.mockResolvedValue({ userId: "u1" });
    isPlatformAdmin.mockReturnValue(true);
    await expect(ForgotPasswordPage()).rejects.toThrow(
      "REDIRECT:/platform/profile#password",
    );
  });
});
