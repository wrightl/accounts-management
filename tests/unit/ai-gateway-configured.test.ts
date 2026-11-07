import { describe, expect, it, vi } from "vitest";

const { serverEnv } = vi.hoisted(() => ({ serverEnv: vi.fn() }));
vi.mock("@/env", () => ({ serverEnv }));

import { aiGatewayConfigured } from "@/lib/ai/models";

describe("aiGatewayConfigured", () => {
  it("is on with an API key", () => {
    serverEnv.mockReturnValue({ AI_GATEWAY_API_KEY: "key" });
    expect(aiGatewayConfigured()).toBe(true);
  });

  it("is off without an API key, even on Vercel with an OIDC token", () => {
    serverEnv.mockReturnValue({ AI_GATEWAY_API_KEY: undefined });
    vi.stubEnv("VERCEL_OIDC_TOKEN", "token");
    expect(aiGatewayConfigured()).toBe(false);
    vi.unstubAllEnvs();
  });

  it("is off with an empty API key", () => {
    serverEnv.mockReturnValue({ AI_GATEWAY_API_KEY: "" });
    expect(aiGatewayConfigured()).toBe(false);
  });
});
