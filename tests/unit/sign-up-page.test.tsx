// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import SignUpPage from "@/app/sign-up/[[...sign-up]]/page";

const signUp = vi.hoisted(() => vi.fn());

vi.mock("@clerk/nextjs", () => ({
  SignUp: (props: { forceRedirectUrl?: string }) => {
    signUp(props);
    return <div>Clerk sign-up</div>;
  },
}));
vi.mock("@/actions/signup-plan", () => ({ saveSignupPlanChoice: vi.fn() }));
vi.mock("@/components/brand/auth-frame", () => ({
  AuthFrame: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock("@/components/signup/plan-picker", () => ({
  SignupPlanPicker: ({ onConfirmed }: { onConfirmed: () => void }) => (
    <button onClick={onConfirmed}>Pick a plan</button>
  ),
}));
vi.mock("@/lib/billing/catalog", () => ({
  getStripeCatalog: vi.fn().mockResolvedValue(null),
}));

describe("SignUpPage", () => {
  it("sends invitees to the dashboard, not onboarding", async () => {
    render(
      await SignUpPage({
        searchParams: Promise.resolve({ __clerk_ticket: "ticket" }),
      }),
    );
    expect(screen.getByText("Clerk sign-up")).toBeTruthy();
    expect(signUp).toHaveBeenCalledWith(
      expect.objectContaining({ forceRedirectUrl: "/dashboard" }),
    );
  });

  it("leaves self-serve sign-ups on the provider's onboarding default", async () => {
    signUp.mockClear();
    render(await SignUpPage({ searchParams: Promise.resolve({}) }));
    screen.getByText("Pick a plan").click();
    await screen.findAllByText("Clerk sign-up");
    expect(signUp.mock.calls.at(-1)?.[0].forceRedirectUrl).toBeUndefined();
  });
});
