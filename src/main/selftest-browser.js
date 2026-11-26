'use strict';
// Real-browser checks for the self-test (CI): drives Chrome / Edge over the
// DevTools protocol to see what a user would see in a tab.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, execFile } = require('child_process');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function findBrowser() {
  const c = process.platform === 'darwin'
    ? ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome']
    : [
      path.join(process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
      path.join(process.env.ProgramFiles || 'C:\\Program Files', 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
      path.join(process.env.ProgramFiles || 'C:\\Program Files', 'Google', 'Chrome', 'Application', 'chrome.exe'),
    ];
  return c.find((p) => { try { return fs.existsSync(p); } catch (_) { return false; } }) || null;
}

async function json(url, opts) {
  const r = await fetch(url, opts);
  return r.json();
}

class Cdp {
  constructor(wsUrl) { this.wsUrl = wsUrl; this.id = 0; this.pending = new Map(); }

  async open() {
    this.ws = new WebSocket(this.wsUrl);
    await new Promise((res, rej) => { this.ws.onopen = res; this.ws.onerror = rej; });
    this.ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && this.pending.has(d.id)) { this.pending.get(d.id)(d); this.pending.delete(d.id); } };
    return this;
  }

  send(method, params = {}) {
    return new Promise((resolve) => {
      this.id += 1;
      const id = this.id;
      const timer = setTimeout(() => { this.pending.delete(id); resolve({ error: 'timeout' }); }, 15000);
      this.pending.set(id, (d) => { clearTimeout(timer); resolve(d); });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async eval(expr) {
    const r = await this.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    return r.result && r.result.result ? r.result.result.value : undefined;
  }

  close() { try { this.ws.close(); } catch (_) { /* ignore */ } }
}

/** Starts a browser with remote debugging. `headless` false = real window (macOS tab checks need one). */
async function launch({ headless, port = 9333, url = 'about:blank' }) {
  const exe = findBrowser();
  if (!exe) return { error: 'no Chrome/Edge found' };
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'hf-browser-'));
  const args = [`--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check', '--disable-features=HttpsUpgrades', '--remote-allow-origins=*'];
  if (headless) args.push('--headless=new');
  args.push(url);
  const child = spawn(exe, args, { stdio: 'ignore', detached: false });
  let ok = false;
  for (let i = 0; i < 40 && !ok; i += 1) {
    try { await json(`http://127.0.0.1:${port}/json/version`); ok = true; } catch (_) { await sleep(500); }
  }
  if (!ok) { try { child.kill(); } catch (_) { /* ignore */ } return { error: `browser did not start (${path.basename(exe)})` }; }
  return { exe, port, child, profile, name: path.basename(exe) };
}

async function pages(b) {
  try { return (await json(`http://127.0.0.1:${b.port}/json/list`)).filter((t) => t.type === 'page'); } catch (_) { return []; }
}

async function attach(b, match) {
  const list = await pages(b);
  const t = list.find((p) => (match ? match(p) : true)) || list[0];
  if (!t) return null;
  return new Cdp(t.webSocketDebuggerUrl).open();
}

/** Navigates the first tab and returns { url, title, text } once it has loaded. */
async function visit(b, url, wait = 6000) {
  const cdp = await attach(b);
  if (!cdp) return { error: 'no tab' };
  try {
    await cdp.send('Page.enable');
    await cdp.send('Page.navigate', { url });
    await sleep(wait);
    const info = await cdp.eval('({ url: location.href, title: document.title, text: (document.body && document.body.innerText || "").slice(0, 600) })');
    return info || { error: 'no result' };
  } finally { cdp.close(); }
}

async function screenshot(b, file, match) {
  const cdp = await attach(b, match);
  if (!cdp) return false;
  try {
    const r = await cdp.send('Page.captureScreenshot', { format: 'png' });
    if (r.result && r.result.data) { fs.writeFileSync(file, Buffer.from(r.result.data, 'base64')); return true; }
    return false;
  } finally { cdp.close(); }
}

function close(b) {
  if (!b || !b.child) return;
  try { b.child.kill(); } catch (_) { /* ignore */ }
  if (process.platform === 'win32') execFile('taskkill.exe', ['/F', '/T', '/PID', String(b.child.pid)], () => {});
}

/** Values of a Windows registry list policy, e.g. HKLM\SOFTWARE\Policies\Microsoft\Edge\URLBlocklist. */
function regList(key) {
  return new Promise((resolve) => {
    execFile('reg.exe', ['query', key], { windowsHide: true }, (err, stdout) => {
      if (err) { resolve([]); return; }
      resolve(String(stdout).split(/\r?\n/).map((l) => /^\s+\d+\s+REG_SZ\s+(.*)$/.exec(l)).filter(Boolean).map((m) => m[1].trim()));
    });
  });
}

module.exports = { findBrowser, launch, pages, visit, screenshot, close, regList, attach };
