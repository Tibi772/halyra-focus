'use strict';
// Block screen. Two hosts:
//  - Android app (BlockActivity): native code calls window.halyraBlock(data); buttons use HalyraBlock.*
//  - Computers: the app serves this page on 127.0.0.1 and redirects blocked browser tabs here;
//    data comes from /state.json, and once the site is unblocked the page offers to go back.
(function () {
  let timer = null;
  const $ = (id) => document.getElementById(id);
  const pad = (n) => String(n).padStart(2, '0');
  const clock = (ms) => { const d = new Date(ms); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
  const left = (ms) => { const s = Math.max(0, Math.round(ms / 1000)); const h = Math.floor(s / 3600); const m = Math.floor((s % 3600) / 60); return h ? `${h}:${pad(m)}:${pad(s % 60)}` : `${pad(m)}:${pad(s % 60)}`; };
  const isMidnight = (ms) => { const d = new Date(ms); return d.getHours() === 0 && d.getMinutes() === 0; };
  const web = /^https?:$/.test(location.protocol);
  const q = new URLSearchParams(location.search);
  let tx = {};

  window.halyraBlock = (d) => {
    const b = d.block || {};
    tx = b.texts || {};
    const body = document.body;
    body.dataset.theme = b.theme === 'custom' && b.vars ? 'custom' : (b.theme || 'midnight');
    if (b.vars) for (const [k, v] of Object.entries(b.vars)) body.style.setProperty(k, v);
    if (b.font) body.dataset.font = b.font;
    if (b.effect) body.dataset.effect = b.effect;
    document.documentElement.lang = b.lang || 'en';
    body.classList.toggle('festive', Boolean(b.festive));
    $('eyebrow').textContent = d.kind === 'limit' ? (tx.limit || 'Daily limit reached') : (tx.title || 'Blocked right now');
    $('app').textContent = d.app || '';
    $('mode').textContent = tx[d.mode] || d.mode || '';
    $('mode').hidden = !d.mode;
    $('until').textContent = d.endsAt ? (isMidnight(d.endsAt) ? (tx.untilMidnight || 'until midnight') : (tx.until || 'until {time}').replace('{time}', clock(d.endsAt))) : '';
    const quotes = Array.isArray(b.quotes) ? b.quotes : [];
    if (!$('quote').textContent) $('quote').textContent = quotes.length ? quotes[Math.floor(Math.random() * quotes.length)] : '';
    $('home').textContent = web ? (tx.back || 'Go back') : (tx.home || 'Back to home screen');
    $('open').textContent = tx.open || 'Open Halyra Focus';
    clearInterval(timer);
    const tick = () => { $('left').textContent = d.endsAt ? left(d.endsAt - Date.now()) : ''; };
    tick();
    timer = setInterval(tick, 1000);
  };

  if (web) {
    document.title = `${q.get('site') || ''} — Halyra Focus`;
    const back = q.get('u');
    const goBack = () => { if (history.length > 1) history.back(); else window.close(); };
    let homeAction = goBack;
    const load = () => fetch(`/state.json?${q}`, { cache: 'no-store' }).then((r) => r.json()).then((d) => {
      window.halyraBlock({ ...d, app: q.get('site') || '' });
      if (d.earn && d.blocked !== false && d.token) {
        const tx2 = (d.block && d.block.texts) || {};
        const can = d.earn.balance >= 5;
        $('home').textContent = can ? (tx2.earnSpend || 'Use {m} earned minutes').replace('{m}', String(Math.min(10, d.earn.balance))) : (tx2.earnNone || 'No earned minutes yet');
        $('until').textContent = (tx2.earnHave || 'You have {m} earned minutes').replace('{m}', String(d.earn.balance));
        homeAction = can ? () => fetch(`/spend?token=${d.token}&list=${encodeURIComponent(d.earn.id)}&m=${Math.min(10, d.earn.balance)}`, { cache: 'no-store' })
          .then((r) => r.json()).then((x) => { if (x.ok) setTimeout(() => { location.href = back && /^https?:\/\//.test(back) ? back : 'about:blank'; }, 2500); }) : goBack;
      }
      if (d.blocked === false) {
        $('eyebrow').textContent = tx.unblocked || 'This site is available again.';
        $('left').textContent = '';
        $('until').textContent = '';
        if (back && /^https?:\/\//.test(back)) { $('home').textContent = tx.continue || 'Continue'; homeAction = () => { location.href = back; }; }
      }
    }).catch(() => {});
    load();
    setInterval(load, 10000);
    $('home').addEventListener('click', () => homeAction());
    $('open').addEventListener('click', () => { location.href = 'halyrafocus://open'; });
  } else {
    $('home').addEventListener('click', () => window.HalyraBlock && window.HalyraBlock.home());
    $('open').addEventListener('click', () => window.HalyraBlock && window.HalyraBlock.open());
  }
})();
