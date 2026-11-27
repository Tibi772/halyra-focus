'use strict';
const GROW = require('../shared/grow');
const crypto = require('crypto');
const { PRESETS, PRESET_REV } = require('./presets');
const { normalizeSite } = require('./domains');
const { normalizePathRule } = require('./blockrules');
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
    ...(preset.paths ? { paths: [...preset.paths] } : {}),
    ...(preset.keywords ? { keywords: [...preset.keywords] } : {}),
    ...(preset.safe ? { safe: true } : {}),
    ...(preset.always ? { always: true } : {}),
    apps: preset.apps.map((a) => ({ name: a.name, mac: [...a.mac], win: [...a.win], ...(a.android ? { android: [...a.android] } : {}) })),
    presetRev: PRESET_REV,
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
    passes: {},
    unlockAt: null, // cool-down: weakening always-on lists is allowed for 24 h from this moment
    unlockChangedAt: 0,
    customThemes: [],
    settings: {
      lang: 'auto',
      theme: 'midnight',
      focusSound: 'off',
      focusVolume: 0.5,
      soundAuto: true,
      growOn: true,
      growItem: 'oak',
      growWither: true,
      earnRatio: 3,
      coolDownH: 0,
      appAction: 'smart',
      season: 'auto',
      hiddenNav: [],
      aiName: 'Halyra',
      aiTone: 'friendly',
      aiAbout: '',
      aiCity: '',
      lbOn: false,
      lbName: '',
      lbEmoji: '🦊',
      lbPublic: false,
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
    if (kind === 'android' && !/^[a-zA-Z][\w]*(\.[a-zA-Z_][\w]*)+$/.test(s)) continue;
    if (!out.includes(s)) out.push(s);
  }
  return out;
}

const COOLDOWNS = [0, 1, 24, 72];
const NAV_HIDEABLE = ['lists', 'schedules', 'stats', 'island', 'ranks'];
const pick = (v, b, allowed, fallback) => (allowed.includes(v) ? v : (allowed.includes(b) ? b : fallback));
const cleanName = (v, fallback) => (typeof v === 'string' && v.trim() ? v.replace(/[^\p{L}\p{N} _.-]/gu, '').trim().slice(0, 20) || fallback : fallback);

