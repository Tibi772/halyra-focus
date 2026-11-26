'use strict';
// The privileged "helper" is installed once (one admin prompt). Afterwards the
// app only writes a plain list of domains to a user-writable file and the
// helper, running as root/SYSTEM, mirrors it into the hosts file. The helper
// validates every line, so the worst a rogue process could do with that file
// is block extra sites — it can never redirect a domain somewhere else.
const BRAND = require('../shared/brand');
const { POLICY_ALWAYS_ALLOW } = require('./hosts');

const DOMAIN_RE_POSIX = '^[a-z0-9]([a-z0-9-]*[a-z0-9])?([.][a-z0-9]([a-z0-9-]*[a-z0-9])?)+$';

const MAC = {
  helperDir: `/Library/Application Support/${BRAND.short}`,
  helperScript: `/Library/Application Support/${BRAND.short}/helper.sh`,
  plist: `/Library/LaunchDaemons/${BRAND.helperLabel}.plist`,
  rulesDir: `/Users/Shared/${BRAND.short}`,
  rules: `/Users/Shared/${BRAND.short}/blocklist.txt`,
  hosts: '/etc/hosts',
};

function macHelperSh() {
  return `#!/bin/sh
# ${BRAND.name} helper - mirrors the user's blocklist into /etc/hosts.
# Runs as root via launchd. It only writes "0.0.0.0 <domain>" and ":: <domain>"
# lines for strictly validated domain names, inside its own marked section.
PATH=/usr/bin:/bin:/usr/sbin:/sbin
RULES="\${HALYRA_RULES:-${MAC.rules}}"
HOSTS="\${HALYRA_HOSTS:-${MAC.hosts}}"
BEGIN='${BRAND.hostsMarkerBegin}'
END='${BRAND.hostsMarkerEnd}'
TMP=$(mktemp "\${TMPDIR:-/tmp}/${BRAND.short}.XXXXXX") || exit 1
trap 'rm -f "$TMP"' EXIT
[ -f "$HOSTS" ] || : > "$HOSTS"
awk -v b="$BEGIN" -v e="$END" '$0==b{s=1;next} $0==e{s=0;next} !s{print}' "$HOSTS" > "$TMP" || exit 1
DOMAINS=""
if [ -f "$RULES" ] && [ ! -L "$RULES" ]; then
  EXP=$(sed -n 's/^# expires=\\([0-9][0-9]*\\)$/\\1/p' "$RULES" | head -n 1)
  NOW=$(date +%s)
  if [ -z "$EXP" ] || [ "$NOW" -lt "$EXP" ]; then
    DOMAINS=$(head -n 20000 "$RULES" | grep -E '${DOMAIN_RE_POSIX}' | sort -u)
  fi
fi
if [ -n "$DOMAINS" ]; then
  {
    echo "$BEGIN"
    for d in $DOMAINS; do printf '0.0.0.0 %s\\n:: %s\\n' "$d" "$d"; done
    echo "$END"
  } >> "$TMP"
fi
if ! cmp -s "$TMP" "$HOSTS"; then
  cat "$TMP" > "$HOSTS"
  if [ -z "$HALYRA_NOFLUSH" ]; then
    dscacheutil -flushcache 2>/dev/null
    killall -HUP mDNSResponder 2>/dev/null
  fi
fi
exit 0
`;
}

