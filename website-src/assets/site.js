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

  // ---------------------------------------------------------------- hero city
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
}());
