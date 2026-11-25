'use strict';
// Parsing process lists and matching them against blocked apps. Pure functions
// so they can be unit-tested on any OS.

/** macOS: output of `ps -x -o pid=,comm=` -> [{pid, path}] */
function parseMacPs(text) {
  const out = [];
  for (const line of String(text).split('\n')) {
    const m = /^\s*(\d+)\s+(.+?)\s*$/.exec(line);
    if (m) out.push({ pid: Number(m[1]), path: m[2] });
  }
  return out;
}

function parseCsvLine(line) {
  const cells = [];
  let cur = '';
  let q = false;
  for (let i = 0; i < line.length; i += 1) {
    const c = line[i];
    if (q) {
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i += 1; } else if (c === '"') q = false;
      else cur += c;
    } else if (c === '"') q = true;
    else if (c === ',') { cells.push(cur); cur = ''; } else cur += c;
  }
  cells.push(cur);
  return cells;
}

/** Windows: output of `tasklist /fo csv /nh` -> [{pid, exe}] */
function parseTasklist(text) {
  const out = [];
  for (const line of String(text).split(/\r?\n/)) {
    if (!line.trim()) continue;
    const c = parseCsvLine(line.trim());
    if (c.length < 2) continue;
    const pid = Number(c[1]);
    if (!Number.isInteger(pid)) continue;
    out.push({ pid, exe: c[0] });
  }
  return out;
}

const MAC_PROTECTED = ['/System/Library/CoreServices/Finder.app/', '/System/Library/CoreServices/Dock.app/', '/loginwindow', '/WindowServer', '/SystemUIServer.app/'];
const WIN_PROTECTED = new Set(['explorer.exe', 'csrss.exe', 'winlogon.exe', 'dwm.exe', 'svchost.exe', 'system', 'smss.exe', 'lsass.exe', 'services.exe', 'wininit.exe', 'fontdrvhost.exe', 'sihost.exe', 'ctfmon.exe', 'conhost.exe', 'tasklist.exe', 'powershell.exe']);

/**
 * macOS matching: an app named "Discord" matches any process whose executable
 * lives inside a bundle called "Discord.app" (main app + its helpers).
 */
function matchMac(procs, apps, { selfPath = '' } = {}) {
  const hits = [];
  for (const p of procs) {
    const lower = p.path.toLowerCase();
    if (selfPath && lower.startsWith(selfPath.toLowerCase())) continue;
    if (MAC_PROTECTED.some((x) => p.path.includes(x))) continue;
    for (const app of apps) {
      const names = app.mac || [];
      if (names.some((n) => lower.includes(`/${n.toLowerCase()}.app/`))) {
        hits.push({ pid: p.pid, app });
        break;
      }
    }
  }
  return hits;
}

function matchWin(procs, apps, { selfExe = '' } = {}) {
  const hits = [];
  const self = selfExe.toLowerCase();
  for (const p of procs) {
    const exe = p.exe.toLowerCase();
    if (WIN_PROTECTED.has(exe) || exe === self) continue;
    for (const app of apps) {
      if ((app.win || []).some((n) => n.toLowerCase() === exe)) {
        hits.push({ pid: p.pid, app });
        break;
      }
    }
  }
  return hits;
}

/** Apps that can be used to kill the blocker; optionally blocked in strict mode. */
const TAMPER_TOOLS = [
  { name: 'Activity Monitor', mac: ['Activity Monitor'], win: ['Taskmgr.exe', 'ProcessHacker.exe', 'procexp.exe', 'procexp64.exe'] },
  { name: 'Terminal', mac: ['Terminal', 'iTerm', 'Warp', 'Ghostty'], win: [] },
];

module.exports = { parseMacPs, parseTasklist, parseCsvLine, matchMac, matchWin, TAMPER_TOOLS };
