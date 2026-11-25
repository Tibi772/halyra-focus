'use strict';
// Matching "what is open in the browser right now" against block-list sites,
// so daily limits count website time too (not only app run-time).
// macOS gives us the exact URL of the front tab; Windows gives window titles.
const { parseCsvLine } = require('./procmatch');

const WIN_BROWSERS = new Set(['chrome.exe', 'msedge.exe', 'firefox.exe', 'brave.exe', 'opera.exe', 'vivaldi.exe', 'arc.exe', 'zen.exe', 'librewolf.exe', 'waterfox.exe']);
const SLD = new Set(['co', 'com', 'org', 'net', 'gov', 'ac', 'edu']);

function hostOf(url) {
  try { const u = new URL(String(url)); return /^https?:$/.test(u.protocol) ? u.hostname.toLowerCase().replace(/^www\./, '') : ''; } catch (_) { return ''; }
}

/** "youtube.com" → "youtube", "bbc.co.uk" → "bbc", "web.whatsapp.com" → "whatsapp". */
function stem(site) {
  const p = String(site).toLowerCase().split('.').filter(Boolean);
  if (p.length < 2) return p[0] || '';
  if (p.length >= 3 && SLD.has(p[p.length - 2])) return p[p.length - 3];
  return p[p.length - 2];
}

/** Window titles of open browser windows from `tasklist /v /fo csv /nh`. */
function parseWinTitles(text) {
  const titles = [];
  for (const line of String(text).split(/\r?\n/)) {
    if (!line.trim()) continue;
    const c = parseCsvLine(line.trim());
    if (c.length < 9) continue;
    const title = c[c.length - 1];
    if (WIN_BROWSERS.has(String(c[0]).toLowerCase()) && title && title !== 'N/A') titles.push(title);
  }
  return titles;
}

/** page: {host} (exact) or {titles: []} (heuristic). */
function pageMatches(page, sites) {
  if (!page || !sites || !sites.length) return false;
  if (page.host) return sites.some((s) => page.host === s || page.host.endsWith(`.${s}`));
  if (page.titles && page.titles.length) {
    const text = page.titles.join('\n').toLowerCase();
    return sites.some((s) => { const st = stem(s); return st.length >= 4 && new RegExp(`(^|[^a-z0-9])${st}([^a-z0-9]|$)`).test(text); });
  }
  return false;
}

module.exports = { WIN_BROWSERS, hostOf, stem, parseWinTitles, pageMatches };
