'use strict';
// Halyra Focus — web/phone companion. Same account as the desktop app (Supabase).
// Reads and writes the same sync row, so a block started here starts on every
// signed-in computer within ~30 seconds. Locked (patient/strict) blocks can be
// started and extended here, but never stopped — the computers enforce that too.
(function () {
  const CFG = window.HALYRA_CFG || {};
  const URL0 = String(CFG.url || '').replace(/\/+$/, '');
  const KEY = CFG.anonKey || '';
  const ENABLED = Boolean(URL0 && KEY);
  const store = {
    get(k) { try { return JSON.parse(localStorage.getItem(`halyra.${k}`)); } catch (_) { return null; } },
    set(k, v) { try { if (v == null) localStorage.removeItem(`halyra.${k}`); else localStorage.setItem(`halyra.${k}`, JSON.stringify(v)); } catch (_) { /* private mode */ } },
  };
  const WEB_ID = store.get('device') || `web-${Math.random().toString(36).slice(2, 10)}`;
  store.set('device', WEB_ID);

  // ---------------------------------------------------------------- i18n
  const L = {
    en: {
      sub: 'Web & phone', welcome: 'Your focus, on every device', intro: 'Sign in with your Halyra Focus account to start a block on all your computers from here, and to edit your lists, limits and schedules.',
      email: 'Email', password: 'Password (min. 8 characters)', signIn: 'Sign in', signUp: 'Create account', forgot: 'Forgot password?', signOut: 'Sign out',
      confirm: 'Check your inbox and click the confirmation link, then sign in here.', resetSent: 'If the address has an account, a reset link is on its way.',
      notReady: 'Accounts are being set up — coming very soon. Until then, download the app; it works fully without an account.',
      dlMac: 'Download for Mac', dlWin: 'Download for Windows', dlAndroid: 'Download for Android', needApp: 'Blocking happens on your computers and Android phones. Install the app there and sign in with the same account.',
      noData: 'No computer has synced yet. Open Halyra Focus on your computer → Settings → Account & sync, and sign in with this account.',
      tFocus: 'Focus', tLists: 'Lists', tSched: 'Schedules', tAcc: 'Account',
      running: 'Focus is on', idle: 'Ready when you are', left: 'left', until: 'until {t}', onAll: 'Runs on all your signed-in computers.',
      dur: 'Duration', what: 'What to block', how: 'How strict', start: 'Start focus everywhere', extend: '+15 min', stop: 'Stop',
      lockedNote: 'This block is locked — it can be extended here, but not stopped early.',
      flexible: 'Flexible', flexibleD: 'Stop any time.', patient: 'Patient', patientD: 'A wait before stopping.', strict: 'Locked', strictD: 'Can’t stop early.',
      started: 'Started — your computers pick it up within ~30 s.', extended: 'Extended by 15 minutes.', stopped: 'Stopped.', saved: 'Saved — syncing to your computers.',
      already: 'A block is already running.', pickList: 'Pick at least one list.',
      sites: '{n} sites', apps: '{n} apps', addSite: 'Add a site, e.g. youtube.com', add: 'Add', badSite: 'That doesn’t look like a website address.',
      limit: 'Daily limit', noLimit: 'No limit', perDay: '{m} min/day', limitHint: 'Counted on your computers: app time + time the site is the front browser tab.',
      lockedList: 'In use by a locked block — you can add, not remove.', appsHere: 'Apps are added on the computer (they differ between Mac and Windows).',
      noSched: 'No schedules yet — create them in the app.', everyDay: 'Every day', days: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
      signedInAs: 'Signed in as {e}', lastFrom: 'Last update from a computer: {t}', never: 'not yet', ago: '{n} min ago', justNow: 'just now', refresh: 'Refresh',
      install: 'Add to Home Screen', installHint: 'iPhone: Share → Add to Home Screen. Android: menu → Install app.', site: 'Website',
      err: { badLogin: 'Wrong email or password.', notConfirmed: 'Confirm your email first (check your inbox).', exists: 'This email already has an account — sign in.', weakPassword: 'Use at least 8 characters.', rateLimit: 'Too many attempts — wait a minute.', network: 'No connection. Try again.', server: 'The server had a problem. Try again.', auth: 'Please sign in again.' },
    },
    hu: {
      sub: 'Web és telefon', welcome: 'A fókuszod, minden eszközön', intro: 'Lépj be a Halyra Focus fiókoddal: innen is elindíthatod a tiltást az összes gépeden, és szerkesztheted a listákat, kereteket, időzítéseket.',
      email: 'E-mail', password: 'Jelszó (min. 8 karakter)', signIn: 'Belépés', signUp: 'Fiók létrehozása', forgot: 'Elfelejtett jelszó?', signOut: 'Kijelentkezés',
      confirm: 'Nézd meg a postafiókodat, kattints a megerősítő linkre, utána lépj be itt.', resetSent: 'Ha ehhez a címhez tartozik fiók, elküldtük a visszaállító linket.',
      notReady: 'A fiókrendszer beállítása folyamatban — hamarosan érkezik. Addig töltsd le az appot: fiók nélkül is teljesen működik.',
      dlMac: 'Letöltés Macre', dlWin: 'Letöltés Windowsra', dlAndroid: 'Letöltés Androidra', needApp: 'A tiltás a gépeiden és androidos telefonodon történik. Telepítsd ott az appot, és lépj be ugyanezzel a fiókkal.',
      noData: 'Még egyik géped sem szinkronizált. Nyisd meg a Halyra Focust a gépeden → Beállítások → Fiók és szinkron, és lépj be ezzel a fiókkal.',
      tFocus: 'Fókusz', tLists: 'Listák', tSched: 'Időzítés', tAcc: 'Fiók',
      running: 'Fókusz bekapcsolva', idle: 'Indulhatunk, ha készen állsz', left: 'van hátra', until: '{t}-ig', onAll: 'Minden bejelentkezett gépeden fut.',
      dur: 'Időtartam', what: 'Mit tiltson', how: 'Mennyire szigorú', start: 'Fókusz indítása mindenhol', extend: '+15 perc', stop: 'Leállítás',
      lockedNote: 'Ez a tiltás zárolt — innen meghosszabbítható, de idő előtt nem állítható le.',
      flexible: 'Laza', flexibleD: 'Bármikor leállítható.', patient: 'Türelmes', patientD: 'Leállítás előtt várni kell.', strict: 'Zárolt', strictD: 'Idő előtt nem áll le.',
      started: 'Elindult — a gépeid ~30 mp-en belül átveszik.', extended: '15 perccel meghosszabbítva.', stopped: 'Leállítva.', saved: 'Mentve — szinkronizálás a gépeidre.',
      already: 'Már fut egy tiltás.', pickList: 'Válassz legalább egy listát.',
      sites: '{n} oldal', apps: '{n} app', addSite: 'Weboldal, pl. youtube.com', add: 'Hozzáad', badSite: 'Ez nem tűnik weboldalcímnek.',
      limit: 'Napi keret', noLimit: 'Nincs keret', perDay: '{m} perc/nap', limitHint: 'A gépeiden mérjük: app-idő + amíg az oldal az elöl lévő böngészőlap.',
      lockedList: 'Egy zárolt tiltás használja — hozzáadni lehet, törölni nem.', appsHere: 'Appot a gépen adhatsz hozzá (Macen és Windowson eltérnek).',
      noSched: 'Még nincs időzítés — az appban hozhatsz létre.', everyDay: 'Minden nap', days: ['V', 'H', 'K', 'Sze', 'Cs', 'P', 'Szo'],
      signedInAs: 'Bejelentkezve: {e}', lastFrom: 'Utolsó frissítés géptől: {t}', never: 'még nem', ago: '{n} perce', justNow: 'épp most', refresh: 'Frissítés',
      install: 'Kezdőképernyőre', installHint: 'iPhone: Megosztás → Főképernyőhöz adás. Android: menü → Alkalmazás telepítése.', site: 'Weboldal',
      err: { badLogin: 'Hibás e-mail vagy jelszó.', notConfirmed: 'Előbb erősítsd meg az e-mail-címed (nézd meg a postafiókod).', exists: 'Ehhez a címhez már van fiók — lépj be.', weakPassword: 'Legalább 8 karakter legyen.', rateLimit: 'Túl sok próbálkozás — várj egy percet.', network: 'Nincs kapcsolat. Próbáld újra.', server: 'Szerverhiba. Próbáld újra.', auth: 'Kérlek, lépj be újra.' },
    },
  };
  let lang = store.get('lang') || (/^hu\b/i.test(navigator.language || '') ? 'hu' : 'en');
  const t = (k, v) => { let s = k.split('.').reduce((o, p) => (o ? o[p] : undefined), L[lang]); if (s === undefined) s = k; if (v) for (const [a, b] of Object.entries(v)) s = String(s).replace(`{${a}}`, b); return s; };

  // ---------------------------------------------------------------- Supabase
  class CErr extends Error { constructor(code) { super(code); this.code = code; } }
  async function req(method, path, { body, auth } = {}) {
    let res;
    try {
      const headers = { apikey: KEY, 'content-type': 'application/json' };
      if (auth) headers.authorization = `Bearer ${auth}`;
      if (method === 'POST' && path.startsWith('/rest/')) headers.prefer = 'resolution=merge-duplicates,return=minimal';
      res = await fetch(URL0 + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    } catch (_) { throw new CErr('network'); }
    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch (_) { data = text; }
    if (!res.ok) {
      const msg = String((data && (data.error_description || data.msg || data.message || data.error)) || res.status);
      if (res.status === 400 && /invalid login|invalid_grant|credentials/i.test(msg)) throw new CErr('badLogin');
      if (/not confirmed/i.test(msg)) throw new CErr('notConfirmed');
      if (/already registered|already exists/i.test(msg)) throw new CErr('exists');
      if (res.status === 422 && /password/i.test(msg)) throw new CErr('weakPassword');
      if (res.status === 401 || res.status === 403) throw new CErr('auth');
      if (res.status === 429) throw new CErr('rateLimit');
      throw new CErr('server');
    }
    return data;
  }
  let auth = store.get('auth');
  function keep(d) {
    auth = { access_token: d.access_token, refresh_token: d.refresh_token, expires_at: d.expires_at || Math.floor(Date.now() / 1000) + (d.expires_in || 3600), user: { id: d.user && d.user.id, email: d.user && d.user.email } };
    store.set('auth', auth);
  }
  async function token() {
    if (!auth) throw new CErr('auth');
    if (auth.expires_at - 60 > Date.now() / 1000) return auth.access_token;
    try { keep(await req('POST', '/auth/v1/token?grant_type=refresh_token', { body: { refresh_token: auth.refresh_token } })); } catch (e) { if (e.code !== 'network') signOut(); throw e; }
    return auth.access_token;
  }
  function signOut() { auth = null; store.set('auth', null); row = null; }
  async function pull() {
    const tok = await token();
    const rows = await req('GET', `/rest/v1/halyra_sync?select=data,device,updated_at&user_id=eq.${encodeURIComponent(auth.user.id)}`, { auth: tok });
    row = Array.isArray(rows) && rows[0] ? rows[0] : null;
    lastPull = Date.now();
    return row;
  }
  async function change(mutate) {
    await pull();
    if (!row || !row.data) throw new CErr('noData');
    const data = JSON.parse(JSON.stringify(row.data));
    data.pcAt = String(row.device || '').startsWith('web-') ? data.pcAt || 0 : Date.parse(row.updated_at) || 0;
    const r = mutate(data, Date.now());
    if (r === false) return false;
    data.changedAt = Date.now();
    data.device = WEB_ID;
    const tok = await token();
    await req('POST', '/rest/v1/halyra_sync?on_conflict=user_id', { auth: tok, body: [{ user_id: auth.user.id, data, device: WEB_ID, updated_at: new Date().toISOString() }] });
    row = { data, device: WEB_ID, updated_at: new Date().toISOString() };
    return true;
  }

  // ---------------------------------------------------------------- UI helpers
  function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else if (k === 'class') el.className = v;
      else if (k === 'html') el.innerHTML = v;
      else if (k === 'value') el.value = v;
      else if (k === 'checked') el.checked = Boolean(v);
      else el.setAttribute(k, v === true ? '' : v);
    }
    for (const c of kids.flat(3)) if (c != null && c !== false) el.append(c.nodeType ? c : document.createTextNode(String(c)));
    return el;
  }
  const svg = (p) => h('span', { html: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${p}</svg>` }).firstChild;
  const IC = {
    focus: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.5"/>',
    lists: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
    sched: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
    acc: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
    lock: '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
  };
  const LOGO = '<svg viewBox="0 0 64 64"><defs><linearGradient id="lg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffb547"/><stop offset="1" stop-color="#ff7a3d"/></linearGradient></defs><circle cx="32" cy="32" r="22" fill="none" stroke="url(#lg)" stroke-width="7" stroke-dasharray="118 20" stroke-linecap="round" transform="rotate(-60 32 32)"/><circle cx="32" cy="32" r="8" fill="url(#lg)"/></svg>';
  let toastTimer = null;
  function toast(msg, bad) {
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.className = `show${bad ? ' bad' : ''}`;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.className = ''; }, 3200);
  }
  const errText = (e) => { const c = (e && e.code) || 'network'; if (c === 'noData' || c === 'pickList') return t(c); const m = L[lang].err[c]; return m || L[lang].err.network; };
  const pad = (n) => String(n).padStart(2, '0');
  const clock = (ms) => { const d = new Date(ms); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
  const left = (ms) => { const s = Math.max(0, Math.round(ms / 1000)); const hh = Math.floor(s / 3600); const mm = Math.floor((s % 3600) / 60); const ss = s % 60; return hh ? `${hh}:${pad(mm)}:${pad(ss)}` : `${pad(mm)}:${pad(ss)}`; };
  function normSite(raw) {
    let s = String(raw || '').trim().toLowerCase();
    s = s.replace(/^[a-z]+:\/\//, '').replace(/^www\./, '').replace(/^m\./, '').split(/[/?#:]/)[0];
    return /^(?=.{3,253}$)([a-z0-9-]{1,63}\.)+[a-z]{2,63}$/.test(s) ? s : null;
  }

  // ---------------------------------------------------------------- state
  let row = null;
  let lastPull = 0;
  let tab = store.get('tab') || 'focus';
  let busy = false;
  let loading = false;
  const form = { minutes: 50, listIds: null, mode: 'flexible', email: '', password: '', note: '', err: '' };
  let openList = null;
  const activeSession = () => { const s = row && row.data && row.data.session; return s && s.endsAt > Date.now() ? s : null; };

  async function act(fn, ok) {
    if (busy) return;
    busy = true; render();
    try { const r = await fn(); if (r !== false && ok) toast(ok); } catch (e) { toast(errText(e), true); }
    busy = false; render();
  }

  // ---------------------------------------------------------------- views
  function top() {
    return h('div', { class: 'top' },
      h('a', { class: 'logo', href: CFG.home || '../' }, h('span', { html: LOGO }).firstChild, h('span', null, 'Halyra Focus', h('small', null, t('sub')))),
      h('span', { class: 'sp' }),
      h('div', { class: 'lang' }, ['en', 'hu'].map((l) => h('button', { class: l === lang ? 'on' : '', onclick: () => { lang = l; store.set('lang', l); document.documentElement.lang = l; render(); } }, l.toUpperCase()))));
  }
  function downloads() {
    return h('div', null,
      /android/i.test(navigator.userAgent || '') && CFG.dl && CFG.dl.android
        ? h('a', { class: 'btn primary wide', href: CFG.dl.android, download: '', style: 'margin-bottom:10px' }, t('dlAndroid')) : null,
      h('div', { class: 'dl' },
        h('a', { class: 'btn pill', href: CFG.dl && CFG.dl.mac, download: '' }, t('dlMac')),
        h('a', { class: 'btn', href: CFG.dl && CFG.dl.win, download: '' }, t('dlWin'))),
      /android/i.test(navigator.userAgent || '') || !(CFG.dl && CFG.dl.android) ? null
        : h('a', { class: 'btn wide', href: CFG.dl.android, download: '', style: 'margin-top:10px' }, t('dlAndroid')),
      h('p', { class: 'muted small' }, t('needApp')));
  }
  function loginView() {
    const doIn = () => act(async () => { form.err = ''; keep(await req('POST', '/auth/v1/token?grant_type=password', { body: { email: form.email.trim(), password: form.password } })); form.password = ''; await pull(); });
    const doUp = () => act(async () => {
      if (form.password.length < 8) throw new CErr('weakPassword');
      const d = await req('POST', '/auth/v1/signup', { body: { email: form.email.trim(), password: form.password } });
      if (d && d.access_token) { keep(d); await pull(); } else form.note = t('confirm');
    });
    return [
      h('h1', null, t('welcome')),
      h('p', { class: 'muted' }, t('intro')),
      ENABLED ? h('div', { class: 'card stack' },
        h('input', { class: 'input', type: 'email', autocomplete: 'email', placeholder: t('email'), value: form.email, oninput: (e) => { form.email = e.target.value; } }),
        h('input', { class: 'input', type: 'password', autocomplete: 'current-password', placeholder: t('password'), value: form.password, oninput: (e) => { form.password = e.target.value; }, onkeydown: (e) => { if (e.key === 'Enter') doIn(); } }),
        h('button', { class: 'btn primary wide', disabled: busy, onclick: doIn }, t('signIn')),
        h('button', { class: 'btn wide', disabled: busy, onclick: doUp }, t('signUp')),
        h('button', { class: 'link', onclick: () => act(async () => { await req('POST', '/auth/v1/recover', { body: { email: form.email.trim() } }); }, t('resetSent')) }, t('forgot')),
        form.note ? h('div', { class: 'note' }, form.note) : null)
        : h('div', { class: 'card' }, h('div', { class: 'note' }, t('notReady'))),
      h('div', { class: 'card' }, downloads()),
    ];
  }
  function ringEl(frac, label) {
    const C = 2 * Math.PI * 48;
    return h('div', { class: 'ring' },
      h('span', { html: `<svg viewBox="0 0 112 112"><defs><linearGradient id="rg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffb547"/><stop offset="1" stop-color="#ff7a3d"/></linearGradient></defs><circle cx="56" cy="56" r="48" fill="none" stroke="rgba(255,255,255,.07)" stroke-width="8"/><circle cx="56" cy="56" r="48" fill="none" stroke="url(#rg)" stroke-width="8" stroke-linecap="round" stroke-dasharray="${C}" stroke-dashoffset="${C * (1 - frac)}"/></svg>` }).firstChild,
      h('div', { class: 't', 'data-live': 'left' }, label));
  }
  function focusView() {
    const d = row && row.data;
    if (!d) return [h('h1', null, t('idle')), h('div', { class: 'card' }, h('div', { class: 'note' }, t('noData'))), h('div', { class: 'card' }, downloads())];
    const s = activeSession();
    const lists = d.lists || [];
    if (s) {
      const total = s.endsAt - s.startedAt;
      const locked = s.mode !== 'flexible';
      const names = lists.filter((l) => s.listIds.includes(l.id)).map((l) => `${l.emoji || ''} ${l.name}`);
      return [
        h('h1', null, t('running')),
        h('div', { class: 'card' },
          h('div', { class: 'status' }, ringEl(Math.max(0, (s.endsAt - Date.now()) / total), left(s.endsAt - Date.now())),
            h('div', null, h('span', { class: 'badge' }, t(s.mode)), h('div', { style: 'margin-top:8px;font-weight:600' }, t('until', { t: clock(s.endsAt) })),
              s.goal ? h('div', { class: 'muted small' }, s.goal) : null, h('div', { class: 'muted small' }, names.join(' · ')))),
          h('p', { class: 'muted small' }, t('onAll')),
          locked ? h('div', { class: 'note', style: 'margin-bottom:12px' }, t('lockedNote')) : null,
          h('div', { class: 'row' },
            h('button', { class: 'btn', disabled: busy, onclick: () => act(() => change((x, now) => { if (!(x.session && x.session.endsAt > now)) return false; x.session.endsAt += 15 * 60000; x.sessionChangedAt = now; return true; }), t('extended')) }, t('extend')),
            locked ? null : h('button', { class: 'btn danger', disabled: busy, onclick: () => act(() => change((x, now) => { x.session = null; x.sessionChangedAt = now; return true; }), t('stopped')) }, t('stop')))),
      ];
    }
    if (!form.listIds) form.listIds = (d.settings && d.settings.defaultListIds && d.settings.defaultListIds.length ? d.settings.defaultListIds : lists.slice(0, 2).map((l) => l.id)).filter((id) => lists.some((l) => l.id === id));
    if (d.settings && d.settings.defaultMode && !form.modeTouched) form.mode = d.settings.defaultMode;
    const start = () => act(() => {
      if (!form.listIds.length) throw Object.assign(new Error(), { code: 'pickList' });
      return change((x, now) => {
        if (x.session && x.session.endsAt > now) { toast(t('already'), true); return false; }
        const ids = form.listIds.filter((id) => (x.lists || []).some((l) => l.id === id));
        x.session = { startedAt: now, endsAt: now + form.minutes * 60000, listIds: ids, mode: form.mode, pomodoro: null, goal: '' };
        x.sessionChangedAt = now;
        return true;
      });
    }, t('started')).catch(() => {});
    return [
      h('h1', null, t('idle')),
      h('div', { class: 'card' },
        h('div', { class: 'label', style: 'margin-top:0' }, t('dur')),
        h('div', { class: 'row' }, [25, 50, 90, 120, 180].map((m) => h('button', { class: `chip${form.minutes === m ? ' on' : ''}`, onclick: () => { form.minutes = m; render(); } }, m < 60 ? `${m} min` : `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60}` : ''}`))),
        h('div', { class: 'label' }, t('what')),
        h('div', { class: 'row' }, lists.map((l) => h('button', { class: `chip${form.listIds.includes(l.id) ? ' on' : ''}`, onclick: () => { form.listIds = form.listIds.includes(l.id) ? form.listIds.filter((x) => x !== l.id) : [...form.listIds, l.id]; render(); } }, `${l.emoji || ''} ${l.name}`, h('span', { class: 'n' }, (l.sites || []).length + (l.apps || []).length)))),
        h('div', { class: 'label' }, t('how')),
        h('div', { class: 'modes' }, ['flexible', 'patient', 'strict'].map((m) => h('button', { class: `mode${form.mode === m ? ' on' : ''}`, onclick: () => { form.mode = m; form.modeTouched = true; render(); } }, h('b', null, t(m)), h('span', null, t(`${m}D`))))),
        h('div', { style: 'margin-top:16px' }, h('button', { class: 'btn primary wide', disabled: busy || !form.listIds.length, onclick: start }, t('start'))),
        h('p', { class: 'muted small', style: 'margin-bottom:0' }, t('onAll'))),
    ];
  }
  function listsView() {
    const d = row && row.data;
    if (!d) return focusView();
    const s = activeSession();
    return [
      h('h1', null, t('tLists')),
      ...(d.lists || []).map((l) => {
        const lockedList = s && s.mode !== 'flexible' && s.listIds.includes(l.id);
        const open = openList === l.id;
        const editSites = (fn, msg) => act(() => change((x) => { const ll = (x.lists || []).find((y) => y.id === l.id); if (!ll) return false; return fn(ll); }), msg);
        let draft = '';
        return h('div', { class: 'list' },
          h('button', { class: 'list-h', onclick: () => { openList = open ? null : l.id; render(); } },
            h('span', { class: 'e' }, l.emoji || '•'), h('b', null, l.name),
            h('span', { class: 'muted small' }, `${t('sites', { n: (l.sites || []).length })} · ${t('apps', { n: (l.apps || []).length })}`)),
          l.limitMin > 0 ? h('div', { class: 'muted small', style: 'margin-top:6px' }, `⏳ ${t('limit')}: ${t('perDay', { m: l.limitMin })}`) : null,
          open ? h('div', null,
            lockedList ? h('div', { class: 'note', style: 'margin-top:10px' }, svg(IC.lock), ' ', t('lockedList')) : null,
            h('div', { class: 'tags' }, (l.sites || []).map((site) => h('span', { class: 'tag' }, site,
              lockedList ? null : h('button', { 'aria-label': `remove ${site}`, onclick: () => editSites((ll) => { ll.sites = ll.sites.filter((x) => x !== site); return true; }, t('saved')) }, '×')))),
            h('div', { class: 'row', style: 'margin-top:12px;flex-wrap:nowrap' },
              h('input', { class: 'input', placeholder: t('addSite'), autocapitalize: 'off', autocorrect: 'off', inputmode: 'url', oninput: (e) => { draft = e.target.value; },
                onkeydown: (e) => { if (e.key === 'Enter') e.target.nextSibling.click(); } }),
              h('button', { class: 'btn', onclick: () => { const site = normSite(draft); if (!site) { toast(t('badSite'), true); return; } editSites((ll) => { if (ll.sites.includes(site)) return false; ll.sites = [...ll.sites, site]; return true; }, t('saved')); } }, t('add'))),
            (l.apps || []).length ? h('div', { class: 'tags' }, l.apps.map((a) => h('span', { class: 'tag', style: 'padding-right:10px' }, a.name))) : null,
            h('p', { class: 'muted small' }, t('appsHere')),
            h('div', { class: 'label' }, t('limit')),
            h('select', { class: 'input', disabled: lockedList && l.limitMin > 0, onchange: (e) => { const v = Number(e.target.value); editSites((ll) => { ll.limitMin = v; return true; }, t('saved')); } },
              [0, 15, 30, 45, 60, 90, 120, 180].map((m) => { const o = h('option', { value: m }, m ? t('perDay', { m }) : t('noLimit')); if ((l.limitMin || 0) === m) o.selected = true; return o; })),
            h('p', { class: 'muted small', style: 'margin-bottom:0' }, t('limitHint'))) : null);
      }),
    ];
  }
  function schedView() {
    const d = row && row.data;
    if (!d) return focusView();
    const sch = d.schedules || [];
    return [
      h('h1', null, t('tSched')),
      h('div', { class: 'card' }, sch.length ? sch.map((s) => h('div', { class: 'sched' },
        h('div', { class: 'sp' }, h('b', null, s.name), h('div', { class: 'muted small' }, `${s.days.length === 7 ? t('everyDay') : s.days.map((x) => t('days')[x]).join(', ')} · ${s.start}–${s.end} · ${t(s.mode)}`)),
        h('label', { class: 'switch' }, h('input', { type: 'checkbox', checked: s.enabled, onchange: (e) => { const on = e.target.checked; act(() => change((x) => { const ss = (x.schedules || []).find((y) => y.id === s.id); if (!ss) return false; ss.enabled = on; return true; }), t('saved')); } }), h('span')))) : h('p', { class: 'muted', style: 'margin:0' }, t('noSched'))),
    ];
  }
  function accView() {
    const pcAt = !row ? 0 : String(row.device || '').startsWith('web-') ? (row.data && row.data.pcAt) || 0 : Date.parse(row.updated_at);
    const mins = pcAt ? Math.round((Date.now() - pcAt) / 60000) : null;
    const fromPc = Boolean(pcAt);
    return [
      h('h1', null, t('tAcc')),
      h('div', { class: 'card' },
        h('b', null, t('signedInAs', { e: auth.user.email })),
        h('p', { class: 'muted small' }, t('lastFrom', { t: row && fromPc ? (mins < 1 ? t('justNow') : t('ago', { n: mins })) : t('never') })),
        h('div', { class: 'row' },
          h('button', { class: 'btn', onclick: () => act(pull) }, t('refresh')),
          h('button', { class: 'btn danger', onclick: () => { signOut(); render(); } }, t('signOut')))),
      h('div', { class: 'card' }, h('h2', null, t('install')), h('p', { class: 'muted small', style: 'margin:0' }, t('installHint'))),
      h('div', { class: 'card' }, downloads()),
    ];
  }
  function tabs() {
    const items = [['focus', 'tFocus', IC.focus], ['lists', 'tLists', IC.lists], ['schedules', 'tSched', IC.sched], ['account', 'tAcc', IC.acc]];
    return h('nav', { class: 'tabs', 'aria-label': 'Sections' }, h('div', { class: 'tabs-in' }, items.map(([id, k, ic]) => h('button', { class: tab === id ? 'on' : '', onclick: () => { tab = id; store.set('tab', id); render(); window.scrollTo(0, 0); } }, svg(ic), t(k)))));
  }
  function render() {
    const root = document.getElementById('root');
    const y = window.scrollY;
    const focusEl = document.activeElement;
    const keepInput = focusEl && focusEl.tagName === 'INPUT' ? { ph: focusEl.placeholder, val: focusEl.value, pos: focusEl.selectionStart } : null;
    root.replaceChildren();
    const shell = h('div', { class: 'shell' }, top());
    if (!auth || !ENABLED) shell.append(...loginView());
    else if (loading && !row) shell.append(h('div', { class: 'spin' }));
    else shell.append(...(tab === 'lists' ? listsView() : tab === 'schedules' ? schedView() : tab === 'account' ? accView() : focusView()));
    root.append(shell);
    if (auth && ENABLED) root.append(tabs());
    window.scrollTo(0, y);
    if (keepInput) { const el = [...root.querySelectorAll('input')].find((i) => i.placeholder === keepInput.ph); if (el) { el.value = keepInput.val; el.focus(); try { el.setSelectionRange(keepInput.pos, keepInput.pos); } catch (_) { /* email inputs */ } } }
  }

  // live countdown without re-rendering inputs
  setInterval(() => {
    const s = activeSession();
    const el = document.querySelector('[data-live="left"]');
    if (s && el) el.textContent = left(s.endsAt - Date.now());
    else if (el && !s) render();
  }, 1000);
  async function refresh() {
    if (!auth || !ENABLED || busy || document.hidden) return;
    const typing = document.activeElement && document.activeElement.tagName === 'INPUT';
    try { await pull(); } catch (e) { if (e.code === 'auth') toast(t('err.auth'), true); }
    if (!typing) render();
  }
  setInterval(refresh, 15000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden && Date.now() - lastPull > 5000) refresh(); });

  document.documentElement.lang = lang;
  render();
  if (auth && ENABLED) { loading = true; render(); pull().catch((e) => { if (e.code === 'auth') signOut(); }).finally(() => { loading = false; render(); }); }
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
  window.__halyra = { L, normSite }; // for tests
}());
