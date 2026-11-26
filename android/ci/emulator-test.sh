#!/usr/bin/env bash
# End-to-end test of the Android app on an emulator: real app blocking, real
# website filtering, unlock rules, daily limits and blocking with the UI closed.
# Usage: emulator-test.sh <debug.apk> <outdir>
set -u
APK="$1"; OUT="$2"; mkdir -p "$OUT"
PKG=com.halyra.focus
HERE="$(cd "$(dirname "$0")" && pwd)"
FAILS=0; TOTAL=0
pass() { TOTAL=$((TOTAL+1)); echo "[android-test] PASS  $1"; }
fail() { TOTAL=$((TOTAL+1)); FAILS=$((FAILS+1)); echo "[android-test] FAIL  $1 — ${2:-}"; }
check() { if eval "$2"; then pass "$1"; else fail "$1" "${3:-}"; fi; }
js() { node "$HERE/cdp.js" eval "$1"; }
top() { adb shell dumpsys activity activities | grep -E "topResumedActivity|mResumedActivity|ResumedActivity" | head -1; }
shot() { adb exec-out screencap -p > "$OUT/$1.png"; }
resolve() { adb shell ping -c 1 -W 3 "$1" 2>&1 | head -1; }

adb wait-for-device
adb shell settings put global window_animation_scale 0; adb shell settings put global transition_animation_scale 0; adb shell settings put global animator_duration_scale 0
adb install -r -g "$APK" >/dev/null && pass "APK installs" || fail "APK installs"
adb shell appops set $PKG GET_USAGE_STATS allow
adb shell appops set $PKG SYSTEM_ALERT_WINDOW allow
adb shell appops set $PKG ACTIVATE_VPN allow
adb shell dumpsys deviceidle whitelist +$PKG >/dev/null 2>&1
adb shell am start -n $PKG/.MainActivity >/dev/null
sleep 10
SOCK=$(adb shell cat /proc/net/unix | grep -o 'webview_devtools_remote_[0-9]*' | head -1)
adb forward tcp:9222 localabstract:"$SOCK" >/dev/null
check "App opens and its UI loads (5 tabs)" '[ "$(js "document.querySelectorAll(\".nav-btn\").length")" = "5" ]'
check "No script errors in the app" '[ "$(js "window.__halyraErrors.length")" = "0" ]' "$(js 'window.__halyraErrors')"
check "Runs as the phone version" '[ "$(js "api.getState().then(s => s.platform)")" = "\"android\"" ]'
PERMS=$(js "api.getState().then(s => s.mobile.perms)")
echo "permissions: $PERMS"
check "Permissions are detected (usage, overlay, website filter)" 'echo "$PERMS" | grep -q "\"usage\":true" && echo "$PERMS" | grep -q "\"overlay\":true" && echo "$PERMS" | grep -q "\"vpn\":true"'
node "$HERE/cdp.js" shot "$OUT/01-onboarding.png" >/dev/null
js "api.setConfig({ settings: { onboarded: true } }).then(() => document.querySelectorAll('.modal-back').forEach((m) => m.remove()))" >/dev/null

# A list with a real app (Settings) and a real site.
js "api.getState().then((s) => api.setConfig({ lists: [...s.lists, { id: 'e2e', name: 'E2E', emoji: '⛔', sites: ['example.org'], apps: [{ name: 'Settings', mac: [], win: [], android: ['com.android.settings'] }], limitMode: 'flexible' }] }))" >/dev/null
BEFORE=$(resolve example.org); echo "before: $BEFORE"
R=$(js "api.startSession({ listIds: ['e2e'], minutes: 5, mode: 'flexible' }).then(r => r.ok)")
check "Starts a focus session" '[ "$R" = "true" ]' "$R"
sleep 4
check "Plan handed to the native blocker" 'adb shell run-as $PKG cat files/app/plan.json | grep -q com.android.settings'
node "$HERE/cdp.js" shot "$OUT/02-focus-running.png" >/dev/null
adb shell am start -a android.settings.SETTINGS >/dev/null; sleep 4
T=$(top); echo "top: $T"
check "Opening a blocked app shows the block screen" 'echo "$T" | grep -q BlockActivity' "$T"
shot 03-block-screen
DNS=$(resolve example.org); echo "blocked: $DNS"
check "Blocked website doesn't resolve to its real address" 'echo "$DNS" | grep -qE "\(0\.0\.0\.0\)|unknown host|Unknown host"' "$DNS"
OK=$(resolve google.com); echo "allowed: $OK"
check "Other websites still work" 'echo "$OK" | grep -qE "PING google.com \([0-9]+\." && ! echo "$OK" | grep -q "0.0.0.0"' "$OK"

