#!/usr/bin/env bash
# Agent pipeline health over the last N days (default 30): PR acceptance rate,
# rework (resolver rounds per PR), PRs escalated to needs-human, and spend.
# Usage: scripts/agent/metrics.sh [days]
set -euo pipefail

days="${1:-30}"
since=$(date -u -v-"${days}"d +%Y-%m-%d 2>/dev/null || date -u -d "-${days} days" +%Y-%m-%d)

prs=$(gh pr list --state all --label agent --search "created:>=$since" --limit 500 \
  --json number,state,labels,createdAt,closedAt,mergedAt)

total=$(jq length <<<"$prs")
merged=$(jq '[.[] | select(.mergedAt)] | length' <<<"$prs")
closed=$(jq '[.[] | select(.state == "CLOSED")] | length' <<<"$prs")
escalated=$(jq '[.[] | select(any(.labels[]; .name == "needs-human"))] | length' <<<"$prs")

rounds=0
for n in $(jq '.[].number' <<<"$prs"); do
  r=$(gh pr view "$n" --json reviews --jq '[.reviews[] | select(.state == "CHANGES_REQUESTED")] | length')
  rounds=$((rounds + r))
done

spend=$(for wf in ci.yml claude-resolve.yml claude-build.yml; do
    gh run list --workflow "$wf" --created ">=$since" --limit 500 --json databaseId --jq '.[].databaseId' 2>/dev/null
  done \
  | while read -r id; do gh run view "$id" --log 2>/dev/null | grep -o 'AGENT_RUN {.*}' | sed 's/AGENT_RUN //'; done \
  | jq -s '[.[].costUsd // 0] | add // 0')

echo "Agent PRs since $since: $total (merged $merged, closed unmerged $closed)"
[ "$total" -gt 0 ] && echo "Acceptance rate: $(( 100 * merged / total ))%"
[ "$total" -gt 0 ] && echo "Rework: $rounds change-request rounds ($(awk "BEGIN{printf \"%.1f\", $rounds/$total}") per PR)"
echo "Escalated to needs-human: $escalated"
echo "Spend: \$$spend"
