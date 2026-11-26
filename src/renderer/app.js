/* Halyra Focus — UI. Vanilla JS, no framework, talks to the app only via window.api. */
'use strict';

// `api` is the global that preload's contextBridge defines (non-configurable),
// so it must never be redeclared here — that is a SyntaxError in Electron.
let S = null;
let t = I18N.make('en');
const ui = {
  view: 'focus',
  structKey: '',
  setup: null,
  presets: [],
  installed: null,
};

// ------------------------------------------------------------------ tiny DOM helpers

function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'style' && typeof v === 'object') { for (const [sk, sv] of Object.entries(v)) { if (sk.startsWith('--')) el.style.setProperty(sk, sv); else el.style[sk] = sv; } }
      else if (k === 'html') el.innerHTML = v;
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
      else if (k === 'dataset') Object.assign(el.dataset, v);
      else if (k === 'value') el.value = v;
      else if (k === 'checked') el.checked = Boolean(v);
      else el.setAttribute(k, v === true ? '' : v);
    }
  }
  for (const kid of kids.flat(Infinity)) {
    if (kid == null || kid === false) continue;
    el.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
  }
  return el;
}

const P = {
  focus: '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>',
  lists: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
  schedules: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
  stats: '<path d="M3 3v18h18M18 17V9M13 17V5M8 17v-3"/>',
  settings: '<path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  lock: '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
  unlock: '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/>',
  hourglass: '<path d="M5 22h14M5 2h14M17 22v-4.2a2 2 0 0 0-.6-1.4L12 12l-4.4 4.4a2 2 0 0 0-.6 1.4V22M7 2v4.2a2 2 0 0 0 .6 1.4L12 12l4.4-4.4a2 2 0 0 0 .6-1.4V2"/>',
  shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
  clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
  play: '<path d="M6 3l14 9-14 9z"/>',
  search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
  globe: '<circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>',
  grid: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/>',
  trash: '<path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>',
  upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/>',
  coffee: '<path d="M17 8h1a4 4 0 1 1 0 8h-1M3 8h14v9a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4ZM6 2v2M10 2v2M14 2v2"/>',
  flame: '<path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.4-.5-2-1-3-1.1-2.1-.2-4 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.2.4-2.3 1-3a2.5 2.5 0 0 0 2.5 2.5z"/>',
  bolt: '<path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z"/>',
  timer: '<path d="M10 2h4M12 14l3-3"/><circle cx="12" cy="14" r="8"/>',
  ext: '<path d="M15 3h6v6M10 14 21 3M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
  power: '<path d="M12 2v10M18.4 6.6a9 9 0 1 1-12.8 0"/>',
  sparkle: '<path d="M12 3l1.9 5.8L20 10l-6.1 1.2L12 17l-1.9-5.8L4 10l6.1-1.2Z"/>',
  key: '<circle cx="7.5" cy="15.5" r="5.5"/><path d="m21 2-9.6 9.6M15.5 7.5l3 3L22 7l-3-3"/>',
  wave: '<path d="M2 12c2-4 4-4 6 0s4 4 6 0 4-4 6 0"/><path d="M2 18c2-4 4-4 6 0s4 4 6 0 4-4 6 0" opacity=".5"/>',
  cloud: '<path d="M17.5 19H7a5 5 0 1 1 .9-9.9A6 6 0 0 1 19.5 11 4 4 0 0 1 17.5 19z"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
};
function icon(name) {
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  s.setAttribute('viewBox', '0 0 24 24');
  s.setAttribute('class', 'ic');
  s.setAttribute('fill', 'none');
  s.setAttribute('stroke', 'currentColor');
  s.setAttribute('stroke-width', '1.8');
  s.setAttribute('stroke-linecap', 'round');
  s.setAttribute('stroke-linejoin', 'round');
  s.innerHTML = P[name] || '';
  return s;
}
function logo(size = 30) {
  const wrap = h('span', { class: 'logo', style: { width: `${size}px`, height: `${size}px` } });
  wrap.innerHTML = `<svg viewBox="0 0 32 32" width="${size}" height="${size}"><defs><linearGradient id="lg${size}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" style="stop-color:var(--accent)"/><stop offset="1" style="stop-color:var(--accent-2)"/></linearGradient></defs><circle cx="16" cy="16" r="11" fill="none" stroke="url(#lg${size})" stroke-width="4" stroke-dasharray="52 80" stroke-linecap="round" transform="rotate(-45 16 16)"/><circle cx="16" cy="16" r="4.2" fill="url(#lg${size})"/></svg>`;
  return wrap;
}

// ------------------------------------------------------------------ formatting

const pad = (n) => String(n).padStart(2, '0');
function fmtLeft(ms) {
  const s = Math.max(0, Math.round(ms / 1000));
  const hh = Math.floor(s / 3600);
  const mm = Math.floor((s % 3600) / 60);
  return hh ? `${hh}:${pad(mm)}:${pad(s % 60)}` : `${pad(mm)}:${pad(s % 60)}`;
}
function fmtClock(ms) { const d = new Date(ms); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; }
function fmtWhen(ms) {
  const d = new Date(ms);
  const now = new Date(S.now);
  const dayDiff = Math.round((new Date(d.getFullYear(), d.getMonth(), d.getDate()) - new Date(now.getFullYear(), now.getMonth(), now.getDate())) / 86400000);
  const label = dayDiff === 0 ? t('common.today') : dayDiff === 1 ? t('common.tomorrow') : t('days.short')[d.getDay()];
  return `${label} ${fmtClock(ms)}`;
}
function fmtMinutes(min) {
  if (min < 60) return { n: min, u: t('stats.minutes') };
  return { n: (Math.round(min / 6) / 10).toLocaleString(S.lang), u: t('stats.hours') };
}
const listById = (id) => S.lists.find((l) => l.id === id);
const modeIcon = (m) => (m === 'strict' ? 'lock' : m === 'patient' ? 'hourglass' : 'unlock');

// ------------------------------------------------------------------ toasts, sound, modals

function toast(text, kind = 'ok') {
  const el = h('div', { class: `toast ${kind}` }, text);
  document.getElementById('toasts').append(el);
  setTimeout(() => el.remove(), 3200);
}

let audio = null;
function chime(up = true) {
  if (!S || !S.settings.sound) return;
  try {
    audio = audio || new AudioContext();
    const notes = up ? [523.25, 659.25, 783.99] : [783.99, 659.25, 523.25];
    notes.forEach((f, i) => {
      const o = audio.createOscillator();
      const g = audio.createGain();
      o.type = S.settings.theme === 'crt' || S.settings.theme === 'onebit' ? 'square' : 'sine';
      o.frequency.value = f;
      const t0 = audio.currentTime + i * 0.09;
      g.gain.setValueAtTime(0, t0);
      g.gain.linearRampToValueAtTime(0.06, t0 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.35);
      o.connect(g).connect(audio.destination);
      o.start(t0);
      o.stop(t0 + 0.4);
    });
  } catch (_) { /* audio not available */ }
}

const modalStack = [];
function openModal(build, { wide = false, xwide = false, onClose } = {}) {
  const box = h('div', { class: `modal${wide ? ' wide' : ''}${xwide ? ' xwide' : ''}` });
  const back = h('div', { class: 'modal-back', onmousedown: (e) => { if (e.target === back) close(); } }, box);
  const entry = { back, box, onClose, refresh: null };
  function close() {
    const i = modalStack.indexOf(entry);
    if (i >= 0) modalStack.splice(i, 1);
    back.remove();
    if (onClose) onClose();
  }
  entry.close = close;
  entry.render = () => { box.replaceChildren(...[].concat(build(entry))); };
  modalStack.push(entry);
  document.getElementById('modals').append(back);
  entry.render();
  return entry;
}
function modalHead(title, close) {
  return h('div', { class: 'modal-head' }, h('h2', null, title), h('button', { class: 'btn icon-only', onclick: close, 'aria-label': t('unlock.close') }, icon('x')));
}
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && modalStack.length) modalStack[modalStack.length - 1].close();
});

function askPin(title) {
  return new Promise((resolve) => {
    let val = '';
    let done = false;
    const m = openModal((self) => [
      modalHead(title || t('unlock.pin'), () => self.close()),
      h('input', {
        class: 'input', type: 'password', inputmode: 'numeric', maxlength: 12, autofocus: true, placeholder: '••••',
        oninput: (e) => { val = e.target.value; },
        onkeydown: (e) => { if (e.key === 'Enter') { done = true; self.close(); resolve(val); } },
      }),
      h('div', { class: 'modal-foot' },
        h('button', { class: 'btn', onclick: () => self.close() }, t('common.cancel')),
        h('button', { class: 'btn primary', onclick: () => { done = true; self.close(); resolve(val); } }, 'OK')),
    ], { onClose: () => { if (!done) resolve(null); } });
    setTimeout(() => { const i = m.box.querySelector('input'); if (i) i.focus(); }, 30);
  });
}

async function patchConfig(patch) {
  let r = await api.setConfig(patch);
  if (!r.ok && r.error === 'pin') {
    const pin = await askPin();
    if (pin == null) return r;
    r = await api.setConfig(patch, pin);
  }
  if (r.state) applyState(r.state);
  if (!r.ok) toast(t(`err.${r.error || 'generic'}`), 'error');
  return r;
}


// ------------------------------------------------------------------ focus sounds (generated offline with WebAudio)

