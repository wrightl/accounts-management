import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestDb, type TestDatabase } from "@/db/pglite";
import { setTestDb, type Database } from "@/db";
import { fxRates } from "@/db/schema";
import { resetFxFetchBackoff, resolveFxRate } from "@/lib/bank/fx";

let ctx: Awaited<ReturnType<typeof createTestDb>>;
let db: TestDatabase;

beforeEach(async () => {
  ctx = await createTestDb();
  db = ctx.db;
  setTestDb(db as unknown as Database);
  resetFxFetchBackoff();
});

afterEach(async () => {
  setTestDb(null);
  await ctx.client.close();
});

function boeFetch(csv: string) {
  return vi.fn().mockResolvedValue({
    ok: true,
    text: async () => csv,
  }) as unknown as typeof fetch & ReturnType<typeof vi.fn>;
}

describe("resolveFxRate", () => {
  it("tolerates concurrent fetches of the same observations", async () => {
    const fetchImpl = boeFetch(
      ["DATE,XUDLUSD", "01 Apr 2026,1.2700", "02 Apr 2026,1.2750"].join("\n"),
    );

    const [a, b] = await Promise.all([
      resolveFxRate("USD", "2026-04-02", fetchImpl),
      resolveFxRate("USD", "2026-04-02", fetchImpl),
    ]);

    expect(a?.foreignPerGbp).toBe(1.275);
    expect(b?.foreignPerGbp).toBe(1.275);
    expect(await db.select().from(fxRates)).toHaveLength(2);
  });

  it("backs off after a failed fetch instead of retrying every call", async () => {
    const fetchImpl = vi
      .fn()
      .mockRejectedValue(new Error("network down")) as unknown as typeof fetch;

    expect(await resolveFxRate("USD", "2026-04-02", fetchImpl)).toBeNull();
    expect(await resolveFxRate("USD", "2026-04-02", fetchImpl)).toBeNull();

    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("falls back to a stale cached rate while backing off", async () => {
    await db.insert(fxRates).values({
      currency: "USD",
      observationDate: "2026-03-01",
      foreignPerGbp: 1.26,
    });
    const fetchImpl = vi
      .fn()
      .mockRejectedValue(new Error("network down")) as unknown as typeof fetch;

    await resolveFxRate("USD", "2026-04-02", fetchImpl);
    const rate = await resolveFxRate("USD", "2026-04-02", fetchImpl);

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(rate?.observationDate).toBe("2026-03-01");
  });
});
