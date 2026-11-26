'use strict';
// Optional AI (Anthropic Claude) with the user's own API key. Nothing is sent
// anywhere unless the user adds a key AND uses an AI feature; only the text the
// feature needs is sent (a style description, or a goal + list names).
const { safeStorage } = require('electron');

const MODEL = 'claude-haiku-5-5';
const API = 'https://api.anthropic.com/v1/messages';

async function complete(key, { system, prompt, maxTokens = 600, timeoutMs = 20000 }) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(API, {
      method: 'POST',
      signal: ctrl.signal,
      headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
      body: JSON.stringify({ model: MODEL, max_tokens: maxTokens, system, messages: [{ role: 'user', content: prompt }] }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error((data && data.error && data.error.message) || `HTTP ${res.status}`);
      err.code = res.status === 401 || res.status === 403 ? 'invalidKey' : res.status === 429 ? 'rateLimit' : 'apiError';
      throw err;
    }
    return (data.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('');
  } catch (e) {
    if (e.name === 'AbortError') e.code = 'timeout';
    if (!e.code) e.code = 'network';
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

function extractJson(text) {
  const m = /\{[\s\S]*\}/.exec(String(text || ''));
  if (!m) return null;
  try { return JSON.parse(m[0]); } catch (_) { return null; }
}

function encryptKey(key) {
  if (safeStorage.isEncryptionAvailable()) return `enc:${safeStorage.encryptString(key).toString('base64')}`;
  return `b64:${Buffer.from(key, 'utf8').toString('base64')}`;
}

function decryptKey(stored) {
  if (!stored) return null;
  try {
    if (stored.startsWith('enc:')) return safeStorage.decryptString(Buffer.from(stored.slice(4), 'base64'));
    if (stored.startsWith('b64:')) return Buffer.from(stored.slice(4), 'base64').toString('utf8');
  } catch (_) { /* key unreadable (other machine) */ }
  return null;
}

async function styleSpec(key, description) {
  const text = await complete(key, {
    system: 'You are a senior UI colour designer. Reply with one JSON object and nothing else.',
    prompt: `Design a colour theme for a desktop focus / app-blocker app from this description: "${description.slice(0, 200)}".
Return JSON with exactly these keys:
{"name": short theme name in the language of the description (max 24 chars),
 "mode": "dark" or "light",
 "bg": "#rrggbb" page background,
 "text": "#rrggbb" main text (must be very readable on bg),
 "accent": "#rrggbb" main highlight colour,
 "accent2": "#rrggbb" second highlight colour that goes well with accent,
 "font": "sans" | "pixel" | "mono" | "serif",
 "radius": integer 0-24 (corner roundness),
 "effect": "aurora" | "grid" | "scanlines" | "sunset" | "stars" | "dots" | "none"}
Be bold and specific to the description.`,
    maxTokens: 300,
  });
  return extractJson(text);
}

async function suggest(key, goal, lists, lang) {
  const text = await complete(key, {
    system: 'You are a firm, smart focus coach. Reply with one JSON object and nothing else.',
    prompt: `The user wants to focus on: "${goal.slice(0, 160)}".
Available block lists (id: name): ${lists.map((l) => `${l.id}: ${l.name}`).join('; ')}.
Choose what to block and how. Return JSON:
{"listIds": [ids from the list above],
 "minutes": integer 15-180 or null if pomodoro,
 "pomodoro": {"work": 25, "brk": 5, "cycles": 4} or null,
 "mode": "flexible" | "patient" | "strict",
 "reason": one or two short, decisive sentences in ${lang === 'hu' ? 'Hungarian' : 'English'} explaining the plan, addressing the user directly}`,
    maxTokens: 300,
  });
  return extractJson(text);
}

module.exports = { MODEL, complete, encryptKey, decryptKey, styleSpec, suggest };
