import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestDb } from "@/db/pglite";
import { setTestDb, type Database } from "@/db";
import { rateLimitBuckets } from "@/db/schema";

vi.mock("server-only", () => ({}));

const { clientIp, hitRateLimit, isOverRateLimit, purgeOldRateLimitBuckets } = await import("@/lib/rate-limit");

let ctx: Awaited<ReturnType<typeof createTestDb>>;
const rule = { limit: 3, windowSeconds: 60 };
const at = (iso: string) => new Date(iso);

beforeEach(async () => {
  ctx = await createTestDb();
  setTestDb(ctx.db as unknown as Database);
});

afterEach(async () => {
  setTestDb(null);
  await ctx.client.close();
  vi.unstubAllEnvs();
});

describe("hitRateLimit", () => {
  it("allows up to the limit in a window, then refuses until the next one", async () => {
    const t = at("2026-11-28T10:00:15Z");
    const results = [];
    for (let i = 0; i < 4; i++) results.push(await hitRateLimit("k", rule, t));
    expect(results.map((r) => r.allowed)).toEqual([true, true, true, false]);
    expect(results[3]!.retryAfterSeconds).toBe(45);

    expect((await hitRateLimit("k", rule, at("2026-11-28T10:01:00Z"))).allowed).toBe(true);
    expect((await hitRateLimit("other", rule, t)).allowed).toBe(true);
  });

  it("counts every call when they arrive together", async () => {
    const t = at("2026-11-28T10:00:15Z");
    const results = await Promise.all(Array.from({ length: 10 }, () => hitRateLimit("k", rule, t)));
    expect(results.filter((r) => r.allowed)).toHaveLength(3);
    const [row] = await ctx.db.select().from(rateLimitBuckets);
    expect(row!.count).toBe(10);
  });
});

describe("isOverRateLimit", () => {
  it("reports a used-up window without counting a call", async () => {
    const t = at("2026-11-28T10:00:59Z");
    expect((await isOverRateLimit("k", rule, t)).allowed).toBe(true);
    for (let i = 0; i < 3; i++) await hitRateLimit("k", rule, t);
    const over = await isOverRateLimit("k", rule, t);
    expect(over).toEqual({ allowed: false, retryAfterSeconds: 1 });
    const [row] = await ctx.db.select().from(rateLimitBuckets);
    expect(row!.count).toBe(3);
  });
});

describe("purgeOldRateLimitBuckets", () => {
  it("deletes windows over a day old and keeps recent ones", async () => {
    await hitRateLimit("old", rule, at("2026-11-26T10:00:00Z"));
    await hitRateLimit("recent", rule, at("2026-11-28T09:00:00Z"));
    expect(await purgeOldRateLimitBuckets(at("2026-11-28T10:00:00Z"))).toBe(1);
    const rows = await ctx.db.select().from(rateLimitBuckets);
    expect(rows.map((r) => r.key)).toEqual(["recent"]);
  });
});

describe("clientIp", () => {
  it("takes the first address the proxy forwarded, and ignores junk", () => {
    expect(clientIp(new Headers({ "x-forwarded-for": "203.0.113.7, 10.0.0.1" }))).toBe("203.0.113.7");
    expect(clientIp(new Headers({ "x-real-ip": "2001:db8::1" }))).toBe("2001:db8::1");
    expect(clientIp(new Headers({ "x-forwarded-for": "not-an-ip" }))).toBeNull();
  });

  it("reads only the header a host names in CLIENT_IP_HEADER", () => {
    vi.stubEnv("CLIENT_IP_HEADER", "CF-Connecting-IP");
    const headers = new Headers({ "x-forwarded-for": "198.51.100.2", "cf-connecting-ip": "203.0.113.7" });
    expect(clientIp(headers)).toBe("203.0.113.7");
    expect(clientIp(new Headers({ "x-forwarded-for": "198.51.100.2" }))).toBeNull();
  });
});
