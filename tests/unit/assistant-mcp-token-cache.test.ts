import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

/** Clerk's verify call, counted so the tests can see when it's skipped. */
const clerk = vi.hoisted(() => ({
  verify: vi.fn(),
}));

vi.mock("@clerk/nextjs/server", () => ({
  clerkClient: async () => ({ idPOAuthAccessToken: { verify: clerk.verify } }),
}));

const { verifyAssistantRequest, forgetVerifiedTokens, TOKEN_CACHE_MS } = await import(
  "@/lib/assistant/mcp/oauth"
);

const ORIGIN = "https://alfa.example.com";

function accepted(expiration = Date.now() + 3_600_000) {
  return { clientId: "client_claude", subject: "user_1", scopes: [], revoked: false, expired: false, expiration };
}

function call(token = "token-1") {
  return verifyAssistantRequest(
    new Request(`${ORIGIN}/api/mcp`, { method: "POST", headers: { Authorization: `Bearer ${token}` } }),
    ORIGIN,
  );
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-10T12:00:00Z"));
  clerk.verify.mockReset();
  forgetVerifiedTokens();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("assistant token cache", () => {
  it("asks Clerk once for a burst of calls on the same token", async () => {
    clerk.verify.mockImplementation(async () => accepted());
    const results = await Promise.all(Array.from({ length: 18 }, () => call()));
    for (const result of results) expect(result).not.toBeInstanceOf(Response);
    expect(clerk.verify).toHaveBeenCalledTimes(1);
  });

  it("asks Clerk again once the cache time has passed", async () => {
    clerk.verify.mockImplementation(async () => accepted());
    await call();
    vi.setSystemTime(Date.now() + TOKEN_CACHE_MS - 1);
    await call();
    expect(clerk.verify).toHaveBeenCalledTimes(1);
    vi.setSystemTime(Date.now() + 2);
    await call();
    expect(clerk.verify).toHaveBeenCalledTimes(2);
  });

  it("checks each token separately", async () => {
    clerk.verify.mockImplementation(async () => accepted());
    await call("token-1");
    await call("token-2");
    expect(clerk.verify).toHaveBeenCalledTimes(2);
  });

  it("doesn't remember a token Clerk refused", async () => {
    clerk.verify.mockRejectedValueOnce(new Error("invalid"));
    const refused = await call();
    expect(refused).toBeInstanceOf(Response);
    expect((refused as Response).status).toBe(401);

    clerk.verify.mockImplementation(async () => accepted());
    expect(await call()).not.toBeInstanceOf(Response);
    expect(clerk.verify).toHaveBeenCalledTimes(2);
  });

  it("doesn't trust a token past its own expiry", async () => {
    clerk.verify.mockImplementation(async () => accepted(Date.now() + 10_000));
    await call();
    vi.setSystemTime(Date.now() + 10_001);
    await call();
    expect(clerk.verify).toHaveBeenCalledTimes(2);
  });
});
