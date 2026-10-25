import { describe, it, expect } from "vitest";
import { mapWithConcurrency } from "@/lib/concurrency";

describe("mapWithConcurrency", () => {
  it("visits every item once with its index, never exceeding the limit", async () => {
    let inFlight = 0;
    let peak = 0;
    const seen: [string, number][] = [];
    await mapWithConcurrency(["a", "b", "c", "d", "e"], 2, async (item, index) => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 5));
      seen.push([item, index]);
      inFlight--;
    });
    expect(peak).toBe(2);
    expect(seen.sort()).toEqual([["a", 0], ["b", 1], ["c", 2], ["d", 3], ["e", 4]]);
  });

  it("does nothing for an empty list", async () => {
    await expect(mapWithConcurrency([], 3, async () => {})).resolves.toBeUndefined();
  });
});
