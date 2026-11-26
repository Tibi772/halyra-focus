'use strict';
// Browser-level enforcement on computers, on top of the hosts file:
//  - macOS: every open tab of Safari / Chrome / Edge / Brave / Arc / Vivaldi is
//    checked (front window every 2 s, all windows every 10 s and whenever the
//    rules change). Blocked tabs — including ones that were already open when
//    the block started — are sent to Halyra Focus' own block page.
//  - Windows: the privileged helper turns the rules into Chrome / Edge / Brave
//    policy (URLBlocklist / URLAllowlist), which also covers part-of-site rules
//    and "only these sites" lists. A small watcher reloads the front browser
//    window once if its title shows a site that just got blocked, so pages that
//    were already open get closed by the policy too.
const { execFile, spawn } = require('child_process');
const rules = require('../core/blockrules');
const { stem } = require('../core/webusage');
const { expandHosts } = require('../core/domains');

const IS_MAC = process.platform === 'darwin';
const IS_WIN = process.platform === 'win32';

const MAC_BROWSERS = [
  { name: 'Safari', kind: 'safari' },
  { name: 'Safari Technology Preview', kind: 'safari' },
  { name: 'Google Chrome', kind: 'chromium' },
  { name: 'Google Chrome Beta', kind: 'chromium' },
  { name: 'Google Chrome Canary', kind: 'chromium' },
  { name: 'Microsoft Edge', kind: 'chromium' },
  { name: 'Brave Browser', kind: 'chromium' },
  { name: 'Arc', kind: 'chromium' },
  { name: 'Vivaldi', kind: 'chromium' },
  { name: 'Chromium', kind: 'chromium' },
];

// Browsers whose tabs cannot be filtered. While an "only these sites" list is
// on they are closed like blocked apps — otherwise the list would be pointless.
const UNFILTERABLE = [
  { name: 'Firefox', mac: ['Firefox', 'Firefox Developer Edition', 'Firefox Nightly', 'LibreWolf', 'Waterfox', 'Zen', 'Zen Browser', 'Tor Browser'], win: ['firefox.exe', 'librewolf.exe', 'waterfox.exe', 'zen.exe'] },
  { name: 'Opera', mac: ['Opera', 'Opera GX', 'Orion'], win: ['opera.exe', 'vivaldi.exe'] },
];

// Same matching code as src/core/blockrules.js, run inside osascript.
const JXA_SWEEP = `
${rules.hostOf.toString()}
${rules.inSet.toString()}
${rules.urlBlocked.toString()}
function run(argv) {
  const cfg = JSON.parse(argv[0]);
  const r = { hosts: new Set(cfg.hosts), paths: cfg.paths, allow: cfg.allow };
  const out = { hits: [], denied: [], tabs: 0, running: [] };
  let front = '';
  if (cfg.frontOnly) {
    try {
      const sa = Application.currentApplication(); sa.includeStandardAdditions = true;
      front = sa.pathTo('frontmost application').toString().split('/').filter(Boolean).pop().replace(/\\.app$/, '');
    } catch (e) { return JSON.stringify(out); }
  }
  for (const b of cfg.browsers) {
    if (cfg.frontOnly && b !== front) continue;
    let app;
    try { app = Application(b); if (!app.running()) continue; } catch (e) { continue; }
    out.running.push(b);
    try {
      let all = null;
      try { all = app.windows.tabs.url(); } catch (e) { all = null; }
      const n = all ? all.length : app.windows.length;
      for (let wi = 0; wi < n && wi < 60; wi++) {
        let urls = all ? all[wi] : null;
        if (!urls) { try { urls = app.windows[wi].tabs.url(); } catch (e) { continue; } }
        out.tabs += urls.length;
        for (let ti = 0; ti < urls.length; ti++) {
          const u = urls[ti];
          if (!u || u.indexOf(cfg.blockUrl) === 0) continue;
          const hit = urlBlocked(u, r);
          if (!hit) continue;
          const to = cfg.blockUrl + '?site=' + encodeURIComponent(hit) + '&u=' + encodeURIComponent(u.slice(0, 1500));
          try { app.windows[wi].tabs[ti].url = to; out.hits.push([b, hit]); } catch (e) { out.hits.push([b, hit, String(e.errorNumber || 'x')]); }
        }
        if (cfg.frontOnly) break;
      }
    } catch (e) {
      const code = e.errorNumber;
      if (code === -1743 || code === -10004 || code === -1744) out.denied.push(b);
      else out.error = String(e).slice(0, 200);
    }
  }
  return JSON.stringify(out);
}`;

