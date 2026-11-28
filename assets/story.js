/* Halyra Focus website — "your island", shown once.
   The same engine as the app's own island, mounted in its own section: it turns
   slowly, the gems can be poked, and that is all. It used to be scrubbed through
   five chapters by the scroll, which meant the island was never still long enough
   to look at. The story the page tells lives in the film above this; the island is
   a thing you look at, in one place.
   Without WebGL (or with reduced motion) it shows a still picture and plain text. */
(function () {
  'use strict';
  const sec = document.getElementById('story');
  if (!sec) return;
  const data = (() => { try { return JSON.parse(document.getElementById('story-data').textContent); } catch (_) { return null; } })();
  if (!data) return;
  const cv = sec.querySelector('.story-canvas');
  const hudN = document.getElementById('hud-n');
  const hudT = document.getElementById('hud-title');
  const hudX = document.getElementById('hud-xp');
  const hudG = document.getElementById('hud-gems');
  const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const root = document.documentElement;
  const xmas = () => root.classList.contains('xmas');
  const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
  const smooth = (x) => x * x * (3 - 2 * x);
  const egg = (id) => document.dispatchEvent(new CustomEvent('halyra:egg', { detail: { id } }));

  if (still) sec.classList.add('still');
  const hint = sec.querySelector('.story-hint');
  const hintText = hint ? hint.textContent : '';
  let pokes = 0;
  const titleOf = (L) => { let t = data.titles[0][1]; for (const [n, name] of data.titles) if (L >= n) t = name; return t; };

  // One island, one state: far enough along to be worth looking at.
  function model() {
    const level = data.level || 24;
    const items = data.items.map((i) => ({ i, ok: true }));
    const gotN = Math.round(data.gems.length * 0.62);
    const gems = data.gems.map((g, k) => ({ ...g, got: k < gotN }));
    return { level, pct: 0.45, items, gems, gotN, season: xmas() ? 1 : 0 };
  }

  let inst = null;
  let key = '';

  function apply() {
    const m = model();
    const k = `${m.level}|${m.items.length}|${m.gotN}|${m.season}`;
    if (inst && k !== key) { key = k; inst.update(m); }
    hudN.textContent = String(m.level);
    hudT.textContent = titleOf(m.level);
    hudX.style.width = `${Math.round(m.pct * 100)}%`;
    hudG.textContent = String(m.gotN);
  }

  function start() {
    if (!window.Island3D) { sec.classList.add('no3d'); apply(); return; }
    inst = window.Island3D.mount(cv, model(), {
      onHover: (g) => { hint.textContent = g ? `${g.got ? '💎' : '🔒'} ${g.name} — ${g.desc}` : hintText; },
      onPick: (g) => {
        hint.textContent = `${g.got ? '💎' : '🔒'} ${g.name} — ${g.desc}`;
        pokes += 1;
        if (pokes === 1) egg('gem');
      },
    });
    if (!inst) { sec.classList.add('no3d'); apply(); return; }
    sec.classList.add('is-3d');
    key = '';
    apply();
  }

  // Mount only when the story comes near (it's a second WebGL scene on the page).
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver((es) => { if (es[0].isIntersecting) { io.disconnect(); start(); } }, { rootMargin: '600px 0px' });
    io.observe(sec);
  } else start();
  // The Christmas look also snows on the island.
  new MutationObserver(() => { key = ''; apply(); }).observe(root, { attributes: true, attributeFilter: ['class'] });
  apply();
}());