const Sound = (() => {
  let ctx = null;
  let master = null;
  let current = 'off';
  let parts = [];
  let timers = [];
  const buffers = {};
  function noise(type) {
    if (buffers[type]) return buffers[type];
    const len = ctx.sampleRate * 6;
    const b = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch += 1) {
      const d = b.getChannelData(ch);
      let b0 = 0; let b1 = 0; let b2 = 0; let b3 = 0; let b4 = 0; let b5 = 0; let b6 = 0; let last = 0;
      for (let i = 0; i < len; i += 1) {
        const w = Math.random() * 2 - 1;
        if (type === 'white') d[i] = w * 0.5;
        else if (type === 'pink') {
          b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759; b2 = 0.969 * b2 + w * 0.153852;
          b3 = 0.8665 * b3 + w * 0.3104856; b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898;
          d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11; b6 = w * 0.115926;
        } else { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; }
      }
    }
    buffers[type] = b;
    return b;
  }
  const src = (type) => { const s0 = ctx.createBufferSource(); s0.buffer = noise(type); s0.loop = true; s0.start(); parts.push(s0); return s0; };
  const filt = (type, freq, q = 0.7) => { const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q; return f; };
  const gain = (v) => { const g = ctx.createGain(); g.gain.value = v; return g; };
  function chain(...nodes) { for (let i = 0; i < nodes.length - 1; i += 1) nodes[i].connect(nodes[i + 1]); return nodes[nodes.length - 1]; }
  function every(minMs, maxMs, fn) {
    const tick = () => { fn(); timers.push(setTimeout(tick, minMs + Math.random() * (maxMs - minMs))); };
    timers.push(setTimeout(tick, minMs));
  }
  function burst(freq, dur, vol, type = 'bandpass', q = 4) {
    const s0 = ctx.createBufferSource(); s0.buffer = noise('white');
    const f = filt(type, freq, q); const g = gain(0); const t0 = ctx.currentTime;
    g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(vol, t0 + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    chain(s0, f, g, master); s0.start(t0, Math.random() * 4); s0.stop(t0 + dur + 0.05);
  }
  function tone(freq, dur, vol) {
    const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = freq; const g = gain(0); const t0 = ctx.currentTime;
    g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(vol, t0 + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    chain(o, g, master); o.start(t0); o.stop(t0 + dur + 0.05);
  }
  function build(kind) {
    if (kind === 'white') chain(src('white'), filt('lowpass', 9000), gain(0.35), master);
    if (kind === 'brown') chain(src('brown'), filt('lowpass', 520), gain(1.1), master);
    if (kind === 'rain') {
      chain(src('pink'), filt('highpass', 380), filt('lowpass', 7000), gain(0.75), master);
      every(40, 160, () => burst(2500 + Math.random() * 3500, 0.03 + Math.random() * 0.05, 0.05 + Math.random() * 0.08));
    }
    if (kind === 'waves') {
      const g = gain(0.35);
      chain(src('pink'), filt('lowpass', 1100), g, master);
      const lfo = ctx.createOscillator(); lfo.frequency.value = 0.085; const depth = gain(0.3); lfo.connect(depth).connect(g.gain); lfo.start(); parts.push(lfo);
    }
    if (kind === 'cafe') {
      chain(src('brown'), filt('bandpass', 420, 0.6), gain(0.9), master);
      chain(src('pink'), filt('bandpass', 1200, 0.8), gain(0.12), master);
      every(2500, 8000, () => tone(1800 + Math.random() * 1400, 0.35, 0.025));
    }
    if (kind === 'fire') {
      chain(src('brown'), filt('lowpass', 700), gain(0.9), master);
      every(60, 450, () => burst(1800 + Math.random() * 4000, 0.015 + Math.random() * 0.04, 0.12 + Math.random() * 0.2, 'highpass', 0.7));
    }
  }
  function stop() {
    for (const p of parts) { try { p.stop(); } catch (_) { /* already stopped */ } try { p.disconnect(); } catch (_) { /* ignore */ } }
    parts = [];
    timers.forEach(clearTimeout); timers = [];
    if (master) { try { master.disconnect(); } catch (_) { /* ignore */ } master = null; }
    current = 'off';
  }
  function play(kind, vol) {
    if (kind === current) { setVolume(vol); return; }
    stop();
    if (!kind || kind === 'off') return;
    try {
      ctx = ctx || new AudioContext();
      if (ctx.state === 'suspended') ctx.resume();
      master = gain(0);
      master.connect(ctx.destination);
      build(kind);
      master.gain.linearRampToValueAtTime(Math.max(0, Math.min(1, vol)) * 0.8, ctx.currentTime + 1.2);
      current = kind;
    } catch (_) { current = 'off'; }
  }
  function setVolume(v) { if (master && ctx) master.gain.linearRampToValueAtTime(Math.max(0, Math.min(1, v)) * 0.8, ctx.currentTime + 0.15); }
  return { play, stop, setVolume, current: () => current };
})();

let soundPreview = false;
function updateSound() {
  if (!S) return;
  const st = S.settings;
  const session = S.eval.sources.find((x) => x.type === 'session');
  const working = S.eval.blocking && !(session && session.phase === 'break');
  const want = st.focusSound !== 'off' && (soundPreview || (st.soundAuto && working)) ? st.focusSound : 'off';
  Sound.play(want, st.focusVolume);
}

function soundBar() {
  const st = S.settings;
  const kinds = ['off', 'rain', 'waves', 'brown', 'cafe', 'fire', 'white'];
  return h('div', { class: 'card sound-bar' },
    h('div', { class: 'card-title row', style: { gap: '8px' } }, icon('wave'), t('snd.title')),
    h('div', { class: 'row', style: { gap: '6px' } }, kinds.map((k) => h('button', {
      class: `chip sm-chip${st.focusSound === k ? ' on' : ''}`,
      onclick: async () => { soundPreview = k !== 'off'; await patchConfig({ settings: { focusSound: k } }); updateSound(); },
    }, t(`snd.${k}`)))),
    h('div', { class: 'row', style: { flexWrap: 'nowrap', gap: '12px' } },
      h('input', { type: 'range', min: 0, max: 100, value: Math.round(st.focusVolume * 100), style: { maxWidth: '180px' }, 'aria-label': t('snd.volume'),
        oninput: (e) => Sound.setVolume(Number(e.target.value) / 100), onchange: (e) => patchConfig({ settings: { focusVolume: Number(e.target.value) / 100 } }) }),
      h('label', { class: 'row small muted', style: { gap: '8px', flexWrap: 'nowrap' } },
        h('span', { class: 'switch', style: { transform: 'scale(.85)' } }, h('input', { type: 'checkbox', checked: st.soundAuto, onchange: (e) => patchConfig({ settings: { soundAuto: e.target.checked } }) }), h('span')),
        t('snd.auto'))));
}

// ------------------------------------------------------------------ state

function structKey() {
  const ev = S.eval;
  return [S.rev, S.lang, S.settings.theme, ev.blocking, ev.mode, ev.sources.map((s) => `${s.id}:${s.phase}:${s.endsAt}`).join(','),
    S.helper.installed, S.helper.verified, S.unlock ? S.unlock.kind : '', ui.view, JSON.stringify(permState()), S.stats.todayBlocks, Math.floor(S.stats.todayMinutes),
    S.cloud ? `${S.cloud.signedIn}${S.cloud.lastSync}${S.cloud.error}` : '', ui.view === 'lists' ? Object.values(S.usage || {}).map((x) => Math.floor(x / 60)).join(',') : ''].join('|');
}

const CUSTOM_KEYS = new Set();
function setVars(el, vars, track) {
  for (const [k, v] of Object.entries(vars || {})) { el.style.setProperty(k, v); if (track) track.add(k); }
}
function applyTheme() {
  const body = document.body;
  for (const k of CUSTOM_KEYS) body.style.removeProperty(k);
  CUSTOM_KEYS.clear();
  delete body.dataset.effect;
  delete body.dataset.font;
  const th = S.settings.theme;
  if (th.startsWith('custom:')) {
    const ct = (S.customThemes || []).find((x) => `custom:${x.id}` === th);
    if (ct) {
      body.dataset.theme = 'custom';
      setVars(body, ct.vars, CUSTOM_KEYS);
      body.dataset.effect = ct.effect;
      body.dataset.font = ct.font;
      return;
    }
  }
  body.dataset.theme = th.startsWith('custom:') ? 'midnight' : th;
}

function applyState(state) {
  const first = !S;
  S = state;
  t = I18N.make(S.lang);
  document.documentElement.lang = S.lang;
  applyTheme();
  document.body.classList.toggle('win', S.platform === 'win32');
  document.body.classList.toggle('mac', S.platform === 'darwin');
  document.body.classList.toggle('android', S.platform === 'android');
  if (!ui.setup) {
    ui.setup = {
      minutes: S.settings.defaultMinutes || 50,
      custom: ![25, 50, 90, 120].includes(S.settings.defaultMinutes),
      pomodoro: false,
      pomo: { work: 25, brk: 5, cycles: 4 },
      listIds: S.settings.defaultListIds.length ? [...S.settings.defaultListIds] : S.lists.slice(0, 2).map((l) => l.id),
      mode: S.settings.defaultMode || 'flexible',
      goal: '',
      reason: '',
      reasonSource: '',
    };
  }
  ui.setup.listIds = ui.setup.listIds.filter((id) => listById(id));
  const key = structKey();
  if (key !== ui.structKey) {
    ui.structKey = key;
    renderAll();
  } else {
    updateLive();
  }
  for (const m of modalStack) if (m.live) m.live();
  updateSound();
  if (first && !S.settings.onboarded) openOnboarding();
}

// ------------------------------------------------------------------ platform

const isMobile = () => Boolean(S && S.platform === 'android');
/** Apps of a list that do something on this device. */
function appsHere(l) {
  const key = isMobile() ? 'android' : S.platform === 'darwin' ? 'mac' : S.platform === 'win32' ? 'win' : null;
  return key ? (l.apps || []).filter((a) => (a[key] || []).length) : (l.apps || []);
}
function appBadge(a) {
  const phoneOnly = !(a.mac || []).length && !(a.win || []).length;
  const desktopOnly = !(a.android || []).length;
  if (!isMobile() && phoneOnly) return h('span', { class: 'dev-badge', title: t('apps.phone') }, '📱');
  if (isMobile() && desktopOnly) return h('span', { class: 'dev-badge', title: t('apps.desktop') }, '💻');
  return null;
}

// ------------------------------------------------------------------ phone permissions

const PERMS = [['usage', true], ['overlay', true], ['vpn', false], ['notifications', false], ['battery', false]];
const permState = () => ((S && S.mobile && S.mobile.perms) || {});
const missingRequired = () => PERMS.filter(([k, req]) => req && !permState()[k]).map(([k]) => k);
async function requestPerm(kind) {
  const r = await api.platformCall('permission', { kind });
  if (r && r.state) applyState(r.state);
  for (const m of modalStack) if (m.render) m.render();
}
// Android back button: close the top sheet, then go back to Focus, then leave the app.
window.__halyraBack = () => {
  const top = modalStack[modalStack.length - 1];
  if (top) { top.close(); return true; }
  if (ui.view !== 'focus') { go('focus'); return true; }
  return false;
};
// Called by the Android app when it comes back to the front (e.g. from system settings).
window.__halyraResume = async () => {
  const r = await api.platformCall('refresh');
  if (r && r.state) applyState(r.state);
  for (const m of modalStack) if (m.render) m.render();
};
function permRows() {
  const p = permState();
  return PERMS.map(([k]) => h('div', { class: 'set-row perm-row' },
    h('div', { class: 'label' }, t(`perm.${k}`), h('small', null, t(`perm.${k}Sub`))),
    p[k] ? h('span', { class: 'okline' }, icon('check'), t('perm.ok'))
      : h('button', { class: 'btn primary sm', onclick: () => requestPerm(k) }, t('perm.allow'))));
}
function openPermissions() {
  openModal((self) => [
    modalHead(t('perm.title'), () => self.close()),
    h('p', { class: 'muted', style: { marginTop: 0 } }, t('perm.sub')),
    h('div', { class: 'stack' }, permRows()),
  ], { wide: true });
}

// ------------------------------------------------------------------ shell

function renderSidebar() {
  const nav = [['focus', 'focus'], ['lists', 'lists'], ['schedules', 'schedules'], ['stats', 'stats'], ['settings', 'settings']];
  const ev = S.eval;
  const session = ev.sources.find((s) => s.type === 'session');
  const onBreak = session && session.phase === 'break';
  const sb = document.getElementById('sidebar');
  sb.replaceChildren(
    h('div', { class: 'brand' }, logo(30), h('div', { class: 'brand-name' }, 'Halyra Focus', h('small', null, t('brand.sub')))),
    h('nav', { class: 'nav' }, nav.map(([id, ic]) => h('button', { class: `nav-btn${ui.view === id ? ' on' : ''}`, onclick: () => go(id) }, icon(ic), t(`nav.${id}`)))),
    h('div', { class: 'side-foot' },
      S.cloud && S.cloud.enabled ? h('button', { class: 'acc-chip', onclick: () => go('settings') }, icon(S.cloud.signedIn ? 'cloud' : 'user'),
        h('span', null, S.cloud.signedIn ? (S.cloud.email || t('acc.chipIn')) : t('acc.chipOut'))) : null,
      h('div', { class: `status-pill${ev.blocking ? ' on' : ''}` },
        h('span', { class: 'status-dot' }),
        h('div', { class: 'status-text' },
          ev.blocking ? t('focus.on') : onBreak ? t('focus.break') : t('tray.idle'),
          (ev.blocking || onBreak) ? h('b', { 'data-live': 'side-left' }, ringModel().time) : null))),
  );
}

function go(view) {
  ui.view = view;
  ui.structKey = '';
  renderAll();
  document.getElementById('main').scrollTop = 0;
}

function renderAll() {
  renderSidebar();
  const view = document.getElementById('view');
  const views = { focus: renderFocus, lists: renderLists, schedules: renderSchedules, stats: renderStats, settings: renderSettings };
  const active = document.activeElement;
  const fid = active && active.dataset ? active.dataset.fid : null;
  view.replaceChildren(h('div', { class: 'view' }, views[ui.view]()));
  if (fid) {
    const again = view.querySelector(`[data-fid="${fid}"]`);
    if (again) again.focus();
  }
  updateLive();
}

function head(eyebrow, title, sub, right) {
  return h('div', { class: 'view-head' },
    h('div', null, h('div', { class: 'eyebrow' }, eyebrow), h('h1', { class: 'view-title' }, title), sub ? h('p', { class: 'view-sub' }, sub) : null),
    right || null);
}

// ------------------------------------------------------------------ focus view

function primarySource() {
  const ev = S.eval;
  const session = ev.sources.find((s) => s.type === 'session');
  if (session) return session;
  return ev.sources.slice().sort((a, b) => b.endsAt - a.endsAt)[0] || null;
}

function ringModel() {
  const src = primarySource();
  if (!src) {
    const m = ui.setup.pomodoro ? ui.setup.pomo.work : ui.setup.minutes;
    return { time: fmtLeft(m * 60000), label: t('focus.readyShort'), sub: '', progress: 0, idle: true };
  }
  if (src.type === 'session') {
    const s = S.session;
    let total;
    let end;
    if (s.pomodoro) {
      total = (src.phase === 'work' ? s.pomodoro.work : s.pomodoro.brk) * 60000;
      end = src.phaseEndsAt;
    } else {
      total = s.endsAt - s.startedAt;
      end = s.endsAt;
    }
    const left = Math.max(0, end - S.now);
    const label = src.phase === 'break' ? t('focus.break') : s.pomodoro ? t('focus.round', { n: src.cycle, total: src.cycles }) : t('focus.session');
    return { time: fmtLeft(left), label, sub: t('focus.until', { time: fmtClock(end) }), progress: 1 - left / total, brk: src.phase === 'break' };
  }
  const sch = S.schedules.find((x) => x.id === src.id);
  const toMin = (s) => { const [a, b] = s.split(':').map(Number); return a * 60 + b; };
  let dur = sch ? (toMin(sch.end) - toMin(sch.start) + 1440) % 1440 : 60;
  if (dur === 0) dur = 1440;
  const left = Math.max(0, src.endsAt - S.now);
  return { time: fmtLeft(left), label: src.name || t('focus.scheduled'), sub: t('focus.until', { time: fmtClock(src.endsAt) }), progress: Math.min(1, 1 - left / (dur * 60000)) };
}

const RING_R = 130;
const RING_C = 2 * Math.PI * RING_R;
function renderRing() {
  const m = ringModel();
  const wrap = h('div', { class: `ring-wrap ${m.idle ? 'idle' : 'active'}` });
  const ticks = Array.from({ length: 60 }, (_, i) => {
    const a = (i / 60) * Math.PI * 2;
    const r1 = 146;
    const r2 = i % 5 === 0 ? 140 : 143;
    return `<line x1="${150 + r1 * Math.cos(a)}" y1="${150 + r1 * Math.sin(a)}" x2="${150 + r2 * Math.cos(a)}" y2="${150 + r2 * Math.sin(a)}"/>`;
  }).join('');
  wrap.innerHTML = `<svg viewBox="0 0 300 300"><defs><linearGradient id="ringGrad" x1="0" y1="0" x2="1" y2="1"><stop offset="0" style="stop-color:var(--accent)"/><stop offset="1" style="stop-color:var(--accent-2)"/></linearGradient></defs><g class="ring-ticks">${ticks}</g><circle class="ring-track" cx="150" cy="150" r="${RING_R}"/><circle class="ring-prog" data-live="ring" cx="150" cy="150" r="${RING_R}" stroke-dasharray="${RING_C}" stroke-dashoffset="${RING_C * (1 - m.progress)}"/></svg>`;
  wrap.append(
    h('div', { class: 'ring-orbit' }),
    h('div', { class: 'ring-center' },
      h('div', { class: 'ring-time', 'data-live': 'ring-time' }, m.time),
      h('div', { class: 'ring-label' }, m.label),
      m.sub ? h('div', { class: 'ring-sub' }, m.sub) : null),
  );
  return wrap;
}

function updateLive() {
  if (!S) return;
  const ev = S.eval;
  const session = ev.sources.find((s) => s.type === 'session');
  const side = document.querySelector('[data-live="side-left"]');
  if (side) side.textContent = ringModel().time;
  if (ui.view === 'focus') {
    const m = ringModel();
    const tEl = document.querySelector('[data-live="ring-time"]');
    if (tEl) tEl.textContent = m.time;
    const ring = document.querySelector('[data-live="ring"]');
    if (ring) ring.setAttribute('stroke-dashoffset', String(RING_C * (1 - m.progress)));
  }
}

function minutesChips() {
  const s = ui.setup;
  const set = (m) => { s.minutes = m; s.custom = false; s.pomodoro = false; renderAll(); };
  return h('div', { class: 'row' },
    [25, 50, 90, 120].map((m) => h('button', { class: `chip${!s.pomodoro && !s.custom && s.minutes === m ? ' on' : ''}`, onclick: () => set(m) },
      m < 60 ? `${m} ${t('focus.minutes')}` : m % 60 ? `${Math.floor(m / 60)}${t('focus.hours')} ${m % 60}` : `${m / 60} ${t('focus.hours')}`)),
    h('button', { class: `chip${!s.pomodoro && s.custom ? ' on' : ''}`, onclick: () => { s.custom = true; s.pomodoro = false; renderAll(); } }, t('focus.custom')),
    !s.pomodoro && s.custom ? h('span', { class: 'row', style: { gap: '6px' } },
      h('input', { class: 'input num', type: 'number', min: 1, max: 1440, value: s.minutes, 'data-fid': 'custom-min', oninput: (e) => { s.minutes = Math.max(1, Math.min(1440, Number(e.target.value) || 1)); updateLive(); } }),
      h('span', { class: 'muted small' }, t('focus.minutes'))) : null,
    h('button', { class: `chip${s.pomodoro ? ' on' : ''}`, onclick: () => { s.pomodoro = !s.pomodoro; renderAll(); } }, icon('timer'), t('focus.pomodoro')));
}

function pomoBox() {
  const p = ui.setup.pomo;
  const num = (key, min, max) => h('input', { class: 'input num', type: 'number', min, max, value: p[key], 'data-fid': `pomo-${key}`, oninput: (e) => { p[key] = Math.max(min, Math.min(max, Number(e.target.value) || min)); } });
  return h('div', { class: 'pomo-box' },
    h('label', { class: 'field' }, t('focus.work'), num('work', 1, 240)),
    h('label', { class: 'field' }, t('focus.brk'), num('brk', 0, 120)),
    h('label', { class: 'field' }, t('focus.cycles'), num('cycles', 1, 24)),
    h('span', { class: 'muted small', style: { alignSelf: 'flex-end', paddingBottom: '10px' } }, t('focus.minutes')));
}

function modeCards(current, onPick) {
  return h('div', { class: 'mode-cards' }, ['flexible', 'patient', 'strict'].map((m) => h('button', { class: `mode-card${current === m ? ' on' : ''}`, onclick: () => onPick(m) },
    h('div', { class: 'mc-top' }, icon(modeIcon(m)), t(`mode.${m}`)),
    h('p', null, t(`mode.${m}Sub`, { s: S.settings.patientDelaySec })))));
}

function listChips(selected, onToggle) {
  return h('div', { class: 'row' }, S.lists.map((l) => h('button', { class: `chip${selected.includes(l.id) ? ' on' : ''}`, onclick: () => onToggle(l.id) },
    h('span', { class: 'emoji' }, l.emoji), l.name, h('small', null, String(l.sites.length + appsHere(l).length)))));
}

async function startFocus() {
  const s = ui.setup;
  if (!s.listIds.length) { toast(t('focus.noLists'), 'error'); return; }
  const r = await api.startSession({ listIds: s.listIds, minutes: s.minutes, mode: s.mode, pomodoro: s.pomodoro ? s.pomo : null, goal: s.goal });
  if (r.state) applyState(r.state);
  if (!r.ok) toast(t(`err.${r.error === 'noLists' ? 'generic' : r.error || 'generic'}`), 'error');
  else chime(true);
}

function renderFocus() {
  const ev = S.eval;
  const parts = [];
  const active = ev.sources.length > 0;
  const session = ev.sources.find((s) => s.type === 'session');
  const onBreak = session && session.phase === 'break';
  parts.push(head(new Date(S.now).toLocaleDateString(S.lang, { weekday: 'long', month: 'long', day: 'numeric' }),
    active ? (onBreak ? t('focus.break') : t('focus.on')) : t('focus.ready'),
    active ? (onBreak ? t('focus.breakSub') : t('focus.blockingCount', { sites: ev.sitesCount, apps: ev.appsCount })) : t('focus.readySub')));

  if (isMobile()) {
    const miss = missingRequired();
    if (miss.length) {
      parts.push(h('div', { class: 'banner' }, icon('shield'),
        h('div', { class: 'b-text' }, h('b', null, t('perm.needed', { n: miss.length })), h('span', null, t('perm.neededSub'))),
        h('button', { class: 'btn primary', onclick: openPermissions }, t('perm.setup'))));
    } else if (permState().privateDns) {
      parts.push(h('div', { class: 'banner' }, icon('globe'),
        h('div', { class: 'b-text' }, h('b', null, t('perm.privateDns')), h('span', null, t('perm.privateDnsSub', { host: permState().privateDns }))),
        h('button', { class: 'btn primary', onclick: () => requestPerm('privateDns') }, t('perm.open'))));
    } else if (!permState().vpn && S.lists.some((l) => l.sites.length)) {
      parts.push(h('div', { class: 'banner' }, icon('globe'),
        h('div', { class: 'b-text' }, h('b', null, t('perm.webOff')), h('span', null, t('perm.webOffSub'))),
        h('button', { class: 'btn primary', onclick: () => requestPerm('vpn') }, t('perm.allow'))));
    }
  }
  if (S.helper.supported && !S.helper.installed) {
    parts.push(h('div', { class: 'banner' }, icon('globe'),
      h('div', { class: 'b-text' }, h('b', null, t('helper.title')), h('span', null, t('helper.sub'))),
      h('button', { class: 'btn primary', onclick: installHelper }, icon('shield'), t('helper.enable'))));
  }

  const right = h('div', { class: 'setup' });
  if (!active) {
    const s = ui.setup;
    right.append(
      h('div', { class: 'setup-sec' }, h('div', { class: 'eyebrow' }, t('coach.goal')),
        h('div', { class: 'row', style: { flexWrap: 'nowrap' } },
          h('input', { class: 'input', placeholder: t('coach.goalPh'), value: s.goal, maxlength: 80, 'data-fid': 'goal', oninput: (e) => { s.goal = e.target.value; }, onkeydown: (e) => { if (e.key === 'Enter') smartSetup(); } }),
          h('button', { class: 'btn', onclick: smartSetup }, icon('sparkle'), t('coach.suggest'))),
        s.reason ? h('div', { class: 'coach-note' }, icon('sparkle'), h('span', null, s.reason), s.reasonSource === 'ai' ? h('span', { class: 'badge' }, t('coach.ai')) : null) : null),
      h('div', { class: 'setup-sec' }, h('div', { class: 'eyebrow' }, t('focus.duration')), minutesChips(), s.pomodoro ? pomoBox() : null),
      h('div', { class: 'setup-sec' }, h('div', { class: 'eyebrow' }, t('focus.lists')),
        listChips(s.listIds, (id) => { s.listIds = s.listIds.includes(id) ? s.listIds.filter((x) => x !== id) : [...s.listIds, id]; renderAll(); })),
      h('div', { class: 'setup-sec' }, h('div', { class: 'eyebrow' }, t('focus.mode')), modeCards(s.mode, (m) => { s.mode = m; renderAll(); })),
      h('div', { class: 'row' }, h('button', { class: 'btn accent big', onclick: startFocus }, icon('play'), t('focus.start')),
        ev.next ? h('span', { class: 'muted small' }, t('focus.next', { name: ev.next.name, when: fmtWhen(ev.next.at) })) : null),
    );
  } else {
    right.append(h('div', { class: 'sources' }, ev.sources.map((src) => h('div', { class: 'source' },
      icon(src.type === 'session' ? (src.phase === 'break' ? 'coffee' : 'timer') : src.type === 'limit' ? 'hourglass' : 'schedules'),
      h('div', { class: 'spacer' }, h('b', null, src.type === 'session' ? (src.pomodoro ? `${t('focus.pomodoro')} · ${t('focus.round', { n: src.cycle, total: src.cycles })}` : t('focus.session')) : src.type === 'limit' ? `${t('lim.source')}: ${src.name}` : src.name),
        h('div', { class: 'muted small' }, t('focus.until', { time: fmtClock(src.endsAt) }))),
      h('span', { class: `badge ${src.mode}` }, t(`mode.${src.mode}`))))));
    const lists = ev.listIds.map(listById).filter(Boolean);
    if (lists.length) right.append(h('div', { class: 'row' }, lists.map((l) => h('span', { class: 'mini-tag' }, `${l.emoji} ${l.name}`))));
    right.append(h('div', { class: 'row' },
      session ? h('button', { class: 'btn', onclick: async () => { const r = await api.extendSession({ minutes: 15 }); if (r.state) applyState(r.state); } },
        icon('plus'), S.session && S.session.pomodoro ? `+1 ${t('focus.cycles').toLowerCase()}` : t('focus.extend', { m: 15 })) : null,
      h('button', { class: 'btn danger', onclick: openUnlock }, icon(modeIcon(ev.mode)), t('focus.stop'))));
    if (S.helper.installed && ev.blocking && ev.sitesCount) {
      right.append(S.helper.verified
        ? h('span', { class: 'okline' }, icon('check'), t('helper.ok'))
        : h('span', { class: 'muted small' }, t('helper.unverified')));
    }
  }

  parts.push(h('div', { class: 'card focus-hero' }, renderRing(), right));
  parts.push(soundBar());

  const st = S.stats;
  const fm = fmtMinutes(st.todayMinutes);
  parts.push(h('div', { class: 'grid g3', style: { marginTop: '16px' } },
    h('div', { class: 'card kpi' }, h('div', { class: 'kpi-num' }, String(fm.n), h('small', null, fm.u)), h('div', { class: 'kpi-label' }, icon('clock'), t('today.focus'))),
    h('div', { class: 'card kpi' }, h('div', { class: 'kpi-num' }, String(st.todayBlocks)), h('div', { class: 'kpi-label' }, icon('shield'), t('today.blocks'))),
    h('div', { class: 'card kpi' }, h('div', { class: 'kpi-num' }, String(st.streak)), h('div', { class: 'kpi-label' }, icon('flame'), t('today.streak')))));
  if (!active && (S.insights || []).length) parts.push(insightsCard(S.insights.slice(0, 2)));
  return parts;
}

async function smartSetup() {
  const s = ui.setup;
  const r = await api.coachSuggest({ goal: s.goal });
  if (!r || !r.ok) return;
  s.listIds = r.listIds;
  s.mode = r.mode;
  if (r.pomodoro) { s.pomodoro = true; s.pomo = { ...r.pomodoro }; } else { s.pomodoro = false; s.minutes = r.minutes || 50; s.custom = ![25, 50, 90, 120].includes(s.minutes); }
  s.reason = r.reason;
  s.reasonSource = r.source;
  renderAll();
}

function insightsCard(list) {
  return h('div', { class: 'card', style: { marginTop: '16px' } },
    h('div', { class: 'card-head' }, h('div', { class: 'card-title row', style: { gap: '8px' } }, icon('sparkle'), t('ins.title'))),
    h('div', { class: 'stack' }, list.map((ins) => h('div', { class: 'insight' },
      h('span', { class: 'spacer' }, ins.text),
      ins.action ? h('button', { class: 'btn sm primary', onclick: async () => {
        if (ins.action.type === 'startFocus') { ui.setup.pomodoro = false; ui.setup.custom = false; ui.setup.minutes = 25; await startFocus(); return; }
        const r = await api.applyInsight({ id: ins.id });
        if (r.state) applyState(r.state);
        toast(r.ok ? t('ok.saved') : t('err.generic'), r.ok ? 'ok' : 'error');
      } }, ins.action.type === 'startFocus' ? t('ins.start') : t('ins.apply')) : null))));
}

// ------------------------------------------------------------------ unlock flow

async function openUnlock() {
  const ev = S.eval;
  if (!ev.sources.length) return;
  let pin;
  if (S.settings.hasPin) {
    pin = await askPin();
    if (pin == null) return;
  }
  const cl = await api.coachLine();
  ui.coach = cl && cl.text ? cl : null;
  if (ev.mode === 'flexible') {
    openModal((self) => [
      modalHead(t('unlock.title'), () => self.close()),
      coachBlock(),
      h('p', { class: 'muted' }, t('unlock.flexible')),
      h('div', { class: 'modal-foot', style: { alignItems: 'center' } },
        h('button', { class: 'btn sm', onclick: async () => { const r = await api.unlockRequest({ pin }); self.close(); handleUnlockResult(r); } }, t('coach.stopAnyway')),
        h('span', { class: 'spacer' }),
        h('button', { class: 'btn accent big', onclick: () => { self.close(); chime(true); } }, icon('shield'), t('coach.stay'))),
    ]);
    return;
  }
  const r = await api.unlockRequest({ pin });
  if (handleUnlockResult(r)) return;
  if (r.status === 'wait') { applyState(await api.getState()); openWaitModal(); }
  else if (r.status === 'locked') openLockedModal(r, pin);
}

function coachBlock() {
  if (!ui.coach) return null;
  return h('div', { class: 'coach' }, h('div', { class: 'coach-ic' }, icon('flame')), h('div', null, h('b', null, ui.coach.text),
    ui.coach.streak ? h('div', { class: 'muted small' }, `${t('today.streak')}: ${ui.coach.streak}`) : null));
}

function handleUnlockResult(r) {
  if (r.status === 'stopped') { toast(t('focus.stop')); chime(false); api.getState().then(applyState); return true; }
  if (r.status === 'pin') { toast(t('unlock.pinWrong'), 'error'); return true; }
  return false;
}

function openWaitModal() {
  const openedAt = Date.now();
  openModal((self) => {
    const u = S.unlock;
    const cd = h('div', { class: 'countdown' });
    const info = h('p', { class: 'muted', style: { textAlign: 'center' } });
    const btn = h('button', { class: 'btn sm', onclick: async () => { const r = await api.unlockConfirm({}); self.close(); if (!handleUnlockResult(r)) toast(t('err.generic'), 'error'); } }, t('coach.stopAnyway'));
    self.live = () => {
      const p = S.unlock;
      if (!p) { if (Date.now() - openedAt > 3000) self.close(); return; }
      const ready = S.now >= p.readyAt;
      cd.textContent = ready ? '✓' : fmtLeft(p.readyAt - S.now);
      info.textContent = ready ? t('unlock.ready', { t: fmtLeft(p.expiresAt - S.now) }) : t('unlock.waitSub');
      btn.disabled = !ready;
    };
    if (u) self.live();
    return [modalHead(t('unlock.waitTitle'), () => { api.unlockCancel(); self.close(); }), coachBlock(), info, cd,
      h('div', { class: 'modal-foot', style: { alignItems: 'center' } }, btn, h('span', { class: 'spacer' }), h('button', { class: 'btn accent', onclick: () => { api.unlockCancel(); self.close(); } }, icon('shield'), t('coach.stay')))];
  });
}

function openLockedModal(r, pin) {
  openModal((self) => [
    modalHead(t('unlock.lockedTitle', { time: fmtClock(r.endsAt) }), () => self.close()),
    coachBlock(),
    h('p', { class: 'muted' }, t('unlock.lockedSub')),
    h('div', { class: 'modal-foot' },
      h('button', { class: 'btn danger', onclick: async () => { const e = await api.unlockEmergency({ pin }); self.close(); if (!handleUnlockResult(e) && e.status === 'challenge') openChallengeModal(); } }, icon('key'), t('unlock.emergency')),
      h('button', { class: 'btn primary', onclick: () => self.close() }, t('unlock.cancel'))),
  ]);
}

function openChallengeModal() {
  let typed = '';
  openModal((self) => {
    const cd = h('span', { class: 'muted small' });
    const btn = h('button', { class: 'btn danger', onclick: async () => {
      const r = await api.unlockConfirm({ challenge: typed });
      if (handleUnlockResult(r)) self.close(); else toast(t('unlock.mismatch'), 'error');
    } }, icon('unlock'), t('unlock.unlock'));
    const block = (e) => e.preventDefault();
    const area = h('textarea', {
      class: 'input', rows: 4, placeholder: t('unlock.typeHere'), spellcheck: 'false', autocomplete: 'off',
      onpaste: block, ondrop: block, oncontextmenu: block,
      oninput: (e) => { typed = e.target.value; self.live(); },
    });
    self.live = () => {
      const p = S.unlock;
      if (!p || p.kind !== 'challenge') { self.close(); return; }
      const ready = S.now >= p.readyAt;
      cd.textContent = ready ? '' : t('unlock.wait', { t: fmtLeft(p.readyAt - S.now) });
      btn.disabled = !(ready && typed === p.challenge);
    };
    const ch = S.unlock && S.unlock.challenge;
    setTimeout(() => self.live(), 0);
    return [modalHead(t('unlock.emergency'), () => self.close()),
      h('p', { class: 'muted' }, t('unlock.emergencySub')),
      h('div', { class: 'challenge' }, ch || ''),
      h('div', { style: { marginTop: '12px' } }, area),
      h('div', { class: 'modal-foot', style: { alignItems: 'center' } }, cd, h('span', { class: 'spacer' }), h('button', { class: 'btn', onclick: () => self.close() }, t('unlock.cancel')), btn)];
  });
}

// ------------------------------------------------------------------ helper install

async function installHelper() {
  const r = await api.installHelper();
  if (r.state) applyState(r.state);
  if (r.ok) toast(t('ok.helper'));
  else if (!r.cancelled) toast(t('err.generic'), 'error');
  return r.ok;
}

// ------------------------------------------------------------------ lists view

const EMOJIS = ['📱', '🎬', '🎮', '💬', '📰', '🛍️', '🎧', '⛔', '🧠', '📚', '💼', '🌙', '🔥', '🍿', '🎲', '🧩'];

function renderLists() {
  const used = new Set(S.lists.map((l) => l.presetId).filter(Boolean));
  const avail = ui.presets.filter((p) => !used.has(p.id));
  const grid = h('div', { class: 'list-grid' },
    S.lists.map((l) => h('button', { class: 'card list-card', onclick: () => openListEditor(l.id) },
      h('div', { class: 'lc-emoji' }, l.emoji),
      h('div', { class: 'lc-name' }, l.name),
      h('div', { class: 'lc-meta' }, t('lists.count', { sites: l.sites.length, apps: appsHere(l).length })),
      l.limitMin > 0 ? h('div', { class: 'lim-bar' }, h('span', { style: { width: `${Math.min(100, ((S.usage[l.id] || 0) / 60 / l.limitMin) * 100)}%` } }),
        h('em', null, t('lim.today', { used: Math.floor((S.usage[l.id] || 0) / 60), max: l.limitMin }))) : null,
      h('div', { class: 'lc-icons' }, [...l.sites.slice(0, 3), ...appsHere(l).slice(0, 2).map((a) => a.name)].map((x) => h('span', { class: 'mini-tag' }, x))))),
    h('button', { class: 'card list-card add', onclick: newList }, icon('plus'), t('lists.new')));
  const out = [head(t('nav.lists'), t('lists.title'), t('lists.sub')), grid];
  if (avail.length) {
    out.push(h('div', { class: 'card', style: { marginTop: '16px' } },
      h('div', { class: 'card-head' }, h('div', { class: 'card-title' }, t('lists.fromPreset'))),
      h('div', { class: 'row' }, avail.map((p) => h('button', { class: 'chip', onclick: () => addPreset(p) }, h('span', { class: 'emoji' }, p.emoji), p.name[S.lang] || p.name.en, icon('plus'))))));
  }
  return out;
}

function newId() { return (crypto.randomUUID && crypto.randomUUID()) || `l${Date.now()}${Math.random().toString(16).slice(2)}`; }

async function newList() {
  const id = newId();
  const r = await patchConfig({ lists: [...S.lists, { id, name: t('lists.untitled'), emoji: '⛔', sites: [], apps: [] }] });
  if (r.ok) openListEditor(id);
}

async function addPreset(p) {
  const id = newId();
  await patchConfig({ lists: [...S.lists, { id, presetId: p.id, name: p.name[S.lang] || p.name.en, emoji: p.emoji, sites: [...p.sites], apps: p.apps.map((a) => ({ ...a })) }] });
}

function saveList(updated) {
  return patchConfig({ lists: S.lists.map((l) => (l.id === updated.id ? updated : l)) });
}

function openListEditor(id) {
  let siteInput = '';
  openModal((self) => {
    const l = listById(id);
    if (!l) { setTimeout(() => self.close()); return []; }
    const clone = () => JSON.parse(JSON.stringify(listById(id)));
    const addSites = async () => {
      const raw = siteInput.split(/[\s,;]+/).filter(Boolean);
      if (!raw.length) return;
      const norm = await api.normalizeSites(raw);
      const c = clone();
      c.sites = [...new Set([...c.sites, ...norm])];
      siteInput = '';
      await saveList(c);
      self.render();
      const i = self.box.querySelector('[data-fid="site-in"]'); if (i) i.focus();
    };
    return [
      modalHead(`${l.emoji} ${l.name}`, () => self.close()),
      h('div', { class: 'stack' },
        h('label', { class: 'field' }, t('lists.name'),
          h('input', { class: 'input', value: l.name, maxlength: 60, onchange: async (e) => { const c = clone(); c.name = e.target.value.trim() || l.name; await saveList(c); self.render(); } })),
        h('div', { class: 'emoji-row' }, EMOJIS.map((em) => h('button', { class: em === l.emoji ? 'on' : '', onclick: async () => { const c = clone(); c.emoji = em; await saveList(c); self.render(); } }, em))),
        h('div', { class: 'row', style: { flexWrap: 'nowrap', alignItems: 'flex-end' } },
          h('label', { class: 'field', style: { flex: 1 } }, t('lim.title'),
            h('select', { class: 'select', onchange: async (e) => { const c = clone(); c.limitMin = Number(e.target.value); await saveList(c); self.render(); } },
              [0, 15, 30, 45, 60, 90, 120, 180].map((m) => h('option', { value: m, selected: (l.limitMin || 0) === m }, m ? t('lim.min', { m }) : t('lim.none'))))),
          l.limitMin > 0 ? h('div', { class: 'muted small', style: { paddingBottom: '10px' } }, t('lim.today', { used: Math.floor((S.usage[l.id] || 0) / 60), max: l.limitMin })) : null),
        h('div', { class: 'muted small' }, t(isMobile() ? 'lim.hintMobile' : 'lim.hint')),
        h('hr', { class: 'sep' }),
        h('div', { class: 'row' }, icon('globe'), h('b', null, t('lists.sites')), h('span', { class: 'muted small' }, String(l.sites.length))),
        h('div', { class: 'row', style: { flexWrap: 'nowrap' } },
          h('input', { class: 'input', placeholder: t('lists.addSite'), 'data-fid': 'site-in', value: siteInput, oninput: (e) => { siteInput = e.target.value; }, onkeydown: (e) => { if (e.key === 'Enter') addSites(); } }),
          h('button', { class: 'btn primary', onclick: addSites }, t('lists.add'))),
        h('div', { class: 'muted small' }, t('lists.sitesHint')),
        l.sites.length ? h('div', { class: 'tags' }, l.sites.map((s) => h('span', { class: 'tag' }, s,
          h('button', { onclick: async () => { const c = clone(); c.sites = c.sites.filter((x) => x !== s); await saveList(c); self.render(); } }, icon('x'))))) : h('div', { class: 'muted small' }, t('lists.empty')),
        h('hr', { class: 'sep' }),
        h('div', { class: 'row' }, icon('grid'), h('b', null, t('lists.apps')), h('span', { class: 'muted small' }, String(appsHere(l).length)), h('span', { class: 'spacer' }),
          h('button', { class: 'btn sm', onclick: () => openAppPicker(id, () => self.render()) }, icon('plus'), t('lists.addApp'))),
        l.apps.length ? h('div', { class: 'tags' }, l.apps.map((a) => h('span', { class: 'tag' }, appBadge(a), a.name,
          h('button', { onclick: async () => { const c = clone(); c.apps = c.apps.filter((x) => x.name !== a.name); await saveList(c); self.render(); } }, icon('x'))))) : h('div', { class: 'muted small' }, t('lists.empty'))),
      h('div', { class: 'modal-foot' },
        h('button', { class: 'btn danger', onclick: async () => {
          if (!confirm(t('lists.confirmDelete', { name: l.name }))) return;
          const r = await patchConfig({ lists: S.lists.filter((x) => x.id !== id) });
          if (r.ok) self.close();
        } }, icon('trash'), t('lists.delete')),
        h('span', { class: 'spacer' }),
        h('button', { class: 'btn primary', onclick: () => self.close() }, t('lists.done'))),
    ];
  }, { wide: true });
}

function openAppPicker(listId, after) {
  let q = '';
  const picked = new Map();
  let loading = !ui.installed;
  const m = openModal((self) => {
    const l = listById(listId);
    const have = new Set((l ? appsHere(l) : []).map((a) => a.name.toLowerCase()));
    const apps = (ui.installed || []).filter((a) => !have.has(a.name.toLowerCase()) && a.name.toLowerCase().includes(q.toLowerCase()));
    const listEl = loading ? h('div', { class: 'muted', style: { padding: '30px', textAlign: 'center' } }, t('picker.loading'))
      : apps.length ? h('div', { class: 'app-list' }, apps.map((a) => h('button', {
        class: `app-item${picked.has(a.name) ? ' on' : ''}`,
        onclick: () => { if (picked.has(a.name)) picked.delete(a.name); else picked.set(a.name, a); self.render(); },
      }, a.icon ? h('img', { src: a.icon, alt: '' }) : h('span', { class: 'ph' }, a.name.slice(0, 1)), h('span', { class: 'nm' }, a.name),
      a.running ? h('span', { class: 'mini-tag' }, t('picker.running')) : null, h('span', { class: 'ck' }, picked.has(a.name) ? icon('check') : null))))
        : h('div', { class: 'muted', style: { padding: '30px', textAlign: 'center' } }, t('picker.none'));
    const add = async (items) => {
      const c = JSON.parse(JSON.stringify(listById(listId)));
      for (const a of items) {
        const have = c.apps.find((x) => x.name.toLowerCase() === a.name.toLowerCase());
        if (!have) c.apps.push({ name: a.name, mac: a.mac || [], win: a.win || [], ...(a.android ? { android: a.android } : {}) });
        else if (a.android) have.android = [...new Set([...(have.android || []), ...a.android])];
      }
      await saveList(c);
      self.close();
      if (after) after();
    };
    return [
      modalHead(t('picker.title'), () => self.close()),
      h('div', { class: 'row', style: { flexWrap: 'nowrap', marginBottom: '12px' } },
        h('input', { class: 'input', placeholder: t('picker.search'), value: q, 'data-fid': 'app-q', oninput: (e) => { q = e.target.value; self.render(); const i = self.box.querySelector('[data-fid="app-q"]'); i.focus(); i.setSelectionRange(q.length, q.length); } }),
        isMobile() ? null : h('button', { class: 'btn', onclick: async () => { const r = await api.browseApps(); if (r && r.length) add(r); } }, t('picker.browse'))),
      listEl,
      h('div', { class: 'modal-foot' },
        h('button', { class: 'btn', onclick: () => self.close() }, t('common.cancel')),
        h('button', { class: 'btn primary', disabled: picked.size === 0, onclick: () => add([...picked.values()]) }, `${t('lists.add')}${picked.size ? ` (${picked.size})` : ''}`)),
    ];
  }, { wide: true });
  if (loading) {
    api.installedApps({}).then((apps) => { ui.installed = apps; loading = false; m.render(); });
  }
}

// ------------------------------------------------------------------ schedules view

function weekTimeline() {
  const order = [1, 2, 3, 4, 5, 6, 0];
  const days = t('days.short');
  const now = new Date(S.now);
  const toMin = (s) => { const [a, b] = s.split(':').map(Number); return a * 60 + b; };
  const rows = [];
  for (const d of order) {
    const track = h('div', { class: 'track' });
    for (const s of S.schedules) {
      const st = toMin(s.start);
      const en = toMin(s.end);
      const segs = [];
      if (st === en) { if (s.days.includes(d)) segs.push([0, 1440]); } else if (st < en) { if (s.days.includes(d)) segs.push([st, en]); } else {
        if (s.days.includes(d)) segs.push([st, 1440]);
        if (s.days.includes((d + 6) % 7)) segs.push([0, en]);
      }
      for (const [a, b] of segs) track.append(h('div', { class: `bar${s.enabled ? '' : ' off'}`, style: { left: `${(a / 1440) * 100}%`, width: `${((b - a) / 1440) * 100}%` }, title: s.name }));
    }
    if (d === now.getDay()) track.append(h('div', { class: 'now', style: { left: `${((now.getHours() * 60 + now.getMinutes()) / 1440) * 100}%` } }));
    rows.push(h('div', { class: `wd${d === now.getDay() ? ' today' : ''}` }, days[d]), track);
  }
  rows.push(h('div', { class: 'hours' }, ['00', '04', '08', '12', '16', '20', '24'].map((x) => h('span', null, x))));
  return h('div', { class: 'card week' }, rows);
}

function renderSchedules() {
  const activeIds = new Set(S.eval.sources.map((s) => s.id));
  const days = t('days.short');
  const out = [head(t('nav.schedules'), t('sched.title'), t('sched.sub'), h('button', { class: 'btn primary', onclick: () => openScheduleEditor(null) }, icon('plus'), t('sched.new'))), weekTimeline()];
  const cards = S.schedules.map((s) => {
    const lists = s.listIds.map(listById).filter(Boolean);
    const dayText = [1, 2, 3, 4, 5, 6, 0].filter((d) => s.days.includes(d)).map((d) => days[d]).join(' ');
    const overnight = s.end <= s.start && s.start !== s.end;
    return h('div', { class: 'card sched-card' },
      h('label', { class: 'switch' }, h('input', { type: 'checkbox', checked: s.enabled, onchange: (e) => patchConfig({ schedules: S.schedules.map((x) => (x.id === s.id ? { ...x, enabled: e.target.checked } : x)) }) }), h('span')),
      h('div', { class: 'sc-main' },
        h('div', { class: 'sc-name' }, s.name, activeIds.has(s.id) ? h('span', { class: 'badge patient' }, t('sched.activeNow')) : null, h('span', { class: `badge ${s.mode}` }, t(`mode.${s.mode}`))),
        h('div', { class: 'sc-meta' }, `${dayText} · ${lists.map((l) => `${l.emoji} ${l.name}`).join(', ') || '—'}`)),
      h('div', { class: 'sc-time' }, s.start === s.end ? t('sched.allDay') : `${s.start}–${s.end}`, overnight ? h('div', { class: 'muted small', style: { fontWeight: 400 } }, t('sched.overnight')) : null),
      h('button', { class: 'btn sm', onclick: () => openScheduleEditor(s.id) }, t('common.edit')));
  });
  out.push(h('div', { class: 'stack', style: { marginTop: '16px' } }, cards.length ? cards : h('div', { class: 'card muted' }, t('sched.none'))));
  return out;
}

function openScheduleEditor(id) {
  const existing = id ? S.schedules.find((s) => s.id === id) : null;
  const d = existing ? JSON.parse(JSON.stringify(existing)) : { id: newId(), name: t('sched.untitled'), listIds: S.lists.slice(0, 1).map((l) => l.id), days: [1, 2, 3, 4, 5], start: '09:00', end: '17:00', mode: 'flexible', enabled: true };
  const days = t('days.short');
  openModal((self) => [
    modalHead(existing ? existing.name : t('sched.new'), () => self.close()),
    h('div', { class: 'stack' },
      h('label', { class: 'field' }, t('lists.name'), h('input', { class: 'input', value: d.name, maxlength: 60, oninput: (e) => { d.name = e.target.value; } })),
      h('div', { class: 'field' }, t('sched.days'), h('div', { class: 'daypick' }, [1, 2, 3, 4, 5, 6, 0].map((x) => h('button', {
        class: d.days.includes(x) ? 'on' : '', onclick: () => { d.days = d.days.includes(x) ? d.days.filter((y) => y !== x) : [...d.days, x]; self.render(); },
      }, days[x])))),
      h('div', { class: 'row' },
        h('label', { class: 'field' }, t('sched.from'), h('input', { class: 'input time', type: 'time', value: d.start, oninput: (e) => { d.start = e.target.value; } })),
        h('label', { class: 'field' }, t('sched.to'), h('input', { class: 'input time', type: 'time', value: d.end, oninput: (e) => { d.end = e.target.value; } }))),
      h('div', { class: 'field' }, t('sched.lists'), listChips(d.listIds, (lid) => { d.listIds = d.listIds.includes(lid) ? d.listIds.filter((x) => x !== lid) : [...d.listIds, lid]; self.render(); })),
      h('div', { class: 'field' }, t('sched.mode'), modeCards(d.mode, (m) => { d.mode = m; self.render(); }))),
    h('div', { class: 'modal-foot' },
      existing ? h('button', { class: 'btn danger', onclick: async () => { const r = await patchConfig({ schedules: S.schedules.filter((s) => s.id !== id) }); if (r.ok) self.close(); } }, icon('trash'), t('sched.delete')) : null,
      h('span', { class: 'spacer' }),
      h('button', { class: 'btn', onclick: () => self.close() }, t('common.cancel')),
      h('button', { class: 'btn primary', onclick: async () => {
        const next = existing ? S.schedules.map((s) => (s.id === id ? d : s)) : [...S.schedules, d];
        const r = await patchConfig({ schedules: next });
        if (r.ok) { self.close(); toast(t('ok.saved')); }
      } }, t('common.save'))),
  ], { wide: true });
}

// ------------------------------------------------------------------ stats view

function renderStats() {
  const st = S.stats;
  const max = Math.max(30, ...st.last7.map((d) => d.minutes));
  const days = t('days.short');
  const today = st.last7[st.last7.length - 1].day;
  const fm = fmtMinutes(st.todayMinutes);
  const wk = fmtMinutes(st.weekMinutes);
  const topMax = Math.max(1, ...st.top.map((x) => x.count));
  return [
    head(t('nav.stats'), t('stats.title'), t('stats.sub')),
    (S.insights || []).length ? h('div', { style: { marginBottom: '16px', marginTop: '-16px' } }, insightsCard(S.insights)) : null,
    h('div', { class: 'grid g4' },
      h('div', { class: 'card kpi' }, h('div', { class: 'kpi-num' }, String(fm.n), h('small', null, fm.u)), h('div', { class: 'kpi-label' }, icon('clock'), t('today.focus'))),
      h('div', { class: 'card kpi' }, h('div', { class: 'kpi-num' }, String(st.todayBlocks)), h('div', { class: 'kpi-label' }, icon('shield'), t('today.blocks'))),
      h('div', { class: 'card kpi' }, h('div', { class: 'kpi-num' }, String(st.streak)), h('div', { class: 'kpi-label' }, icon('flame'), t('today.streak'))),
      h('div', { class: 'card kpi' }, h('div', { class: 'kpi-num' }, String(st.totalHours).replace('.', S.lang === 'hu' ? ',' : '.'), h('small', null, t('stats.hours'))), h('div', { class: 'kpi-label' }, icon('bolt'), t('stats.total')))),
    h('div', { class: 'grid g2', style: { marginTop: '16px', gridTemplateColumns: '1.4fr 1fr' } },
      h('div', { class: 'card' },
        h('div', { class: 'card-head' }, h('div', { class: 'card-title' }, t('stats.week')), h('span', { class: 'muted small' }, `${wk.n} ${wk.u}`)),
        h('div', { class: 'bars' }, st.last7.map((d) => h('div', { class: `bar-col${d.day === today ? ' today' : ''}` },
          h('div', { class: 'v' }, d.minutes ? `${d.minutes}` : ''),
          h('div', { class: `b${d.minutes ? '' : ' zero'}`, style: { height: `${Math.max(3, (d.minutes / max) * 150)}px` } }),
          h('div', { class: 'd' }, days[d.weekday]))))),
      h('div', { class: 'card' },
        h('div', { class: 'card-head' }, h('div', { class: 'card-title' }, t('stats.top'))),
        st.top.length ? st.top.map((x) => h('div', { class: 'top-row' }, h('span', null, x.name), h('div', { class: 'tb' }, h('span', { style: { width: `${(x.count / topMax) * 100}%` } })), h('span', { class: 'n' }, String(x.count))))
          : h('p', { class: 'muted' }, t('stats.noBlocks')))),
  ];
}

// ------------------------------------------------------------------ settings view

function toggleRow(label, key, sub) {
  return h('div', { class: 'set-row' }, h('div', { class: 'label' }, label, sub ? h('small', null, sub) : null),
    h('label', { class: 'switch' }, h('input', { type: 'checkbox', checked: S.settings[key], onchange: (e) => patchConfig({ settings: { [key]: e.target.checked } }) }), h('span')));
}
function numRow(label, key, min, max, scale = 1) {
  return h('div', { class: 'set-row' }, h('div', { class: 'label' }, label),
    h('input', { class: 'input num', type: 'number', min, max, value: Math.round(S.settings[key] / scale), 'data-fid': `num-${key}`,
      onchange: (e) => patchConfig({ settings: { [key]: Math.max(min, Math.min(max, Number(e.target.value) || min)) * scale } }) }));
}

function themePicker(current, onPick, withCustom) {
  const builtIn = ['midnight', 'daylight', 'crt', 'onebit', 'vapor'].map((th) => h('button', { class: `theme-card${current === th ? ' on' : ''}`, onclick: () => onPick(th) },
    h('div', { class: `tp ${th}` }, h('i', { class: 'tp-ring' }), h('i', { class: 'tp-l1' }), h('i', { class: 'tp-l2' }), h('i', { class: 'tp-b' })),
    h('div', { class: 'tn' }, t(`theme.${th}`))));
  if (!withCustom) return h('div', { class: 'themes' }, builtIn);
  const custom = (S.customThemes || []).map((ct) => h('button', {
    class: `theme-card${current === `custom:${ct.id}` ? ' on' : ''}`,
    onclick: () => onPick(`custom:${ct.id}`),
    ondblclick: () => openStyleStudio(ct.id),
  }, h('div', { class: 'tp custom', style: ct.vars, 'data-effect': ct.effect }, h('i', { class: 'tp-ring' }), h('i', { class: 'tp-l1' }), h('i', { class: 'tp-l2' }), h('i', { class: 'tp-b' })),
  h('div', { class: 'tn row', style: { gap: '6px', flexWrap: 'nowrap' } }, h('span', { class: 'spacer', style: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, ct.name),
    h('span', { class: 'tp-edit', title: t('common.edit'), onclick: (e) => { e.stopPropagation(); openStyleStudio(ct.id); } }, icon('sparkle')))));
  const add = h('button', { class: 'theme-card new-style', onclick: () => openStyleStudio(null) },
    h('div', { class: 'tp new' }, icon('sparkle'), h('b', null, t('style.new')), h('small', null, t('style.newSub'))),
    h('div', { class: 'tn' }, t('style.new')));
  return h('div', { class: 'themes' }, builtIn, custom, add);
}

// ------------------------------------------------------------------ style studio

function stylePreview(theme) {
  const box = h('div', { class: 'style-preview', 'data-effect': theme.effect, 'data-font': theme.font, style: theme.vars });
  const C = 2 * Math.PI * 34;
  const ring = h('div', { class: 'sp-ring' });
  ring.innerHTML = `<svg viewBox="0 0 80 80"><circle cx="40" cy="40" r="34" fill="none" stroke="var(--ring-track)" stroke-width="6"/><circle cx="40" cy="40" r="34" fill="none" stroke="var(--accent)" stroke-width="6" stroke-linecap="round" stroke-dasharray="${C}" stroke-dashoffset="${C * 0.38}" transform="rotate(-90 40 40)"/></svg><span>24:59</span>`;
  box.append(h('div', { class: 'sp-in' },
    h('div', { class: 'sp-side' }, logo(20), h('div', { class: 'sp-nav on' }, icon('focus'), t('nav.focus')), h('div', { class: 'sp-nav' }, icon('lists'), t('nav.lists')), h('div', { class: 'sp-nav' }, icon('stats'), t('nav.stats'))),
    h('div', { class: 'sp-main' },
      h('div', { class: 'eyebrow' }, theme.name),
      h('div', { class: 'sp-title' }, t('focus.on')),
      h('div', { class: 'sp-row' }, ring,
        h('div', { class: 'stack', style: { gap: '8px' } },
          h('div', { class: 'row', style: { gap: '6px' } }, h('span', { class: 'chip on' }, '📱 Social'), h('span', { class: 'chip' }, '🎮 Games')),
          h('div', { class: 'row', style: { gap: '6px' } }, h('span', { class: 'btn accent sm' }, t('focus.start')), h('span', { class: 'btn sm' }, '+15'))),
      ),
      h('div', { class: 'card sp-card' }, h('b', null, '27'), h('span', { class: 'muted small' }, t('today.blocks'))))));
  return box;
}

function openStyleStudio(existingId) {
  const existing = existingId ? (S.customThemes || []).find((x) => x.id === existingId) : null;
  const st = { prompt: existing ? existing.prompt || existing.name : '', seed: 0, theme: existing ? { ...existing } : null, source: '', aiError: '', busy: false };
  let previewHost = null;
  const refreshPreview = () => { if (previewHost && st.theme) previewHost.replaceChildren(stylePreview(st.theme)); };
  const tune = async (patch) => {
    const next = { ...st.theme, ...patch, colors: { ...st.theme.colors, ...(patch.colors || {}) } };
    const r = await api.previewStyle({ theme: next });
    if (r.ok) { st.theme = { ...r.theme, id: st.theme.id }; refreshPreview(); }
  };
  openModal((self) => {
    const generate = async (seedBump) => {
      if (!st.prompt.trim()) { toast(t('style.empty'), 'error'); return; }
      st.busy = true; self.render();
      if (seedBump) st.seed += 1;
      const r = await api.generateStyle({ prompt: st.prompt, seed: st.seed });
      st.busy = false;
      if (r.ok) { st.theme = existing ? { ...r.theme, id: existing.id } : r.theme; st.source = r.source; st.aiError = r.aiError || ''; }
      self.render();
    };
    const th = st.theme;
    previewHost = h('div', { class: 'sp-host' }, th ? stylePreview(th) : h('div', { class: 'sp-empty' }, icon('sparkle'), t('style.empty')));
    const color = (key, label) => h('label', { class: 'field color-field' }, label,
      h('input', { type: 'color', value: th.colors[key], oninput: (e) => tune({ colors: { [key]: e.target.value } }) }));
    return [
      modalHead(t('style.title'), () => self.close()),
      h('div', { class: 'studio' },
        h('div', { class: 'studio-left stack' },
          h('textarea', { class: 'input', rows: 3, maxlength: 200, placeholder: t('style.prompt'), value: st.prompt, 'data-fid': 'style-prompt', oninput: (e) => { st.prompt = e.target.value; }, onkeydown: (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); generate(); } } }),
          h('div', { class: 'row', style: { gap: '6px' } }, t('style.ex').map((ex) => h('button', { class: 'chip sm-chip', onclick: () => { st.prompt = ex; st.seed = 0; generate(); } }, ex))),
          h('div', { class: 'row' },
            h('button', { class: 'btn accent', disabled: st.busy, onclick: () => generate() }, icon('sparkle'), st.busy ? '…' : t('style.generate')),
            th ? h('button', { class: 'btn', disabled: st.busy, onclick: () => generate(true) }, t('style.again')) : null),
          h('div', { class: 'muted small' }, st.source === 'ai' ? `✦ ${t('style.sourceAi')}` : st.source === 'offline' ? (st.aiError ? t('style.aiFallback') : t('style.sourceOffline')) : (S.settings.hasAiKey ? t('ai.active', { model: S.aiModel }) : t('style.aiHint'))),
          th ? h('div', { class: 'stack tune' },
            h('div', { class: 'eyebrow' }, t('style.tune')),
            h('label', { class: 'field' }, t('style.name'), h('input', { class: 'input', value: th.name, maxlength: 40, onchange: (e) => tune({ name: e.target.value }) })),
            h('div', { class: 'color-row' }, color('bg', t('style.bg')), color('text', t('style.text')), color('accent', t('style.accent')), color('accent2', t('style.accent2'))),
            h('div', { class: 'row', style: { flexWrap: 'nowrap' } },
              h('label', { class: 'field', style: { flex: 1 } }, t('style.font'), h('select', { class: 'select', onchange: (e) => tune({ font: e.target.value }) }, ['sans', 'pixel', 'mono', 'serif'].map((f) => h('option', { value: f, selected: th.font === f }, t(`font.${f}`))))),
              h('label', { class: 'field', style: { flex: 1 } }, t('style.effect'), h('select', { class: 'select', onchange: (e) => tune({ effect: e.target.value }) }, ['aurora', 'grid', 'scanlines', 'sunset', 'stars', 'dots', 'none'].map((f) => h('option', { value: f, selected: th.effect === f }, t(`fx.${f}`)))))),
            h('label', { class: 'field' }, `${t('style.radius')}`, h('input', { type: 'range', min: 0, max: 28, value: th.radius, oninput: (e) => tune({ radius: Number(e.target.value) }) }))) : null),
        h('div', { class: 'studio-right' }, previewHost)),
      h('div', { class: 'modal-foot' },
        existing ? h('button', { class: 'btn danger', onclick: async () => { const r = await api.deleteStyle({ id: existing.id }); if (r.state) applyState(r.state); self.close(); } }, icon('trash'), t('style.delete')) : null,
        h('span', { class: 'spacer' }),
        h('button', { class: 'btn', onclick: () => self.close() }, t('common.cancel')),
        h('button', { class: 'btn primary', disabled: !th, onclick: async () => {
          const r = await api.saveStyle({ theme: st.theme, apply: true });
          if (r.state) applyState(r.state);
          if (r.ok) { toast(t('style.saved')); self.close(); } else toast(t(`err.${r.error || 'generic'}`), 'error');
        } }, t('style.saveApply'))),
    ];
  }, { wide: true, xwide: true });
}

