'use strict';
/* Extra screens for Halyra Focus (loaded before app.js, used by it):
   - Christmas look (snow, string lights) that the user can switch off
   - "Your island": level, XP, achievements (gems) and the 3D focus island
   - Leaderboard: opt-in, weekly focus minutes, friend groups with a code
   - Personalisation: hide menu items, what happens to blocked apps, AI persona
   Everything here uses the helpers from app.js (h, t, S, api, icon, …) at call time. */

// ------------------------------------------------------------------ Christmas look

const season = { canvas: null, raf: 0, flakes: [], on: false };

function seasonActive() {
  return Boolean(S && S.season);
}

function applySeason() {
  const on = seasonActive();
  document.body.classList.toggle('xmas', on);
  if (on === season.on) return;
  season.on = on;
  if (on) startSnow(); else stopSnow();
}

function startSnow() {
  if (season.canvas || (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches)) return;
  const cv = h('canvas', { class: 'snow', 'aria-hidden': 'true' });
  document.body.append(cv);
  season.canvas = cv;
  const ctx = cv.getContext('2d');
  const fit = () => { const d = Math.min(2, window.devicePixelRatio || 1); cv.width = innerWidth * d; cv.height = innerHeight * d; ctx.setTransform(d, 0, 0, d, 0, 0); };
  fit();
  window.addEventListener('resize', fit);
  const n = isMobile() ? 18 : 34;
  season.flakes = Array.from({ length: n }, () => ({ x: Math.random() * innerWidth, y: Math.random() * innerHeight, r: 0.8 + Math.random() * 2.2, v: 0.25 + Math.random() * 0.6, w: Math.random() * 6.28 }));
  let last = 0;
  const frame = (now) => {
    season.raf = requestAnimationFrame(frame);
    if (document.hidden || now - last < 33) return; // ~30 fps is plenty for snow
    last = now;
    ctx.clearRect(0, 0, innerWidth, innerHeight);
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    for (const f of season.flakes) {
      f.y += f.v; f.w += 0.012; f.x += Math.sin(f.w) * 0.35;
      if (f.y > innerHeight + 4) { f.y = -4; f.x = Math.random() * innerWidth; }
      ctx.globalAlpha = 0.25 + f.r / 6;
      ctx.beginPath(); ctx.arc(f.x, f.y, f.r, 0, 6.283); ctx.fill();
    }
    ctx.globalAlpha = 1;
  };
  season.raf = requestAnimationFrame(frame);
}

function stopSnow() {
  cancelAnimationFrame(season.raf);
  if (season.canvas) season.canvas.remove();
  season.canvas = null;
}

/** A string of tiny lights for the sidebar. */
function garland() {
  if (!seasonActive()) return null;
  const cols = ['#ff5d5d', '#ffd36b', '#5fd0ff', '#7dff9a', '#ff8ad8'];
  return h('div', { class: 'garland', 'aria-hidden': 'true' }, Array.from({ length: 11 }, (_, i) => h('i', { style: { '--c': cols[i % cols.length], '--d': `${(i * 0.37) % 2}s` } })));
}

function seasonToggle() {
  const on = seasonActive();
  return h('button', { class: `season-btn${on ? ' on' : ''}`, title: t(on ? 'season.off' : 'season.on'), 'aria-label': t(on ? 'season.off' : 'season.on'),
    onclick: () => patchConfig({ settings: { season: on ? 'off' : 'on' } }) }, on ? '❄️' : '🎄');
}

// ------------------------------------------------------------------ levels & the 3D island

const island = { inst: null, key: '' };

function levelChip() {
  const L = S.levels;
  if (!L) return null;
  return h('button', { class: 'level-chip', onclick: () => go('island'), title: t('isl.open') },
    h('b', null, String(L.level)), h('span', null, L.title),
    h('i', { class: 'lvl-mini' }, h('i', { style: { width: `${Math.round(L.pct * 100)}%` } })));
}

function islandData() {
  const L = S.levels || { level: 1, pct: 0, gems: [] };
  return { level: L.level, pct: L.pct, gems: L.gems, items: (S.stats && S.stats.garden && S.stats.garden.items) || [], season: seasonActive() };
}

