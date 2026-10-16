#!/usr/bin/env node
// Summarises a claude-code-action run (cost, turns, duration) into the job
// summary and prints a single JSON line for log-based tracking.
// Usage: node scripts/agent/report-run.mjs <role> <execution_file>
import { appendFileSync, existsSync, readFileSync } from "node:fs";

const [role, file] = process.argv.slice(2);
if (!file || !existsSync(file)) {
  console.log(`No execution file for ${role}; nothing to report.`);
  process.exit(0);
}

const messages = JSON.parse(readFileSync(file, "utf8"));
const result = [...messages].reverse().find((m) => m.type === "result") ?? {};
const row = {
  role,
  run: `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`,
  costUsd: result.total_cost_usd ?? null,
  turns: result.num_turns ?? null,
  durationSec: result.duration_ms ? Math.round(result.duration_ms / 1000) : null,
  outcome: result.subtype ?? "unknown",
};

console.log(`AGENT_RUN ${JSON.stringify(row)}`);
if (process.env.GITHUB_STEP_SUMMARY) {
  appendFileSync(
    process.env.GITHUB_STEP_SUMMARY,
    `### ${role} run\n\n| Cost (USD) | Turns | Duration (s) | Outcome |\n| --- | --- | --- | --- |\n| ${row.costUsd ?? "?"} | ${row.turns ?? "?"} | ${row.durationSec ?? "?"} | ${row.outcome} |\n`,
  );
}
