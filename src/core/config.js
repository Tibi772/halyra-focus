'use strict';
const crypto = require('crypto');
const { PRESETS } = require('./presets');
const { normalizeSite } = require('./domains');
const { parseHM } = require('./schedule');
const { MODES } = require('./engine');
const stylegen = require('./stylegen');

const THEMES = ['midnight', 'daylight', 'crt', 'onebit', 'vapor'];
const LANGS = ['auto', 'en', 'hu'];
const VERSION = 1;

const uid = () => crypto.randomUUID();

function presetToList(preset, lang) {
  return {
    id: uid(),
    presetId: preset.id,
    name: preset.name[lang] || preset.name.en,
    emoji: preset.emoji,
    sites: [...preset.sites],
    apps: preset.apps.map((a) => ({ name: a.name, mac: [...a.mac], win: [...a.win] })),
  };
}

function defaults(lang = 'en') {
  const pick = ['social', 'video', 'games', 'chat'];
  const lists = PRESETS.filter((p) => pick.includes(p.id)).map((p) => presetToList(p, lang));
  return {
    version: VERSION,
    lists,
    schedules: [
      {
        id: uid(),
        name: lang === 'hu' ? 'Munkaidő' : 'Work hours',
        listIds: lists.filter((l) => l.presetId === 'social' || l.presetId === 'video').map((l) => l.id),
        days: [1, 2, 3, 4, 5],
        start: '09:00',
        end: '17:00',
        mode: 'flexible',
        enabled: false,
      },
    ],
    session: null,
    skips: {},
    customThemes: [],
    settings: {
      lang: 'auto',
      theme: 'midnight',
      launchAtLogin: true,
      showOverlay: true,
      notifications: true,
      sound: true,
      defaultMode: 'flexible',
      defaultMinutes: 50,
      defaultListIds: lists.filter((l) => l.presetId === 'social' || l.presetId === 'video').map((l) => l.id),
      patientDelaySec: 60,
      emergencyDelaySec: 300,
      challengeLength: 120,
      strictBlocksTools: false,
      pinHash: null,
      pinSalt: null,
      aiKeyEnc: null,
      onboarded: false,
    },
  };
}

const str = (v, max, fallback = '') => (typeof v === 'string' ? v.slice(0, max) : fallback);
const bool = (v, fallback) => (typeof v === 'boolean' ? v : fallback);
const int = (v, min, max, fallback) => (Number.isFinite(Number(v)) ? Math.min(max, Math.max(min, Math.round(Number(v)))) : fallback);

