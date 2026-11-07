import { beforeEach, describe, expect, it, vi } from "vitest";

const { ai, stored } = vi.hoisted(() => ({
  ai: { on: false },
  stored: { provider: "ai_gateway" },
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/ai/models", () => ({ aiGatewayConfigured: () => ai.on }));
vi.mock("@/db", () => {
  const query = {
    select: () => query,
    from: () => query,
    where: () => query,
    limit: async () => [
      { defaultReceiptOcrProvider: stored.provider, defaultReceiptOcrModel: "google/gemini-2.5-flash" },
    ],
  };
  return { hasDatabaseClient: () => true, getDb: () => query };
});

import { getReceiptOcrSettings } from "@/lib/platform-settings";

describe("getReceiptOcrSettings", () => {
  beforeEach(() => {
    ai.on = false;
    stored.provider = "ai_gateway";
  });

  it("reads locally when AI Gateway is chosen but AI isn't set up", async () => {
    expect((await getReceiptOcrSettings()).provider).toBe("local");
  });

  it("uses AI Gateway when chosen and set up", async () => {
    ai.on = true;
    expect(await getReceiptOcrSettings()).toEqual({
      provider: "ai_gateway",
      model: "google/gemini-2.5-flash",
    });
  });

  it("keeps local when local is chosen, even with AI set up", async () => {
    ai.on = true;
    stored.provider = "local";
    expect((await getReceiptOcrSettings()).provider).toBe("local");
  });
});
