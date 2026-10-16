#!/usr/bin/env bash
# One-off: protect main so agents (and people) can only land changes through a
# reviewed PR with green CI. Run by a repo admin; review before running.
set -euo pipefail

repo="${1:-wrightl/accounts-management}"

gh api -X PUT "repos/$repo/branches/main/protection" --input - <<'JSON'
{
  "required_status_checks": { "strict": true, "contexts": ["verify", "security"] },
  "enforce_admins": false,
  "required_pull_request_reviews": {
    "required_approving_review_count": 1,
    "require_code_owner_reviews": true,
    "dismiss_stale_reviews": true
  },
  "restrictions": null,
  "allow_force_pushes": false,
  "allow_deletions": false,
  "required_conversation_resolution": true
}
JSON

for label in "agent:5319e7:Opened by the build agent" \
             "needs-human:d93f0b:Agent review loop hit its round cap"; do
  IFS=: read -r name color desc <<<"$label"
  gh label create "$name" --repo "$repo" --color "$color" --description "$desc" --force
done