async function pinFlow(remove) {
  let current = '';
  if (S.settings.hasPin) { current = await askPin(t('set.pinCurrent')); if (current == null) return; }
  let next = '';
  if (!remove) { next = await askPin(t('set.pinNew')); if (next == null) return; if (next.length < 4) { toast(t('set.pinNew'), 'error'); return; } }
  const r = await api.setPin({ current, next });
  if (r.state) applyState(r.state);
  toast(r.ok ? t('ok.saved') : t(`err.${r.error || 'generic'}`), r.ok ? 'ok' : 'error');
}

function renderSettings() {
  const s = S.settings;
  const helperBlock = !S.helper.supported ? h('p', { class: 'muted' }, '—')
    : S.helper.installed
      ? h('div', { class: 'set-row' }, h('div', { class: 'label' }, h('span', { class: 'okline' }, icon('check'), t('helper.ok'))), h('button', { class: 'btn sm', onclick: async () => { const r = await api.uninstallHelper(); if (r.state) applyState(r.state); if (!r.ok && r.error) toast(t(`err.${r.error}`), 'error'); } }, t('helper.remove')))
      : h('div', { class: 'set-row' }, h('div', { class: 'label' }, t('helper.off'), h('small', null, t('helper.sub'))), h('button', { class: 'btn primary', onclick: installHelper }, icon('shield'), t('helper.enable')));
  return [
    head(t('nav.settings'), t('set.title'), null),
    h('div', { class: 'stack' },
      accountCard(),
      h('div', { class: 'card' }, h('div', { class: 'card-head' }, h('div', { class: 'card-title' }, t('set.appearance'))),
        themePicker(s.theme, (th) => patchConfig({ settings: { theme: th } }), true),
        h('div', { class: 'set-row', style: { marginTop: '8px' } }, h('div', { class: 'label' }, t('set.language')),
          h('select', { class: 'select', style: { width: '200px' }, onchange: (e) => patchConfig({ settings: { lang: e.target.value } }) },
            [['auto', t('set.auto')], ['hu', 'Magyar'], ['en', 'English']].map(([v, n]) => h('option', { value: v, selected: s.lang === v }, n))))),
      aiCard(),
      isMobile()
        ? h('div', { class: 'card' }, h('div', { class: 'card-head' }, h('div', { class: 'card-title' }, t('perm.title'))), h('p', { class: 'muted', style: { marginTop: 0 } }, t('perm.sub')), permRows())
        : h('div', { class: 'card' }, h('div', { class: 'card-head' }, h('div', { class: 'card-title' }, t('set.web'))), helperBlock),
      h('div', { class: 'card' }, h('div', { class: 'card-head' }, h('div', { class: 'card-title' }, t('set.behavior'))),
        isMobile() ? null : toggleRow(t('set.login'), 'launchAtLogin'), isMobile() ? null : toggleRow(t('set.overlay'), 'showOverlay'),
        toggleRow(t('set.notifications'), 'notifications'), toggleRow(t('set.sound'), 'sound')),
      h('div', { class: 'card' }, h('div', { class: 'card-head' }, h('div', { class: 'card-title' }, t('set.unlock'))),
        numRow(t('set.patientDelay'), 'patientDelaySec', 10, 3600), numRow(t('set.emergencyDelay'), 'emergencyDelaySec', 1, 120, 60), numRow(t('set.challenge'), 'challengeLength', 30, 600),
        toggleRow(t(isMobile() ? 'set.toolsMobile' : 'set.tools'), 'strictBlocksTools')),
      h('div', { class: 'card' }, h('div', { class: 'card-head' }, h('div', { class: 'card-title' }, t('set.pin'))),
        h('p', { class: 'muted', style: { marginTop: 0 } }, t('set.pinSub')),
        h('div', { class: 'row' }, h('button', { class: 'btn', onclick: () => pinFlow(false) }, icon('key'), s.hasPin ? t('set.pinChange') : t('set.pinSet')),
          s.hasPin ? h('button', { class: 'btn danger', onclick: () => pinFlow(true) }, t('set.pinRemove')) : null)),
      isMobile() ? null : h('div', { class: 'card' }, h('div', { class: 'card-head' }, h('div', { class: 'card-title' }, t('set.data'))),
        h('p', { class: 'muted', style: { marginTop: 0 } }, t('set.dataSub')),
        h('div', { class: 'row' },
          h('button', { class: 'btn', onclick: () => api.exportConfig() }, icon('download'), t('set.export')),
          h('button', { class: 'btn', onclick: async () => { const r = await api.importConfig({}); if (r.state) applyState(r.state); if (r.ok) toast(t('ok.imported')); else if (r.error) toast(t(`err.${r.error}`), 'error'); } }, icon('upload'), t('set.import')))),
      h('div', { class: 'card' }, h('div', { class: 'card-head' }, h('div', { class: 'card-title' }, t('set.about'))),
        h('div', { class: 'row' }, logo(36), h('div', null, h('b', null, 'Halyra Focus'), h('div', { class: 'muted small' }, t('set.version', { v: S.version }))), h('span', { class: 'spacer' }),
          h('button', { class: 'btn', onclick: () => api.openExternal(BRAND.website) }, icon('ext'), t('set.website')),
          isMobile() ? null : h('button', { class: 'btn', onclick: async () => { const r = await api.quit(); if (!r.ok) toast(t('err.quitLocked'), 'error'); } }, icon('power'), t('set.quit'))))),
  ];
}

