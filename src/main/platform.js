'use strict';
// Everything that touches the operating system: finding and closing blocked
// apps, listing installed apps, and the one-time privileged helper that keeps
// the hosts file in sync for website blocking.
const { execFile } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const BRAND = require('../shared/brand');
const proc = require('../core/procmatch');
const webusage = require('../core/webusage');
const hostsLib = require('../core/hosts');
const helper = require('../core/helperScripts');
const hider = require('./hider');

const IS_MAC = process.platform === 'darwin';
const IS_WIN = process.platform === 'win32';

function run(cmd, args, opts = {}) {
  return new Promise((resolve) => {
    execFile(cmd, args, { windowsHide: true, maxBuffer: 16 * 1024 * 1024, timeout: opts.timeout || 15000, ...opts }, (err, stdout, stderr) => {
      resolve({ code: err ? (typeof err.code === 'number' ? err.code : 1) : 0, stdout: String(stdout || ''), stderr: String(stderr || '') });
    });
  });
}

// ---------------------------------------------------------------- processes

function selfInfo() {
  if (IS_MAC) {
    const m = /^(.*?\.app)\//.exec(process.execPath);
    return { selfPath: m ? m[1] + '/' : process.execPath };
  }
  return { selfExe: path.basename(process.execPath) };
}

async function listProcesses() {
  if (IS_MAC) {
    const r = await run('/bin/ps', ['-x', '-o', 'pid=,comm=']);
    return proc.parseMacPs(r.stdout);
  }
  if (IS_WIN) {
    const r = await run('tasklist.exe', ['/fo', 'csv', '/nh']);
    return proc.parseTasklist(r.stdout);
  }
  return [];
}

/** Finds running processes that belong to blocked apps. */
async function findBlocked(apps) {
  if (!apps.length) return [];
  const procs = await listProcesses();
  return IS_MAC ? proc.matchMac(procs, apps, selfInfo()) : proc.matchWin(procs, apps, selfInfo());
}

// ---------------------------------------------------------------- browser page (for daily limits)

// JXA: name of the frontmost app + URL of its front tab (Safari & Chromium browsers).
// The first time, macOS asks once whether Halyra Focus may read the browser.
const JXA_FRONT = `function run(argv) {
  const sa = Application.currentApplication(); sa.includeStandardAdditions = true;
  const p = sa.pathTo('frontmost application').toString();
  const name = p.split('/').filter(Boolean).pop().replace(/\\.app$/, '');
  if ((argv[0] || '').split('|').indexOf(name) >= 0) return name + '\\n';
  const chromium = ['Google Chrome', 'Brave Browser', 'Microsoft Edge', 'Arc', 'Vivaldi', 'Chromium'];
  try {
    if (chromium.indexOf(name) >= 0) return name + '\\n' + Application(name).windows[0].activeTab.url();
    if (name === 'Safari' || name === 'Safari Technology Preview') return name + '\\n' + Application(name).documents[0].url();
  } catch (e) { return name + '\\n!' + (e.errorNumber || ''); }
  return name + '\\n';
}`;
const deniedBrowsers = new Set();

async function activeWebPage() {
  if (IS_MAC) {
    const r = await run('/usr/bin/osascript', ['-l', 'JavaScript', '-e', JXA_FRONT, [...deniedBrowsers].join('|')], { timeout: 4000 });
    if (r.code) return null;
    const [name, url = ''] = r.stdout.trim().split('\n');
    if (url.startsWith('!')) { if (/-1743|-10004/.test(url)) deniedBrowsers.add(name); return null; }
    const host = webusage.hostOf(url);
    return host ? { host } : null;
  }
  if (IS_WIN) {
    const r = await run('tasklist.exe', ['/v', '/fo', 'csv', '/nh', '/fi', 'WINDOWTITLE ne N/A'], { timeout: 8000 });
    const titles = webusage.parseWinTitles(r.stdout);
    return titles.length ? { titles } : null;
  }
  return null;
}

function kill(pids) {
  for (const pid of pids) {
    try { process.kill(pid, IS_WIN ? undefined : 'SIGTERM'); } catch (_) { /* gone or not ours */ }
  }
  if (!IS_WIN) {
    setTimeout(() => {
      for (const pid of pids) {
        try { process.kill(pid, 0); process.kill(pid, 'SIGKILL'); } catch (_) { /* already closed */ }
      }
    }, 1500);
  }
}

// ---------------------------------------------------------------- installed apps

function readdirSafe(dir) {
  try { return fs.readdirSync(dir, { withFileTypes: true }); } catch (_) { return []; }
}

function walk(dir, depth, out) {
  for (const e of readdirSafe(dir)) {
    const p = path.join(dir, e.name);
    if (e.isDirectory() && depth > 0) walk(p, depth - 1, out);
    else if (e.isFile() && /\.lnk$/i.test(e.name)) out.push(p);
  }
}