function gemIcon(g) {
  return h('span', { class: `gem-ic${g.got ? '' : ' locked'}`, style: { '--g': g.color } }, h('i'));
}

function renderIsland() {
  const L = S.levels || { level: 1, xp: 0, into: 0, need: 60, pct: 0, title: '', gems: [] };
  const got = L.gems.filter((g) => g.got).length;
  const tip = h('div', { class: 'isl-tip', hidden: true });
  const canvas = h('canvas', { class: 'isl-canvas', 'aria-label': t('isl.canvas', { n: L.level, t: L.title }) });
  const stage = h('div', { class: 'isl-stage' }, canvas, tip,
    h('div', { class: 'isl-badge' },
      h('div', { class: 'isl-lvl' }, h('small', null, t('isl.level')), h('b', null, String(L.level))),
      h('div', null, h('div', { class: 'isl-title' }, L.title),
        h('div', { class: 'isl-xp' }, h('i', { style: { width: `${Math.round(L.pct * 100)}%` } })),
        h('div', { class: 'muted small' }, t('isl.toNext', { n: L.need - L.into, next: L.level + 1 })))),
    h('div', { class: 'isl-gemcount' }, '💎 ', h('b', null, `${got}/${L.gems.length}`)));
  // mount after it is in the document
  requestAnimationFrame(() => mountIsland(canvas, tip));
  const fallback = h('div', { class: 'isl-fallback' }, t('isl.no3d'));
  return [
    head(t('nav.island'), t('isl.title'), t('isl.sub'),
      (S.settings.hiddenNav || []).includes('ranks') ? null : h('button', { class: 'btn', onclick: () => go('ranks') }, icon('ranks'), t('nav.ranks'))),
    h('div', { class: 'card isl-card' }, stage, fallback),
    h('div', { class: 'grid g2', style: { marginTop: '16px' } },
      h('div', { class: 'card' },
        h('div', { class: 'card-head' }, h('div', { class: 'card-title' }, t('isl.how'))),
        h('ul', { class: 'isl-how' },
          h('li', null, t('isl.how1')), h('li', null, t('isl.how2')), h('li', null, t('isl.how3')), h('li', null, t('isl.how4'))),
        h('p', { class: 'muted small' }, t('isl.next', { title: L.nextTitle, n: L.nextBandAt }))),
      h('div', { class: 'card' },
        h('div', { class: 'card-head' }, h('div', { class: 'card-title' }, t('isl.gems')), h('span', { class: 'muted small' }, `${got}/${L.gems.length}`)),
        h('div', { class: 'gem-list' }, L.gems.map((g) => h('div', { class: `gem-row${g.got ? ' got' : ''}` }, gemIcon(g),
          h('div', null, h('b', null, g.name), h('small', null, g.desc))))))),
  ];
}

function mountIsland(canvas, tip) {
  if (island.inst) { island.inst.destroy(); island.inst = null; }
  if (!canvas.isConnected || !window.Island3D) return;
  island.inst = window.Island3D.mount(canvas, islandData(), {
    onHover: (g) => {
      if (!g) { tip.hidden = true; return; }
      tip.hidden = false;
      tip.replaceChildren(h('b', null, g.name), h('span', null, g.got ? g.desc : `🔒 ${g.desc}`));
    },
    onPick: (g) => toast(`${g.got ? '💎' : '🔒'} ${g.name} — ${g.desc}`),
  });
  island.key = JSON.stringify([S.levels && S.levels.level, (islandData().items || []).length, seasonActive(), (S.levels && S.levels.gems || []).filter((g) => g.got).length]);
  if (!island.inst) canvas.closest('.isl-card').classList.add('no3d');
}

/** Called on every state update while the island is visible. */
function refreshIsland() {
  if (!island.inst) return;
  if (ui.view !== 'island' || !document.querySelector('.isl-canvas')) { island.inst.destroy(); island.inst = null; return; }
  const key = JSON.stringify([S.levels && S.levels.level, (islandData().items || []).length, seasonActive(), (S.levels && S.levels.gems || []).filter((g) => g.got).length]);
  if (key !== island.key) { island.key = key; island.inst.update(islandData()); }
}

