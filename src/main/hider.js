'use strict';
// Hides blocked apps instead of quitting them (Mac & Windows): chat apps like
// Discord or Messenger keep running in the background, but their windows stay
// out of sight until the block is over — then they come back by themselves.
//   Mac:     NSRunningApplication hide / unhide (no extra permission needed)
//   Windows: a small PowerShell helper minimises the windows of those processes
//            and restores them (without stealing focus) when the block ends.
const { execFile, spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const IS_MAC = process.platform === 'darwin';
const IS_WIN = process.platform === 'win32';

/** Chat & social apps are hidden by default; everything else (games, video…) is closed. */
const HIDE_BY_DEFAULT = /discord|messenger|whatsapp|telegram|slack|teams|signal|skype|facebook|instagram|viber|wechat|\bline\b|messages|mail|outlook|thunderbird|spark|zoom|element|threema/i;

function actionFor(app, setting) {
  if (setting === 'hide' || setting === 'close') return setting;
  const text = [app && app.name, ...((app && app.mac) || []), ...((app && app.win) || [])].join(' ');
  return HIDE_BY_DEFAULT.test(text) ? 'hide' : 'close';
}

// ---------------------------------------------------------------- macOS

const JXA_HIDE = `ObjC.import('AppKit');
function run(argv) {
  const hide = argv[0] ? argv[0].split(',').map(Number) : [];
  const show = argv[1] ? argv[1].split(',').map(Number) : [];
  const apps = $.NSWorkspace.sharedWorkspace.runningApplications;
  const out = [];
  for (let i = 0; i < apps.count; i += 1) {
    const a = apps.objectAtIndex(i);
    const pid = a.processIdentifier;
    if (hide.indexOf(pid) >= 0) { if (!a.isHidden) { a.hide; out.push('hid ' + pid); } }
    else if (show.indexOf(pid) >= 0 && a.isHidden) { a.unhide; out.push('show ' + pid); }
  }
  return out.join('\\n');
}`;

function osa(hidePids, showPids) {
  return new Promise((resolve) => {
    execFile('/usr/bin/osascript', ['-l', 'JavaScript', '-e', JXA_HIDE, hidePids.join(','), showPids.join(',')], { timeout: 5000 }, (err, stdout) => {
      if (err) { resolve([]); return; }
      resolve(String(stdout).split('\n').filter((l) => l.startsWith('hid ')).map((l) => Number(l.slice(4))));
    });
  });
}

// ---------------------------------------------------------------- Windows

// A small PowerShell loop. The list of process ids to keep hidden comes from a file the
// app rewrites (reading stdin would block the loop in Windows PowerShell 5.1). It quits by
// itself when the file says "exit" or the app is gone, and brings every window back then.
const psq = (x) => String(x).replace(/'/g, "''");
function winHider(file, ppid) {
  return `
$ErrorActionPreference = 'SilentlyContinue'
$file = '${psq(file)}'
$ppid = ${Number(ppid) || 0}
Add-Type @"
using System; using System.Runtime.InteropServices; using System.Collections.Generic;
public static class HalyraHide {
  public delegate bool EnumProc(IntPtr h, IntPtr l);
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc cb, IntPtr l);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint p);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr h);
  [DllImport("user32.dll")] public static extern bool ShowWindowAsync(IntPtr h, int c);
  [DllImport("user32.dll")] public static extern IntPtr GetWindow(IntPtr h, uint c);
  public static List<IntPtr> Windows(HashSet<uint> pids) {
    var list = new List<IntPtr>();
    EnumWindows((h, l) => { uint p; GetWindowThreadProcessId(h, out p); if (pids.Contains(p) && IsWindowVisible(h) && GetWindow(h, 4) == IntPtr.Zero) list.Add(h); return true; }, IntPtr.Zero);
    return list;
  }
}
"@
$hide = New-Object 'System.Collections.Generic.HashSet[uint32]'
$mini = @{}
$last = $null
$n = 0
while ($true) {
  $n++
  if ($ppid -gt 0 -and ($n % 6) -eq 0 -and -not (Get-Process -Id $ppid -ErrorAction SilentlyContinue)) { break }
  $line = ''
  try { $line = [System.IO.File]::ReadAllText($file).Trim() } catch { $line = '' }
  if ($line -eq 'exit') { break }
  if ($line -ne $last) {
    $last = $line
    $new = New-Object 'System.Collections.Generic.HashSet[uint32]'
    foreach ($x in $line.Split(',')) { [uint32]$v = 0; if ([uint32]::TryParse($x, [ref]$v)) { [void]$new.Add($v) } }
    foreach ($k in @($mini.Keys)) {
      if (-not $new.Contains([uint32]$mini[$k])) { [void][HalyraHide]::ShowWindowAsync([IntPtr][int64]$k, 4); $mini.Remove($k) }
    }
    $hide = $new
  }
  if ($hide.Count -gt 0) {
    foreach ($h in [HalyraHide]::Windows($hide)) {
      if (-not [HalyraHide]::IsIconic($h)) {
        [void][HalyraHide]::ShowWindowAsync($h, 6)
        [uint32]$p = 0
        [void][HalyraHide]::GetWindowThreadProcessId($h, [ref]$p)
        $mini[[int64]$h] = $p
        [Console]::Out.WriteLine('hid ' + $p)
        [Console]::Out.Flush()
      }
    }
  }
  Start-Sleep -Milliseconds 700
}
foreach ($k in @($mini.Keys)) { [void][HalyraHide]::ShowWindowAsync([IntPtr][int64]$k, 4) }
`;
}
const WIN_HIDER = winHider('C:\\example\\halyra-hide.txt', 0);

class Hider {
  /** onHidden(pid): a window of this process was just put away (the user tried to use it). */
  constructor(onHidden) {
    this.onHidden = onHidden || (() => {});
    this.hidden = new Set(); // mac pids we hid
    this.proc = null;
    this.last = '';
    this.count = 0;
    this.file = path.join(os.tmpdir(), `halyra-hide-${process.pid}.txt`);
  }

  supported() { return IS_MAC || IS_WIN; }

  /** The full set of pids to keep hidden right now (empty = bring everything back). */
  async set(pids) {
    const want = [...new Set(pids.map(Number).filter((p) => p > 0))].sort((a, b) => a - b);
    if (IS_MAC) {
      const show = [...this.hidden].filter((p) => !want.includes(p));
      if (!want.length && !show.length) return [];
      // Same set as last time: re-check (the user may have brought it back) at most every 1.5 s.
      const key = want.join(',');
      if (!show.length && key === this.last && Date.now() - (this.lastAt || 0) < 1500) return [];
      this.last = key;
      this.lastAt = Date.now();
      const hid = await osa(want, show);
      for (const p of show) this.hidden.delete(p);
      for (const p of want) this.hidden.add(p);
      for (const p of hid) { this.count += 1; this.onHidden(p); }
      return hid;
    }
    if (IS_WIN) {
      const line = want.join(',');
      if (!want.length && !this.proc) return [];
      if (line !== this.last) { this.write(line); this.last = line; }
      if (want.length && !this.proc) this.start();
      clearTimeout(this.stopTimer);
      if (!want.length) this.stopTimer = setTimeout(() => { if (this.last === '') this.stop(); }, 4000);
    }
    return [];
  }

  write(text) {
    try { fs.writeFileSync(this.file, text); } catch (_) { /* temp folder not writable: nothing to hide */ }
  }

  start() {
    const enc = Buffer.from(winHider(this.file, process.pid), 'utf16le').toString('base64');
    try {
      this.proc = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', enc], { windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] });
    } catch (_) { this.proc = null; return; }
    const proc = this.proc;
    proc.stdout.on('data', (d) => {
      for (const l of String(d).split(/\r?\n/)) if (l.startsWith('hid ')) { this.count += 1; this.onHidden(Number(l.slice(4))); }
    });
    proc.on('error', () => { if (this.proc === proc) this.proc = null; });
    proc.on('exit', () => { if (this.proc === proc) this.proc = null; });
  }

  stop() {
    clearTimeout(this.stopTimer);
    if (IS_WIN) this.write('exit'); // the loop restores every window and quits
    const p = this.proc;
    this.proc = null;
    this.last = '';
    if (p) setTimeout(() => { try { p.kill(); } catch (_) { /* gone */ } }, 2500).unref();
  }

}

module.exports = { Hider, actionFor, HIDE_BY_DEFAULT, JXA_HIDE, WIN_HIDER, winHider };