/**
 * Returns [{ name, path, mac?:[bundle], win?:[exe] }]. `readShortcut` is
 * electron's shell.readShortcutLink (Windows only).
 */
async function listInstalledApps(readShortcut) {
  const out = new Map();
  if (IS_MAC) {
    const dirs = ['/Applications', '/Applications/Utilities', '/System/Applications', '/System/Applications/Utilities', path.join(os.homedir(), 'Applications')];
    for (const d of dirs) {
      for (const e of readdirSafe(d)) {
        if (!e.name.endsWith('.app')) continue;
        const bundle = e.name.slice(0, -4);
        if (bundle === BRAND.name) continue;
        if (!out.has(bundle.toLowerCase())) out.set(bundle.toLowerCase(), { name: bundle, path: path.join(d, e.name), mac: [bundle], win: [] });
      }
    }
  } else if (IS_WIN) {
    const lnks = [];
    const roots = [
      path.join(process.env.ProgramData || 'C:\\ProgramData', 'Microsoft', 'Windows', 'Start Menu', 'Programs'),
      path.join(process.env.APPDATA || '', 'Microsoft', 'Windows', 'Start Menu', 'Programs'),
    ];
    for (const r of roots) walk(r, 3, lnks);
    for (const l of lnks) {
      const name = path.basename(l, '.lnk');
      if (/uninstall|eltávolít|readme|help|documentation|website/i.test(name)) continue;
      let target = '';
      try { target = readShortcut(l).target || ''; } catch (_) { target = ''; }
      if (!/\.exe$/i.test(target)) continue;
      const exe = path.basename(target);
      if (/^(unins\d*|uninstall|setup|update)\.exe$/i.test(exe)) continue;
      const key = exe.toLowerCase();
      if (!out.has(key)) out.set(key, { name, path: target, mac: [], win: [exe] });
    }
    // Store apps (WhatsApp, Netflix, …) have no plain shortcut target: add running windowed processes.
    const ps = "Get-Process | Where-Object { $_.MainWindowTitle -and $_.Path } | Select-Object ProcessName,Path,Description | ConvertTo-Json -Compress";
    const r = await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', ps], { timeout: 20000 });
    try {
      const data = JSON.parse(r.stdout || '[]');
      for (const p of Array.isArray(data) ? data : [data]) {
        if (!p || !p.Path) continue;
        const exe = path.basename(p.Path);
        const key = exe.toLowerCase();
        if (key === path.basename(process.execPath).toLowerCase()) continue;
        if (!out.has(key)) out.set(key, { name: p.Description || p.ProcessName, path: p.Path, mac: [], win: [exe], running: true });
      }
    } catch (_) { /* PowerShell unavailable */ }
  }
  return [...out.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/** Turn a file picked in the "Browse…" dialog into an app entry. */
function appFromPath(p) {
  if (IS_MAC) {
    const m = /([^/]+)\.app\/?$/.exec(p);
    if (!m) return null;
    return { name: m[1], mac: [m[1]], win: [], path: p };
  }
  const exe = path.basename(p);
  if (!/\.exe$/i.test(exe)) return null;
  return { name: exe.replace(/\.exe$/i, ''), mac: [], win: [exe], path: p };
}

// ---------------------------------------------------------------- website blocking helper

function rulesPath() {
  if (IS_MAC) return helper.MAC.rules;
  if (IS_WIN) return path.join(helper.WIN.dir(process.env.ProgramData || 'C:\\ProgramData'), 'blocklist.txt');
  return null;
}

function hostsPath() {
  if (IS_WIN) return path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'drivers', 'etc', 'hosts');
  return '/etc/hosts';
}

function helperInstalled() {
  try {
    if (IS_MAC) {
      if (!fs.existsSync(helper.MAC.plist) || !fs.existsSync(helper.MAC.helperScript)) return false;
    } else if (IS_WIN) {
      if (!fs.existsSync(path.join(path.dirname(rulesPath()), 'helper.ps1'))) return false;
    } else return false;
    fs.accessSync(rulesPath(), fs.constants.W_OK);
    return true;
  } catch (_) { return false; }
}

function writeRules(hosts, expiresAt, extra) {
  const p = rulesPath();
  if (!p) return false;
  try {
    fs.writeFileSync(p, hostsLib.blocklistFile(hosts, expiresAt, extra));
    return true;
  } catch (_) { return false; }
}

/** Version of the installed helper (scripts carry a "halyra-helper-version: N" line; none = 1). */
function helperVersion() {
  try {
    const file = IS_MAC ? helper.MAC.helperScript : path.join(path.dirname(rulesPath()), 'helper.ps1');
    const m = /halyra-helper-version: (\d+)/.exec(fs.readFileSync(file, 'utf8'));
    return m ? Number(m[1]) : 1;
  } catch (_) { return 0; }
}

/** The helper works but an update (one admin prompt) adds features, e.g. browser policy on Windows. */
function helperOutdated() {
  if (!IS_MAC && !IS_WIN) return false;
  const v = helperVersion();
  return v > 0 && v < helper.HELPER_VERSION[IS_MAC ? 'mac' : 'win'];
}

// ---------------------------------------------------------------- browsers

function createBrowserGuard(opts) {
  const { BrowserGuard } = require('./browsers');
  return new BrowserGuard(opts);
}

function startBlockServer(opts) {
  return require('./blockserver').start(opts);
}

function unfilterableBrowsers() {
  return require('./browsers').UNFILTERABLE;
}

/** Open the macOS Automation privacy pane (to allow controlling a browser). */
function openAutomationSettings() {
  if (IS_MAC) run('/usr/bin/open', ['x-apple.systempreferences:com.apple.preference.security?Privacy_Automation']);
}

/** Actions the renderer can call through platform:call. */
function handlers() {
  return {
    openAutomation: () => { openAutomationSettings(); return { ok: true }; },
  };
}

/** Which of `expected` hostnames are currently present in the hosts file. */
function verifyHosts(expected) {
  try {
    const text = fs.readFileSync(hostsPath(), 'utf8');
    const present = hostsLib.sectionHosts(text);
    if (!expected.length) return { ok: !hostsLib.hasSection(text), present: present.size };
    return { ok: expected.every((h) => present.has(h)), present: present.size };
  } catch (_) {
    return { ok: false, present: 0 };
  }
}

function stage(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `${BRAND.short}-`));
  for (const [name, content] of Object.entries(files)) {
    fs.writeFileSync(path.join(dir, name), content, { mode: 0o700 });
  }
  return dir;
}