let lastCelebrated = 0;
function celebrateLevel() {
  const ev = S.levelEvent;
  if (!ev || ev.at <= lastCelebrated) return;
  lastCelebrated = ev.at;
  confetti();
  toast(`🎉 ${t('lvl.upTitle', { n: ev.level })} — ${S.levels ? S.levels.title : ''}`);
  if (island.inst) island.inst.celebrate();
}

function confetti() {
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const box = h('div', { class: 'confetti', 'aria-hidden': 'true' });
  const cols = ['#ffb547', '#ff6b6b', '#5fd0ff', '#7dff9a', '#c58cff', '#ffe28a'];
  for (let i = 0; i < 70; i += 1) {
    box.append(h('i', { style: { left: `${Math.random() * 100}%`, background: cols[i % cols.length], '--dx': `${(Math.random() - 0.5) * 240}px`, '--r': `${Math.random() * 720}deg`, animationDelay: `${Math.random() * 0.4}s`, animationDuration: `${1.6 + Math.random() * 1.2}s` } }));
  }
  document.body.append(box);
  setTimeout(() => box.remove(), 3400);
}

// ------------------------------------------------------------------ leaderboard

/** t() with a fallback key when the first one has no text. */
function tOr(key, fallback, vars) {
  const v = t(key, vars);
  return v === key ? t(fallback, vars) : v;
}

const lb = { scope: 'global', group: null, rows: null, groups: [], error: null, loading: false, at: 0 };

async function loadBoard(force) {
  if (lb.loading || (!force && Date.now() - lb.at < 20000 && lb.rows)) return;
  lb.loading = true;
  const r = await api.lbBoard(lb.scope, lb.group);
  lb.loading = false;
  lb.at = Date.now();
  if (r.ok) { lb.rows = r.rows; lb.groups = r.groups; lb.error = null; } else { lb.error = r.error; lb.rows = []; }
  if (ui.view === 'ranks') { ui.structKey = ''; renderAll(); }
}

function renderRanks() {
  const cl = S.cloud || {};
  const s = S.settings;
  const intro = head(t('nav.ranks'), t('lb.title'), t('lb.sub'));
  if (!cl.enabled) return [intro, h('div', { class: 'card lb-empty' }, h('div', { class: 'lb-big' }, '🏆'), h('h3', null, t('lb.soonT')), h('p', { class: 'muted' }, t('lb.soon')))];
  if (!cl.signedIn) return [intro, h('div', { class: 'card lb-empty' }, h('div', { class: 'lb-big' }, '🏆'), h('h3', null, t('lb.signInT')), h('p', { class: 'muted' }, t('lb.signIn')), h('button', { class: 'btn primary', onclick: () => go('settings') }, icon('user'), t('lb.toAccount')))];
  if (!s.lbOn) return [intro, joinCard()];
  if (!lb.rows && !lb.loading) loadBoard(true);
  const tabs = h('div', { class: 'seg lb-tabs' },
    h('button', { class: lb.scope === 'global' ? 'on' : '', onclick: () => { lb.scope = 'global'; lb.group = null; lb.rows = null; loadBoard(true); renderAll(); } }, '🌍 ', t('lb.everyone')),
    ...(lb.groups || []).map((g) => h('button', { class: lb.scope === 'group' && lb.group === g.id ? 'on' : '', onclick: () => { lb.scope = 'group'; lb.group = g.id; lb.rows = null; loadBoard(true); renderAll(); } }, '👥 ', g.name)));
  const cur = lb.scope === 'group' ? (lb.groups || []).find((g) => g.id === lb.group) : null;
  const rows = lb.rows || [];
  const max = Math.max(1, ...rows.map((r) => r.week_minutes));
  const list = lb.error ? h('p', { class: 'muted' }, tOr(`lb.err.${lb.error}`, 'lb.err.server'))
    : !lb.rows ? h('p', { class: 'muted' }, t('lb.loading'))
      : !rows.length ? h('p', { class: 'muted' }, t('lb.nobody'))
        : h('div', { class: 'lb-list' }, rows.map((r) => h('div', { class: `lb-row${r.me ? ' me' : ''}${r.rank <= 3 ? ` top${r.rank}` : ''}` },
          h('span', { class: 'lb-rank' }, r.rank <= 3 ? ['🥇', '🥈', '🥉'][r.rank - 1] : `#${r.rank}`),
          h('span', { class: 'lb-emoji' }, r.emoji || '🙂'),
          h('div', { class: 'lb-name' }, h('b', null, r.name, r.me ? h('small', null, ` · ${t('lb.you')}`) : null), h('small', null, t('lb.lvl', { n: r.level }), r.streak ? ` · 🔥 ${r.streak}` : '')),
          h('div', { class: 'lb-bar' }, h('i', { style: { width: `${(r.week_minutes / max) * 100}%` } })),
          h('b', { class: 'lb-min' }, fmtMinutesShort(r.week_minutes)))));
  return [
    intro,
    h('div', { class: 'card' },
      h('div', { class: 'card-head' }, tabs, h('button', { class: 'btn sm', onclick: () => loadBoard(true) }, t('lb.refresh'))),
      cur ? h('div', { class: 'lb-code' }, t('lb.codeIs'), ' ', h('b', null, cur.code), ' ', h('button', { class: 'btn sm', onclick: () => { navigator.clipboard && navigator.clipboard.writeText(cur.code); toast(t('lb.copied')); } }, t('lb.copy')),
        h('button', { class: 'btn sm ghost', onclick: async () => { await api.lbLeave(cur.id); lb.scope = 'global'; lb.group = null; lb.rows = null; loadBoard(true); } }, t('lb.leave'))) : null,
      list,
      h('p', { class: 'muted small', style: { marginTop: '12px' } }, t('lb.fair'))),
    h('div', { class: 'grid g2', style: { marginTop: '16px' } }, groupCard(), profileCard()),
  ];
}