function macPlist() {
  const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>${BRAND.helperLabel}</string>
  <key>ProgramArguments</key>
  <array><string>/bin/sh</string><string>${esc(MAC.helperScript)}</string></array>
  <key>WatchPaths</key>
  <array><string>${esc(MAC.rules)}</string></array>
  <key>StartInterval</key><integer>60</integer>
  <key>RunAtLoad</key><true/>
  <key>ThrottleInterval</key><integer>2</integer>
</dict>
</plist>
`;
}

/** Run as root. $1 = console user name, $2 = folder holding helper.sh + helper.plist */
function macInstallSh() {
  return `#!/bin/sh
set -e
U="$1"
SRC="$2"
H='${MAC.helperDir}'
R='${MAC.rulesDir}'
P='${MAC.plist}'
mkdir -p "$H"
cp "$SRC/helper.sh" "$H/helper.sh"
chown -R root:wheel "$H"
chmod 755 "$H" "$H/helper.sh"
mkdir -p "$R"
[ -f "$R/blocklist.txt" ] || : > "$R/blocklist.txt"
chown -R "$U" "$R"
chmod 755 "$R"
chmod 644 "$R/blocklist.txt"
cp "$SRC/helper.plist" "$P"
chown root:wheel "$P"
chmod 644 "$P"
launchctl bootout system/${BRAND.helperLabel} 2>/dev/null || true
sleep 1
launchctl bootstrap system "$P" 2>/dev/null || launchctl load -w "$P"
launchctl kickstart -k system/${BRAND.helperLabel} 2>/dev/null || true
exit 0
`;
}

function macUninstallSh() {
  return `#!/bin/sh
H='${MAC.helperDir}'
R='${MAC.rulesDir}'
P='${MAC.plist}'
launchctl bootout system/${BRAND.helperLabel} 2>/dev/null || launchctl unload "$P" 2>/dev/null || true
rm -f "$P"
if [ -f "$H/helper.sh" ]; then
  : > "$R/blocklist.txt" 2>/dev/null || true
  /bin/sh "$H/helper.sh" || true
fi
rm -rf "$H" "$R"
dscacheutil -flushcache 2>/dev/null
killall -HUP mDNSResponder 2>/dev/null
exit 0
`;
}

const WIN = {
  task: `${BRAND.short}Helper`,
  dir: (programData) => `${programData}\\${BRAND.short}`,
};

// Bumped whenever a helper script changes, so the app can ask for a one-time update.
const HELPER_VERSION = { mac: 1, win: 3 };

function winHelperPs1() {
  return `# ${BRAND.name} helper - runs as SYSTEM, mirrors blocklist.txt into the hosts file
# and into Chrome / Edge / Brave policy (URLBlocklist / URLAllowlist).
# halyra-helper-version: ${HELPER_VERSION.win}
# It only writes "0.0.0.0 <domain>" and ":: <domain>" lines for strictly validated
# domain names, inside its own marked section, and only policy entries it owns.
$ErrorActionPreference = 'SilentlyContinue'
$Dir = Split-Path -Parent $MyInvocation.MyCommand.Path
$Rules = Join-Path $Dir 'blocklist.txt'
$Owned = Join-Path $Dir 'policy-owned.txt'
$HostsFile = Join-Path $env:SystemRoot 'System32\\drivers\\etc\\hosts'
$Begin = '${BRAND.hostsMarkerBegin}'
$End = '${BRAND.hostsMarkerEnd}'
$Re = '^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$'
$PathRe = '^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+/[a-z0-9._~%/+=,-]*$'
$PolicyRoots = @('SOFTWARE\\Policies\\Google\\Chrome', 'SOFTWARE\\Policies\\Microsoft\\Edge', 'SOFTWARE\\Policies\\BraveSoftware\\Brave', 'SOFTWARE\\Policies\\Chromium')
$AlwaysAllow = @(${POLICY_ALWAYS_ALLOW.map((x) => `'${x}'`).join(', ')})
$Utf8 = New-Object System.Text.UTF8Encoding($false)

function Read-Rules {
  $r = @{ Domains = @(); Paths = @(); Allow = @() }
  if (-not (Test-Path -LiteralPath $Rules -PathType Leaf)) { return $r }
  $item = Get-Item -LiteralPath $Rules
  if ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) { return $r }
  $lines = @(Get-Content -LiteralPath $Rules -TotalCount 20000)
  foreach ($l in $lines) {
    if ($l -match '^# expires=(\\d+)$') {
      if ([DateTimeOffset]::UtcNow.ToUnixTimeSeconds() -ge [int64]$Matches[1]) { return $r }
    }
  }
  $r.Domains = @($lines | ForEach-Object { $_.Trim() } | Where-Object { $_ -cmatch $Re } | Sort-Object -Unique)
  $r.Paths = @($lines | Where-Object { $_ -cmatch '^# path ' } | ForEach-Object { $_.Substring(7).Trim() } | Where-Object { $_ -cmatch $PathRe } | Sort-Object -Unique)
  $r.Allow = @($lines | Where-Object { $_ -cmatch '^# allow ' } | ForEach-Object { $_.Substring(8).Trim() } | Where-Object { $_ -cmatch $Re } | Sort-Object -Unique)
  return $r
}

