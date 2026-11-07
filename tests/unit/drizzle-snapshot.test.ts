import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { generateDrizzleJson, generateMigration } from "drizzle-kit/api";
import * as schema from "@/db/schema";

// drizzle-kit generates migrations by comparing schema.ts with the newest
// snapshot. A migration written by hand without one leaves the snapshot
// behind, and every later `db:generate` then tries to recreate it.
const META = join(process.cwd(), "drizzle", "meta");
const FIX = "Run `npm run db:generate` (edit the generated SQL if you need to, but keep its snapshot).";

function latestSnapshot() {
  const files = readdirSync(META)
    .filter((f) => /^\d{4}_snapshot\.json$/.test(f))
    .sort();
  const file = files.at(-1)!;
  return { number: file.slice(0, 4), json: JSON.parse(readFileSync(join(META, file), "utf8")) };
}

describe("drizzle snapshots", () => {
  it("cover the newest migration", () => {
    const journal = JSON.parse(readFileSync(join(META, "_journal.json"), "utf8")) as {
      entries: { tag: string }[];
    };
    const lastTag = journal.entries.at(-1)!.tag;
    expect(latestSnapshot().number, `${lastTag} has no snapshot. ${FIX}`).toBe(lastTag.slice(0, 4));
  });

  it("match schema.ts", async () => {
    const { json } = latestSnapshot();
    const statements = await generateMigration(json, generateDrizzleJson(schema, json.id));
    expect(statements, `schema.ts has changes with no migration. ${FIX}`).toEqual([]);
  });
});