function fmtMinutesShort(m) {
  const hh = Math.floor(m / 60);
  return hh ? `${hh} ${t('focus.hours')} ${m % 60}′` : `${m} ${t('focus.minutes')}`;
}

const LB_EMOJIS = ['🦊', '🐼', '🐙', '🦉', '🐯', '🐸', '🦄', '🐧', '🐢', '🦁', '🐝', '🌵', '🚀', '⭐', '🎧', '📚'];

function joinCard() {
  let name = S.settings.lbName || '';
  let emoji = S.settings.lbEmoji || '🦊';
  let pub = S.settings.lbPublic === true;
  const pick = h('div', { class: 'emoji-pick' }, LB_EMOJIS.map((e) => h('button', { class: e === emoji ? 'on' : '', onclick: (ev) => { emoji = e; pick.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b === ev.currentTarget)); } }, e)));
  return h('div', { class: 'card lb-join' },
    h('div', { class: 'lb-big' }, '🏆'),
    h('h3', null, t('lb.joinT')),
    h('p', { class: 'muted' }, t('lb.joinSub')),
    h('div', { class: 'stack', style: { maxWidth: '420px', margin: '0 auto', textAlign: 'left' } },
      h('label', { class: 'eyebrow' }, t('lb.nick')),
      h('input', { class: 'input', maxlength: 24, value: name, placeholder: t('lb.nickPh'), 'data-fid': 'lb-name', oninput: (e) => { name = e.target.value; } }),
      h('label', { class: 'eyebrow' }, t('lb.avatar')), pick,
      h('label', { class: 'set-row', style: { padding: 0 } }, h('div', { class: 'label' }, t('lb.public'), h('small', null, t('lb.publicSub'))),
        h('span', { class: 'switch' }, h('input', { type: 'checkbox', checked: pub, onchange: (e) => { pub = e.target.checked; } }), h('span'))),
      h('button', { class: 'btn primary', onclick: async () => {
        if (!name.trim()) { toast(t('lb.needName'), 'error'); return; }
        await patchConfig({ settings: { lbOn: true, lbName: name.trim(), lbEmoji: emoji, lbPublic: pub } });
        lb.rows = null; loadBoard(true);
      } }, t('lb.join'))));
}