function accountCard() {
  const c = S.cloud || {};
  const f = ui.acc || (ui.acc = { email: '', password: '', note: '' });
  const head0 = h('div', { class: 'card-head' }, h('div', { class: 'card-title row', style: { gap: '8px' } }, icon('cloud'), t('acc.title')),
    c.signedIn ? h('span', { class: 'okline' }, icon('check'), t('acc.chipIn')) : null);
  if (!c.enabled) return h('div', { class: 'card' }, head0, h('p', { class: 'muted', style: { margin: 0 } }, t('acc.sub')), h('p', { class: 'small', style: { marginBottom: 0 } }, t('acc.notReady')));
  const act = async (fn, okMsg) => {
    const r = await fn();
    if (r.state) applyState(r.state);
    if (!r.ok) toast(t(`err.${r.error || 'generic'}`), 'error');
    else if (r.needsConfirm) { f.note = t('acc.confirm'); renderAll(); } else if (okMsg) toast(okMsg);
  };
  if (c.signedIn) {
    return h('div', { class: 'card' }, head0,
      h('div', { class: 'row' }, h('div', { class: 'acc-avatar' }, icon('user')),
        h('div', { class: 'spacer' }, h('b', null, t('acc.signedIn', { email: c.email })),
          h('div', { class: 'muted small' }, t('acc.lastSync', { time: c.lastSync ? fmtClock(c.lastSync) : t('acc.never') }), c.error ? ` · ${t(`err.${c.error}`)}` : '')),
        h('button', { class: 'btn', onclick: () => act(() => api.cloudSyncNow({}), t('ok.saved')) }, icon('cloud'), t('acc.syncNow')),
        h('button', { class: 'btn', onclick: () => act(() => api.cloudSignOut({})) }, t('acc.signOut'))));
  }
  return h('div', { class: 'card' }, head0,
    h('p', { class: 'muted', style: { marginTop: 0 } }, t('acc.sub')),
    h('div', { class: 'grid g2', style: { gap: '10px' } },
      h('input', { class: 'input', type: 'email', placeholder: t('acc.email'), value: f.email, autocomplete: 'email', 'data-fid': 'acc-email', oninput: (e) => { f.email = e.target.value; } }),
      h('input', { class: 'input', type: 'password', placeholder: t('acc.password'), value: f.password, autocomplete: 'current-password', 'data-fid': 'acc-pw', oninput: (e) => { f.password = e.target.value; }, onkeydown: (e) => { if (e.key === 'Enter') act(() => api.cloudSignIn({ email: f.email, password: f.password })); } })),
    h('div', { class: 'row', style: { marginTop: '12px' } },
      h('button', { class: 'btn primary', onclick: () => act(() => api.cloudSignIn({ email: f.email, password: f.password })) }, t('acc.signIn')),
      h('button', { class: 'btn', onclick: () => { if ((f.password || '').length < 8) { toast(t('err.weakPassword'), 'error'); return; } act(() => api.cloudSignUp({ email: f.email, password: f.password })); } }, t('acc.signUp')),
      h('span', { class: 'spacer' }),
      h('button', { class: 'btn sm', onclick: () => act(() => api.cloudReset({ email: f.email }), t('acc.resetSent')) }, t('acc.forgot'))),
    f.note ? h('div', { class: 'coach-note', style: { marginTop: '12px' } }, icon('check'), h('span', null, f.note)) : null);
}

