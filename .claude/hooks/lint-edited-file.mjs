#!/usr/bin/env node
// PostToolUse hook for Edit/Write. Lints the file just changed so problems are
// fixed while the agent still has the context. Exit 2 feeds errors back.
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const input = JSON.parse(readFileSync(0, "utf8"));
const file = String(input?.tool_input?.file_path ?? "");

if (!/\.(ts|tsx|js|jsx|mjs)$/.test(file) || file.includes("node_modules")) process.exit(0);

const result = spawnSync("npx", ["eslint", "--no-warn-ignored", file], { encoding: "utf8" });
if (result.status !== 0) {
  process.stderr.write(`eslint failed for ${file}:\n${result.stdout}${result.stderr}`);
  process.exit(2);
}