function groupCard() {
  let name = '';
  let code = '';
  return h('div', { class: 'card' },
    h('div', { class: 'card-head' }, h('div', { class: 'card-title' }, t('lb.groups'))),
    h('p', { class: 'muted small', style: { marginTop: 0 } }, t('lb.groupsSub')),
    h('div', { class: 'row', style: { flexWrap: 'nowrap', marginBottom: '8px' } },
      h('input', { class: 'input', placeholder: t('lb.groupName'), maxlength: 40, 'data-fid': 'lb-gname', oninput: (e) => { name = e.target.value; } }),
      h('button', { class: 'btn', onclick: async () => {
        if (!name.trim()) return;
        const r = await api.lbCreate(name.trim());
        if (!r.ok) { toast(tOr(`lb.err.${r.error}`, 'lb.err.server'), 'error'); return; }
        toast(t('lb.created', { code: r.group.code }));
        lb.scope = 'group'; lb.group = r.group.id; lb.rows = null; loadBoard(true);
      } }, t('lb.create'))),
    h('div', { class: 'row', style: { flexWrap: 'nowrap' } },
      h('input', { class: 'input', placeholder: t('lb.codePh'), maxlength: 8, style: { textTransform: 'uppercase' }, 'data-fid': 'lb-code', oninput: (e) => { code = e.target.value; } }),
      h('button', { class: 'btn primary', onclick: async () => {
        const r = await api.lbJoin(code.trim());
        if (!r.ok) { toast(t('lb.badCode'), 'error'); return; }
        toast(t('lb.joined', { name: r.group.name }));
        lb.scope = 'group'; lb.group = r.group.id; lb.rows = null; loadBoard(true);
      } }, t('lb.joinGroup'))));
}

function profileCard() {
  const s = S.settings;
  return h('div', { class: 'card' },
    h('div', { class: 'card-head' }, h('div', { class: 'card-title' }, t('lb.me'))),
    h('div', { class: 'set-row' }, h('div', { class: 'label' }, `${s.lbEmoji || '🦊'} ${s.lbName || ''}`, h('small', null, s.lbPublic ? t('lb.isPublic') : t('lb.isPrivate'))),
      h('label', { class: 'switch' }, h('input', { type: 'checkbox', checked: s.lbPublic === true, onchange: async (e) => { await patchConfig({ settings: { lbPublic: e.target.checked } }); lb.rows = null; loadBoard(true); } }), h('span'))),
    h('button', { class: 'btn danger sm', style: { marginTop: '8px' }, onclick: async () => {
      const r = await api.lbOff();
      if (r.state) applyState(r.state);
      lb.rows = null;
      toast(r.ok ? t('lb.offDone') : t('lb.offLocal'), 'ok');
    } }, t('lb.off')));
}

// ------------------------------------------------------------------ personalise

function personalizeCard() {
  const s = S.settings;
  const hidden = new Set(s.hiddenNav || []);
  const items = [['lists', 'lists'], ['schedules', 'schedules'], ['stats', 'stats'], ['island', 'island'], ['ranks', 'ranks']];
  return h('div', { class: 'card', 'data-fid': 'personal-card' },
    h('div', { class: 'card-head' }, h('div', { class: 'card-title' }, t('per.title'))),
    h('p', { class: 'muted', style: { marginTop: 0 } }, t('per.sub')),
    h('div', { class: 'eyebrow', style: { margin: '6px 0 8px' } }, t('per.menu')),
    h('div', { class: 'chips' }, items.map(([id]) => h('button', { class: `chip${hidden.has(id) ? '' : ' on'}`, onclick: () => {
      const next = new Set(hidden);
      if (next.has(id)) next.delete(id); else next.add(id);
      patchConfig({ settings: { hiddenNav: [...next] } });
    } }, hidden.has(id) ? '＋ ' : '✓ ', t(`nav.${id}`)))),
    isMobile() ? null : h('div', { class: 'set-row', style: { marginTop: '12px' } }, h('div', { class: 'label' }, t('per.apps'), h('small', null, t('per.appsSub'))),
      h('select', { class: 'select', style: { width: 'auto' }, onchange: (e) => patchConfig({ settings: { appAction: e.target.value } }) },
        ['smart', 'hide', 'close'].map((v) => h('option', { value: v, selected: (s.appAction || 'smart') === v }, t(`per.apps.${v}`))))),
    h('div', { class: 'set-row' }, h('div', { class: 'label' }, t('per.season'), h('small', null, t('per.seasonSub'))),
      h('select', { class: 'select', style: { width: 'auto' }, onchange: (e) => patchConfig({ settings: { season: e.target.value } }) },
        ['auto', 'on', 'off'].map((v) => h('option', { value: v, selected: (s.season || 'auto') === v }, t(`per.season.${v}`))))));
}

