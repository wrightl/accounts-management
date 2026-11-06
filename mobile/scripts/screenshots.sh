#!/usr/bin/env bash
# Store screenshots from integration_test/store_screenshots_test.dart, which
# renders the real screens with fixture data (no sign-in, no server).
#
#   scripts/screenshots.sh            # iOS and Android
#   scripts/screenshots.sh --ios
#   scripts/screenshots.sh --android
#
# iOS:     fastlane/screenshots/en-GB/<device>-NN_name.png (deliver reads sizes)
# Android: fastlane/metadata/android/en-GB/images/{phone,tenInch}Screenshots/
#
# Override devices with IOS_PHONE, IOS_TABLET (simulator names), ANDROID_PHONE
# and ANDROID_TABLET (AVD names; default: the first AVD without / with
# "tablet" in its name; no tablet AVD skips tablet shots).
set -euo pipefail

cd "$(dirname "$0")/.."

IOS_PHONE="${IOS_PHONE:-iPhone 16 Pro Max}"   # 6.9", 1320x2868
IOS_TABLET="${IOS_TABLET:-iPad Pro 13-inch (M4)}" # 13", 2064x2752
ANDROID_PHONE="${ANDROID_PHONE:-}"
ANDROID_TABLET="${ANDROID_TABLET:-}"

IOS_OUT="fastlane/screenshots/en-GB"
ANDROID_OUT="fastlane/metadata/android/en-GB/images"

run_ios=true
run_android=true
case "${1:-}" in
  --ios) run_android=false ;;
  --android) run_ios=false ;;
  "") ;;
  *) echo "Usage: $0 [--ios|--android]" >&2; exit 2 ;;
esac

drive() { # device-id out-dir prefix
  SCREENSHOT_DIR="$2" SCREENSHOT_PREFIX="$3" flutter drive \
    --driver=test_driver/integration_test.dart \
    --target=integration_test/store_screenshots_test.dart \
    -d "$1"
}

# Newest-runtime simulator with this exact name.
simulator_udid() {
  xcrun simctl list devices available -j | python3 -c '
import json, sys
name = sys.argv[1]
runtimes = json.load(sys.stdin)["devices"]
def version(key):
    return [int(p) for p in key.rsplit("iOS-", 1)[-1].split("-") if p.isdigit()]
for runtime in sorted((k for k in runtimes if "iOS" in k), key=version, reverse=True):
    for device in runtimes[runtime]:
        if device["name"] == name:
            print(device["udid"]); sys.exit(0)
sys.exit(1)
' "$1"
}

ios_device() { # name prefix
  local udid
  udid="$(simulator_udid "$1")" || { echo "No simulator named \"$1\". Set IOS_PHONE / IOS_TABLET." >&2; exit 1; }
  xcrun simctl boot "$udid" 2>/dev/null || true
  xcrun simctl bootstatus "$udid" -b >/dev/null
  xcrun simctl status_bar "$udid" override \
    --time 9:41 --dataNetwork wifi --wifiMode active --wifiBars 3 \
    --cellularMode active --cellularBars 4 --batteryState charged --batteryLevel 100
  drive "$udid" "$IOS_OUT" "$2-"
  xcrun simctl status_bar "$udid" clear
}

android_device() { # avd out-subdir
  local serial
  serial="$(adb devices | awk 'NR>1 && /emulator-/ {print $1; exit}')"
  if [[ -z "$serial" ]]; then
    emulator -avd "$1" -no-snapshot-save -no-boot-anim >/dev/null 2>&1 &
    adb wait-for-device
    until [[ "$(adb shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')" == 1 ]]; do sleep 2; done
    serial="$(adb devices | awk 'NR>1 && /emulator-/ {print $1; exit}')"
  fi
  # Clean status bar: SystemUI demo mode.
  adb -s "$serial" shell settings put global sysui_demo_allowed 1
  local demo="adb -s $serial shell am broadcast -a com.android.systemui.demo -e command"
  $demo enter >/dev/null
  $demo clock -e hhmm 0941 >/dev/null
  $demo battery -e level 100 -e plugged false >/dev/null
  $demo network -e wifi show -e level 4 -e mobile show -e level 4 -e datatype none >/dev/null
  $demo notifications -e visible false >/dev/null
  drive "$serial" "$ANDROID_OUT/$2" ""
  $demo exit >/dev/null
  adb -s "$serial" emu kill >/dev/null 2>&1 || true
}

if $run_ios; then
  rm -rf "$IOS_OUT" && mkdir -p "$IOS_OUT"
  ios_device "$IOS_PHONE" "iphone69"
  ios_device "$IOS_TABLET" "ipad13"
fi

if $run_android; then
  if [[ -z "$ANDROID_PHONE" ]]; then
    ANDROID_PHONE="$(emulator -list-avds | grep -iv tablet | head -n1)"
    [[ -n "$ANDROID_PHONE" ]] || { echo "No Android AVD found. Create one or set ANDROID_PHONE." >&2; exit 1; }
  fi
  ANDROID_TABLET="${ANDROID_TABLET:-$(emulator -list-avds | grep -i tablet | head -n1 || true)}"
  rm -rf "$ANDROID_OUT/phoneScreenshots" "$ANDROID_OUT/tenInchScreenshots"
  android_device "$ANDROID_PHONE" phoneScreenshots
  if [[ -n "$ANDROID_TABLET" ]]; then android_device "$ANDROID_TABLET" tenInchScreenshots; fi
fi

# Fail on sizes the stores reject.
bad=0
while IFS= read -r -d '' png; do
  w="$(sips -g pixelWidth "$png" | awk '/pixelWidth/ {print $2}')"
  h="$(sips -g pixelHeight "$png" | awk '/pixelHeight/ {print $2}')"
  case "$png" in
    "$IOS_OUT"/iphone69-*) [[ "${w}x${h}" == 1320x2868 || "${w}x${h}" == 1290x2796 ]] || { echo "Wrong iPhone size ${w}x${h}: $png" >&2; bad=1; } ;;
    "$IOS_OUT"/ipad13-*) [[ "${w}x${h}" == 2064x2752 || "${w}x${h}" == 2048x2732 ]] || { echo "Wrong iPad size ${w}x${h}: $png" >&2; bad=1; } ;;
    *) # Play: each side 320–3840px, long side at most twice the short.
      short=$(( w < h ? w : h )); long=$(( w < h ? h : w ))
      (( short >= 320 && long <= 3840 && long <= 2 * short )) || { echo "Play rejects ${w}x${h}: $png" >&2; bad=1; } ;;
  esac
done < <(find "$IOS_OUT" "$ANDROID_OUT" -name '*.png' -print0 2>/dev/null)
(( bad == 0 )) || exit 1

echo "Screenshots written to $IOS_OUT and $ANDROID_OUT"
