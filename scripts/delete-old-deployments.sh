#!/usr/bin/env bash
#
# Delete production or preview deployments older than N days from a Vercel project.
# Lists what it would delete unless you pass --delete, which asks before each one.
#
# Never deletes the live production deployment or any deployment that still
# has an alias. Stops without deleting if it can't identify the live deployment.
#
# Usage:
#   ./delete-old-deployments.sh <project> [--target production|preview] [--days N] [--scope TEAM] [--delete]
#
# Requires: vercel (logged in, recent enough to have `vercel api`) and jq.

set -euo pipefail

usage() {
  sed -n '10p' "$0" | sed 's/^# *//' >&2
  exit 2
}

PROJECT=""
TARGET=production
DAYS=7
DELETE=false
SCOPE_ARGS=()

while [ $# -gt 0 ]; do
  case "$1" in
    --target)
      [ $# -ge 2 ] || usage
      TARGET="$2"
      shift 2
      ;;
    --days)
      [ $# -ge 2 ] || usage
      DAYS="$2"
      shift 2
      ;;
    --scope)
      [ $# -ge 2 ] || usage
      SCOPE_ARGS=(--scope "$2")
      shift 2
      ;;
    --delete)
      DELETE=true
      shift
      ;;
    -h | --help) usage ;;
    -*)
      echo "Unknown option: $1" >&2
      usage
      ;;
    *)
      [ -z "$PROJECT" ] || usage
      PROJECT="$1"
      shift
      ;;
  esac
done

[ -n "$PROJECT" ] || usage
case "$TARGET" in
  production | preview) ;;
  *)
    echo "--target must be production or preview" >&2
    exit 2
    ;;
esac
case "$DAYS" in
  '' | *[!0-9]*)
    echo "--days must be a whole number" >&2
    exit 2
    ;;
esac

for tool in vercel jq; do
  command -v "$tool" >/dev/null || {
    echo "$tool is not installed" >&2
    exit 1
  }
done

# ${arr[@]+...} keeps an empty array safe under `set -u` on macOS's bash 3.2.
api() {
  vercel api "$1" ${SCOPE_ARGS[@]+"${SCOPE_ARGS[@]}"} </dev/null
}

project_json=$(api "/v9/projects/$PROJECT")
PROJECT_ID=$(jq -r '.id // empty' <<<"$project_json")
LIVE_ID=$(jq -r '.targets.production.id // empty' <<<"$project_json")

if [ -z "$PROJECT_ID" ] || [ -z "$LIVE_ID" ]; then
  echo "Could not identify the live production deployment for '$PROJECT'. Nothing was deleted." >&2
  exit 1
fi

CUTOFF_MS=$((($(date +%s) - DAYS * 86400) * 1000))

echo "Project:  $PROJECT ($PROJECT_ID)"
echo "Live:     $LIVE_ID (always kept)"
echo "Deleting: $TARGET deployments older than $DAYS days"
$DELETE || echo "Mode:     dry run (pass --delete to delete)"
echo

# Collect every candidate first, so deleting doesn't shift pagination.
candidates=""
until_param=""
while :; do
  page=$(api "/v6/deployments?projectId=$PROJECT_ID&target=$TARGET&limit=100$until_param")

  jq -e '.deployments | type == "array"' <<<"$page" >/dev/null || {
    echo "Unexpected response when listing deployments. Nothing was deleted." >&2
    exit 1
  }

  # Checks target again here so a filter the API ignored can't widen the delete.
  # Previews have a null target; custom environments match neither option.
  rows=$(jq -r --argjson cutoff "$CUTOFF_MS" --arg live "$LIVE_ID" --arg target "$TARGET" '
    .deployments[]
    | select((.target // "preview") == $target and .uid != $live)
    | (.createdAt // .created) as $created
    | select($created != null and $created < $cutoff)
    | [.uid, .url, ($created / 1000 | floor | todate)]
    | @tsv
  ' <<<"$page")
  [ -z "$rows" ] || candidates+="$rows"$'\n'

  next=$(jq -r '.pagination.next // empty' <<<"$page")
  [ -n "$next" ] || break
  until_param="&until=$next"
done

matched=0
kept=0
deleted=0
skipped=0
failed=0

while IFS=$'\t' read -r uid url created; do
  [ -n "$uid" ] || continue

  # A failed alias lookup counts as "has aliases", so the deployment is kept.
  if ! alias_count=$(api "/v2/deployments/$uid/aliases" | jq -e '.aliases | length'); then
    echo "KEEP    $created  $url  (could not check aliases)"
    kept=$((kept + 1))
    continue
  fi
  if [ "$alias_count" -gt 0 ]; then
    echo "KEEP    $created  $url  ($alias_count alias(es))"
    kept=$((kept + 1))
    continue
  fi

  matched=$((matched + 1))
  if ! $DELETE; then
    echo "WOULD   $created  $url"
    continue
  fi

  # Reads the terminal directly because the loop's stdin is the candidate list.
  printf 'Delete %s  %s? [y/N/q] ' "$created" "$url"
  if ! { read -r answer </dev/tty; } 2>/dev/null; then
    echo
    echo "Could not read a confirmation from the terminal. Stopping." >&2
    exit 1
  fi
  case "$answer" in
    y | Y) ;;
    q | Q)
      echo "Stopped."
      break
      ;;
    *)
      echo "SKIPPED $created  $url"
      skipped=$((skipped + 1))
      continue
      ;;
  esac

  if vercel rm "$url" --yes ${SCOPE_ARGS[@]+"${SCOPE_ARGS[@]}"} </dev/null >/dev/null; then
    echo "DELETED $created  $url"
    deleted=$((deleted + 1))
  else
    echo "FAILED  $created  $url"
    failed=$((failed + 1))
  fi
done <<<"$candidates"

echo
if $DELETE; then
  echo "Deleted $deleted, skipped $skipped, failed $failed, kept $kept (aliased or unchecked), plus the live deployment."
else
  echo "Would delete $matched, keep $kept (aliased or unchecked), plus the live deployment."
fi

[ "$failed" -eq 0 ]
