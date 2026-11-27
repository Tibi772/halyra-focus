/* Halyra Focus website — interactive isometric "city of apps" hero + small UI bits. No dependencies. */
(function () {
  'use strict';

  // ---------------------------------------------------------------- OS-aware download buttons
  const ua = (navigator.userAgentData && navigator.userAgentData.platform) || navigator.platform || navigator.userAgent || '';
  const uaFull = navigator.userAgent || '';
  const ios = /iphone|ipad|ipod/i.test(uaFull) || (navigator.maxTouchPoints > 1 && /mac/i.test(ua));
  const android = /android/i.test(uaFull);
  const os = android ? 'android' : ios ? 'ios' : /mobile/i.test(uaFull) ? 'ios' : /mac/i.test(ua) ? 'mac' : /win/i.test(ua) ? 'win' : null;
  if (os) {
    document.documentElement.dataset.os = os;
    document.querySelectorAll('[data-dl]').forEach((el) => { if (el.dataset.dl === os) el.classList.add('is-os'); });
  }

  // ---------------------------------------------------------------- theme tabs
  document.querySelectorAll('[data-tabs]').forEach((root) => {
    const btns = root.querySelectorAll('[data-tab]');
    const panes = root.querySelectorAll('[data-pane]');
    btns.forEach((b) => b.addEventListener('click', () => {
      btns.forEach((x) => x.classList.toggle('on', x === b));
      panes.forEach((p) => p.classList.toggle('on', p.dataset.pane === b.dataset.tab));
      root.dataset.active = b.dataset.tab;
    }));
  });

  // ---------------------------------------------------------------- reveal on scroll
  // Content is only hidden once this script runs (html.js), and is always shown
  // after 2.5 s even if the observer never fires (e.g. inside an embedded viewer).
  document.documentElement.classList.add('js');
  const revealAll = () => document.querySelectorAll('.reveal').forEach((el) => el.classList.add('in'));
  const io = 'IntersectionObserver' in window ? new IntersectionObserver((es) => {
    es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } });
  }, { rootMargin: '0px 0px -10% 0px' }) : null;
  document.querySelectorAll('.reveal').forEach((el) => (io ? io.observe(el) : el.classList.add('in')));
  setTimeout(revealAll, 2500);

  // ---------------------------------------------------------------- headings come in word by word, grids in a cascade
  const stillMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!stillMotion) {
    document.querySelectorAll('.sec-head h2, .story-intro h2').forEach((h) => {
      let n = 0;
      const walk = (node) => {
        for (const c of [...node.childNodes]) {
          if (c.nodeType === 3) {
            const frag = document.createDocumentFragment();
            for (const part of c.textContent.split(/(\s+)/)) {
              if (!part) continue;
              if (/^\s+$/.test(part)) { frag.appendChild(document.createTextNode(part)); continue; }
              const w = document.createElement('span');
              w.className = 'w';
              w.style.setProperty('--w', String(n));
              n += 1;
              w.textContent = part;
              frag.appendChild(w);
            }
            c.replaceWith(frag);
          } else if (c.nodeType === 1) walk(c);
        }
      };
      walk(h);
      h.classList.add('words');
    });
    document.querySelectorAll('.grid, .modes, .fb-btns').forEach((g) => [...g.children].forEach((c, i) => c.style.setProperty('--d', `${(i % 3) * 90 + Math.floor(i / 3) * 40}ms`)));
  }

  // ---------------------------------------------------------------- scroll-linked depth (Apple-style): screenshots tilt up into place
  const scrubbed = [...document.querySelectorAll('[data-scrub], .frow .shot, .panes, .shield-shot .shot, .cmp')];
  if (!stillMotion && scrubbed.length) {
    let ticking = false;
    const vis = new Set();
    const ioS = 'IntersectionObserver' in window ? new IntersectionObserver((es) => es.forEach((e) => (e.isIntersecting ? vis.add(e.target) : vis.delete(e.target))), { rootMargin: '120px 0px' }) : null;
    scrubbed.forEach((el) => { el.classList.add('scrub'); if (ioS) ioS.observe(el); else vis.add(el); });
    const update = () => {
      ticking = false;
      const vh = window.innerHeight;
      for (const el of vis) {
        const r = el.getBoundingClientRect();
        const s = Math.max(0, Math.min(1, (vh - r.top) / (vh * 0.75)));
        el.style.setProperty('--s', s.toFixed(3));
      }
    };
    addEventListener('scroll', () => { if (!ticking) { ticking = true; requestAnimationFrame(update); } }, { passive: true });
    addEventListener('resize', update);
    update();
    setTimeout(update, 300);
  }

  // ---------------------------------------------------------------- slow-drifting light in the background
  if (!stillMotion) {
    const orbs = document.createElement('div');
    orbs.className = 'bg-orbs';
    orbs.setAttribute('aria-hidden', 'true');
    orbs.innerHTML = '<i></i><i></i><i></i>';
    document.body.prepend(orbs);
    let ot = false;
    addEventListener('scroll', () => {
      if (ot) return;
      ot = true;
      requestAnimationFrame(() => { ot = false; orbs.style.setProperty('--y', `${(Math.sin(scrollY / 900) * 70).toFixed(1)}px`); });
    }, { passive: true });
  }

  // ---------------------------------------------------------------- the gate
  // The door the site opens on. It is only ever a layer on top of a page that is
  // already complete, so every way of leaving it does the same thing, and any of
  // them can be skipped entirely.
  (function gate() {
    const el = document.getElementById('gate');
    if (!el) return;
    const body = document.body;
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let open = false;

    const enter = (instant) => {
      if (open) return;
      open = true;
      body.classList.add('entered');
      el.classList.add('going');
      // Tell the scene someone came in: it answers with a push-in.
      document.dispatchEvent(new CustomEvent('halyra:enter', { detail: { instant: Boolean(instant) } }));
      try { sessionStorage.setItem('halyra-entered', '1'); } catch (_) { /* private mode */ }
      setTimeout(() => el.classList.add('gone'), instant ? 0 : 1200);
      off();
    };

    const onKey = (e) => { if (e.key !== 'Tab' && !e.metaKey && !e.ctrlKey && !e.altKey) enter(); };
    const onWheel = () => enter();
    const onTouch = () => enter();
    function off() {
      removeEventListener('keydown', onKey);
      removeEventListener('wheel', onWheel);
      removeEventListener('touchmove', onTouch);
    }

    // Anyone who asked for less motion, is coming back during this visit, or
    // landed on a deep link does not get held at the door.
    let been = false;
    try { been = sessionStorage.getItem('halyra-entered') === '1'; } catch (_) { been = false; }
    if (still || been || location.hash || /[?&](nointro|lighthouse)=/.test(location.search)) {
      el.classList.add('gone');
      body.classList.add('entered');
      open = true;
      document.dispatchEvent(new CustomEvent('halyra:enter', { detail: { instant: true } }));
      return;
    }

    const btn = document.getElementById('gate-enter');
    const skip = document.getElementById('gate-skip');
    if (btn) btn.addEventListener('click', () => enter());
    if (skip) skip.addEventListener('click', () => enter(true));
    el.addEventListener('click', (e) => { if (e.target === el || e.target.classList.contains('gate-frost')) enter(); });
    addEventListener('keydown', onKey);
    addEventListener('wheel', onWheel, { passive: true });
    addEventListener('touchmove', onTouch, { passive: true });
    // Never trap anyone: if the scripts that run the scene fall over, the door
    // opens by itself after a few seconds.
    setTimeout(() => enter(true), 9000);
    if (btn) setTimeout(() => btn.focus({ preventScroll: true }), 420);
  }());

  // ---------------------------------------------------------------- Christmas look (auto in December, switchable, remembered)
  (function season() {
    const root = document.documentElement;
    const btn = document.getElementById('season-btn');
    let snow = null;
    let flakes = [];
    let raf = 0;
    let blizzardUntil = 0;
    const label = () => {
      if (!btn) return;
      const on = root.classList.contains('xmas');
      const t = on ? btn.dataset.on : btn.dataset.off;
      btn.setAttribute('aria-label', t);
      btn.title = t;
      btn.setAttribute('aria-pressed', String(on));
    };
    const make = (n) => Array.from({ length: n }, () => ({ x: Math.random() * innerWidth, y: Math.random() * innerHeight, r: 0.8 + Math.random() * 2, v: 0.3 + Math.random() * 0.7, w: Math.random() * 6.3 }));
    const startSnow = () => {
      if (snow || stillMotion) return;
      snow = document.createElement('canvas');
      snow.className = 'snow';
      snow.setAttribute('aria-hidden', 'true');
      document.body.appendChild(snow);
      const ctx = snow.getContext('2d');
      const fit = () => { const d = Math.min(2, window.devicePixelRatio || 1); snow.width = innerWidth * d; snow.height = innerHeight * d; ctx.setTransform(d, 0, 0, d, 0, 0); };
      fit();
      addEventListener('resize', fit);
      flakes = make(innerWidth < 700 ? 22 : 40);
      let last = 0;
      const frame = (now) => {
        raf = requestAnimationFrame(frame);
        if (document.hidden || now - last < 30) return;
        last = now;
        const heavy = Date.now() < blizzardUntil;
        if (!heavy && flakes.length > 60) flakes.length = innerWidth < 700 ? 22 : 40;
        ctx.clearRect(0, 0, innerWidth, innerHeight);
        ctx.fillStyle = '#fff';
        for (const f of flakes) {
          f.y += f.v * (heavy ? 3.2 : 1); f.w += 0.013; f.x += Math.sin(f.w) * (heavy ? 1.6 : 0.4) + (heavy ? 1.2 : 0);
          if (f.y > innerHeight + 4) { f.y = -4; f.x = Math.random() * innerWidth; }
          if (f.x > innerWidth + 4) f.x = -4;
          ctx.globalAlpha = 0.25 + f.r / 6;
          ctx.beginPath(); ctx.arc(f.x, f.y, f.r, 0, 6.283); ctx.fill();
        }
      };
      raf = requestAnimationFrame(frame);
    };
    const stopSnow = () => { cancelAnimationFrame(raf); if (snow) snow.remove(); snow = null; };
    const set = (on, remember) => {
      root.classList.toggle('xmas', on);
      if (remember) { try { localStorage.setItem('halyra-season', on ? 'on' : 'off'); } catch (_) { /* private mode */ } }
      if (on) startSnow(); else stopSnow();
      label();
    };
    let clicks = [];
    if (btn) btn.addEventListener('click', () => {
      const now = Date.now();
      clicks = [...clicks.filter((x) => now - x < 2500), now];
      if (clicks.length >= 5) {
        clicks = [];
        set(true, true);
        blizzardUntil = now + 8000;
        flakes = flakes.concat(make(170));
        document.dispatchEvent(new CustomEvent('halyra:egg', { detail: { id: 'blizzard' } }));
        return;
      }
      set(!root.classList.contains('xmas'), true);
    });
    document.querySelectorAll('[data-season-off]').forEach((b) => b.addEventListener('click', () => set(false, true)));
    set(root.classList.contains('xmas'), false);
  }());

  // ---------------------------------------------------------------- 3D-ish polish: tilt screenshots, card spotlight
  const fine = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (fine && !still) {
    document.querySelectorAll('.shot').forEach((el) => {
      el.addEventListener('pointermove', (e) => {
        const r = el.getBoundingClientRect();
        el.style.setProperty('--ry', `${((e.clientX - r.left) / r.width - 0.5) * 7}deg`);
        el.style.setProperty('--rx', `${-((e.clientY - r.top) / r.height - 0.5) * 6}deg`);
        el.classList.add('tilt');
      });
      el.addEventListener('pointerleave', () => { el.classList.remove('tilt'); el.style.removeProperty('--rx'); el.style.removeProperty('--ry'); });
    });
    document.querySelectorAll('.card').forEach((el) => {
      el.addEventListener('pointermove', (e) => {
        const r = el.getBoundingClientRect();
        el.style.setProperty('--mx', `${e.clientX - r.left}px`);
        el.style.setProperty('--my', `${e.clientY - r.top}px`);
      });
    });
  }

  // ---------------------------------------------------------------- hidden things (shh)
  const EGG = (() => { try { return JSON.parse((document.getElementById('egg-text') || {}).textContent || 'null'); } catch (_) { return null; } })();
  if (EGG) {
    const IDS = Object.keys(EGG.names);
    let got = [];
    try { got = JSON.parse(localStorage.getItem('halyra-eggs') || '[]').filter((x) => IDS.includes(x)); } catch (_) { got = []; }
    const toastEl = document.createElement('div');
    toastEl.className = 'egg-toast';
    toastEl.setAttribute('role', 'status');
    toastEl.setAttribute('aria-live', 'polite');
    document.body.appendChild(toastEl);
    let toastTimer = 0;
    const toast = (html, ms = 4600) => {
      toastEl.innerHTML = html;
      toastEl.classList.add('show');
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => toastEl.classList.remove('show'), ms);
    };
    const esc = (x) => String(x).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    const found = (id) => {
      if (!IDS.includes(id)) return;
      const fresh = !got.includes(id);
      if (fresh) { got.push(id); try { localStorage.setItem('halyra-eggs', JSON.stringify(got)); } catch (_) { /* private mode */ } }
      const head = fresh ? EGG.found.replace('{n}', got.length).replace('{t}', IDS.length) : EGG.again;
      toast(`<span class="egg-ic">✦</span><span><b>${esc(head)}</b><br>${esc(EGG.names[id])}</span>`);
      if (fresh && got.length === IDS.length) setTimeout(() => toast(`<span class="egg-ic">🏆</span><span><b>${esc(EGG.allT)}</b><br>${esc(EGG.all)}</span>`, 7000), 4800);
    };
    document.addEventListener('halyra:egg', (e) => found(e.detail && e.detail.id));
    const root = document.documentElement;

    // ↑ ↑ ↓ ↓ ← → ← → B A — retro CRT mode. Typing a secret word starts focus.
    const KONAMI = ['arrowup', 'arrowup', 'arrowdown', 'arrowdown', 'arrowleft', 'arrowright', 'arrowleft', 'arrowright', 'b', 'a'];
    let seq = [];
    let typed = '';
    document.addEventListener('keydown', (e) => {
      const k = (e.key || '').toLowerCase();
      seq = [...seq, k].slice(-KONAMI.length);
      if (seq.join() === KONAMI.join()) { root.classList.toggle('crt'); root.classList.remove('onebit'); found('konami'); seq = []; }
      if (e.target && /input|textarea|select/i.test(e.target.tagName)) return;
      if (k.length === 1) typed = (typed + k).slice(-12);
      if (EGG.words.some((w) => typed.endsWith(w))) {
        typed = '';
        const hero = document.querySelector('.hero');
        if (hero && scrollY > hero.offsetHeight * 0.6) scrollTo({ top: 0, behavior: still ? 'auto' : 'smooth' });
        document.dispatchEvent(new CustomEvent('halyra:focus', { detail: { gold: true } }));
        found('word');
      }
    });

    // Click the logo 7 times: 1-bit mode.
    let logoN = 0;
    let logoAt = 0;
    document.querySelectorAll('.nav .logo').forEach((a) => a.addEventListener('click', (e) => {
      const here = new URL(a.href, location.href);
      if (here.pathname.replace(/index\.html$/, '') !== location.pathname.replace(/index\.html$/, '')) return;
      e.preventDefault();
      const now = Date.now();
      logoN = now - logoAt < 1500 ? logoN + 1 : 1;
      logoAt = now;
      if (logoN === 1) scrollTo({ top: 0, behavior: still ? 'auto' : 'smooth' });
      if (logoN >= 7) { logoN = 0; root.classList.toggle('onebit'); root.classList.remove('crt'); found('logo'); }
    }));

    // The sleepy cat in the footer.
    document.querySelectorAll('.cat').forEach((c) => c.addEventListener('click', () => {
      const tip = EGG.cat[Math.floor(Math.random() * EGG.cat.length)];
      c.classList.remove('awake');
      void c.offsetWidth;
      c.classList.add('awake');
      c.dataset.say = tip;
      found('cat');
    }));

    // Night owls get a gentle nudge.
    const hr = new Date().getHours();
    const nightEl = document.getElementById('night');
    if (nightEl && hr < 5) {
      const now = new Date();
      nightEl.textContent = EGG.night.replace('{time}', `${now.getHours()}:${String(now.getMinutes()).padStart(2, '0')}`);
      nightEl.hidden = false;
      setTimeout(() => found('night'), 2500);
    }

    // Console visitors.
    const art = [
      '  _   _       _                 ',
      ' | | | | __ _| |_   _ _ __ __ _ ',
      " | |_| |/ _` | | | | | '__/ _` |",
      ' |  _  | (_| | | |_| | | | (_| |',
      ' |_| |_|\\__,_|_|\\__, |_|  \\__,_|',
      '                |___/   focus   ',
    ].join('\n');
    try {
      console.log(`%c${art}`, 'color:#ff9a3c;font-family:monospace;font-weight:bold');
      console.log(`%c${EGG.console}`, 'color:#9aa3c7;font-size:12px');
    } catch (_) { /* no console */ }
    window.halyra = Object.freeze({
      secret() { found('console'); return EGG.hints.join('\n'); },
      ufo() { document.dispatchEvent(new CustomEvent('halyra:ufo')); return '🛸'; },
      found() { return `${got.length}/${IDS.length}`; },
    });
  }

  // ---------------------------------------------------------------- hero city (2D fallback when WebGL isn't available)
  window.__city2d = city2d;
  function city2d() {
  const cv = document.getElementById('city');
  if (!cv) return;
  const ctx = cv.getContext('2d');
  const stage = cv.parentElement;
  const labelsEl = document.getElementById('city-labels');
  const toggle = document.getElementById('focus-toggle');
  const overlay = document.getElementById('city-overlay');
  const timerEl = document.getElementById('city-timer');
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const L = JSON.parse(stage.dataset.labels || '{}');

  let rnd = 7;
  const rand = () => { rnd = (rnd * 16807) % 2147483647; return (rnd - 1) / 2147483646; };

  // Ground grid: 5x5 lots separated by streets. kind: bad (distraction) / good (work) / city (filler)
  const LOTS = [
    [-2, -2, 'city', 2.4], [-1, -2, 'city', 1.8], [0, -2, 'bad:social', 3.6], [1, -2, 'city', 2.6], [2, -2, 'bad:video', 4.4],
    [-2, -1, 'bad:games', 3.0], [-1, -1, 'city', 1.4], [0, -1, 'good:work', 5.2], [1, -1, 'city', 2.0], [2, -1, 'bad:news', 2.6],
    [-2, 0, 'city', 1.8], [-1, 0, 'good:study', 3.2], [0, 0, 'good:code', 3.8], [1, 0, 'city', 2.2], [2, 0, 'city', 1.5],
    [-2, 1, 'bad:shop', 2.2], [-1, 1, 'city', 2.6], [0, 1, 'city', 1.9], [1, 1, 'city', 1.7], [2, 1, 'city', 2.4],
    [-2, 2, 'bad:chat', 3.0], [-1, 2, 'city', 2.0], [0, 2, 'city', 1.6], [1, 2, 'city', 2.9], [2, 2, 'city', 1.4],
  ];
  const SP = 2.3;
  const B = LOTS.map(([gx, gy, k, h], i) => {
    const [kind, key] = k.split(':');
    const w = 1.25 + rand() * 0.35;
    const d = 1.25 + rand() * 0.35;
    const cols = Math.max(2, Math.round(w / 0.42));
    const rows = Math.max(2, Math.round(h / 0.46));
    const wins = [];
    for (let f = 0; f < 4; f += 1) {
      const face = [];
      for (let r = 0; r < rows; r += 1) for (let c = 0; c < cols; c += 1) face.push(rand());
      wins.push(face);
    }
    return { i, x: gx * SP, y: gy * SP, w, d, h, kind, key, cols, rows, wins, t: 0, delay: rand() * 0.6, lit: kind === 'city' ? 0.38 : kind === 'good' ? 0.62 : 0.72 };
  });

  let W = 0;
  let H = 0;
  let S = 30;
  let cx = 0;
  let cy = 0;
  let rot = -0.06;
  let mouse = 0;
  let mouseT = 0;
  let focus = false;
  let focusAt = 0;
  let auto = !reduce;
  let lastAuto = performance.now();
  let visible = true;
  let endAt = 0;

  const labelNodes = new Map();
  for (const b of B) {
    if (b.kind === 'city') continue;
    const el = document.createElement('div');
    el.className = `c-label ${b.kind}`;
    el.innerHTML = `<span class="dot"></span><span class="nm">${L[b.key] || b.key}</span><span class="lk" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg></span>`;
    labelsEl.appendChild(el);
    labelNodes.set(b, el);
  }

  function resize() {
    const r = stage.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    W = r.width;
    H = r.height;
    cv.width = Math.round(W * dpr);
    cv.height = Math.round(H * dpr);
    cv.style.width = `${W}px`;
    cv.style.height = `${H}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    S = Math.min(W / (W < 600 ? 19.5 : 17), H / 12.2);
    cx = W * 0.5;
    cy = H * 0.5 - S * 0.2;
  }

  const C30 = Math.cos(Math.PI / 6);
  function P(x, y, z) {
    const c = Math.cos(rot);
    const s = Math.sin(rot);
    const xr = x * c - y * s;
    const yr = x * s + y * c;
    return [cx + (xr - yr) * C30 * S, cy + (xr + yr) * 0.5 * S - z * S, xr + yr];
  }
  function poly(pts) {
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i += 1) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.closePath();
  }

  function ground() {
    const ext = 3 * SP;
    const g = [P(-ext, -ext, 0), P(ext, -ext, 0), P(ext, ext, 0), P(-ext, ext, 0)];
    poly(g);
    const grd = ctx.createLinearGradient(0, g[0][1], 0, g[2][1]);
    grd.addColorStop(0, 'rgba(30,38,64,.0)');
    grd.addColorStop(0.5, 'rgba(26,33,56,.85)');
    grd.addColorStop(1, 'rgba(14,18,32,.0)');
    ctx.fillStyle = grd;
    ctx.fill();
    // streets
    ctx.lineWidth = 1;
    for (let i = -2.5; i <= 2.5; i += 1) {
      const a = P(i * SP, -ext, 0);
      const b = P(i * SP, ext, 0);
      const c = P(-ext, i * SP, 0);
      const d = P(ext, i * SP, 0);
      ctx.strokeStyle = 'rgba(140,160,220,.07)';
      ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.moveTo(c[0], c[1]); ctx.lineTo(d[0], d[1]); ctx.stroke();
    }
    // street lamps
    ctx.globalCompositeOperation = 'lighter';
    for (let i = -2; i <= 2; i += 1) {
      for (let j = -2; j <= 3; j += 1) {
        const p = P((i - 0.5) * SP + 0.02, (j - 0.5) * SP, 0.02);
        const r = S * 0.55;
        const gl = ctx.createRadialGradient(p[0], p[1], 0, p[0], p[1], r);
        gl.addColorStop(0, 'rgba(255,180,90,.22)');
        gl.addColorStop(1, 'rgba(255,180,90,0)');
        ctx.fillStyle = gl;
        ctx.fillRect(p[0] - r, p[1] - r, r * 2, r * 2);
      }
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  function ringAround(b, alpha) {
    const pts = [];
    const r = Math.max(b.w, b.d) * 0.82;
    for (let k = 0; k < 40; k += 1) {
      const a = (k / 40) * Math.PI * 2;
      pts.push(P(b.x + Math.cos(a) * r, b.y + Math.sin(a) * r, 0.01));
    }
    poly(pts);
    ctx.strokeStyle = `rgba(255,92,92,${0.65 * alpha})`;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.fillStyle = `rgba(255,70,70,${0.08 * alpha})`;
    ctx.fill();
  }

  function building(b, now) {
    const { x, y, w, d } = b;
    const hw = w / 2;
    const hd = d / 2;
    const sink = b.kind === 'bad' ? b.t * 0.12 : 0;
    const h = b.h * (1 - sink);
    const c = Math.cos(rot);
    const s = Math.sin(rot);
    const faces = [
      { n: [1, 0], a: [x + hw, y - hd], b: [x + hw, y + hd] },
      { n: [0, 1], a: [x + hw, y + hd], b: [x - hw, y + hd] },
      { n: [-1, 0], a: [x - hw, y + hd], b: [x - hw, y - hd] },
      { n: [0, -1], a: [x - hw, y - hd], b: [x + hw, y - hd] },
    ];
    if (b.kind === 'bad' && b.t > 0.02) ringAround(b, b.t);

    const glowLit = [];
    faces.forEach((f, fi) => {
      const nx = f.n[0] * c - f.n[1] * s;
      const ny = f.n[0] * s + f.n[1] * c;
      if (nx + ny <= 0.001) return;
      const shade = nx - ny > 0 ? 0 : 1;
      const p1 = P(f.a[0], f.a[1], 0);
      const p2 = P(f.b[0], f.b[1], 0);
      const p3 = P(f.b[0], f.b[1], h);
      const p4 = P(f.a[0], f.a[1], h);
      poly([p1, p2, p3, p4]);
      const base = b.kind === 'bad' ? (shade ? [30, 34, 56] : [40, 46, 74]) : b.kind === 'good' ? (shade ? [34, 33, 50] : [48, 44, 66]) : (shade ? [22, 27, 44] : [31, 37, 60]);
      const g = ctx.createLinearGradient(0, p4[1], 0, p1[1]);
      g.addColorStop(0, `rgb(${base[0] + 10},${base[1] + 10},${base[2] + 14})`);
      g.addColorStop(1, `rgb(${base[0] - 8},${base[1] - 8},${base[2] - 8})`);
      ctx.fillStyle = g;
      ctx.fill();
      // windows
      const ex = f.b[0] - f.a[0];
      const ey = f.b[1] - f.a[1];
      const wins = b.wins[fi];
      let lit = b.lit;
      if (b.kind === 'bad') lit *= 1 - b.t;
      if (b.kind === 'good') lit = Math.min(0.92, lit + b.t * 0.28);
      for (let r = 0; r < b.rows; r += 1) {
        for (let cI = 0; cI < b.cols; cI += 1) {
          const v = wins[r * b.cols + cI];
          const u0 = (cI + 0.22) / b.cols;
          const u1 = (cI + 0.78) / b.cols;
          const z0 = ((r + 0.25) / b.rows) * h * 0.94 + 0.04;
          const z1 = ((r + 0.7) / b.rows) * h * 0.94 + 0.04;
          if (z1 > h - 0.05) continue;
          const q = [P(f.a[0] + ex * u0, f.a[1] + ey * u0, z0), P(f.a[0] + ex * u1, f.a[1] + ey * u1, z0), P(f.a[0] + ex * u1, f.a[1] + ey * u1, z1), P(f.a[0] + ex * u0, f.a[1] + ey * u0, z1)];
          const on = v < lit;
          poly(q);
          if (on) {
            const warm = b.kind === 'good' ? '255,214,140' : b.kind === 'bad' ? '255,196,120' : '255,205,150';
            const flick = 0.82 + 0.18 * Math.sin(now / 900 + v * 40);
            ctx.fillStyle = `rgba(${warm},${(shade ? 0.78 : 0.95) * flick})`;
            glowLit.push(q);
          } else {
            ctx.fillStyle = shade ? 'rgba(255,255,255,.025)' : 'rgba(255,255,255,.045)';
          }
          ctx.fill();
        }
      }
      // edge highlight
      ctx.strokeStyle = 'rgba(255,255,255,.05)';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(p4[0], p4[1]); ctx.lineTo(p3[0], p3[1]); ctx.stroke();
    });
    // roof
    const top = [P(x - hw, y - hd, h), P(x + hw, y - hd, h), P(x + hw, y + hd, h), P(x - hw, y + hd, h)];
    poly(top);
    ctx.fillStyle = b.kind === 'bad' ? `rgba(${58 + 80 * b.t},${62 - 10 * b.t},${92 - 30 * b.t},1)` : b.kind === 'good' ? '#4b4565' : '#2c3352';
    ctx.fill();
    ctx.strokeStyle = b.kind === 'bad' && b.t > 0.1 ? `rgba(255,110,110,${0.5 * b.t})` : 'rgba(255,255,255,.06)';
    ctx.stroke();
    // window glow
    if (glowLit.length) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = b.kind === 'good' ? 'rgba(255,190,90,.07)' : 'rgba(255,170,80,.06)';
      for (const q of glowLit) {
        const mx = (q[0][0] + q[2][0]) / 2;
        const my = (q[0][1] + q[2][1]) / 2;
        ctx.beginPath();
        ctx.arc(mx, my, S * 0.16, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalCompositeOperation = 'source-over';
    }
    // label anchor
    const lab = labelNodes.get(b);
    if (lab) {
      const p = P(x, y, h + 0.25);
      lab.style.transform = `translate(${p[0]}px, ${p[1]}px) translate(-50%, -100%)`;
      lab.classList.toggle('blocked', b.kind === 'bad' && b.t > 0.5);
      lab.classList.toggle('boost', b.kind === 'good' && b.t > 0.5);
    }
  }

  function setFocus(on, fromUser) {
    focus = on;
    focusAt = performance.now();
    if (fromUser) auto = false;
    if (on) endAt = Date.now() + 25 * 60000;
    toggle.setAttribute('aria-pressed', String(on));
    stage.classList.toggle('is-focus', on);
    if (overlay) {
      overlay.classList.remove('show');
      if (on) setTimeout(() => { if (focus) overlay.classList.add('show'); }, 900);
      setTimeout(() => overlay.classList.remove('show'), 4400);
    }
  }
  toggle.addEventListener('click', () => setFocus(!focus, true));

  stage.addEventListener('pointermove', (e) => {
    const r = stage.getBoundingClientRect();
    mouseT = ((e.clientX - r.left) / r.width - 0.5) * 0.35;
  });
  stage.addEventListener('pointerleave', () => { mouseT = 0; });

  function frame(now) {
    if (!visible || !W || !H) { if (!W) resize(); requestAnimationFrame(frame); return; }
    if (auto && now - lastAuto > (focus ? 6500 : 3800)) { lastAuto = now; setFocus(!focus, false); }
    mouse += (mouseT - mouse) * 0.06;
    rot = -0.06 + (reduce ? 0 : Math.sin(now / 7000) * 0.05) + mouse;
    for (const b of B) {
      if (b.kind === 'city') continue;
      const since = (now - focusAt) / 1000 - b.delay;
      const target = focus ? 1 : 0;
      if (since > 0) b.t += (target - b.t) * 0.06;
    }
    ctx.clearRect(0, 0, W, H);
    ground();
    const order = B.map((b) => ({ b, depth: P(b.x, b.y, 0)[2] })).sort((a, z) => a.depth - z.depth);
    for (const o of order) building(o.b, now);
    if (timerEl) {
      const left = focus ? Math.max(0, endAt - Date.now()) : 25 * 60000;
      const m = Math.floor(left / 60000);
      const sec = Math.floor((left % 60000) / 1000);
      timerEl.textContent = `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
    }
    requestAnimationFrame(frame);
  }

  if ('IntersectionObserver' in window) {
    new IntersectionObserver((es) => { visible = es[0].isIntersecting; }).observe(stage);
  }
  window.addEventListener('resize', resize);
  if ('ResizeObserver' in window) new ResizeObserver(resize).observe(stage);
  resize();
  requestAnimationFrame(frame);
  }
}());
