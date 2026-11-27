/* Halyra Focus website — the scroll story: a sticky 3D island (the same engine as the
   app's "Your island") that grows as you scroll. Chapters fade through in 3D, gems pop
   in, the camera circles the island, and a small leaderboard flies in at the end.
   Without WebGL (or with reduced motion) it shows a still picture and plain text. */
(function () {
  'use strict';
  const sec = document.getElementById('story');
  if (!sec) return;
  const data = (() => { try { return JSON.parse(document.getElementById('story-data').textContent); } catch (_) { return null; } })();
  if (!data) return;
  const track = sec.querySelector('.story-track');
  const cv = sec.querySelector('.story-canvas');
  const chaps = [...sec.querySelectorAll('.chap')];
  const dots = [...sec.querySelectorAll('.story-dots i')];
  const tip = document.getElementById('story-tip');
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
  const titleOf = (L) => { let t = data.titles[0][1]; for (const [n, name] of data.titles) if (L >= n) t = name; return t; };

  // Scroll progress → what the island looks like.
  function model(p) {
    const [L0, L1] = data.levels;
    const lf = L0 + (L1 - L0) * smooth(clamp(p / 0.92));
    const level = Math.max(1, Math.floor(lf));
    const items = data.items.slice(0, Math.round(data.items.length * clamp((p - 0.04) / 0.8))).map((i) => ({ i, ok: true }));
    // gems arrive from chapter 3 on, one by one
    const gotN = Math.round(data.gems.length * clamp((p - 0.4) / 0.48));
    const gems = data.gems.map((g, k) => ({ ...g, got: k < gotN }));
    return { level, pct: lf - level, items, gems, gotN, season: xmas() };
  }

  let inst = null;
  let key = '';
  let p = still ? 1 : 0;
  let shown = -1;
  let pokes = 0;

  function apply() {
    const m = model(p);
    const k = `${m.level}|${m.items.length}|${m.gotN}|${m.season}`;
    if (inst && k !== key) { key = k; inst.update(m); }
    if (inst && !still) inst.setView({ yaw: 0.55 + p * Math.PI * 1.55, zoom: 0.8 + 0.28 * smooth(clamp(p)), lift: 1.6 - 2.2 * p });
    hudN.textContent = String(m.level);
    hudT.textContent = titleOf(m.level);
    hudX.style.width = `${Math.round(m.pct * 100)}%`;
    hudG.textContent = String(m.gotN);
    const ci = Math.min(chaps.length - 1, Math.floor(p * chaps.length * 0.999));
    if (ci !== shown) {
      chaps.forEach((c, i) => { c.classList.toggle('on', i === ci); c.classList.toggle('past', i < ci); });
      dots.forEach((d, i) => d.classList.toggle('on', i === ci));
      sec.dataset.chapter = String(ci);
      if (shown >= 0 && ci > shown && inst && ci === chaps.length - 1) inst.celebrate();
      shown = ci;
    }
  }

  function onScroll() {
    if (still) return;
    const r = track.getBoundingClientRect();
    const span = Math.max(1, r.height - window.innerHeight);
    const np = clamp(-r.top / span);
    if (Math.abs(np - p) < 0.0005 && shown >= 0) return;
    p = np;
    apply();
  }

  function start() {
    if (!window.Island3D) { sec.classList.add('no3d'); apply(); return; }
    inst = window.Island3D.mount(cv, model(p), {
      onHover: (g) => {
        if (!g) { tip.hidden = true; return; }
        tip.hidden = false;
        tip.textContent = `${g.got ? '💎' : '🔒'} ${g.name} — ${g.desc}`;
      },
      onPick: (g) => {
        tip.hidden = false;
        tip.textContent = `${g.got ? '💎' : '🔒'} ${g.name} — ${g.desc}`;
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
  addEventListener('scroll', onScroll, { passive: true });
  addEventListener('resize', onScroll);
  // The Christmas look also snows on the island.
  new MutationObserver(() => { key = ''; apply(); }).observe(root, { attributes: true, attributeFilter: ['class'] });
  onScroll();
  apply();
}());
