#!/usr/bin/env node
// PreToolUse hook for Bash. Blocks commands an agent must never run, whatever
// its prompt says. Exit 2 = block; stderr is shown to the model.
import { readFileSync } from "node:fs";

const input = JSON.parse(readFileSync(0, "utf8"));
const command = String(input?.tool_input?.command ?? "");

const rules = [
  [/\bgit\s+push\b[^;&|]*\b(main|master)\b/, "pushing to main"],
  [/\bgit\s+push\b[^;&|]*(\s--force\b|\s-f\b|\s--force-with-lease\b)/, "force-pushing"],
  [/\bgit\s+push\b[^;&|]*\s--delete\b/, "deleting remote branches"],
  [/\bgit\s+(reset\s+--hard|clean\s+-[a-z]*f)/, "discarding work with reset --hard / clean -f"],
  [/\bgit\s+(checkout|switch)\s+(main|master)\b/, "switching to main"],
  [/\bgh\s+pr\s+merge\b/, "merging PRs (a human merges)"],
  [/\bgh\s+pr\s+review\b[^;&|]*--approve\b/, "approving PRs (a human approves)"],
  [/\bgh\s+(api|secret|variable|repo\s+(edit|delete))\b/, "changing repo settings or secrets"],
  [/\brm\s+-[a-z]*r[a-z]*f?\s+(\/|~|\$HOME|\.\s*$|\.\.)/, "recursive delete outside the project"],
  [/\b(vercel|vc)\s+(deploy\b[^;&|]*--prod|promote|rollback|env\s+(add|rm|pull))/, "production deploys or Vercel env changes"],
  [/\b(drizzle-kit\s+push|npm\s+run\s+(db:push|db:migrate|build)\b)/, "running migrations against a real database"],
  [/\bnpm\s+(publish|install\s+-g)\b/, "publishing or global installs"],
  [/(curl|wget)\b[^|]*\|\s*(ba|z)?sh\b/, "piping downloads into a shell"],
  [/\.env(\.[\w.]+)?\b|\.secrets\b/, "reading env files or secrets"],
];

for (const [pattern, what] of rules) {
  if (pattern.test(command)) {
    process.stderr.write(`Blocked by .claude/hooks/block-dangerous.mjs: ${what} is not allowed for agents. Find another way or stop and explain.\n`);
    process.exit(2);
  }
}