function Sync-Hosts($domains) {
  $old = ''
  if (Test-Path -LiteralPath $HostsFile) { $old = [IO.File]::ReadAllText($HostsFile) }
  $kept = New-Object System.Collections.Generic.List[string]
  $skip = $false
  foreach ($l in ($old -split "\\r?\\n")) {
    if ($l -ceq $Begin) { $skip = $true; continue }
    if ($l -ceq $End) { $skip = $false; continue }
    if (-not $skip) { $kept.Add($l) }
  }
  while ($kept.Count -gt 0 -and $kept[$kept.Count - 1] -eq '') { $kept.RemoveAt($kept.Count - 1) }
  if ($domains.Count -gt 0) {
    $kept.Add($Begin)
    foreach ($d in $domains) { $kept.Add("0.0.0.0 $d"); $kept.Add(":: $d") }
    $kept.Add($End)
  }
  $new = ($kept -join "\`r\`n") + "\`r\`n"
  if ($new -ne $old) {
    for ($i = 0; $i -lt 8; $i++) {
      try { [IO.File]::WriteAllText($HostsFile, $new, $Utf8); break } catch { Start-Sleep -Milliseconds 500 }
    }
    ipconfig /flushdns | Out-Null
  }
}

# Sets one list policy (e.g. ...\\Chrome\\URLBlocklist) to: entries owned by
# someone else (kept untouched) + ours. Returns the entries we now own.
function Set-ListPolicy([string]$path, [string[]]$want, $owned) {
  $hklm = [Microsoft.Win32.Registry]::LocalMachine
  $k = $hklm.OpenSubKey($path, $true)
  $cur = New-Object System.Collections.Generic.List[string]
  if ($k) {
    foreach ($n in @($k.GetValueNames() | Where-Object { $_ -match '^\\d+$' } | Sort-Object { [int]$_ })) { $cur.Add([string]$k.GetValue($n)) }
  }
  $final = New-Object System.Collections.Generic.List[string]
  foreach ($v in $cur) { if (-not $owned.ContainsKey("$path|$v") -and -not $final.Contains($v)) { $final.Add($v) } }
  $mine = New-Object System.Collections.Generic.List[string]
  foreach ($v in $want) { if ($v -and -not $final.Contains($v)) { $final.Add($v); $mine.Add($v) } }
  if (($final -join "\`n") -cne ($cur -join "\`n")) {
    $script:PolicyChanged = $true
    if ($k) { foreach ($n in @($k.GetValueNames())) { if ($n -match '^\\d+$') { $k.DeleteValue($n) } } }
    if ($final.Count -gt 0) {
      if (-not $k) { $k = $hklm.CreateSubKey($path) }
      $i = 1
      foreach ($v in $final) { $k.SetValue([string]$i, [string]$v, [Microsoft.Win32.RegistryValueKind]::String); $i++ }
    }
  }
  if ($k) {
    $empty = ($k.ValueCount -eq 0 -and $k.SubKeyCount -eq 0)
    $k.Close()
    if ($empty) { $hklm.DeleteSubKey($path, $false) }
  }
  return ,$mine
}

