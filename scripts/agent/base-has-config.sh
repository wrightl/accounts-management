#!/usr/bin/env bash
# On PR events claude-code-action replaces .claude/ and CLAUDE.md with the base
# branch's copies (the PR head is untrusted), so agents run with the base
# branch's config. Until that config exists there, skip instead of failing.
# Prints "ready=true|false" for $GITHUB_OUTPUT.
# Usage: scripts/agent/base-has-config.sh <base-branch>
set -euo pipefail

base="$1"
git fetch --quiet --depth=1 origin "$base"

if git cat-file -e "FETCH_HEAD:.claude/ci-settings.json" 2>/dev/null; then
  echo "ready=true"
else
  echo "::notice::Agent skipped: .claude/ci-settings.json is not on $base yet. It runs once the pipeline config is merged." >&2
  echo "ready=false"
fi
