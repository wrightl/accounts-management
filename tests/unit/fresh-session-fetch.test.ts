import { describe, expect, it, vi } from "vitest";
import { isNextServerRequest, withFreshSession } from "@/lib/fresh-session-fetch";

describe("isNextServerRequest", () => {
  it("spots server actions and RSC navigations", () => {
    expect(isNextServerRequest("/invoices", { headers: { "Next-Action": "abc" } })).toBe(true);
    expect(isNextServerRequest("/invoices", { headers: { RSC: "1" } })).toBe(true);
    expect(isNextServerRequest(new Request("http://x/invoices", { headers: { rsc: "1" } }))).toBe(true);
  });

  it("leaves other requests alone", () => {
    expect(isNextServerRequest("/api/export")).toBe(false);
    expect(isNextServerRequest("/api/export", { headers: { Accept: "text/csv" } })).toBe(false);
  });
});

describe("withFreshSession", () => {
  const ok = () => Promise.resolve(new Response("ok"));

  it("renews the token before a server action is sent", async () => {
    const order: string[] = [];
    const fetchImpl = vi.fn(async () => {
      order.push("fetch");
      return ok();
    });
    const renew = vi.fn(async () => {
      order.push("renew");
    });

    await withFreshSession(fetchImpl, renew)("/", { headers: { "next-action": "abc" } });

    expect(order).toEqual(["renew", "fetch"]);
  });

  it("does not renew for other requests", async () => {
    const renew = vi.fn(async () => {});
    await withFreshSession(vi.fn(ok), renew)("/api/export");
    expect(renew).not.toHaveBeenCalled();
  });

  it("still sends the request when renewal fails", async () => {
    const fetchImpl = vi.fn(ok);
    await withFreshSession(fetchImpl, () => Promise.reject(new Error("offline")))("/", {
      headers: { rsc: "1" },
    });
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it("stops waiting for a slow renewal", async () => {
    vi.useFakeTimers();
    try {
      const fetchImpl = vi.fn(ok);
      const sent = withFreshSession(fetchImpl, () => new Promise(() => {}), 3000)("/", {
        headers: { rsc: "1" },
      });
      await vi.advanceTimersByTimeAsync(3000);
      await sent;
      expect(fetchImpl).toHaveBeenCalledOnce();
    } finally {
      vi.useRealTimers();
    }
  });
});