function runJxa(arg, timeout = 8000) {
  return new Promise((resolve) => {
    execFile('/usr/bin/osascript', ['-l', 'JavaScript', '-e', JXA_SWEEP, arg], { timeout, maxBuffer: 4 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) { resolve({ error: err.killed ? 'timeout (waiting for permission?)' : String(stderr || err.message).slice(0, 300) }); return; }
      try { resolve(JSON.parse(String(stdout).trim() || '{}')); } catch (_) { resolve({ error: 'parse' }); }
    });
  });
}

// ---------------------------------------------------------------- Windows foreground watcher

const WIN_WATCHER = `
$ErrorActionPreference = 'SilentlyContinue'
Add-Type -AssemblyName System.Windows.Forms
Add-Type @"
using System; using System.Runtime.InteropServices; using System.Text;
public static class HalyraFg {
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint p);
}
"@
$browsers = @('chrome', 'msedge', 'brave', 'chromium')
$stems = @()
$done = @{}
$in = [Console]::In
$next = $in.ReadLineAsync()
while ($true) {
  if ($next.IsCompleted) {
    $line = $next.Result
    if ($null -eq $line) { exit 0 }
    $stems = @($line.Split(',') | Where-Object { $_.Length -ge 4 })
    $done = @{}
    $next = $in.ReadLineAsync()
  }
  if ($stems.Count -gt 0) {
    $h = [HalyraFg]::GetForegroundWindow()
    $sb = New-Object System.Text.StringBuilder 512
    [void][HalyraFg]::GetWindowText($h, $sb, 512)
    $title = $sb.ToString()
    [uint32]$procId = 0
    [void][HalyraFg]::GetWindowThreadProcessId($h, [ref]$procId)
    $p = Get-Process -Id $procId
    if ($p -and ($browsers -contains $p.ProcessName.ToLower()) -and $title -and -not $done.ContainsKey($title)) {
      $low = $title.ToLower()
      foreach ($s in $stems) {
        if ($low -match ('(^|[^a-z0-9])' + [regex]::Escape($s) + '([^a-z0-9]|$)')) {
          $done[$title] = $true
          [System.Windows.Forms.SendKeys]::SendWait('{F5}')
          [Console]::Out.WriteLine('reload ' + $s)
          [Console]::Out.Flush()
          break
        }
      }
    }
  }
  Start-Sleep -Milliseconds 1200
}
`;

class WinWatcher {
  constructor(log) { this.proc = null; this.last = null; this.log = log || (() => {}); this.reloads = 0; }

  set(stems) {
    const line = stems.join(',');
    if (!stems.length) { this.stop(); return; }
    if (!this.proc) this.start();
    if (this.proc && line !== this.last) {
      try { this.proc.stdin.write(`${line}\n`); this.last = line; } catch (_) { this.stop(); }
    }
  }

  start() {
    const enc = Buffer.from(WIN_WATCHER, 'utf16le').toString('base64');
    try {
      this.proc = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', enc], { windowsHide: true, stdio: ['pipe', 'pipe', 'ignore'] });
    } catch (_) { this.proc = null; return; }
    this.last = null;
    this.proc.stdout.on('data', (d) => { for (const l of String(d).split(/\r?\n/)) if (l.startsWith('reload')) { this.reloads += 1; this.log(l); } });
    this.proc.on('exit', () => { this.proc = null; this.last = null; });
    this.proc.stdin.on('error', () => {});
  }

