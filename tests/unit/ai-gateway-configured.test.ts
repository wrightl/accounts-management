import { beforeEach, describe, expect, it, vi } from "vitest";

const { serverEnv, getVercelOidcTokenSync } = vi.hoisted(() => ({
  serverEnv: vi.fn(),
  getVercelOidcTokenSync: vi.fn(),
}));
vi.mock("@/env", () => ({ serverEnv }));
vi.mock("@vercel/functions/oidc", () => ({ getVercelOidcTokenSync }));

import { aiGatewayConfigured } from "@/lib/ai/models";

describe("aiGatewayConfigured", () => {
  beforeEach(() => {
    serverEnv.mockReturnValue({ AI_GATEWAY_API_KEY: undefined });
    getVercelOidcTokenSync.mockImplementation(() => {
      throw new Error("The 'x-vercel-oidc-token' header is missing from the request.");
    });
  });

  it("is on with an API key", () => {
    serverEnv.mockReturnValue({ AI_GATEWAY_API_KEY: "key" });
    expect(aiGatewayConfigured()).toBe(true);
  });

  it("is on with an OIDC token from the request, with no key or env var", () => {
    getVercelOidcTokenSync.mockReturnValue("header-token");
    expect(aiGatewayConfigured()).toBe(true);
  });

  it("is off with neither", () => {
    expect(aiGatewayConfigured()).toBe(false);
  });
});
