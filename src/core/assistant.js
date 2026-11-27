'use strict';
// Halyra AI: a chat assistant that knows (almost) everything — through Gemini,
// with web search for anything current — and can operate the app for you:
// start / extend focus, block sites, build lists and schedules, set limits,
// change the look and what grows. Every change goes through the same rules as
// the UI, so it can never weaken a locked block.
// Without an AI connection a small offline parser still understands the most
// common commands in English and Hungarian.
const GROW = require('../shared/grow');

const MODES = ['flexible', 'patient', 'strict'];
const DAY = { sun: 0, sunday: 0, vasárnap: 0, mon: 1, monday: 1, hétfő: 1, tue: 2, tuesday: 2, kedd: 2, wed: 3, wednesday: 3, szerda: 3, thu: 4, thursday: 4, csütörtök: 4, fri: 5, friday: 5, péntek: 5, sat: 6, saturday: 6, szombat: 6 };

// ------------------------------------------------------------------ tool schema
// Written once, in the app's own shape; src/core/gemini.js translates it for the model.

const TOOLS = [
  { name: 'get_status', description: 'Current state of Halyra Focus: is a block running (until when, how strict), block lists with their sites/apps, schedules, daily limits, today\'s stats, what grows during focus, whether website blocking is installed. Call this before changing things.', input_schema: { type: 'object', properties: {} } },
  { name: 'start_focus', description: 'Start a focus session that blocks the given lists on all the user\'s devices.', input_schema: { type: 'object', properties: {
    minutes: { type: 'integer', minimum: 1, maximum: 1440, description: 'Length in minutes (ignored with pomodoro).' },
    lists: { type: 'array', items: { type: 'string' }, description: 'Block list names or ids. Omit to use the user\'s usual lists.' },
    mode: { type: 'string', enum: MODES, description: 'flexible = can stop any time; patient = must wait before stopping; strict = cannot stop early.' },
    pomodoro: { type: 'object', properties: { work: { type: 'integer' }, brk: { type: 'integer' }, cycles: { type: 'integer' } } },
    goal: { type: 'string', description: 'What the user works on (shown during the session).' },
  } } },
  { name: 'extend_focus', description: 'Add minutes to the running focus session.', input_schema: { type: 'object', properties: { minutes: { type: 'integer', minimum: 1, maximum: 240 } }, required: ['minutes'] } },
  { name: 'stop_focus', description: 'Stop the running block. Only works for flexible blocks without a PIN; patient/strict blocks must be stopped by the user in the app (that is the point of them).', input_schema: { type: 'object', properties: {} } },
  { name: 'block_sites', description: 'Add websites (youtube.com) or parts of sites (youtube.com/shorts) to a block list. Creates the list if it does not exist.', input_schema: { type: 'object', properties: {
    sites: { type: 'array', items: { type: 'string' } }, list: { type: 'string', description: 'List name or id (default: "Blocked by AI").' },
  }, required: ['sites'] } },
  { name: 'unblock_sites', description: 'Remove websites from block lists. Refused while a locked block uses them.', input_schema: { type: 'object', properties: { sites: { type: 'array', items: { type: 'string' } }, list: { type: 'string' } }, required: ['sites'] } },
  { name: 'block_apps', description: 'Add apps (by name, e.g. "Discord", "Steam") to a block list. Only apps installed on this computer or known to Halyra Focus can be added.', input_schema: { type: 'object', properties: { apps: { type: 'array', items: { type: 'string' } }, list: { type: 'string' } }, required: ['apps'] } },
  { name: 'create_list', description: 'Create a new block list. With allow_only=true it becomes an "only these sites" list: while on, every other website is blocked.', input_schema: { type: 'object', properties: {
    name: { type: 'string' }, emoji: { type: 'string' }, sites: { type: 'array', items: { type: 'string' } }, apps: { type: 'array', items: { type: 'string' } }, allow_only: { type: 'boolean' },
  }, required: ['name'] } },
  { name: 'create_schedule', description: 'Block lists automatically at set times on set days.', input_schema: { type: 'object', properties: {
    name: { type: 'string' }, days: { type: 'array', items: { type: 'integer', minimum: 0, maximum: 6 }, description: '0 = Sunday … 6 = Saturday' },
    start: { type: 'string', description: 'HH:MM' }, end: { type: 'string', description: 'HH:MM (may be after midnight)' },
    lists: { type: 'array', items: { type: 'string' } }, mode: { type: 'string', enum: MODES },
  }, required: ['name', 'days', 'start', 'end', 'lists'] } },
  { name: 'set_schedule_enabled', description: 'Turn a schedule on or off.', input_schema: { type: 'object', properties: { schedule: { type: 'string' }, enabled: { type: 'boolean' } }, required: ['schedule', 'enabled'] } },
  { name: 'set_daily_limit', description: 'Give a list a daily time budget (minutes per day, 0 = no limit). After the budget is used up, the list is blocked until midnight.', input_schema: { type: 'object', properties: { list: { type: 'string' }, minutes: { type: 'integer', minimum: 0, maximum: 600 } }, required: ['list', 'minutes'] } },
  { name: 'set_list_protection', description: 'How a list is enforced. "always" = blocked around the clock, even without focus (good for adult content, gambling). "earn" = blocked until the user spends minutes earned by focusing. "normal" = only during focus/schedules/limits. safe_search forces Google/Bing SafeSearch and YouTube Restricted Mode while the list is on. Weakening an always-on list needs the PIN and any cool-down, so the user may have to do it in the app.', input_schema: { type: 'object', properties: {
    list: { type: 'string' }, kind: { type: 'string', enum: ['always', 'earn', 'normal'] }, safe_search: { type: 'boolean' } }, required: ['list'] } },
  { name: 'block_keywords', description: 'Block pages whose address, search or tab title contains these words or phrases (e.g. "casino", "porn"). Whole words only, 3-40 characters. Desktop only.', input_schema: { type: 'object', properties: {
    keywords: { type: 'array', items: { type: 'string' } }, list: { type: 'string' } }, required: ['keywords'] } },
  { name: 'spend_earned_minutes', description: 'Open an "earn" list for some of the minutes the user earned by focusing (minutes 0 = lock it again and refund the rest).', input_schema: { type: 'object', properties: {
    list: { type: 'string' }, minutes: { type: 'integer', minimum: 0, maximum: 120 } }, required: ['list', 'minutes'] } },
  { name: 'get_weather', description: 'Current weather and the next days for a place (city name). Without a place it uses the user\'s saved city, or their approximate location.', input_schema: { type: 'object', properties: { place: { type: 'string' } } } },
  { name: 'get_time', description: 'The current local date and time (and time zone) on this device.', input_schema: { type: 'object', properties: {} } },
  { name: 'customize_app', description: 'Personalise Halyra Focus: hide or show menu items (lists, schedules, stats, island, ranks — focus and settings always stay), the Christmas look (on/off/auto), what happens to blocked apps (smart = hide chat apps and close the rest, hide, close), and the assistant\'s own name and tone.', input_schema: { type: 'object', properties: {
    hide_menu: { type: 'array', items: { type: 'string', enum: ['lists', 'schedules', 'stats', 'island', 'ranks'] } },
    show_menu: { type: 'array', items: { type: 'string', enum: ['lists', 'schedules', 'stats', 'island', 'ranks'] } },
    season: { type: 'string', enum: ['on', 'off', 'auto'] }, blocked_apps: { type: 'string', enum: ['smart', 'hide', 'close'] },
    assistant_name: { type: 'string' }, assistant_tone: { type: 'string', enum: ['friendly', 'brief', 'coach', 'funny', 'formal'] }, city: { type: 'string' } } } },
  { name: 'remember_about_me', description: 'Save a short note about the user (goals, school/job, what distracts them, preferences) so future answers are personal. The user can see and edit these notes in Settings. Use only for things they tell you and want remembered.', input_schema: { type: 'object', properties: { note: { type: 'string' }, forget: { type: 'boolean' } }, required: ['note'] } },
  { name: 'get_level', description: 'The user\'s level, XP, title and achievements (gems) on their focus island.', input_schema: { type: 'object', properties: {} } },
  { name: 'set_grow', description: 'Choose what grows or gets built during focus sessions (or "none").', input_schema: { type: 'object', properties: { item: { type: 'string', enum: [...GROW.CATALOG.map((c) => c.id), 'none'] } }, required: ['item'] } },
  { name: 'set_theme', description: 'Change the app\'s look: a built-in theme (midnight, daylight, crt, onebit, vapor) or a new custom style from a short description.', input_schema: { type: 'object', properties: { theme: { type: 'string', enum: ['midnight', 'daylight', 'crt', 'onebit', 'vapor'] }, describe: { type: 'string' } } } },
  { name: 'get_stats', description: 'Focus statistics: last 7 days, streak, most blocked apps/sites, the forest.', input_schema: { type: 'object', properties: {} } },
];

