#!/usr/bin/env node
// Stop hook. In CI agent runs only, refuse to finish while the project has
// type errors. Interactive sessions are left alone.
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const input = JSON.parse(readFileSync(0, "utf8"));
if (!process.env.CI || input?.stop_hook_active) process.exit(0);

const result = spawnSync("npx", ["tsc", "--noEmit"], { encoding: "utf8" });
if (result.status !== 0) {
  process.stderr.write(`Typecheck fails, fix before finishing:\n${result.stdout.slice(0, 4000)}`);
  process.exit(2);
}