// `nonInteractive` is for the automated self-test on CI machines, where the
// runner already has passwordless sudo (macOS) / an elevated admin (Windows).
async function installHelper(prompt, { nonInteractive = false } = {}) {
  if (IS_MAC) {
    const dir = stage({ 'helper.sh': helper.macHelperSh(), 'helper.plist': helper.macPlist(), 'install.sh': helper.macInstallSh() });
    const r = nonInteractive
      ? await run('/usr/bin/sudo', ['-n', '/bin/sh', path.join(dir, 'install.sh'), os.userInfo().username, dir], { timeout: 180000 })
      : await run('/usr/bin/osascript', ['-e', helper.macElevateAppleScript(path.join(dir, 'install.sh'), [os.userInfo().username, dir], prompt)], { timeout: 180000 });
    fs.rmSync(dir, { recursive: true, force: true });
    return { ok: r.code === 0 && helperInstalled(), cancelled: /-128|User canceled/i.test(r.stderr), error: r.stderr.trim() };
  }
  if (IS_WIN) {
    const dir = stage({ 'helper.ps1': helper.winHelperPs1(), 'install.ps1': helper.winInstallPs1() });
    const r = nonInteractive
      ? await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', path.join(dir, 'install.ps1')], { timeout: 180000 })
      : await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', helper.winElevateCommand(path.join(dir, 'install.ps1'))], { timeout: 180000 });
    fs.rmSync(dir, { recursive: true, force: true });
    return { ok: r.code === 0 && helperInstalled(), cancelled: r.code === 1223, error: r.stderr.trim() };
  }
  return { ok: false, error: 'unsupported' };
}

async function uninstallHelper(prompt, { nonInteractive = false } = {}) {
  if (IS_MAC) {
    const dir = stage({ 'uninstall.sh': helper.macUninstallSh() });
    const r = nonInteractive
      ? await run('/usr/bin/sudo', ['-n', '/bin/sh', path.join(dir, 'uninstall.sh')], { timeout: 180000 })
      : await run('/usr/bin/osascript', ['-e', helper.macElevateAppleScript(path.join(dir, 'uninstall.sh'), [], prompt)], { timeout: 180000 });
    fs.rmSync(dir, { recursive: true, force: true });
    return { ok: r.code === 0, cancelled: /-128|User canceled/i.test(r.stderr) };
  }
  if (IS_WIN) {
    const dir = stage({ 'uninstall.ps1': helper.winUninstallPs1() });
    const r = nonInteractive
      ? await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', path.join(dir, 'uninstall.ps1')], { timeout: 180000 })
      : await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', helper.winElevateCommand(path.join(dir, 'uninstall.ps1'))], { timeout: 180000 });
    fs.rmSync(dir, { recursive: true, force: true });
    return { ok: r.code === 0, cancelled: r.code === 1223 };
  }
  return { ok: false };
}

module.exports = {
  IS_MAC, IS_WIN, findBlocked, activeWebPage, kill, listInstalledApps, appFromPath,
  helperInstalled, helperVersion, helperOutdated, writeRules, verifyHosts, installHelper, uninstallHelper, rulesPath, hostsPath,
  createBrowserGuard, startBlockServer, unfilterableBrowsers, openAutomationSettings, handlers,
  makeHider: (onHidden) => new hider.Hider(onHidden), appAction: hider.actionFor,
};
