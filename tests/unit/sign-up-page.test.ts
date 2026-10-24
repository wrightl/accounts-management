import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactElement } from "react";

const { getStripeCatalog } = vi.hoisted(() => ({ getStripeCatalog: vi.fn() }));

vi.mock("@/components/brand/auth-frame", () => ({ AuthFrame: () => null }));
vi.mock("@/components/signup/sign-up-with-plan", () => ({
  ClerkSignUp: () => null,
  SignUpWithPlan: () => null,
}));
vi.mock("@/lib/billing/catalog", () => ({ getStripeCatalog }));

import SignUpPage from "@/app/sign-up/[[...sign-up]]/page";
import { AuthFrame } from "@/components/brand/auth-frame";
import { ClerkSignUp, SignUpWithPlan } from "@/components/signup/sign-up-with-plan";

type Frame = ReactElement<{ children: ReactElement }>;

beforeEach(() => {
  getStripeCatalog.mockReset().mockResolvedValue(null);
});

describe("sign-up page", () => {
  it("shows the plain sign-up form for an invitation ticket", async () => {
    const page = (await SignUpPage({
      searchParams: Promise.resolve({ __clerk_ticket: "tkt_1", plan: "pro" }),
    })) as Frame;

    expect(page.type).toBe(AuthFrame);
    expect(page.props.children.type).toBe(ClerkSignUp);
    expect(getStripeCatalog).not.toHaveBeenCalled();
  });

  it("shows the plan picker without a ticket", async () => {
    const page = (await SignUpPage({ searchParams: Promise.resolve({}) })) as Frame;

    expect(page.props.children.type).toBe(SignUpWithPlan);
    expect(getStripeCatalog).toHaveBeenCalled();
  });
});
