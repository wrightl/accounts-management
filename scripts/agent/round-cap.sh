#!/usr/bin/env bash
# Stops the build/review/fix loop. Prints "continue=true|false" for
# $GITHUB_OUTPUT. When the reviewer bot has already requested changes
# MAX_ROUNDS times, or a human added needs-human, the PR is left to a person.
# Usage: scripts/agent/round-cap.sh <pr-number>
# Env: GH_TOKEN, BOT_LOGIN, MAX_ROUNDS (default 3)
set -euo pipefail

pr="$1"
max="${MAX_ROUNDS:-3}"

pr_json=$(gh pr view "$pr" --json labels,reviews)

if jq -e 'any(.labels[]; .name == "needs-human")' <<<"$pr_json" > /dev/null; then
  echo "PR #$pr is labelled needs-human; agents stand down." >&2
  echo "continue=false"
  exit 0
fi

rounds=$(jq --arg bot "$BOT_LOGIN" \
  '[.reviews[] | select(.author.login == $bot or .author.login == ($bot | sub("\\[bot\\]$"; ""))) | select(.state == "CHANGES_REQUESTED")] | length' \
  <<<"$pr_json")

if [ "$rounds" -ge "$max" ]; then
  gh pr edit "$pr" --add-label needs-human > /dev/null
  gh pr comment "$pr" --body "The agent review loop has run $rounds rounds without converging, so it has stopped. Over to a human." > /dev/null
  echo "PR #$pr hit the $max-round cap." >&2
  echo "continue=false"
else
  echo "PR #$pr: $rounds of $max agent review rounds used." >&2
  echo "continue=true"
fi
