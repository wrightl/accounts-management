import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestDb, type TestDatabase } from "@/db/pglite";
import { setTestDb, type Database } from "@/db";
import { fxRates } from "@/db/schema";
import { resetFxFetchBackoff, resolveFxRate } from "@/lib/bank/fx";
import { documentRate } from "@/lib/document-rate";

vi.mock("server-only", () => ({}));

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
      ["DATE,XUDLUSS", "01 Apr 2026,1.2700", "02 Apr 2026,1.2750"].join("\n"),
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

describe("documentRate", () => {
  it("is 1 for sterling without fetching", async () => {
    const fetchImpl = vi.fn() as unknown as typeof fetch;
    const result = await documentRate("gbp", "2026-05-01", fetchImpl);
    expect(result).toEqual({
      ok: true,
      rate: { currency: "GBP", fxRate: 1, fxRateDate: null, fxRateSource: null },
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("uses the Bank of England rate on or before the document date", async () => {
    await db.insert(fxRates).values({
      currency: "USD",
      observationDate: "2026-04-30",
      foreignPerGbp: 1.2731,
    });
    const fetchImpl = vi.fn() as unknown as typeof fetch;
    const result = await documentRate("USD", "2026-05-01", fetchImpl);
    expect(result).toEqual({
      ok: true,
      rate: { currency: "USD", fxRate: 1.2731, fxRateDate: "2026-04-30", fxRateSource: "boe" },
    });
  });

  it("asks for a rate by hand when the Bank of England can't be reached", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error("offline")) as unknown as typeof fetch;
    const result = await documentRate("EUR", "2026-05-01", fetchImpl);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/Enter the rate yourself/);
  });

  it("refuses currencies documents can't be issued in", async () => {
    const result = await documentRate("JPY", "2026-05-01");
    expect(result.ok).toBe(false);
  });
});
