'use strict';
// Block screen shown by the Android app over a blocked app. Data comes from the
// native side: { app, kind: 'app'|'limit', endsAt, mode, block: { theme, vars, font, effect, texts, quotes } }.
(function () {
  let timer = null;
  const $ = (id) => document.getElementById(id);
  const pad = (n) => String(n).padStart(2, '0');
  const clock = (ms) => { const d = new Date(ms); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
  const left = (ms) => { const s = Math.max(0, Math.round(ms / 1000)); const h = Math.floor(s / 3600); const m = Math.floor((s % 3600) / 60); return h ? `${h}:${pad(m)}:${pad(s % 60)}` : `${pad(m)}:${pad(s % 60)}`; };
  const isMidnight = (ms) => { const d = new Date(ms); return d.getHours() === 0 && d.getMinutes() === 0; };

  window.halyraBlock = (d) => {
    const b = d.block || {};
    const tx = b.texts || {};
    const body = document.body;
    body.dataset.theme = b.theme === 'custom' && b.vars ? 'custom' : (b.theme || 'midnight');
    if (b.vars) for (const [k, v] of Object.entries(b.vars)) body.style.setProperty(k, v);
    if (b.font) body.dataset.font = b.font;
    if (b.effect) body.dataset.effect = b.effect;
    document.documentElement.lang = b.lang || 'en';
    $('eyebrow').textContent = d.kind === 'limit' ? (tx.limit || 'Daily limit reached') : (tx.title || 'Blocked right now');
    $('app').textContent = d.app || '';
    $('mode').textContent = tx[d.mode] || d.mode || '';
    $('mode').hidden = !d.mode;
    $('until').textContent = d.endsAt ? (isMidnight(d.endsAt) ? (tx.untilMidnight || 'until midnight') : (tx.until || 'until {time}').replace('{time}', clock(d.endsAt))) : '';
    const quotes = Array.isArray(b.quotes) ? b.quotes : [];
    $('quote').textContent = quotes.length ? quotes[Math.floor(Math.random() * quotes.length)] : '';
    $('home').textContent = tx.home || 'Back to home screen';
    $('open').textContent = tx.open || 'Open Halyra Focus';
    clearInterval(timer);
    const tick = () => { $('left').textContent = d.endsAt ? left(d.endsAt - Date.now()) : ''; };
    tick();
    timer = setInterval(tick, 1000);
  };
  $('home').addEventListener('click', () => window.HalyraBlock && window.HalyraBlock.home());
  $('open').addEventListener('click', () => window.HalyraBlock && window.HalyraBlock.open());
})();
