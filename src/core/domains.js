'use strict';
const { domainToASCII } = require('url');
const { EXTRA_HOSTS } = require('./presets');

const LABEL = /^(?!-)[a-z0-9-]{1,63}(?<!-)$/;
const SECOND_LEVEL = new Set(['co', 'com', 'org', 'net', 'ac', 'gov', 'edu', 'or', 'ne']);

/** Turns "https://www.YouTube.com/watch?v=1" into "youtube.com". Returns null if invalid. */
function normalizeSite(input) {
  let s = String(input == null ? '' : input).trim().toLowerCase();
  if (!s) return null;
  s = s.replace(/^[a-z][a-z0-9+.-]*:\/\//, '');
  s = s.replace(/^[^@/]*@/, '');
  s = s.split(/[/?#\s]/)[0];
  s = s.replace(/:\d+$/, '');
  s = s.replace(/^\*\./, '').replace(/^\.+/, '').replace(/\.+$/, '');
  s = s.replace(/^www\d?\./, '');
  if (!s) return null;
  let ascii = s;
  try { ascii = domainToASCII(s) || ''; } catch (_) { ascii = ''; }
  if (!ascii) return null;
  const labels = ascii.split('.');
  if (labels.length < 2) return null;
  if (!labels.every((l) => LABEL.test(l))) return null;
  if (/^\d+$/.test(labels[labels.length - 1])) return null; // raw IPs are not supported by hosts blocking
  if (ascii.length > 253) return null;
  return ascii;
}

function isRegistrable(host) {
  const labels = host.split('.');
  if (labels.length === 2) return true;
  if (labels.length === 3 && SECOND_LEVEL.has(labels[1]) && labels[2].length === 2) return true;
  return false;
}

/** All hostnames to put in the hosts file for a list of normalized sites. */
function expandHosts(sites) {
  const out = new Set();
  for (const raw of sites || []) {
    const d = normalizeSite(raw);
    if (!d) continue;
    out.add(d);
    if (isRegistrable(d)) {
      out.add(`www.${d}`);
      out.add(`m.${d}`);
      out.add(`mobile.${d}`);
    }
    for (const extra of EXTRA_HOSTS[d] || []) out.add(extra);
  }
  return [...out].sort();
}

module.exports = { normalizeSite, expandHosts };