function aiPersonaCard() {
  const s = S.settings;
  let about = s.aiAbout || '';
  return h('div', { class: 'card', 'data-fid': 'ai-persona' },
    h('div', { class: 'card-head' }, h('div', { class: 'card-title row', style: { gap: '8px' } }, icon('sparkle'), t('aip.title'))),
    h('p', { class: 'muted', style: { marginTop: 0 } }, t('aip.sub')),
    h('div', { class: 'grid g2' },
      h('div', null, h('label', { class: 'eyebrow' }, t('aip.name')),
        h('input', { class: 'input', maxlength: 20, value: s.aiName || 'Halyra', 'data-fid': 'aip-name', onchange: (e) => patchConfig({ settings: { aiName: e.target.value } }) })),
      h('div', null, h('label', { class: 'eyebrow' }, t('aip.tone')),
        h('select', { class: 'select', onchange: (e) => patchConfig({ settings: { aiTone: e.target.value } }) },
          ['friendly', 'brief', 'coach', 'funny', 'formal'].map((v) => h('option', { value: v, selected: (s.aiTone || 'friendly') === v }, t(`aip.tone.${v}`)))))),
    h('label', { class: 'eyebrow', style: { display: 'block', marginTop: '12px' } }, t('aip.city')),
    h('input', { class: 'input', maxlength: 60, value: s.aiCity || '', placeholder: t('aip.cityPh'), 'data-fid': 'aip-city', onchange: (e) => patchConfig({ settings: { aiCity: e.target.value } }) }),
    h('label', { class: 'eyebrow', style: { display: 'block', marginTop: '12px' } }, t('aip.about')),
    h('textarea', { class: 'input', rows: 4, maxlength: 600, placeholder: t('aip.aboutPh'), 'data-fid': 'aip-about', oninput: (e) => { about = e.target.value; }, onchange: () => patchConfig({ settings: { aiAbout: about } }) }, about),
    h('p', { class: 'muted small' }, t('aip.private')));
}

// ------------------------------------------------------------------ feedback

/** Where a feedback button leads: the owner's form if set, otherwise a GitHub issue form. */
function feedbackUrl(kind) {
  const B = window.BRAND || {};
  const os = S.platform === 'darwin' ? 'Mac' : S.platform === 'win32' ? 'Windows' : S.platform === 'android' ? 'Android' : S.platform;
  const info = `Halyra Focus ${S.version || ''} · ${os} · ${S.lang}`;
  if (B.feedbackForm) return `${B.feedbackForm}${B.feedbackForm.includes('?') ? '&' : '?'}kind=${encodeURIComponent(kind)}&app=${encodeURIComponent(info)}`;
  const tpl = kind === 'bug' ? 'bug.yml' : 'idea.yml';
  return `${B.repo || 'https://github.com/Tibi772/halyra-focus'}/issues/new?template=${tpl}&labels=${kind === 'bug' ? 'bug' : 'idea'}&version=${encodeURIComponent(info)}`;
}

function feedbackCard() {
  const btn = (kind, emoji) => h('button', { class: 'btn', onclick: () => api.openExternal(feedbackUrl(kind)) }, `${emoji} `, t(`fb.${kind}`));
  return h('div', { class: 'card', 'data-fid': 'feedback-card' },
    h('div', { class: 'card-head' }, h('div', { class: 'card-title' }, t('fb.title'))),
    h('p', { class: 'muted', style: { marginTop: 0 } }, t('fb.sub')),
    h('div', { class: 'row', style: { gap: '8px' } }, btn('idea', '💡'), btn('bug', '🐞'), btn('love', '❤️'), btn('remove', '✂️')));
}
