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

/**
 * Contents of the user-writable blocklist file the helper watches.
 * `expiresAt` (ms) makes the helper drop the blocks by itself once the block's
 * timer is over — even if the app was force-quit or deleted in the meantime.
 */
function blocklistFile(hosts, expiresAt) {
  const valid = [...new Set(hosts)].filter((h) => DOMAIN_RE.test(h)).sort();
  const exp = valid.length && expiresAt ? `# expires=${Math.ceil(expiresAt / 1000)}\n` : '';
  return `# ${BRAND.name} blocklist - written by the app, applied by the helper\n${exp}${valid.join('\n')}${valid.length ? '\n' : ''}`;
}

module.exports = { DOMAIN_RE, stripSection, hasSection, sectionHosts, buildSection, applySection, blocklistFile };