function cleanAppNames(arr, kind) {
  if (!Array.isArray(arr)) return [];
  const out = [];
  for (const raw of arr.slice(0, 12)) {
    const s = String(raw || '').trim();
    if (!s || s.length > 120 || /[\\/:*?"<>|\0]/.test(s)) continue;
    if (kind === 'win' && !/\.exe$/i.test(s)) continue;
    if (!out.includes(s)) out.push(s);
  }
  return out;
}

function sanitizeLists(lists) {
  if (!Array.isArray(lists)) return [];
  const seen = new Set();
  const out = [];
  for (const l of lists.slice(0, 60)) {
    if (!l || typeof l !== 'object') continue;
    let id = str(l.id, 64);
    if (!id || seen.has(id)) id = uid();
    seen.add(id);
    const sites = [];
    for (const s of Array.isArray(l.sites) ? l.sites.slice(0, 3000) : []) {
      const n = normalizeSite(s);
      if (n && !sites.includes(n)) sites.push(n);
    }
    const apps = [];
    const names = new Set();
    for (const a of Array.isArray(l.apps) ? l.apps.slice(0, 300) : []) {
      if (!a || typeof a !== 'object') continue;
      const name = str(a.name, 80).trim();
      if (!name || names.has(name.toLowerCase())) continue;
      const mac = cleanAppNames(a.mac, 'mac');
      const win = cleanAppNames(a.win, 'win');
      if (!mac.length && !win.length) continue;
      names.add(name.toLowerCase());
      apps.push({ name, mac, win });
    }
    out.push({
      id,
      presetId: str(l.presetId, 32) || undefined,
      name: str(l.name, 60).trim() || 'List',
      emoji: str(l.emoji, 16) || '⛔',
      sites,
      apps,
    });
  }
  return out;
}

function sanitizeSchedules(schedules, listIds) {
  if (!Array.isArray(schedules)) return [];
  const ids = new Set(listIds);
  const seen = new Set();
  const out = [];
  for (const s of schedules.slice(0, 60)) {
    if (!s || typeof s !== 'object') continue;
    let id = str(s.id, 64);
    if (!id || seen.has(id)) id = uid();
    seen.add(id);
    const days = [...new Set((Array.isArray(s.days) ? s.days : []).map(Number).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))].sort();
    out.push({
      id,
      name: str(s.name, 60).trim() || 'Schedule',
      listIds: (Array.isArray(s.listIds) ? s.listIds : []).filter((x) => ids.has(x)),
      days,
      start: parseHM(s.start) == null ? '09:00' : String(s.start).trim().padStart(5, '0'),
      end: parseHM(s.end) == null ? '17:00' : String(s.end).trim().padStart(5, '0'),
      mode: MODES.includes(s.mode) ? s.mode : 'flexible',
      enabled: bool(s.enabled, true),
    });
  }
  return out;
}

const isTheme = (v) => THEMES.includes(v) || /^custom:[\w-]{1,40}$/.test(String(v || ''));

function sanitizeCustomThemes(list) {
  if (!Array.isArray(list)) return [];
  const out = [];
  const seen = new Set();
  for (const t of list.slice(0, 24)) {
    const clean = stylegen.sanitizeTheme(t);
    if (!clean || seen.has(clean.id)) continue;
    seen.add(clean.id);
    out.push(clean);
  }
  return out;
}

function sanitizeSettings(input, base) {
  const i = input && typeof input === 'object' ? input : {};
  const b = base;
  return {
    lang: LANGS.includes(i.lang) ? i.lang : b.lang,
    theme: isTheme(i.theme) ? i.theme : b.theme,
    launchAtLogin: bool(i.launchAtLogin, b.launchAtLogin),
    showOverlay: bool(i.showOverlay, b.showOverlay),
    notifications: bool(i.notifications, b.notifications),
    sound: bool(i.sound, b.sound),
    defaultMode: MODES.includes(i.defaultMode) ? i.defaultMode : b.defaultMode,
    defaultMinutes: int(i.defaultMinutes, 1, 24 * 60, b.defaultMinutes),
    defaultListIds: Array.isArray(i.defaultListIds) ? i.defaultListIds.filter((x) => typeof x === 'string').slice(0, 60) : b.defaultListIds,
    patientDelaySec: int(i.patientDelaySec, 10, 3600, b.patientDelaySec),
    emergencyDelaySec: int(i.emergencyDelaySec, 30, 7200, b.emergencyDelaySec),
    challengeLength: int(i.challengeLength, 30, 600, b.challengeLength),
    strictBlocksTools: bool(i.strictBlocksTools, b.strictBlocksTools),
    // The PIN and the AI key are only changed through their own IPC calls, never through setConfig.
    pinHash: b.pinHash,
    pinSalt: b.pinSalt,
    aiKeyEnc: b.aiKeyEnc || null,
    onboarded: bool(i.onboarded, b.onboarded),
  };
}

/** Merge user-editable parts (lists, schedules, settings) of `input` onto `base`. */
function mergeEditable(base, input) {
  const lists = 'lists' in input ? sanitizeLists(input.lists) : base.lists;
  const listIds = lists.map((l) => l.id);
  const schedules = sanitizeSchedules('schedules' in input ? input.schedules : base.schedules, listIds);
  const settings = sanitizeSettings('settings' in input ? { ...base.settings, ...input.settings } : base.settings, base.settings);
  settings.defaultListIds = settings.defaultListIds.filter((x) => listIds.includes(x));
  const customThemes = 'customThemes' in input ? sanitizeCustomThemes(input.customThemes) : (base.customThemes || []);
  if (settings.theme.startsWith('custom:') && !customThemes.some((t) => `custom:${t.id}` === settings.theme)) settings.theme = 'midnight';
  return { ...base, lists, schedules, settings, customThemes };
}

/** Load-time repair: tolerate hand-edited or older files. */
function normalizeLoaded(raw, lang) {
  const d = defaults(lang);
  if (!raw || typeof raw !== 'object') return d;
  const base = { ...d, settings: { ...d.settings, pinHash: null, pinSalt: null } };
  const merged = mergeEditable(base, {
    lists: Array.isArray(raw.lists) ? raw.lists : d.lists,
    schedules: Array.isArray(raw.schedules) ? raw.schedules : d.schedules,
    customThemes: Array.isArray(raw.customThemes) ? raw.customThemes : [],
    settings: raw.settings || {},
  });
  if (raw.settings && typeof raw.settings.pinHash === 'string' && typeof raw.settings.pinSalt === 'string') {
    merged.settings.pinHash = raw.settings.pinHash;
    merged.settings.pinSalt = raw.settings.pinSalt;
  }
  if (raw.settings && typeof raw.settings.aiKeyEnc === 'string') merged.settings.aiKeyEnc = raw.settings.aiKeyEnc.slice(0, 4000);
  const s = raw.session;
  merged.session = s && typeof s.endsAt === 'number' && typeof s.startedAt === 'number'
    ? {
      startedAt: s.startedAt,
      endsAt: s.endsAt,
      listIds: Array.isArray(s.listIds) ? s.listIds.filter((x) => typeof x === 'string') : [],
      mode: MODES.includes(s.mode) ? s.mode : 'flexible',
      goal: typeof s.goal === 'string' ? s.goal.slice(0, 80) : '',
      pomodoro: s.pomodoro && s.pomodoro.work > 0 ? { work: int(s.pomodoro.work, 1, 240, 25), brk: int(s.pomodoro.brk, 0, 120, 5), cycles: int(s.pomodoro.cycles, 1, 24, 4) } : null,
    }
    : null;
  merged.skips = {};
  if (raw.skips && typeof raw.skips === 'object') {
    for (const [k, v] of Object.entries(raw.skips)) if (typeof v === 'number') merged.skips[k] = v;
  }
  merged.version = VERSION;
  return merged;
}

function hashPin(pin, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(String(pin), salt, 32).toString('hex');
  return { hash, salt };
}

function verifyPin(settings, pin) {
  if (!settings.pinHash) return true;
  if (typeof pin !== 'string' || !pin) return false;
  const { hash } = hashPin(pin, settings.pinSalt);
  const a = Buffer.from(hash, 'hex');
  const b = Buffer.from(settings.pinHash, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

module.exports = {
  THEMES, LANGS, VERSION, uid, defaults, presetToList, mergeEditable, normalizeLoaded, sanitizeCustomThemes,
  sanitizeLists, sanitizeSchedules, hashPin, verifyPin,
};