  stop() {
    if (!this.proc) return;
    try { this.proc.stdin.end(); } catch (_) { /* ignore */ }
    try { this.proc.kill(); } catch (_) { /* ignore */ }
    this.proc = null;
    this.last = null;
  }
}

/** Title words for the Windows watcher: "youtube.com" → "youtube" (short or ambiguous words are left out). */
function titleStems(sites, keep = []) {
  const keepStems = new Set(keep.map(stem));
  const out = new Set();
  for (const s of sites) {
    const st = stem(s);
    if (st.length >= 4 && !keepStems.has(st) && /^[a-z0-9-]+$/.test(st)) out.add(st);
  }
  return [...out].sort();
}

// ---------------------------------------------------------------- controller

class BrowserGuard {
  constructor({ log } = {}) {
    this.log = log || (() => {});
    this.busy = false;
    this.lastFull = 0;
    this.lastFront = 0;
    this.sig = '';
    this.denied = new Set();
    this.running = new Set();
    this.blockedTabs = 0;
    this.lastHit = null;
    this.watcher = IS_WIN ? new WinWatcher(this.log) : null;
    this.onHit = null;
    this.lastError = null;
  }

  /**
   * Called every second. `r` = { sites, paths, allow } from the engine (empty when
   * nothing is blocked), `blockUrl` = the local block page, `policyOk` = the
   * Windows helper is installed (policy can be applied).
   */
  update(r, { blockUrl, policyOk = false, now = Date.now() } = {}) {
    const active = Boolean(r && (r.sites.length || r.paths.length || (r.allow && r.allow.length)));
    const sig = active ? JSON.stringify([r.sites, r.paths, r.allow]) : '';
    const changed = sig !== this.sig;
    this.sig = sig;
    if (changed) this.denied.clear();
    if (IS_MAC) {
      if (!active || !blockUrl || this.busy) return;
      const full = changed || now - this.lastFull >= 10000;
      if (!full && now - this.lastFront < 2000) return;
      this.sweep(r, blockUrl, full, now);
    } else if (IS_WIN && this.watcher) {
      const stems = active && policyOk && !(r.allow && r.allow.length) ? titleStems(r.sites, []) : [];
      this.watcher.set(stems);
    }
  }

  async sweep(r, blockUrl, full, now) {
    this.busy = true;
    if (full) this.lastFull = now;
    this.lastFront = now;
    const browsers = MAC_BROWSERS.map((b) => b.name).filter((n) => !this.denied.has(n));
    const arg = JSON.stringify({
      hosts: expandHosts(r.sites).slice(0, 5000), paths: r.paths, allow: r.allow && r.allow.length ? r.allow : null,
      blockUrl, browsers, frontOnly: !full,
    });
    try {
      const res = await runJxa(arg);
      if (res.error) { this.lastError = res.error; this.log(`browsers: ${res.error}`); return; }
      this.lastError = res.error || null;
      if (full) this.running = new Set(res.running || []);
      for (const d of res.denied || []) this.denied.add(d);
      const ok = (res.hits || []).filter((h) => !h[2]);
      if (ok.length) {
        this.blockedTabs += ok.length;
        this.lastHit = { at: Date.now(), site: ok[0][1], browser: ok[0][0] };
        if (this.onHit) for (const h of ok) this.onHit(h[1], h[0]);
      }
    } finally { this.busy = false; }
  }

  /** For the UI. */
  state() {
    return {
      supported: IS_MAC || IS_WIN,
      denied: [...this.denied],
      running: [...this.running],
      blockedTabs: this.blockedTabs,
      reloads: this.watcher ? this.watcher.reloads : 0,
      lastHit: this.lastHit,
      lastError: this.lastError || null,
    };
  }

  stop() { if (this.watcher) this.watcher.stop(); }
}

module.exports = { BrowserGuard, titleStems, UNFILTERABLE, MAC_BROWSERS, JXA_SWEEP, WIN_WATCHER };