function aiCard() {
  let key = '';
  const on = S.settings.hasAiKey;
  return h('div', { class: 'card' },
    h('div', { class: 'card-head' }, h('div', { class: 'card-title row', style: { gap: '8px' } }, icon('sparkle'), t('ai.title')),
      h('span', { class: on ? 'okline' : 'muted small' }, on ? icon('check') : null, on ? t('ai.active', { model: S.aiModel }) : t('ai.inactive'))),
    h('p', { class: 'muted', style: { marginTop: 0 } }, t('ai.sub')),
    on ? h('div', { class: 'row' }, h('button', { class: 'btn', onclick: () => openStyleStudio(null) }, icon('sparkle'), t('style.new')),
      h('button', { class: 'btn danger', onclick: async () => { const r = await api.removeAiKey(); if (r.state) applyState(r.state); } }, t('ai.remove')))
      : h('div', { class: 'row', style: { flexWrap: 'nowrap' } },
        h('input', { class: 'input', type: 'password', placeholder: `${t('ai.key')} (sk-ant-…)`, autocomplete: 'off', 'data-fid': 'ai-key', oninput: (e) => { key = e.target.value; } }),
        h('button', { class: 'btn primary', onclick: async (e) => {
          e.target.disabled = true;
          const r = await api.setAiKey({ key });
          e.target.disabled = false;
          if (r.state) applyState(r.state);
          toast(r.ok ? t('ok.saved') : t(`err.${r.error || 'generic'}`), r.ok ? 'ok' : 'error');
        } }, t('ai.save'))),
    on ? null : h('div', { class: 'muted small', style: { marginTop: '8px' } }, t('ai.where')));
}

