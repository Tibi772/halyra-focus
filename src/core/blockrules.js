'use strict';
// Website rules beyond whole domains:
//  - path rules: "youtube.com/shorts", "reddit.com/r/all" (block a part of a site)
//  - allowlist lists: while active, only their sites are allowed in the browser
// Used for browser-level enforcement (open tabs, Chromium policy) on every platform.
const { normalizeSite } = require('./domains');

/** "https://www.YouTube.com/shorts/?x=1" → "youtube.com/shorts" (host + path prefix), or null. */
function normalizePathRule(raw) {
  let s = String(raw || '').trim().toLowerCase();
  if (!s || s.length > 300) return null;
  s = s.replace(/^[a-z][a-z0-9+.-]*:\/\//, '').replace(/[?#].*$/, '');
  const slash = s.indexOf('/');
  if (slash < 0) return null;
  const host = normalizeSite(s.slice(0, slash));
  if (!host) return null;
  let p = s.slice(slash).replace(/\/{2,}/g, '/').replace(/\/+$/, '');
  if (!p || p === '/') return null;
  if (!/^[/a-z0-9._~%!$&'()*+,;=:@-]+$/.test(p)) return null;
  return host + p;
}

function hostOf(url) {
  const m = /^https?:\/\/([^/:?#]+)(?::\d+)?([^?#]*)/i.exec(String(url || ''));
  if (!m) return null;
  return { host: m[1].toLowerCase().replace(/^www\./, '').replace(/\.$/, ''), path: m[2] || '/' };
}

function inSet(host, set) {
  for (let h = host; h;) {
    if (set.has(h)) return true;
    const i = h.indexOf('.');
    if (i < 0) return false;
    h = h.slice(i + 1);
  }
  return false;
}

/**
 * What a URL hits, given { hosts:Set|Array, paths:Array, allow:Array|null }.
 * Returns the matched rule (string) or null. Local and internal pages are never blocked.
 */
function urlBlocked(url, rules) {
  const u = hostOf(url);
  if (!u) return null;
  if (u.host === 'localhost' || u.host === '127.0.0.1' || u.host === '[::1]') return null;
  const hosts = rules.hosts instanceof Set ? rules.hosts : new Set(rules.hosts || []);
  if (inSet(u.host, hosts)) return u.host;
  const p = u.path.toLowerCase();
  for (const r of rules.paths || []) {
    // "youtube.com/shorts" covers m.youtube.com/shorts/… too, but not /shortsx.
    const i = r.indexOf('/');
    const rh = r.slice(0, i);
    const rp = r.slice(i);
    if (u.host !== rh && !u.host.endsWith(`.${rh}`)) continue;
    if (p === rp || p.startsWith(`${rp}/`)) return r;
  }
  if (rules.allow && rules.allow.length) {
    const allow = new Set(rules.allow);
    if (!inSet(u.host, allow)) return u.host;
  }
  return null;
}

/** Chromium "URLBlocklist"/"URLAllowlist" policy entries for the rules. */
function chromiumPolicy({ sites = [], paths = [], allow = [] }) {
  if (allow.length) return { block: ['*'], allow: [...new Set(allow)].sort() };
  return { block: [...new Set([...sites, ...paths])].sort(), allow: [] };
}

module.exports = { normalizePathRule, urlBlocked, chromiumPolicy, hostOf, inSet };