const WEB_SEARCH = { type: 'web_search_20250305', name: 'web_search', max_uses: 3 };

// ------------------------------------------------------------------ helpers

const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();

function findList(config, ref) {
  if (!ref) return null;
  const r = norm(ref);
  return config.lists.find((l) => l.id === ref) || config.lists.find((l) => norm(l.name) === r)
    || config.lists.find((l) => norm(l.name).includes(r) || r.includes(norm(l.name))) || null;
}

function newId() { return `ai${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`; }

function fmtTime(ms) {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** Short, model-friendly snapshot of the app. */
function status(ctx) {
  const config = ctx.config();
  const ev = ctx.evaluate();
  const st = ctx.stats();
  return {
    now: new Date(ctx.now()).toString(),
    blocking: ev.blocking ? { mode: ev.mode, until: fmtTime(ev.endsAt), because: ev.sources.map((s) => `${s.type}${s.name ? `: ${s.name}` : ''}`), sites: ev.sites.length, apps: ev.apps.length } : null,
    session: config.session && config.session.endsAt > ctx.now() ? { until: fmtTime(config.session.endsAt), mode: config.session.mode, goal: config.session.goal || '' } : null,
    lists: config.lists.map((l) => ({ id: l.id, name: l.name, sites: l.sites.slice(0, 40), parts: (l.paths || []).slice(0, 20), apps: (l.apps || []).map((a) => a.name).slice(0, 40), keywords: (l.keywords || []).slice(0, 20), dailyLimitMin: l.limitMin || 0, onlyTheseSites: Boolean(l.allowOnly), kind: l.always ? 'always' : l.earn ? 'earn' : 'normal', safeSearch: Boolean(l.safe), openUntil: (config.passes || {})[l.id] > ctx.now() ? fmtTime(config.passes[l.id]) : undefined })),
    earnedMinutes: ctx.wallet ? ctx.wallet() : undefined,
    coolDownHours: config.settings.coolDownH || 0,
    schedules: config.schedules.map((s) => ({ name: s.name, days: s.days, start: s.start, end: s.end, mode: s.mode, enabled: s.enabled, lists: s.listIds.map((id) => (config.lists.find((l) => l.id === id) || {}).name).filter(Boolean) })),
    usualLists: config.settings.defaultListIds.map((id) => (config.lists.find((l) => l.id === id) || {}).name).filter(Boolean),
    today: { focusMinutes: st.todayMinutes, blocks: st.todayBlocks, streakDays: st.streak, totalFocusHours: st.totalHours },
    grows: config.settings.growOn === false ? 'nothing' : config.settings.growItem,
    websiteBlockingInstalled: ctx.helperInstalled ? ctx.helperInstalled() : null,
    hasPin: Boolean(config.settings.pinHash),
    theme: config.settings.theme,
  };
}

function cleanSites(ctx, raw) {
  const sites = [];
  const paths = [];
  const bad = [];
  for (const s of (Array.isArray(raw) ? raw : [raw]).slice(0, 200)) {
    const r = ctx.normalizeRule(String(s || ''));
    if (r && r.path) paths.push(r.path);
    else if (r && r.site) sites.push(r.site);
    else bad.push(String(s).slice(0, 60));
  }
  return { sites, paths, bad };
}

function resolveApps(ctx, names) {
  const known = ctx.knownApps ? ctx.knownApps() : [];
  const found = [];
  const missing = [];
  for (const n of (names || []).slice(0, 60)) {
    const q = norm(n);
    const hit = known.find((a) => norm(a.name) === q) || known.find((a) => norm(a.name).startsWith(q) || q.startsWith(norm(a.name)));
    if (hit) found.push({ name: hit.name, mac: hit.mac || [], win: hit.win || [], ...(hit.android ? { android: hit.android } : {}) });
    else missing.push(n);
  }
  return { found, missing };
}

function ensureList(config, ref, lang) {
  const l = findList(config, ref);
  if (l) return { lists: config.lists, list: l, created: false };
  const name = ref && !/^ai/.test(ref) ? String(ref).slice(0, 60) : (lang === 'hu' ? 'AI tiltólista' : 'Blocked by AI');
  const list = { id: newId(), name, emoji: '⛔', sites: [], paths: [], apps: [] };
  return { lists: [...config.lists, list], list, created: true };
}

// ------------------------------------------------------------------ tool runner

/**
 * Runs one tool call. ctx gives access to the app:
 * { lang, now(), config(), evaluate(), stats(), startSession(o), stopAll(), extendSession(m),
 *   applyConfigChange(partial) → {ok, error}, normalizeRule(raw) → {site}|{path}|null,
 *   knownApps(), helperInstalled(), makeTheme(describe) → Promise<theme> }
 */
async function runTool(ctx, name, input = {}) {
  const config = ctx.config();
  const lang = ctx.lang;
  const fail = (error, extra = {}) => ({ ok: false, error, ...extra });
  switch (name) {
    case 'get_status': return status(ctx);
    case 'get_stats': {
      const st = ctx.stats();
      return { last7: st.last7.map((d) => ({ day: d.day, focusMinutes: d.minutes, blocks: d.blocks })), streak: st.streak, totalFocusHours: st.totalHours, mostBlocked: st.top, forest: st.garden ? { grown: st.garden.grown, withered: st.garden.withered, today: st.garden.today } : null, devices: st.devices || 1 };
    }
    case 'start_focus': {
      const ids = (input.lists && input.lists.length ? input.lists.map((r) => findList(config, r)).filter(Boolean).map((l) => l.id) : config.settings.defaultListIds);
      const listIds = ids.length ? [...new Set(ids)] : config.lists.slice(0, 2).map((l) => l.id);
      const mode = MODES.includes(input.mode) ? input.mode : config.settings.defaultMode || 'flexible';
      const r = ctx.startSession({ listIds, minutes: input.minutes || config.settings.defaultMinutes || 50, mode, pomodoro: input.pomodoro && input.pomodoro.work ? input.pomodoro : null, goal: input.goal || '' });
      if (!r.ok) return fail(r.error === 'active' ? 'A focus session is already running — use extend_focus.' : r.error || 'could not start');
      const s = ctx.config().session;
      return { ok: true, until: fmtTime(s.endsAt), mode: s.mode, lists: listIds.map((id) => (config.lists.find((l) => l.id === id) || {}).name), grows: s.grow || null };
    }
    case 'extend_focus': {
      const r = ctx.extendSession(input.minutes || 15);
      return r.ok ? { ok: true, until: fmtTime(ctx.config().session.endsAt) } : fail('No focus session is running.');
    }
    case 'stop_focus': {
      const ev = ctx.evaluate();
      if (!ev.sources.length) return { ok: true, note: 'Nothing was running.' };
      if (ev.mode !== 'flexible') return fail(`This block is ${ev.mode}. It can only be stopped by the user in the app (${ev.mode === 'patient' ? 'after a short wait' : 'not before it ends, except via the emergency exit'}). Do not try to work around this.`);
      if (config.settings.pinHash) return fail('A PIN protects stopping. The user must stop it in the app with their PIN.');
      ctx.stopAll();
      return { ok: true };
    }
    case 'block_sites': {
      const { sites, paths, bad } = cleanSites(ctx, input.sites);
      if (!sites.length && !paths.length) return fail('No valid website addresses.', { invalid: bad });
      const { lists, list, created } = ensureList(config, input.list, lang);
      const next = lists.map((l) => (l.id === list.id ? { ...l, sites: [...new Set([...(l.sites || []), ...sites])], paths: l.allowOnly ? l.paths || [] : [...new Set([...(l.paths || []), ...paths])] } : l));
      const r = ctx.applyConfigChange({ lists: next });
      return r.ok ? { ok: true, list: list.name, createdList: created, added: [...sites, ...paths], invalid: bad, note: list.allowOnly ? 'This is an "only these sites" list: these sites are now ALLOWED, not blocked.' : undefined } : fail(r.error);
    }
    case 'unblock_sites': {
      const { sites, paths } = cleanSites(ctx, input.sites);
      const drop = new Set([...sites, ...paths]);
      const target = input.list ? findList(config, input.list) : null;
      const next = config.lists.map((l) => (!target || l.id === target.id ? { ...l, sites: l.sites.filter((s) => !drop.has(s)), paths: (l.paths || []).filter((p) => !drop.has(p)) } : l));
      const r = ctx.applyConfigChange({ lists: next });
      return r.ok ? { ok: true, removed: [...drop] } : fail(r.error === 'locked' ? 'A locked block is using these sites — they can be removed after it ends.' : r.error === 'pin' ? 'A PIN is set: the user must remove them in the app.' : r.error);
    }
    case 'block_apps': {
      const { found, missing } = resolveApps(ctx, input.apps);
      if (!found.length) return fail('None of these apps are installed or known.', { missing });
      const { lists, list, created } = ensureList(config, input.list, lang);
      const next = lists.map((l) => {
        if (l.id !== list.id) return l;
        const have = new Set((l.apps || []).map((a) => norm(a.name)));
        return { ...l, apps: [...(l.apps || []), ...found.filter((a) => !have.has(norm(a.name)))] };
      });
      const r = ctx.applyConfigChange({ lists: next });
      return r.ok ? { ok: true, list: list.name, createdList: created, added: found.map((a) => a.name), missing } : fail(r.error);
    }
    case 'create_list': {
      const { sites, paths, bad } = cleanSites(ctx, input.sites || []);
      const { found, missing } = resolveApps(ctx, input.apps || []);
      const list = { id: newId(), name: String(input.name || 'List').slice(0, 60), emoji: input.emoji && [...String(input.emoji)].length <= 2 ? String(input.emoji) : '⛔', sites, paths: input.allow_only ? [] : paths, apps: found, allowOnly: Boolean(input.allow_only) };
      const r = ctx.applyConfigChange({ lists: [...config.lists, list] });
      return r.ok ? { ok: true, id: list.id, name: list.name, sites: sites.length + paths.length, apps: found.map((a) => a.name), missingApps: missing, invalid: bad } : fail(r.error);
    }
    case 'create_schedule': {
      const ids = (input.lists || []).map((r) => findList(config, r)).filter(Boolean).map((l) => l.id);
      if (!ids.length) return fail('Unknown lists. Use names from get_status.');
      const days = [...new Set((input.days || []).map(Number).filter((d) => d >= 0 && d <= 6))];
      const hm = /^([01]?\d|2[0-3]):([0-5]\d)$/;
      if (!days.length || !hm.test(input.start || '') || !hm.test(input.end || '')) return fail('Need days 0-6 and HH:MM times.');
      const pad = (x) => x.replace(/^(\d):/, '0$1:');
      const sch = { id: newId(), name: String(input.name || 'Schedule').slice(0, 60), listIds: ids, days, start: pad(input.start), end: pad(input.end), mode: MODES.includes(input.mode) ? input.mode : 'patient', enabled: true };
      const r = ctx.applyConfigChange({ schedules: [...config.schedules, sch] });
      return r.ok ? { ok: true, name: sch.name } : fail(r.error);
    }
    case 'set_schedule_enabled': {
      const q = norm(input.schedule);
      const sch = config.schedules.find((s) => s.id === input.schedule || norm(s.name) === q) || config.schedules.find((s) => norm(s.name).includes(q));
      if (!sch) return fail('Unknown schedule.');
      const r = ctx.applyConfigChange({ schedules: config.schedules.map((s) => (s.id === sch.id ? { ...s, enabled: Boolean(input.enabled) } : s)) });
      return r.ok ? { ok: true, name: sch.name, enabled: Boolean(input.enabled) } : fail(r.error === 'locked' ? 'It is part of a locked block right now.' : r.error);
    }
    case 'set_daily_limit': {
      const l = findList(config, input.list);
      if (!l) return fail('Unknown list.');
      const minutes = Math.max(0, Math.min(600, Math.round(Number(input.minutes) || 0)));
      const r = ctx.applyConfigChange({ lists: config.lists.map((x) => (x.id === l.id ? { ...x, limitMin: minutes } : x)) });
      return r.ok ? { ok: true, list: l.name, minutesPerDay: minutes } : fail(r.error);
    }
    case 'set_list_protection': {
      const l = findList(config, input.list);
      if (!l) return fail('Unknown list.');
      const kind = ['always', 'earn', 'normal'].includes(input.kind) ? input.kind : (l.always ? 'always' : l.earn ? 'earn' : 'normal');
      const patch = { always: kind === 'always', earn: kind === 'earn', ...(typeof input.safe_search === 'boolean' ? { safe: input.safe_search } : {}) };
      const r = ctx.applyConfigChange({ lists: config.lists.map((x) => (x.id === l.id ? { ...x, ...patch } : x)) });
      if (!r.ok) return fail(r.error === 'pin' ? 'A PIN protects always-on lists: the user must change this in the app.' : r.error === 'cooldown' ? `Cool-down: the user must start the ${config.settings.coolDownH} h countdown in the app first.` : r.error);
      return { ok: true, list: l.name, kind, safeSearch: typeof input.safe_search === 'boolean' ? input.safe_search : Boolean(l.safe) };
    }
    case 'block_keywords': {
      const words = ctx.cleanKeywords ? ctx.cleanKeywords(input.keywords || []) : [];
      if (!words.length) return fail('No valid keywords (3-40 letters or digits).');
      const { lists, list, created } = ensureList(config, input.list, lang);
      const r = ctx.applyConfigChange({ lists: lists.map((l) => (l.id === list.id ? { ...l, keywords: [...new Set([...(l.keywords || []), ...words])] } : l)) });
      return r.ok ? { ok: true, list: list.name, createdList: created, added: words } : fail(r.error);
    }
    case 'spend_earned_minutes': {
      const l = findList(config, input.list);
      if (!l || !l.earn) return fail('That is not an "earn" list.');
      if (!ctx.spendEarned) return fail('Not available here.');
      const r = ctx.spendEarned(l.id, Math.max(0, Math.min(120, Math.round(Number(input.minutes) || 0))));
      if (!r.ok) return fail(r.error === 'balance' ? `Not enough earned minutes (has ${ctx.wallet ? ctx.wallet() : 0}).` : r.error);
      const until = (ctx.config().passes || {})[l.id];
      return { ok: true, list: l.name, openUntil: until ? fmtTime(until) : null, earnedMinutesLeft: ctx.wallet ? ctx.wallet() : undefined };
    }
    case 'get_weather': {
      if (!ctx.weather) return fail('Weather is not available here.');
      try { return { ok: true, ...(await ctx.weather(String(input.place || '').slice(0, 60))) }; } catch (e) { return fail(e && e.message === 'notfound' ? 'Place not found.' : 'Could not reach the weather service.'); }
    }
    case 'get_time': {
      const d = new Date(ctx.now());
      let tz = '';
      try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch (_) { tz = ''; }
      return { ok: true, time: fmtTime(ctx.now()), date: d.toISOString().slice(0, 10), weekday: d.getDay(), timeZone: tz, local: d.toString() };
    }
    case 'customize_app': {
      const st = config.settings;
      const hidden = new Set(st.hiddenNav || []);
      for (const m of input.hide_menu || []) hidden.add(m);
      for (const m of input.show_menu || []) hidden.delete(m);
      const patch = { hiddenNav: [...hidden] };
      if (input.season) patch.season = input.season;
      if (input.blocked_apps) patch.appAction = input.blocked_apps;
      if (input.assistant_name) patch.aiName = String(input.assistant_name).slice(0, 20);
      if (input.assistant_tone) patch.aiTone = input.assistant_tone;
      if (typeof input.city === 'string') patch.aiCity = input.city.slice(0, 60);
      const r = ctx.applyConfigChange({ settings: patch });
      if (!r.ok) return fail(r.error);
      const after = ctx.config().settings;
      return { ok: true, hiddenMenu: after.hiddenNav, season: after.season, blockedApps: after.appAction, assistantName: after.aiName, tone: after.aiTone, city: after.aiCity };
    }
    case 'remember_about_me': {
      const note = String(input.note || '').replace(/\s+/g, ' ').trim().slice(0, 160);
      if (!note) return fail('Empty note.');
      const cur = String(config.settings.aiAbout || '');
      let lines = cur.split('\n').map((x) => x.trim()).filter(Boolean);
      if (input.forget) lines = lines.filter((x) => !x.toLowerCase().includes(note.toLowerCase()));
      else if (!lines.some((x) => x.toLowerCase() === note.toLowerCase())) lines.push(note);
      let text = lines.join('\n');
      while (text.length > 600 && lines.length > 1) { lines.shift(); text = lines.join('\n'); }
      const r = ctx.applyConfigChange({ settings: { aiAbout: text } });
      return r.ok ? { ok: true, notes: lines } : fail(r.error);
    }
    case 'get_level': {
      const lv = ctx.levels ? ctx.levels() : null;
      if (!lv) return fail('Not available.');
      return { ok: true, level: lv.level, title: lv.title, xp: lv.xp, toNextLevel: lv.need - lv.into, nextTitle: lv.nextTitle, nextTitleAtLevel: lv.nextBandAt, gems: lv.gems.map((g) => ({ name: g.name, got: g.got, how: g.desc })) };
    }
    case 'set_grow': {
      if (input.item === 'none') { ctx.applyConfigChange({ settings: { growOn: false } }); return { ok: true }; }
      const item = GROW.BY_ID[input.item];
      if (!item) return fail('Unknown item.');
      const hours = Number(ctx.stats().totalHours) || 0;
      if (item.unlockH > hours) return fail(`Locked: unlocks at ${item.unlockH} h of total focus (now ${hours} h).`);
      ctx.applyConfigChange({ settings: { growOn: true, growItem: item.id } });
      return { ok: true, grows: item.name[lang] || item.name.en };
    }
    case 'set_theme': {
      if (input.describe && ctx.makeTheme) {
        const th = await ctx.makeTheme(String(input.describe).slice(0, 200));
        if (!th) return fail('Could not make a style.');
        const r = ctx.applyConfigChange({ customThemes: [th, ...(config.customThemes || []).filter((x) => x.id !== th.id)].slice(0, 24), settings: { theme: `custom:${th.id}` } });
        return r.ok ? { ok: true, theme: th.name } : fail(r.error);
      }
      if (!['midnight', 'daylight', 'crt', 'onebit', 'vapor'].includes(input.theme)) return fail('Unknown theme.');
      ctx.applyConfigChange({ settings: { theme: input.theme } });
      return { ok: true, theme: input.theme };
    }
    default: return fail(`Unknown tool ${name}`);
  }
}

// ------------------------------------------------------------------ system prompt

const TONES = {
  friendly: 'Be warm, direct and decisive — like a smart friend who wants them to succeed.',
  brief: 'Be very brief: short sentences, no small talk, straight to the point.',
  coach: 'Be an encouraging but firm coach: name the next concrete step, hold them to their goals, celebrate wins.',
  funny: 'Be playful and a little funny (light jokes, never sarcastic about their struggles), while still being genuinely helpful.',
  formal: 'Be polite and professional, a little more formal.',
};

function systemPrompt(ctx) {
  const hu = ctx.lang === 'hu';
  const st = (ctx.config && ctx.config().settings) || {};
  const name = st.aiName && st.aiName !== 'Halyra' ? st.aiName : 'Halyra AI';
  const about = String(st.aiAbout || '').trim();
  return [
    `You are ${name}, the assistant inside Halyra Focus — an app and website blocker for Mac, Windows and Android.`,
    'You are very knowledgeable: answer any question well (studying, coding, writing, science, history, health basics, life advice, planning). Use web search for anything current or that you are not sure about, and mention sources briefly.',
    'You can also operate the app with your tools: start/extend focus, block sites or parts of sites, block keywords, build lists and schedules, set daily limits, make a list always-on (blocked around the clock, optionally with SafeSearch) or earn-to-unlock (opened with minutes earned by focusing), spend earned minutes, change the look and what grows during focus. When the user asks for something the tools can do, do it (call get_status first if you need names), then confirm briefly what changed.',
    'For porn or gambling problems, be kind and never shaming: suggest an always-on list with SafeSearch, keyword blocking, a PIN given to someone they trust and a 24 h cool-down, so a weak moment can pass.',
    `${TONES[st.aiTone] || TONES.friendly} Keep answers short unless asked for detail. Use simple Markdown (bold, lists, links) only when it helps.`,
    'You can also look up the weather (get_weather), the time, the user\'s level and achievements, and personalise the app (customize_app: hide menu items, Christmas look, what happens to blocked apps, your own name and tone). When the user tells you something about themselves that would help later (goals, exams, job, what distracts them), offer to remember it and use remember_about_me.',
    about ? `What the user asked you to remember about them:\n${about}` : '',
    st.aiCity ? `The user\'s city (for weather and local questions): ${st.aiCity}.` : '',
    'Never help to get around a running patient/strict block, a PIN, or the user\'s own rules (e.g. suggest other browsers, VPNs, deleting the app). If they want to stop early, remind them why they started and point to the Stop button in the app.',
    'If the user seems to be in crisis or talks about harming themselves, respond with care and suggest local emergency services or a crisis line.',
    `Reply in ${hu ? 'Hungarian' : 'the user\'s language (default English)'}. Current local time: ${new Date(ctx.now()).toString()}.`,
  ].filter(Boolean).join('\n');
}

// ------------------------------------------------------------------ offline understanding (no AI connection)

const NUM_WORDS = { egy: 1, ket: 2, kett: 2, ketto: 2, harom: 3, negy: 4, ot: 5, fel: 0.5, one: 1, two: 2, three: 3, four: 4, half: 0.5, an: 1, a: 1 };

function parseMinutes(t) {
  let m = /(\d+(?:[.,]\d+)?)\s*(?:h\b|hr|hrs|hour|hours|ora|oras|orara|orat|oraig)/.exec(t);
  if (m) return Math.round(parseFloat(m[1].replace(',', '.')) * 60);
  m = /(\d+)\s*(?:m\b|min|mins|minute|minutes|perc|perces|percre|percig)/.exec(t);
  if (m) return Number(m[1]);
  m = /\b(egy|ket|kett|ketto|harom|negy|one|two|three|four|an|half)\s+(?:h\b|hour|hours|ora|orara|oras)/.exec(t);
  if (m) return Math.round(NUM_WORDS[m[1]] * 60);
  if (/\bfel ora|half an hour|half hour/.test(t)) return 30;
  return null;
}

function parseMode(t) {
  if (/strict|locked|zarolt|szigoru|nem lehet leallit|cant stop|can't stop/.test(t)) return 'strict';
  if (/patient|turelmes/.test(t)) return 'patient';
  if (/flexible|laza/.test(t)) return 'flexible';
  return null;
}

function siteTokens(raw) {
  const out = [];
  const re = /\b((?:[a-z0-9-]+\.)+[a-z]{2,}(?:\/[^\s,;]*)?)/gi;
  let m;
  while ((m = re.exec(raw))) out.push(m[1].replace(/[.,;:!?)]+$/, ''));
  // bare well-known names ("block youtube")
  const names = { youtube: 'youtube.com', reddit: 'reddit.com', tiktok: 'tiktok.com', instagram: 'instagram.com', facebook: 'facebook.com', twitter: 'x.com', netflix: 'netflix.com', twitch: 'twitch.tv', discord: 'discord.com', '9gag': '9gag.com', linkedin: 'linkedin.com', pinterest: 'pinterest.com', snapchat: 'snapchat.com' };
  const low = norm(raw);
  for (const [k, v] of Object.entries(names)) if (new RegExp(`\\b${k}`).test(low) && !out.some((s) => s.includes(k))) out.push(v);
  return out;
}

/**
 * Understands a handful of commands without an AI connection.
 * Returns { handled, reply, calls:[{name,input}] } — calls are run by the caller.
 */
const PLACE_STOP = new Set(['milyen', 'hogyan', 'mennyien', 'holnap', 'holnapután', 'reggel', 'este', 'ma', 'most', 'itt', 'otthon', 'kint', 'bent', 'hétvégén', 'hétfőn', 'kedden', 'szerdán', 'csütörtökön', 'pénteken', 'szombaton', 'vasárnap', 'délután', 'éjjel', 'éjszaka', 'nálunk', 'mennyien']);
/** "…in London", "…Debrecenben", "Budapesten…" → the city (or '' for "here"). */
function weatherPlace(text) {
  const raw = String(text || '');
  const en = /\b(?:in|at|for)\s+([A-Za-zÀ-ž][\p{L} .'-]{1,40}?)\s*(?:today|tomorrow|now|this week)?[?.!]*\s*$/u.exec(raw);
  if (en && !/^(the|today|tomorrow|here|my area)$/i.test(en[1].trim())) return en[1].trim();
  for (const m of raw.matchAll(/(?:^|[^\p{L}])(\p{Lu}[\p{L}-]{1,30}?)(ban|ben|on|en|ön|n)(?![\p{L}])/gu)) {
    const word = (m[1] + m[2]).toLowerCase();
    if (!PLACE_STOP.has(word)) return m[1];
  }
  return '';
}

function offline(text, lang) {
  const hu = lang === 'hu';
  const t = ` ${norm(text)} `;
  const sites = siteTokens(text);
  const minutes = parseMinutes(t);
  const mode = parseMode(t);
  const growHit = GROW.CATALOG.find((c) => t.includes(` ${norm(c.name.en)}`) || t.includes(` ${norm(c.name.hu)}`) || t.includes(` ${c.id}`));

  if (/\b(weather|temperature|forecast|idojaras|hany fok|homerseklet|esik|esni fog|havazik|rain|snow|hideg|meleg|ido lesz|milyen (az )?ido)\b/.test(t) || /hany fok/.test(t)) {
    const place = weatherPlace(text);
    return { handled: true, calls: [{ name: 'get_weather', input: { place } }] };
  }
  if (/\b(what time|hany ora|mennyi az ido|milyen nap van|what day|datum|date today)\b/.test(t)) return { handled: true, calls: [{ name: 'get_time', input: {} }] };
  if (/(karacsony|christmas|xmas|unnepi|holiday)/.test(t) && /\b(ki|off|kapcsold ki|tuntesd el|disable|be|on|kapcsold be|enable)\b/.test(t)) {
    const off = /\b(ki|off|kapcsold ki|tuntesd el|disable)\b/.test(t);
    return { handled: true, calls: [{ name: 'customize_app', input: { season: off ? 'off' : 'on' } }] };
  }
  const MENU = [['lists', /\b(list|lists|lista|listak|listakat)\b/], ['schedules', /\b(schedule|schedules|idozites|idoziteseket|idozitest)\b/], ['stats', /\b(stat|stats|statisztika|statisztikat)\b/], ['island', /\b(island|sziget|szigetet|level|szint)\b/], ['ranks', /\b(rank|ranks|leaderboard|ranglista|ranglistat)\b/]];
  if (/\b(hide|remove from menu|rejtsd|tuntesd el|vedd ki|show|mutasd|tedd vissza)\b/.test(t) && MENU.some(([, re]) => re.test(t))) {
    const ids = MENU.filter(([, re]) => re.test(t)).map(([id]) => id);
    const show = /\b(show|mutasd|tedd vissza)\b/.test(t);
    return { handled: true, calls: [{ name: 'customize_app', input: show ? { show_menu: ids } : { hide_menu: ids } }] };
  }
  if (/\b(level\w*|szint\w*|xp|achievement\w*|gems?|kristaly\w*)\b/.test(t) && !sites.length) return { handled: true, calls: [{ name: 'get_level', input: {} }] };
  if (/\b(stop|leallit|allitsd le|kapcsold ki|vege a tiltas)/.test(t) && !sites.length) return { handled: true, calls: [{ name: 'stop_focus', input: {} }] };
  if (/\b(extend|hosszabbit|meghosszabbit|meg \d+|\+\s*\d+)/.test(t) && minutes) return { handled: true, calls: [{ name: 'extend_focus', input: { minutes } }] };
  if (/\b(unblock|enged|oldd fel|vedd le|torold)\b/.test(t) && sites.length) return { handled: true, calls: [{ name: 'unblock_sites', input: { sites } }] };
  if (/\b(block|tilt|blokk|letilt|zard le)/.test(t) && sites.length) {
    const calls = [{ name: 'block_sites', input: { sites } }];
    if (minutes) calls.push({ name: 'start_focus', input: { minutes, mode: mode || undefined, lists: [hu ? 'AI tiltólista' : 'Blocked by AI'] } });
    return { handled: true, calls };
  }
  if (/\b(start|indits|kezd|fokusz|focus|pomodoro|tanul|study|dolgoz|work)/.test(t) && (minutes || /pomodoro|indits|start/.test(t))) {
    const pomo = /pomodoro/.test(t);
    return { handled: true, calls: [{ name: 'start_focus', input: { minutes: minutes || undefined, mode: mode || undefined, pomodoro: pomo ? { work: 25, brk: 5, cycles: minutes ? Math.max(1, Math.round(minutes / 30)) : 4 } : undefined } }] };
  }
  if (growHit && /\b(grow|build|nojon|novessz|epits|epuljon|legyen)/.test(t)) return { handled: true, calls: [{ name: 'set_grow', input: { item: growHit.id } }] };
  if (/\b(stat|mennyit|how much|how long|streak|sorozat|fokuszaltam|focused)/.test(t)) return { handled: true, calls: [{ name: 'get_stats', input: {} }] };
  if (/\b(status|mi fut|what is running|allapot)/.test(t)) return { handled: true, calls: [{ name: 'get_status', input: {} }] };
  return { handled: false };
}

/** Human summary of offline results. */
function offlineReply(lang, results) {
  const hu = lang === 'hu';
  const lines = [];
  for (const { name, result: r } of results) {
    if (!r || r.ok === false) { lines.push(`⚠️ ${r && r.error ? r.error : (hu ? 'Nem sikerült.' : 'That didn\'t work.')}`); continue; }
    if (name === 'start_focus') lines.push(hu ? `✅ Fókusz elindítva **${r.until}**-ig (${r.lists.join(', ')}).` : `✅ Focus started until **${r.until}** (${r.lists.join(', ')}).`);
    else if (name === 'extend_focus') lines.push(hu ? `✅ Meghosszabbítva **${r.until}**-ig.` : `✅ Extended until **${r.until}**.`);
    else if (name === 'stop_focus') lines.push(hu ? '✅ Leállítva.' : '✅ Stopped.');
    else if (name === 'block_sites') lines.push(hu ? `✅ Tiltva: ${r.added.join(', ')} (lista: ${r.list}).` : `✅ Blocked: ${r.added.join(', ')} (list: ${r.list}).`);
    else if (name === 'unblock_sites') lines.push(hu ? `✅ Levéve: ${r.removed.join(', ')}.` : `✅ Removed: ${r.removed.join(', ')}.`);
    else if (name === 'set_grow') lines.push(hu ? `🌱 Mostantól ez nő: ${r.grows}.` : `🌱 Now growing: ${r.grows}.`);
    else if (name === 'get_stats') lines.push(hu ? `📊 Ma: **${r.last7[6].focusMinutes} perc**, a héten: **${r.last7.reduce((a, b) => a + b.focusMinutes, 0)} perc**, sorozat: **${r.streak} nap**, összesen **${r.totalFocusHours} óra**.` : `📊 Today: **${r.last7[6].focusMinutes} min**, this week: **${r.last7.reduce((a, b) => a + b.focusMinutes, 0)} min**, streak: **${r.streak} days**, total **${r.totalFocusHours} h**.`);
    else if (name === 'get_weather') lines.push(weatherLine(r, hu));
    else if (name === 'get_time') lines.push(hu ? `🕒 Most **${r.time}** van (${r.date}).` : `🕒 It’s **${r.time}** (${r.date}).`);
    else if (name === 'customize_app') lines.push(hu ? '✅ Kész, átállítottam.' : '✅ Done — updated.');
    else if (name === 'get_level') lines.push(hu ? `🏝️ **${r.level}. szint** — ${r.title}. Még **${r.toNextLevel} XP** a következőig. Kristályok: ${r.gems.filter((g) => g.got).length}/${r.gems.length}.` : `🏝️ **Level ${r.level}** — ${r.title}. **${r.toNextLevel} XP** to the next one. Gems: ${r.gems.filter((g) => g.got).length}/${r.gems.length}.`);
    else if (name === 'get_status') lines.push(r.blocking ? (hu ? `🔒 Tiltás fut **${r.blocking.until}**-ig (${r.blocking.mode}).` : `🔒 Blocking until **${r.blocking.until}** (${r.blocking.mode}).`) : (hu ? 'Most nincs tiltás.' : 'Nothing is blocked right now.'));
  }
  return lines.join('\n');
}

const WMO = {
  en: { 0: ['☀️', 'clear sky'], 1: ['🌤️', 'mostly clear'], 2: ['⛅', 'partly cloudy'], 3: ['☁️', 'cloudy'], 45: ['🌫️', 'fog'], 48: ['🌫️', 'icy fog'], 51: ['🌦️', 'light drizzle'], 53: ['🌦️', 'drizzle'], 55: ['🌧️', 'heavy drizzle'], 56: ['🌧️', 'freezing drizzle'], 57: ['🌧️', 'freezing drizzle'], 61: ['🌦️', 'light rain'], 63: ['🌧️', 'rain'], 65: ['🌧️', 'heavy rain'], 66: ['🌧️', 'freezing rain'], 67: ['🌧️', 'freezing rain'], 71: ['🌨️', 'light snow'], 73: ['🌨️', 'snow'], 75: ['❄️', 'heavy snow'], 77: ['🌨️', 'snow grains'], 80: ['🌦️', 'rain showers'], 81: ['🌧️', 'rain showers'], 82: ['⛈️', 'heavy showers'], 85: ['🌨️', 'snow showers'], 86: ['❄️', 'heavy snow showers'], 95: ['⛈️', 'thunderstorm'], 96: ['⛈️', 'thunderstorm with hail'], 99: ['⛈️', 'thunderstorm with hail'] },
  hu: { 0: ['☀️', 'derült'], 1: ['🌤️', 'többnyire derült'], 2: ['⛅', 'részben felhős'], 3: ['☁️', 'borult'], 45: ['🌫️', 'köd'], 48: ['🌫️', 'zúzmarás köd'], 51: ['🌦️', 'gyenge szitálás'], 53: ['🌦️', 'szitálás'], 55: ['🌧️', 'erős szitálás'], 56: ['🌧️', 'ónos szitálás'], 57: ['🌧️', 'ónos szitálás'], 61: ['🌦️', 'gyenge eső'], 63: ['🌧️', 'eső'], 65: ['🌧️', 'erős eső'], 66: ['🌧️', 'ónos eső'], 67: ['🌧️', 'ónos eső'], 71: ['🌨️', 'gyenge havazás'], 73: ['🌨️', 'havazás'], 75: ['❄️', 'erős havazás'], 77: ['🌨️', 'hószemcsék'], 80: ['🌦️', 'zápor'], 81: ['🌧️', 'zápor'], 82: ['⛈️', 'heves zápor'], 85: ['🌨️', 'hózápor'], 86: ['❄️', 'erős hózápor'], 95: ['⛈️', 'zivatar'], 96: ['⛈️', 'zivatar jégesővel'], 99: ['⛈️', 'zivatar jégesővel'] },
};
function wmo(code, hu) { const t = WMO[hu ? 'hu' : 'en']; return t[code] || t[Math.floor(code / 10) * 10] || ['🌡️', '']; }

/** "Weather" tool result → one friendly line (offline replies and tests). */
function weatherLine(r, hu) {
  const [ic, desc] = wmo(r.now.code, hu);
  const day = (d) => (d ? `${Math.round(d.min)}–${Math.round(d.max)} °C${d.rain != null ? (hu ? `, eső esélye ${d.rain}%` : `, ${d.rain}% chance of rain`) : ''}` : '');
  return hu
    ? `${ic} **${r.place}**: most **${Math.round(r.now.temp)} °C** (hőérzet ${Math.round(r.now.feels)} °C), ${desc}. Ma ${day(r.today)}.${r.tomorrow ? ` Holnap ${day(r.tomorrow)}, ${wmo(r.tomorrow.code, true)[1]}.` : ''}`
    : `${ic} **${r.place}**: **${Math.round(r.now.temp)} °C** now (feels like ${Math.round(r.now.feels)} °C), ${desc}. Today ${day(r.today)}.${r.tomorrow ? ` Tomorrow ${day(r.tomorrow)}, ${wmo(r.tomorrow.code, false)[1]}.` : ''}`;
}

/** Open-Meteo (free, no key) → compact weather. `fetchJson(url)` is injected. */
async function weather(fetchJson, place, opts = {}) {
  const lang = opts.lang === 'hu' ? 'hu' : 'en';
  let loc = null;
  const q = String(place || opts.city || '').trim();
  if (q) {
    const g = await fetchJson(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=1&language=${lang}&format=json`);
    const r = g && g.results && g.results[0];
    if (!r) throw new Error('notfound');
    loc = { name: r.name, country: r.country || '', lat: r.latitude, lon: r.longitude };
  } else {
    const ip = await fetchJson('https://get.geojs.io/v1/ip/geo.json');
    if (!ip || !ip.latitude) throw new Error('notfound');
    loc = { name: ip.city || ip.region || ip.country || '?', country: ip.country || '', lat: Number(ip.latitude), lon: Number(ip.longitude), approx: true };
  }
  const w = await fetchJson(`https://api.open-meteo.com/v1/forecast?latitude=${loc.lat}&longitude=${loc.lon}&current=temperature_2m,apparent_temperature,weather_code,wind_speed_10m,precipitation&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=auto&forecast_days=3`);
  const c = w.current || {};
  const d = w.daily || {};
  const dayAt = (i) => (d.time && d.time[i] ? { date: d.time[i], code: d.weather_code[i], max: d.temperature_2m_max[i], min: d.temperature_2m_min[i], rain: d.precipitation_probability_max ? d.precipitation_probability_max[i] : null } : null);
  return {
    place: loc.country && loc.name !== loc.country ? `${loc.name}, ${loc.country}` : loc.name, approximate: Boolean(loc.approx),
    now: { temp: c.temperature_2m, feels: c.apparent_temperature, code: c.weather_code, wind: c.wind_speed_10m, precipitation: c.precipitation },
    today: dayAt(0), tomorrow: dayAt(1), dayAfter: dayAt(2), source: 'Open-Meteo',
  };
}

function offlineHelp(lang) {
  return lang === 'hu'
    ? 'Offline módban ezeket értem: „indíts 50 perc fókuszt szigorúan”, „tiltsd le a youtube.com/shorts-ot 2 órára”, „hosszabbíts 15 percet”, „mennyit fókuszáltam?”, „hány fok van?”, „hányas szinten vagyok?”, „rejtsd el a statisztikát”, „karácsonyi mód ki”. Bármi másra (kérdések, tanulás, tervek) kapcsold be a Halyra AI-t a Beállításokban.'
    : 'Offline I understand things like “start 50 min strict focus”, “block youtube.com/shorts for 2 hours”, “extend 15 min”, “how much did I focus?”, “what’s the weather?”, “what level am I?”, “hide stats from the menu”, “Christmas look off”. For everything else (questions, study help, planning) turn on Halyra AI in Settings.';
}

module.exports = { TOOLS, WEB_SEARCH, runTool, systemPrompt, offline, offlineReply, offlineHelp, status, findList, parseMinutes, weather, weatherLine, wmo, weatherPlace };
