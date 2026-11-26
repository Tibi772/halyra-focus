'use strict';
// Pure helpers for the managed section of the hosts file. The privileged
// helpers (helper-scripts.js) implement the same rules in sh/PowerShell; these
// functions are used for tests, for cleanup and for the blocklist file format.
const BRAND = require('../shared/brand');

const DOMAIN_RE = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/;

function stripSection(text) {
  const lines = String(text).split(/\r?\n/);
  if (lines.length && lines[lines.length - 1] === '') lines.pop();
  const out = [];
  let skip = false;
  for (const line of lines) {
    if (line === BRAND.hostsMarkerBegin) { skip = true; continue; }
    if (line === BRAND.hostsMarkerEnd) { skip = false; continue; }
    if (!skip) out.push(line);
  }
  return out.length ? out.join('\n') + '\n' : '';
}

function hasSection(text) {
  return String(text).split(/\r?\n/).includes(BRAND.hostsMarkerBegin);
}

/** Domains currently inside the managed section. */
function sectionHosts(text) {
  const out = new Set();
  let inside = false;
  for (const line of String(text).split(/\r?\n/)) {
    if (line === BRAND.hostsMarkerBegin) { inside = true; continue; }
    if (line === BRAND.hostsMarkerEnd) { inside = false; continue; }
    if (inside) { const m = /^\S+\s+(\S+)/.exec(line); if (m) out.add(m[1]); }
  }
  return out;
}

function buildSection(hosts) {
  const valid = [...new Set(hosts.map((h) => String(h).toLowerCase()))].filter((h) => DOMAIN_RE.test(h));
  if (!valid.length) return '';
  const lines = [BRAND.hostsMarkerBegin];
  for (const h of valid) {
    lines.push(`0.0.0.0 ${h}`);
    lines.push(`:: ${h}`);
  }
  lines.push(BRAND.hostsMarkerEnd);
  return lines.join('\n') + '\n';
}

function applySection(text, hosts) {
  return stripSection(text) + buildSection(hosts);
}

// Part-of-site rules the Windows helper may put into browser policy: host + a plain path.
const POLICY_PATH_RE = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+\/[a-z0-9._~%/+=,-]*$/;

/**
 * Contents of the user-writable blocklist file the helper watches.
 * `expiresAt` (ms) makes the helper drop the blocks by itself once the block's
 * timer is over — even if the app was force-quit or deleted in the meantime.
 * `extra.paths` / `extra.allow` are only used for browser policy (Windows);
 * older helpers simply ignore those comment lines.
 */
function blocklistFile(hosts, expiresAt, extra = {}) {
  const valid = [...new Set(hosts)].filter((h) => DOMAIN_RE.test(h)).sort();
  const paths = [...new Set(extra.paths || [])].filter((p) => POLICY_PATH_RE.test(p)).sort();
  const allow = [...new Set(extra.allow || [])].filter((h) => DOMAIN_RE.test(h)).sort();
  const any = valid.length || paths.length || allow.length;
  const exp = any && expiresAt ? `# expires=${Math.ceil(expiresAt / 1000)}\n` : '';
  const lines = [...valid, ...paths.map((p) => `# path ${p}`), ...allow.map((h) => `# allow ${h}`)];
  return `# ${BRAND.name} blocklist - written by the app, applied by the helper\n${exp}${lines.join('\n')}${lines.length ? '\n' : ''}`;
}

/** What the blocklist file asks for: { hosts, paths, allow, expiresAt } (mirrors the helpers' parsing). */
function parseBlocklist(text) {
  const out = { hosts: [], paths: [], allow: [], expiresAt: null };
  for (const raw of String(text).split(/\r?\n/)) {
    const l = raw.trim();
    let m;
    if ((m = /^# expires=(\d+)$/.exec(l))) out.expiresAt = Number(m[1]) * 1000;
    else if ((m = /^# path (\S+)$/.exec(l)) && POLICY_PATH_RE.test(m[1])) out.paths.push(m[1]);
    else if ((m = /^# allow (\S+)$/.exec(l)) && DOMAIN_RE.test(m[1])) out.allow.push(m[1]);
    else if (DOMAIN_RE.test(l)) out.hosts.push(l);
  }
  return out;
}

/** Chromium policy the Windows helper derives from the file (same rules as helper.ps1). */
function policyFromBlocklist(b) {
  if (b.allow.length) return { block: ['*'], allow: [...b.allow, ...POLICY_ALWAYS_ALLOW] };
  const set = new Set(b.hosts);
  const base = b.hosts.filter((h) => { for (let i = h.indexOf('.'); i >= 0; i = h.indexOf('.', i + 1)) { if (set.has(h.slice(i + 1))) return false; } return true; });
  return { block: [...base, ...b.paths].slice(0, 1000), allow: [] };
}
const POLICY_ALWAYS_ALLOW = ['127.0.0.1', 'localhost', 'chrome://*', 'edge://*', 'brave://*'];

module.exports = { DOMAIN_RE, POLICY_PATH_RE, POLICY_ALWAYS_ALLOW, stripSection, hasSection, sectionHosts, buildSection, applySection, blocklistFile, parseBlocklist, policyFromBlocklist };
