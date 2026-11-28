import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({
  unstable_cache: <T,>(fn: T) => fn,
  updateTag: vi.fn(),
  cacheTag: vi.fn(),
  cacheLife: vi.fn(),
}));
vi.mock("@/lib/platform-settings", () => ({
  getPlatformSettings: vi.fn(async () => {
    throw new Error("connect ECONNREFUSED 127.0.0.1:5432");
  }),
}));

const { getStripeCatalog } = await import("@/lib/billing/catalog");

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("getStripeCatalog when the database can't be reached", () => {
  it("returns no catalog during the build, rather than failing it", async () => {
    vi.stubEnv("NEXT_PHASE", "phase-production-build");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await expect(getStripeCatalog()).resolves.toBeNull();
    expect(warn.mock.calls[0]![0]).toContain("stripe.catalog_price_ids_unavailable");
  });

  it("still throws the error while the site is running", async () => {
    vi.stubEnv("NEXT_PHASE", "phase-production-server");
    await expect(getStripeCatalog()).rejects.toThrow("ECONNREFUSED");
  });
});