function Sync-Policy($r) {
  $script:PolicyChanged = $false
  $block = New-Object System.Collections.Generic.List[string]
  $allow = New-Object System.Collections.Generic.List[string]
  if ($r.Allow.Count -gt 0) {
    $block.Add('*')
    foreach ($a in $r.Allow) { $allow.Add($a) }
    foreach ($a in $AlwaysAllow) { $allow.Add($a) }
  } else {
    $set = @{}
    foreach ($d in $r.Domains) { $set[$d] = $true }
    foreach ($d in $r.Domains) {
      $keep = $true
      $p = $d
      while ($p.Contains('.')) { $p = $p.Substring($p.IndexOf('.') + 1); if ($set.ContainsKey($p)) { $keep = $false; break } }
      if ($keep -and $block.Count -lt 1000) { $block.Add($d) }
    }
    foreach ($p in $r.Paths) { if ($block.Count -lt 1000) { $block.Add($p) } }
  }
  $owned = @{}
  if (Test-Path -LiteralPath $Owned) { foreach ($l in @(Get-Content -LiteralPath $Owned)) { if ($l) { $owned[$l] = $true } } }
  $now = New-Object System.Collections.Generic.List[string]
  foreach ($root in $PolicyRoots) {
    foreach ($v in (Set-ListPolicy "$root\\URLBlocklist" $block.ToArray() $owned)) { $now.Add("$root\\URLBlocklist|$v") }
    foreach ($v in (Set-ListPolicy "$root\\URLAllowlist" $allow.ToArray() $owned)) { $now.Add("$root\\URLAllowlist|$v") }
    # Keep the (empty) browser key itself: Chrome/Edge only notice live policy
    # changes under a key that already existed when they started.
    $rk = [Microsoft.Win32.Registry]::LocalMachine.CreateSubKey($root)
    if ($rk) { $rk.Close() }
  }
  [IO.File]::WriteAllLines($Owned, [string[]]$now.ToArray())
  if ($script:PolicyChanged) {
    # Browsers re-arm their registry watch after each change; a second, later
    # change makes sure they also see the final state (e.g. a removal).
    Start-Sleep -Seconds 2
    foreach ($root in $PolicyRoots) {
      $rk = [Microsoft.Win32.Registry]::LocalMachine.CreateSubKey($root)
      if ($rk) { $rk.SetValue('HalyraFocusSync', 1, [Microsoft.Win32.RegistryValueKind]::DWord); $rk.DeleteValue('HalyraFocusSync', $false); $rk.Close() }
    }
  }
}

function Sync-All {
  $r = Read-Rules
  Sync-Hosts $r.Domains
  Sync-Policy $r
}

if ($args -contains '-Once') { Sync-All; exit 0 }

$last = $null
$tick = 0
while ($true) {
  $stamp = ''
  if (Test-Path -LiteralPath $Rules) { $f = Get-Item -LiteralPath $Rules; $stamp = "$($f.LastWriteTimeUtc.Ticks)-$($f.Length)" }
  if ($stamp -ne $last -or $tick -ge 30) { Sync-All; $last = $stamp; $tick = 0 }
  Start-Sleep -Seconds 2
  $tick += 2
}
`;
}

function winInstallPs1() {
  return `$ErrorActionPreference = 'Stop'