# Blocking continues while the app's UI is closed.
adb shell input keyevent KEYCODE_HOME; sleep 1
adb shell am start -n $PKG/.MainActivity >/dev/null; sleep 1; adb shell input keyevent KEYCODE_HOME; sleep 1
adb shell am start -a android.settings.SETTINGS >/dev/null; sleep 4
T=$(top)
check "Still blocks with the app in the background" 'echo "$T" | grep -q BlockActivity' "$T"

# Flexible: can be stopped; everything unblocks.
adb shell am start -n $PKG/.MainActivity >/dev/null; sleep 3
U=$(js "api.unlockRequest({}).then(r => r.status)")
check "A flexible block can be stopped" '[ "$U" = "\"stopped\"" ]' "$U"
sleep 5
adb shell am start -a android.settings.SETTINGS >/dev/null; sleep 4
T=$(top)
check "After stopping, the app opens normally" 'echo "$T" | grep -q "com.android.settings" && ! echo "$T" | grep -q BlockActivity' "$T"
DNS2=$(resolve example.org)
check "After stopping, the website works again" '! echo "$DNS2" | grep -q "0.0.0.0"' "$DNS2"

# Daily limit: 1 minute of Settings, then it's blocked until midnight.
adb shell am start -n $PKG/.MainActivity >/dev/null; sleep 3
js "api.getState().then((s) => api.setConfig({ lists: s.lists.map((l) => (l.id === 'e2e' ? { ...l, sites: [], limitMin: 1, limitMode: 'flexible' } : l)) }))" >/dev/null
sleep 3
adb shell am start -a android.settings.SETTINGS >/dev/null
LIMIT_HIT=no
for i in $(seq 1 20); do sleep 6; if top | grep -q BlockActivity; then LIMIT_HIT=yes; break; fi; done
check "Daily limit blocks the app once its time is used up" '[ "$LIMIT_HIT" = yes ]'
adb shell am start -n $PKG/.MainActivity >/dev/null; sleep 3
js "document.querySelectorAll('.nav-btn')[1].click()" >/dev/null; sleep 1
node "$HERE/cdp.js" shot "$OUT/04-lists-limit.png" >/dev/null
js "api.getState().then((s) => api.setConfig({ lists: s.lists.map((l) => (l.id === 'e2e' ? { ...l, limitMin: 0 } : l)) }))" >/dev/null

# Locked mode can't be stopped early, not even here.
S=$(js "api.startSession({ listIds: ['e2e'], minutes: 3, mode: 'strict' }).then(r => r.ok)")
U2=$(js "api.unlockRequest({}).then(r => r.status)")
check "A locked block can't be stopped early" '[ "$S" = "true" ] && [ "$U2" != "\"stopped\"" ]' "$S $U2"
js "document.querySelectorAll('.modal-back').forEach((m) => m.remove()); document.querySelectorAll('.nav-btn')[4].click()" >/dev/null; sleep 1
node "$HERE/cdp.js" shot "$OUT/05-settings.png" >/dev/null
js "api.setConfig({ settings: { theme: 'crt' } }).then(() => document.querySelectorAll('.nav-btn')[0].click())" >/dev/null; sleep 2
node "$HERE/cdp.js" shot "$OUT/06-retro-crt.png" >/dev/null
adb shell am start -a android.settings.SETTINGS >/dev/null; sleep 4
shot 07-block-screen-crt
check "Block screen also appears in retro theme" 'top | grep -q BlockActivity'
check "No script errors after the whole run" '[ "$(js "window.__halyraErrors.length")" = "0" ]' "$(js 'window.__halyraErrors')"

adb logcat -d -s AndroidRuntime:E | tail -30 > "$OUT/crashes.txt"
check "No app crashes" '! grep -q "com.halyra.focus" "$OUT/crashes.txt"' "$(head -20 "$OUT/crashes.txt")"

echo "[android-test] $((TOTAL-FAILS))/$TOTAL passed"
[ "$FAILS" = 0 ] && echo "[android-test] ALL PASSED" || echo "[android-test] FAILURES: $FAILS"
[ "$FAILS" = 0 ]
