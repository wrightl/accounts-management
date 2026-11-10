#!/usr/bin/env bash
# Build Alfa for iOS and/or Android and upload to TestFlight and the Play
# internal track, with fresh store copy and screenshots. Nothing is submitted
# for review; promote to production in the consoles.
#
#   scripts/release.sh [ios|android|all] [options]
#
#   --version 1.1.0      new marketing version (default: keep, bump build only)
#   --skip-narrative     keep the current store copy
#   --skip-screenshots   keep the current screenshots
#   --no-upload          build only; no upload, commit or tag
#   --yes                don't stop to review the store copy
#
# Needs (see README "Releasing"):
#   mobile/.env.production                        API_BASE_URL, CLERK_PUBLISHABLE_KEY
#   iOS:     DEVELOPMENT_TEAM set in Xcode; ASC_KEY_ID, ASC_ISSUER_ID, ASC_KEY_PATH
#   Android: android/key.properties; PLAY_JSON_KEY_PATH
#   Store copy: the claude CLI, signed in, for npm run mobile:narrative
set -euo pipefail

MOBILE="$(cd "$(dirname "$0")/.." && pwd)"
ROOT="$(cd "$MOBILE/.." && pwd)"
cd "$MOBILE"

platform="all"
new_version=""
narrative=true
screenshots=true
upload=true
assume_yes=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    ios|android|all) platform="$1" ;;
    --version) new_version="${2:?--version needs a value, e.g. 1.1.0}"; shift ;;
    --skip-narrative) narrative=false ;;
    --skip-screenshots) screenshots=false ;;
    --no-upload) upload=false ;;
    --yes) assume_yes=true ;;
    -h|--help) sed -n '2,20p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "Unknown option: $1 (see --help)" >&2; exit 2 ;;
  esac
  shift
done

ios=false; android=false
[[ "$platform" == ios || "$platform" == all ]] && ios=true
[[ "$platform" == android || "$platform" == all ]] && android=true

step() { printf '\n\033[1m==> %s\033[0m\n' "$*"; }
fail() { echo "Error: $*" >&2; exit 1; }
warn() { echo "Warning: $*" >&2; }
need() { command -v "$1" >/dev/null || fail "$1 is not on PATH"; }

# --- Pre-flight -------------------------------------------------------------
step "Checking setup"
need flutter
need git
$narrative && need claude
[[ -z "$(git status --porcelain -- .)" ]] || fail "mobile/ has uncommitted changes. Commit or stash them first."
[[ -f .env.production ]] || fail "mobile/.env.production is missing (API_BASE_URL and CLERK_PUBLISHABLE_KEY)."
if [[ -n "$new_version" && ! "$new_version" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  fail "--version must look like 1.2.3"
fi

if $ios; then
  need xcrun
  grep -q 'DEVELOPMENT_TEAM = ' ios/Runner.xcodeproj/project.pbxproj ||
    fail "No signing team. In Xcode, Runner > Signing & Capabilities, choose your team."
  [[ -f ios/Runner/GoogleService-Info.plist ]] || warn "ios/Runner/GoogleService-Info.plist is missing; push notifications will be off in this build."
fi
if $android; then
  [[ -f android/key.properties ]] || fail "android/key.properties is missing, so the build would be signed with the debug key."
  [[ -f android/app/google-services.json ]] || warn "android/app/google-services.json is missing; push notifications will be off in this build."
fi
if $upload; then
  need bundle
  if $ios; then
    for var in ASC_KEY_ID ASC_ISSUER_ID ASC_KEY_PATH; do
      [[ -n "${!var:-}" ]] || fail "$var is not set (App Store Connect API key)."
    done
    [[ -f "$ASC_KEY_PATH" ]] || fail "ASC_KEY_PATH does not point at a file."
  fi
  if $android; then
    [[ -n "${PLAY_JSON_KEY_PATH:-}" && -f "$PLAY_JSON_KEY_PATH" ]] ||
      fail "PLAY_JSON_KEY_PATH must point at the Play service account JSON."
  fi
fi

# --- Version ----------------------------------------------------------------
current="$(sed -n 's/^version: *//p' pubspec.yaml)"
[[ "$current" =~ ^([0-9]+\.[0-9]+\.[0-9]+)\+([0-9]+)$ ]] || fail "pubspec.yaml version must look like 1.0.0+1 (found $current)"
version="${new_version:-${BASH_REMATCH[1]}}"
build=$(( BASH_REMATCH[2] + 1 ))
release="$version+$build"
step "Version $current -> $release"
# Not sed -i: its flags differ between macOS and Linux.
sed "s/^version: .*/version: $release/" pubspec.yaml > pubspec.yaml.tmp
mv pubspec.yaml.tmp pubspec.yaml

# Undo the bump if we stop before uploading. Pre-flight required a clean
# mobile/, so HEAD has the old version. Once an upload starts, keep it: a build
# may already be in a store, and the stores refuse a build number twice.
keep_bump=false
restore_version() {
  if ! $keep_bump; then
    git checkout -- pubspec.yaml
    echo "Version left at $current."
  fi
}
trap restore_version EXIT

# --- Tests ------------------------------------------------------------------
step "Running tests"
flutter pub get >/dev/null
flutter test

# --- Store copy -------------------------------------------------------------
if $narrative; then
  step "Drafting store copy"
  (cd "$ROOT" && npm run --silent mobile:narrative)
  git --no-pager diff --stat -- fastlane/metadata
  git --no-pager diff -- fastlane/metadata
  git ls-files --others --exclude-standard -- fastlane/metadata | sed 's/^/new: /'
  if ! $assume_yes; then
    echo
    read -r -p "Edit mobile/fastlane/metadata now if needed. Continue with this copy? [y/N] " answer
    [[ "$answer" =~ ^[Yy] ]] || fail "Stopped. The drafted copy is left in fastlane/metadata."
  fi
fi

# --- Screenshots ------------------------------------------------------------
if $screenshots; then
  step "Taking screenshots"
  if $ios && $android; then scripts/screenshots.sh
  elif $ios; then scripts/screenshots.sh --ios
  else scripts/screenshots.sh --android
  fi
fi

# --- Build ------------------------------------------------------------------
defines=(--dart-define-from-file=.env.production)
if $ios; then
  step "Building iOS"
  rm -rf build/ios/ipa
  flutter build ipa --release "${defines[@]}" --export-method app-store
  ls build/ios/ipa/*.ipa
fi
if $android; then
  step "Building Android"
  flutter build appbundle --release "${defines[@]}"
  ls build/app/outputs/bundle/release/app-release.aab
fi

if ! $upload; then
  step "Built $release (not uploaded)"
  exit 0
fi

# --- Upload -----------------------------------------------------------------
step "Uploading"
keep_bump=true
trap 'echo "Upload failed after $release may have reached a store. pubspec.yaml keeps $release; commit it before the next release so the build number moves on." >&2' ERR
bundle check >/dev/null 2>&1 || bundle install
if $ios; then bundle exec fastlane ios beta; fi
if $android; then bundle exec fastlane android beta; fi

# --- Record the release -----------------------------------------------------
step "Committing and tagging mobile-v$release"
git add pubspec.yaml fastlane/metadata
git commit -m "chore(mobile): release $release" -- pubspec.yaml fastlane/metadata
git tag "mobile-v$release"
echo "Done. Push with: git push && git push origin mobile-v$release"