$Src = $PSScriptRoot
$Dir = Join-Path $env:ProgramData '${BRAND.short}'
$Task = '${WIN.task}'
Stop-ScheduledTask -TaskName $Task -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force -Path $Dir | Out-Null
Copy-Item -LiteralPath (Join-Path $Src 'helper.ps1') -Destination (Join-Path $Dir 'helper.ps1') -Force
$Rules = Join-Path $Dir 'blocklist.txt'
if (-not (Test-Path -LiteralPath $Rules)) { New-Item -ItemType File -Path $Rules | Out-Null }
& icacls.exe $Dir /inheritance:r /grant:r '*S-1-5-18:(OI)(CI)F' '*S-1-5-32-544:(OI)(CI)F' '*S-1-5-32-545:(OI)(CI)RX' | Out-Null
& icacls.exe $Rules /grant '*S-1-5-32-545:(M)' | Out-Null
$Ps = Join-Path $env:SystemRoot 'System32\\WindowsPowerShell\\v1.0\\powershell.exe'
$Action = New-ScheduledTaskAction -Execute $Ps -Argument ('-NoProfile -NonInteractive -ExecutionPolicy Bypass -WindowStyle Hidden -File "' + (Join-Path $Dir 'helper.ps1') + '"')
$Trigger = New-ScheduledTaskTrigger -AtStartup
$Principal = New-ScheduledTaskPrincipal -UserId 'NT AUTHORITY\\SYSTEM' -LogonType ServiceAccount -RunLevel Highest
$Settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 10 -RestartInterval (New-TimeSpan -Minutes 1) -MultipleInstances IgnoreNew
foreach ($k in @('HKLM:\\SOFTWARE\\Policies\\Google\\Chrome', 'HKLM:\\SOFTWARE\\Policies\\Microsoft\\Edge', 'HKLM:\\SOFTWARE\\Policies\\BraveSoftware\\Brave', 'HKLM:\\SOFTWARE\\Policies\\Chromium')) {
  if (-not (Test-Path -LiteralPath $k)) { New-Item -Path $k -Force | Out-Null }
}
Register-ScheduledTask -TaskName $Task -Action $Action -Trigger $Trigger -Principal $Principal -Settings $Settings -Force | Out-Null
Start-ScheduledTask -TaskName $Task
exit 0
`;
}

function winUninstallPs1() {
  return `$ErrorActionPreference = 'SilentlyContinue'
$Dir = Join-Path $env:ProgramData '${BRAND.short}'
$Task = '${WIN.task}'
Stop-ScheduledTask -TaskName $Task
Unregister-ScheduledTask -TaskName $Task -Confirm:$false
$Rules = Join-Path $Dir 'blocklist.txt'
if (Test-Path -LiteralPath (Join-Path $Dir 'helper.ps1')) {
  Set-Content -LiteralPath $Rules -Value ''
  & (Join-Path $Dir 'helper.ps1') -Once
}
Remove-Item -LiteralPath $Dir -Recurse -Force
ipconfig /flushdns | Out-Null
exit 0
`;
}

/** PowerShell one-liner that runs `scriptPath` elevated (UAC prompt) and returns its exit code. */
function winElevateCommand(scriptPath) {
  const p = String(scriptPath).replace(/'/g, "''");
  return [
    "$ErrorActionPreference = 'Stop'",
    'try {',
    "  $ps = Join-Path $env:SystemRoot 'System32\\WindowsPowerShell\\v1.0\\powershell.exe'",
    `  $p = Start-Process -FilePath $ps -Verb RunAs -WindowStyle Hidden -Wait -PassThru -ArgumentList '-NoProfile','-ExecutionPolicy','Bypass','-File','"${p}"'`,
    '  exit $p.ExitCode',
    '} catch { exit 1223 }',
  ].join('\n');
}

/** AppleScript that runs a shell script with an admin password prompt. */
function macElevateAppleScript(scriptPath, args, prompt) {
  const lit = (s) => `"${String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
  const parts = [`"/bin/sh " & quoted form of ${lit(scriptPath)}`];
  for (const a of args) parts.push(`" " & quoted form of ${lit(a)}`);
  return `do shell script ${parts.join(' & ')} with prompt ${lit(prompt)} with administrator privileges`;
}

module.exports = {
  HELPER_VERSION, MAC, WIN, macHelperSh, macPlist, macInstallSh, macUninstallSh,
  winHelperPs1, winInstallPs1, winUninstallPs1, winElevateCommand, macElevateAppleScript,
};