// ------------------------------------------------------------------ onboarding

function openOnboarding() {
  let step = 0;
  let theme = S.settings.theme;
  let picked = S.settings.defaultListIds.length ? [...S.settings.defaultListIds] : S.lists.map((l) => l.id);
  const finish = async (self) => {
    await patchConfig({ settings: { onboarded: true, theme, defaultListIds: picked } });
    ui.setup.listIds = picked;
    self.close();
    renderAll();
  };
  openModal((self) => {
    const dots = h('div', { class: 'ob-steps' }, [0, 1, 2].map((i) => h('i', { class: i <= step ? 'on' : '' })));
    let body;
    if (step === 0) {
      body = [h('div', { class: 'ob-hero' }, logo(64), h('h2', null, t('ob.welcome')), h('p', null, t('ob.welcomeSub'))),
        h('div', { class: 'eyebrow', style: { margin: '22px 0 10px' } }, t('ob.theme')),
        themePicker(theme, (th) => { theme = th; document.body.dataset.theme = th; self.render(); })];
    } else if (step === 1) {
      body = [h('div', { class: 'ob-hero' }, h('h2', null, t('ob.lists'))),
        h('div', { class: 'pill-list' }, listChips(picked, (id) => { picked = picked.includes(id) ? picked.filter((x) => x !== id) : [...picked, id]; self.render(); }))];
    } else if (isMobile()) {
      body = [h('div', { class: 'ob-hero' }, h('div', { style: { color: 'var(--accent)' } }, (() => { const i = icon('shield'); i.style.width = '48px'; i.style.height = '48px'; return i; })()),
        h('h2', null, t('ob.permsTitle')), h('p', null, t('ob.permsSub'))),
      h('div', { class: 'stack', style: { marginTop: '8px' } }, permRows())];
    } else {
      body = [h('div', { class: 'ob-hero' }, h('div', { style: { color: 'var(--accent)' } }, (() => { const i = icon('globe'); i.style.width = '48px'; i.style.height = '48px'; return i; })()),
        h('h2', null, t('ob.web')), h('p', null, t('ob.webSub'))),
      S.helper.installed ? h('div', { style: { textAlign: 'center', marginTop: '16px' } }, h('span', { class: 'okline' }, icon('check'), t('helper.ok'))) : null];
    }
    const foot = h('div', { class: 'modal-foot' },
      step > 0 ? h('button', { class: 'btn', onclick: () => { step -= 1; self.render(); } }, t('ob.back')) : null,
      h('span', { class: 'spacer' }),
      step === 2 && !S.helper.installed && !isMobile() ? h('button', { class: 'btn', onclick: () => finish(self) }, t('ob.skip')) : null,
      step < 2 ? h('button', { class: 'btn primary', onclick: () => { step += 1; self.render(); } }, t('ob.next'))
        : S.helper.installed || !S.helper.supported ? h('button', { class: 'btn accent', onclick: () => finish(self) }, t('ob.done'))
          : h('button', { class: 'btn accent', onclick: async () => { if (await installHelper()) finish(self); } }, icon('shield'), t('helper.enable')));
    return [dots, ...body, foot];
  }, { wide: true });
}

// ------------------------------------------------------------------ boot

api.onState(applyState);
api.onToast(({ kind, text }) => toast(text, kind));
api.onNavigate((v) => go(v));
api.onOpenUnlock(() => { go('focus'); openUnlock(); });
Promise.all([api.getState(), api.getPresets()]).then(([state, presets]) => { ui.presets = presets; applyState(state); });
