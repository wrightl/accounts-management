/**
 * Seeded randomness for the demo company, so a reset tells the same story
 * every time. Not for anything security-related.
 */

/** 32-bit hash of a string (xmur3), used to seed {@link createRandom}. */
export function hashSeed(text: string): number {
  let h = 1779033703 ^ text.length;
  for (let i = 0; i < text.length; i++) {
    h = Math.imul(h ^ text.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return (h ^= h >>> 16) >>> 0;
}

export type Random = ReturnType<typeof createRandom>;

/** A mulberry32 generator with the helpers the demo story needs. */
export function createRandom(seed: string) {
  let state = hashSeed(seed);
  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  return {
    next,
    /** Integer from `min` to `max` inclusive. */
    int(min: number, max: number): number {
      return min + Math.floor(next() * (max - min + 1));
    },
    /** True with probability `p`. */
    chance(p: number): boolean {
      return next() < p;
    },
    pick<T>(items: readonly T[]): T {
      return items[Math.floor(next() * items.length)]!;
    },
    /** Pick by weight: `[[value, weight], ...]`. */
    weighted<T>(items: ReadonlyArray<readonly [T, number]>): T {
      const total = items.reduce((t, [, w]) => t + w, 0);
      let roll = next() * total;
      for (const [value, weight] of items) {
        roll -= weight;
        if (roll < 0) return value;
      }
      return items[items.length - 1]![0];
    },
    /** A whole number of pence from `minPounds` to `maxPounds`, rounded to `stepPence`. */
    pence(minPounds: number, maxPounds: number, stepPence = 1): number {
      const raw = minPounds * 100 + next() * (maxPounds - minPounds) * 100;
      return Math.max(stepPence, Math.round(raw / stepPence) * stepPence);
    },
    /** A UUID (v4 layout) drawn from this generator. */
    uuid(): string {
      const hex = Array.from({ length: 32 }, () => Math.floor(next() * 16).toString(16));
      hex[12] = "4";
      hex[16] = ((parseInt(hex[16]!, 16) & 0x3) | 0x8).toString(16);
      const s = hex.join("");
      return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20)}`;
    },
    /** Lowercase hex string of `length` characters. */
    hex(length: number): string {
      return Array.from({ length }, () => Math.floor(next() * 16).toString(16)).join("");
    },
  };
}
