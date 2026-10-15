import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Every exported platform action must authorise through `platformMutate`.
 * A new action that forgets the guard would be callable by any signed-in user,
 * so this checks the source rather than relying on each action having a test.
 */
const PUBLIC_ACTIONS = new Set(["reportClientError"]);

describe("actions/platform.ts", () => {
  const source = readFileSync(join(process.cwd(), "src/actions/platform.ts"), "utf8");
  const exported = [...source.matchAll(/^export async function (\w+)/gm)].map((m) => m[1]);

  it("exports actions", () => {
    expect(exported.length).toBeGreaterThan(10);
  });

  it.each(exported.filter((name) => !PUBLIC_ACTIONS.has(name)))(
    "%s goes through platformMutate",
    (name) => {
      const start = source.indexOf(`export async function ${name}(`);
      const next = source.indexOf("\nexport ", start + 1);
      const body = source.slice(start, next === -1 ? undefined : next);
      expect(body).toMatch(/platformMutate\(/);
    },
  );
});
