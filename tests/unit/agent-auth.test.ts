import { describe, expect, it } from "vitest";
import {
  assertAgentAuthAllowed,
  pickFounder,
  resolveRedirectUrl,
  ticketSignInUrl,
  type FounderCandidate,
} from "@/lib/agent-auth";

const founders: FounderCandidate[] = [
  {
    email: "ops@example.com",
    clerkUserId: "user_ops",
    role: "platform_admin",
    companyId: null,
  },
  {
    email: "pending@example.com",
    clerkUserId: "user_pending",
    role: "pending",
    companyId: "co_1",
  },
  {
    email: "orphan@example.com",
    clerkUserId: null,
    role: "admin",
    companyId: "co_1",
  },
  {
    email: "founder@example.com",
    clerkUserId: "user_founder",
    role: "admin",
    companyId: "co_1",
  },
  {
    email: "cofounder@example.com",
    clerkUserId: "user_co",
    role: "user",
    companyId: "co_1",
  },
];

describe("assertAgentAuthAllowed", () => {
  it("allows development secrets locally", () => {
    expect(() =>
      assertAgentAuthAllowed({
        clerkSecretKey: "sk_test_abc",
        nodeEnv: "development",
      }),
    ).not.toThrow();
  });

  it("refuses live Clerk secrets", () => {
    expect(() =>
      assertAgentAuthAllowed({
        clerkSecretKey: "sk_live_abc",
        nodeEnv: "development",
      }),
    ).toThrow(/live Clerk secret/i);
  });

  it("refuses NODE_ENV=production", () => {
    expect(() =>
      assertAgentAuthAllowed({
        clerkSecretKey: "sk_test_abc",
        nodeEnv: "production",
      }),
    ).toThrow(/NODE_ENV=production/);
  });

  it("refuses Vercel environments", () => {
    expect(() =>
      assertAgentAuthAllowed({
        clerkSecretKey: "sk_test_abc",
        nodeEnv: "development",
        vercel: "1",
      }),
    ).toThrow(/Vercel/i);
  });
});

describe("pickFounder", () => {
  it("picks the first admin/user with company and Clerk id", () => {
    expect(pickFounder(founders).email).toBe("founder@example.com");
  });

  it("honours --email override", () => {
    expect(pickFounder(founders, "cofounder@example.com").email).toBe(
      "cofounder@example.com",
    );
  });

  it("ignores platform admins and incomplete rows", () => {
    expect(() => pickFounder(founders, "ops@example.com")).toThrow(
      /No tenant founder/,
    );
    expect(() => pickFounder(founders, "orphan@example.com")).toThrow(
      /No tenant founder/,
    );
  });

  it("throws when no founder exists", () => {
    expect(() =>
      pickFounder([
        {
          email: "ops@example.com",
          clerkUserId: "user_ops",
          role: "platform_admin",
          companyId: null,
        },
      ]),
    ).toThrow(/No tenant founder found/);
  });
});

describe("resolveRedirectUrl", () => {
  it("defaults to /dashboard on localhost:3001", () => {
    expect(resolveRedirectUrl(null)).toBe("http://localhost:3001/dashboard");
  });

  it("joins a relative path", () => {
    expect(resolveRedirectUrl("/settings")).toBe(
      "http://localhost:3001/settings",
    );
    expect(resolveRedirectUrl("settings")).toBe(
      "http://localhost:3001/settings",
    );
  });

  it("passes through absolute URLs", () => {
    expect(resolveRedirectUrl("http://localhost:3001/invoices")).toBe(
      "http://localhost:3001/invoices",
    );
  });
});

describe("ticketSignInUrl", () => {
  it("builds a sign-in URL with the ticket query param", () => {
    expect(ticketSignInUrl("tok_abc")).toBe(
      "http://localhost:3001/sign-in?__clerk_ticket=tok_abc",
    );
  });
});