function cleanKeywords(raw) {
  const out = [];
  for (const k of Array.isArray(raw) ? raw.slice(0, 200) : []) {
    const w = String(k || '').toLowerCase().normalize('NFC').trim().replace(/\s+/g, ' ');
    if (w.length >= 3 && w.length <= 40 && /^[\p{L}\p{N} .\-_]+$/u.test(w) && !out.includes(w)) out.push(w);
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
      const android = cleanAppNames(a.android, 'android');
      if (!mac.length && !win.length && !android.length) continue;
      names.add(name.toLowerCase());
      apps.push(android.length ? { name, mac, win, android } : { name, mac, win });
    }
    out.push({
      id,
      presetId: str(l.presetId, 32) || undefined,
      name: str(l.name, 60).trim() || 'List',
      emoji: str(l.emoji, 16) || '⛔',
      sites,
      apps,
      limitMin: int(l.limitMin, 0, 720, 0),
      limitMode: MODES.includes(l.limitMode) ? l.limitMode : 'patient',
      // Parts of sites ("youtube.com/shorts") and "only these sites" lists.
      paths: [...new Set((Array.isArray(l.paths) ? l.paths.slice(0, 300) : []).map(normalizePathRule).filter(Boolean))],
      allowOnly: l.allowOnly === true,
      // Standing lists: "always" = blocked around the clock; "earn" = blocked until
      // you spend minutes earned by focusing. Not both.
      always: l.always === true && l.earn !== true,
      earn: l.earn === true,
      // Pages whose address or title contains one of these words are blocked (computers).
      keywords: cleanKeywords(l.keywords),
      // Force SafeSearch on Google, Bing and YouTube while this list is on.
      safe: l.safe === true,
      ...(l.presetId ? { presetRev: int(l.presetRev, 0, 999, 0) } : {}),
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
    focusSound: ['off', 'rain', 'waves', 'brown', 'cafe', 'fire', 'white'].includes(i.focusSound) ? i.focusSound : (b.focusSound || 'off'),
    focusVolume: Number.isFinite(Number(i.focusVolume)) ? Math.min(1, Math.max(0, Number(i.focusVolume))) : (b.focusVolume == null ? 0.5 : b.focusVolume),
    soundAuto: bool(i.soundAuto, b.soundAuto == null ? true : b.soundAuto),
    growOn: bool(i.growOn, b.growOn == null ? true : b.growOn),
    growItem: GROW.BY_ID[i.growItem] ? i.growItem : (GROW.BY_ID[b.growItem] ? b.growItem : 'oak'),
    growWither: bool(i.growWither, b.growWither == null ? true : b.growWither),
    // Focus minutes per earned minute (3 → 30 min focus earns 10 min).
    earnRatio: [2, 3, 4, 6].includes(Number(i.earnRatio)) ? Number(i.earnRatio) : ([2, 3, 4, 6].includes(Number(b.earnRatio)) ? Number(b.earnRatio) : 3),
    // Hours you must wait before always-on protection can be weakened (0 = no wait).
    coolDownH: COOLDOWNS.includes(Number(i.coolDownH)) ? Number(i.coolDownH) : (COOLDOWNS.includes(Number(b.coolDownH)) ? Number(b.coolDownH) : 0),
    // Blocked apps: 'smart' hides chat apps and closes the rest; 'hide' / 'close' for all.
    appAction: pick(i.appAction, b.appAction, ['smart', 'hide', 'close'], 'smart'),
    // Christmas look: 'auto' = December to 6 January.
    season: pick(i.season, b.season, ['auto', 'on', 'off'], 'auto'),
    // Menu items the user doesn't want to see (focus and settings always stay).
    hiddenNav: Array.isArray(i.hiddenNav) ? [...new Set(i.hiddenNav.filter((x) => NAV_HIDEABLE.includes(x)))] : (Array.isArray(b.hiddenNav) ? b.hiddenNav : []),
    // How Halyra AI talks to you.
    aiName: cleanName(i.aiName, b.aiName || 'Halyra'),
    aiTone: pick(i.aiTone, b.aiTone, ['friendly', 'brief', 'coach', 'funny', 'formal'], 'friendly'),
    aiAbout: typeof i.aiAbout === 'string' ? i.aiAbout.replace(/\r\n?/g, '\n').replace(/[\u0000-\u0009\u000b-\u001f]/g, ' ').slice(0, 600) : (b.aiAbout || ''),
    aiCity: typeof i.aiCity === 'string' ? i.aiCity.replace(/[^\p{L}\p{N} ,.'-]/gu, '').slice(0, 60) : (b.aiCity || ''),
    // Leaderboard (opt-in, needs an account).
    lbOn: bool(i.lbOn, b.lbOn === true),
    lbName: typeof i.lbName === 'string' ? i.lbName.replace(/[^\p{L}\p{N} _.-]/gu, '').trim().slice(0, 24) : (b.lbName || ''),
    lbEmoji: typeof i.lbEmoji === 'string' && i.lbEmoji.length <= 8 && !/[<>&"']/.test(i.lbEmoji) ? i.lbEmoji : (b.lbEmoji || '🦊'),
    lbPublic: bool(i.lbPublic, b.lbPublic === true),
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
      grow: typeof s.grow === 'string' && GROW.BY_ID[s.grow] ? s.grow : null,
      pomodoro: s.pomodoro && s.pomodoro.work > 0 ? { work: int(s.pomodoro.work, 1, 240, 25), brk: int(s.pomodoro.brk, 0, 120, 5), cycles: int(s.pomodoro.cycles, 1, 24, 4) } : null,
    }
    : null;
  upgradePresetLists(merged.lists);
  merged.sessionChangedAt = typeof raw.sessionChangedAt === 'number' ? raw.sessionChangedAt : 0;
  merged.skips = {};
  if (raw.skips && typeof raw.skips === 'object') {
    for (const [k, v] of Object.entries(raw.skips)) if (typeof v === 'number') merged.skips[k] = v;
  }
  // Unlocked earn-lists: list id → until (ms).
  merged.unlockAt = typeof raw.unlockAt === 'number' ? raw.unlockAt : null;
  merged.unlockChangedAt = typeof raw.unlockChangedAt === 'number' ? raw.unlockChangedAt : 0;
  merged.passes = {};
  if (raw.passes && typeof raw.passes === 'object') {
    for (const [k, v] of Object.entries(raw.passes)) if (typeof v === 'number' && merged.lists.some((l) => l.id === k)) merged.passes[k] = v;
  }
  merged.version = VERSION;
  return merged;
}

/** Lists made from a preset get apps added to that preset later (once per PRESET_REV). */
function upgradePresetLists(lists) {
  for (const l of lists || []) {
    if (!l.presetId || (l.presetRev || 0) >= PRESET_REV) continue;
    const p = PRESETS.find((x) => x.id === l.presetId);
    if (p) {
      for (const pa of p.apps) {
        const have = l.apps.find((a) => a.name.toLowerCase() === pa.name.toLowerCase());
        if (!have) l.apps.push({ name: pa.name, mac: [...pa.mac], win: [...pa.win], ...(pa.android ? { android: [...pa.android] } : {}) });
        else if (pa.android) have.android = [...new Set([...(have.android || []), ...pa.android])];
      }
    }
    l.presetRev = PRESET_REV;
  }
  return lists;
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
  cleanKeywords, COOLDOWNS, NAV_HIDEABLE,
  THEMES, LANGS, VERSION, uid, defaults, presetToList, mergeEditable, normalizeLoaded, sanitizeCustomThemes,
  sanitizeLists, sanitizeSchedules, hashPin, verifyPin, upgradePresetLists,
};
