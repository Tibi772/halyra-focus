/* Halyra Focus — "Focus Island": a tiny WebGL engine for the hero (no dependencies).
   A floating island city at night. Distracting apps are neon-lit buildings; focus mode
   switches their signs off, locks them in glass, raises a shield and grows the tree.
   Drag to orbit, click buildings. Falls back to the 2D city if WebGL isn't available. */
(function () {
  'use strict';
  const cv = document.getElementById('city');
  if (!cv) return;
  const stage = cv.parentElement;
  const fallback = () => { if (window.__city2d) window.__city2d(); };

  let gl = null;
  try { gl = cv.getContext('webgl', { antialias: true, alpha: false, powerPreference: 'high-performance' }) || cv.getContext('experimental-webgl'); } catch (_) { gl = null; }
  if (!gl) { fallback(); return; }

  const labelsEl = document.getElementById('city-labels');
  const toggle = document.getElementById('focus-toggle');
  const overlay = document.getElementById('city-overlay');
  const timerEl = document.getElementById('city-timer');
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  // How wintry the scene is. Follows the season switch in the header, eased so
  // flipping it reads as the weather turning rather than a setting toggling.
  const wantWinter = () => (document.documentElement.classList.contains('xmas') ? 1 : 0.12);
  let winter = wantWinter();
  const L = JSON.parse(stage.dataset.labels || '{}');
  const egg = (id) => document.dispatchEvent(new CustomEvent('halyra:egg', { detail: { id } }));

  // ------------------------------------------------------------------ tiny math
  const mat = () => new Float32Array(16);
  function persp(o, fovy, aspect, near, far) {
    const f = 1 / Math.tan(fovy / 2);
    const nf = 1 / (near - far);
    o.fill(0);
    o[0] = f / aspect; o[5] = f; o[10] = (far + near) * nf; o[11] = -1; o[14] = 2 * far * near * nf;
    return o;
  }
  function lookAt(o, e, c, up) {
    let zx = e[0] - c[0]; let zy = e[1] - c[1]; let zz = e[2] - c[2];
    let l = Math.hypot(zx, zy, zz); zx /= l; zy /= l; zz /= l;
    let xx = up[1] * zz - up[2] * zy; let xy = up[2] * zx - up[0] * zz; let xz = up[0] * zy - up[1] * zx;
    l = Math.hypot(xx, xy, xz); xx /= l; xy /= l; xz /= l;
    const yx = zy * xz - zz * xy; const yy = zz * xx - zx * xz; const yz = zx * xy - zy * xx;
    o[0] = xx; o[1] = yx; o[2] = zx; o[3] = 0;
    o[4] = xy; o[5] = yy; o[6] = zy; o[7] = 0;
    o[8] = xz; o[9] = yz; o[10] = zz; o[11] = 0;
    o[12] = -(xx * e[0] + xy * e[1] + xz * e[2]);
    o[13] = -(yx * e[0] + yy * e[1] + yz * e[2]);
    o[14] = -(zx * e[0] + zy * e[1] + zz * e[2]);
    o[15] = 1;
    return o;
  }
  function mul(o, a, b) {
    for (let i = 0; i < 4; i += 1) {
      for (let j = 0; j < 4; j += 1) {
        let s = 0;
        for (let k = 0; k < 4; k += 1) s += a[k * 4 + j] * b[i * 4 + k];
        o[i * 4 + j] = s;
      }
    }
    return o;
  }
  /** translate · rotateY · scale(sx, sy, sz) */
  function trs(o, tx, ty, tz, ry, sx, sy, sz) {
    const c = Math.cos(ry); const s = Math.sin(ry);
    o[0] = c * sx; o[1] = 0; o[2] = -s * sx; o[3] = 0;
    o[4] = 0; o[5] = sy; o[6] = 0; o[7] = 0;
    o[8] = s * sz; o[9] = 0; o[10] = c * sz; o[11] = 0;
    o[12] = tx; o[13] = ty; o[14] = tz; o[15] = 1;
    return o;
  }
  const ID = trs(mat(), 0, 0, 0, 0, 1, 1, 1);

  let seed = 11;
  const rand = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
  const hex = (h) => [parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255];
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const norm = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

  // ------------------------------------------------------------------ geometry (pos3 nor3 col4 ex4)
  // ex = [object id, material flag, u, v]
  // flags: 0 plain · 1 wall with windows (col.a = wall height) · 2 ground · 3..8 neon sign · 10 emissive · 11 tree leaves
  const STRIDE = 14;
  function Mesh() { this.v = []; }
  Mesh.prototype.vert = function (p, n, c, e) { this.v.push(p[0], p[1], p[2], n[0], n[1], n[2], c[0], c[1], c[2], c[3] == null ? 1 : c[3], e[0], e[1], e[2], e[3]); };
  Mesh.prototype.tri = function (a, b, c, col, ex, hint, exB, exC) {
    let n = norm(cross(sub(b, a), sub(c, a)));
    if (hint && n[0] * hint[0] + n[1] * hint[1] + n[2] * hint[2] < 0) n = [-n[0], -n[1], -n[2]];
    this.vert(a, n, col, ex); this.vert(b, n, col, exB || ex); this.vert(c, n, col, exC || ex);
  };
  /** Quad a-b-c-d with a given normal and per-corner uv. */
  Mesh.prototype.quad = function (a, b, c, d, n, col, id, flag, uv) {
    const e = (k) => [id, flag, uv ? uv[k][0] : 0, uv ? uv[k][1] : 0];
    this.vert(a, n, col, e(0)); this.vert(b, n, col, e(1)); this.vert(c, n, col, e(2));
    this.vert(a, n, col, e(0)); this.vert(c, n, col, e(2)); this.vert(d, n, col, e(3));
  };
  /** Low-poly sphere (flat shaded, slightly jittered). */
  Mesh.prototype.blob = function (cx, cy, cz, r, col, id, flag, segU = 7, segV = 5, jit = 0.12, sy = 1) {
    const pts = [];
    for (let i = 0; i <= segV; i += 1) {
      const row = [];
      const th = (i / segV) * Math.PI;
      for (let j = 0; j < segU; j += 1) {
        const ph = (j / segU) * Math.PI * 2 + (i % 2) * (Math.PI / segU);
        const k = i === 0 || i === segV ? 0 : jit;
        const rr = r * (1 + (rand() - 0.5) * k);
        row.push([cx + Math.sin(th) * Math.cos(ph) * rr, cy + Math.cos(th) * rr * sy, cz + Math.sin(th) * Math.sin(ph) * rr]);
      }
      pts.push(row);
    }
    for (let i = 0; i < segV; i += 1) {
      for (let j = 0; j < segU; j += 1) {
        const a = pts[i][j]; const b = pts[i][(j + 1) % segU]; const c = pts[i + 1][j]; const d = pts[i + 1][(j + 1) % segU];
        const mid = (p, q, s) => [(p[0] + q[0] + s[0]) / 3 - cx, (p[1] + q[1] + s[1]) / 3 - cy, (p[2] + q[2] + s[2]) / 3 - cz];
        if (i > 0) this.tri(a, b, c, col, [id, flag, 0, 0], mid(a, b, c));
        if (i < segV - 1) this.tri(b, d, c, col, [id, flag, 0, 0], mid(b, d, c));
      }
    }
  };
  /** Cone / tapered prism. */
  Mesh.prototype.cone = function (cx, y0, cz, r0, y1, r1, seg, col, id, flag = 0, rot = 0) {
    for (let j = 0; j < seg; j += 1) {
      const a0 = rot + (j / seg) * Math.PI * 2; const a1 = rot + ((j + 1) / seg) * Math.PI * 2;
      const p0 = [cx + Math.cos(a0) * r0, y0, cz + Math.sin(a0) * r0]; const p1 = [cx + Math.cos(a1) * r0, y0, cz + Math.sin(a1) * r0];
      const q0 = [cx + Math.cos(a0) * r1, y1, cz + Math.sin(a0) * r1]; const q1 = [cx + Math.cos(a1) * r1, y1, cz + Math.sin(a1) * r1];
      const out = [Math.cos((a0 + a1) / 2), 0.3, Math.sin((a0 + a1) / 2)];
      this.tri(p0, p1, q1, col, [id, flag, 0, 0], out);
      if (r1 > 0.001) this.tri(p0, q1, q0, col, [id, flag, 0, 0], out);
      if (r1 > 0.001) this.tri(q0, q1, [cx, y1, cz], col, [id, flag, 0, 0], [0, 1, 0]);
    }
  };

  // ---------------------------------------------------------------- the island & city
  const SP = 2.25;
  const NEON = { social: '#ff4f9a', video: '#ff3d3d', games: '#9d6bff', news: '#dfe6ff', shop: '#ffc531', chat: '#2fc8ff' };
  const SIGN = { social: 3, video: 4, games: 5, news: 6, shop: 7, chat: 8 };
  const LOTS = [
    [-2, -2, 'city', 2.0], [-1, -2, 'bad:social', 3.7], [0, -2, 'city', 2.6], [1, -2, 'bad:video', 4.7], [2, -2, 'city', 1.8],
    [-2, -1, 'bad:games', 3.1], [-1, -1, 'good:work', 4.4], [0, -1, 'city', 1.5], [1, -1, 'good:code', 3.4], [2, -1, 'bad:news', 2.8],
    [-2, 0, 'city', 2.4], [-1, 0, 'city', 1.3], [1, 0, 'city', 1.4], [2, 0, 'bad:chat', 3.3],
    [-2, 1, 'bad:shop', 2.5], [-1, 1, 'good:study', 2.5], [0, 1, 'city', 1.3], [1, 1, 'city', 1.5], [2, 1, 'city', 2.7],
    [-2, 2, 'city', 1.6], [-1, 2, 'city', 2.2], [0, 2, 'city', 1.6], [1, 2, 'city', 2.9], [2, 2, 'city', 1.5],
  ];
  const OBJ_N = 40; // uniform slots: 0 = static, 1..25 buildings, 30 tree, 31 ufo
  const T_TREE = 30;
  const T_UFO = 31;
  const objs = new Float32Array(OBJ_N * 4);

  const world = new Mesh();
  const buildings = LOTS.map(([gx, gz, k, h], i) => {
    const [kind, key] = k.split(':');
    const id = i + 1;
    const w = 1.2 + rand() * 0.35;
    const d = 1.2 + rand() * 0.35;
    const x = gx * SP + (rand() - 0.5) * 0.25;
    const z = gz * SP + (rand() - 0.5) * 0.25;
    const b = { id, kind, key, x, z, w, d, h, lit: kind === 'city' ? 0.42 + rand() * 0.15 : kind === 'good' ? 0.6 : 0.78, lock: 0, neon: 1, light: 1, manual: false, hover: 0, bounce: 0, delay: rand() * 0.7 };
    const col = kind === 'bad' ? hex('#2a2f4d') : kind === 'good' ? hex('#3a3350') : hex('#242a44');
    const roof = kind === 'bad' ? hex('#353b5e') : kind === 'good' ? hex('#4a4262') : hex('#2d3453');
    const hw = w / 2; const hd = d / 2;
    const C = [[x - hw, z - hd], [x + hw, z - hd], [x + hw, z + hd], [x - hw, z + hd]];
    const N = [[0, 0, -1], [1, 0, 0], [0, 0, 1], [-1, 0, 0]];
    for (let f = 0; f < 4; f += 1) {
      const [ax, az] = C[f]; const [bx, bz] = C[(f + 1) % 4];
      const len = Math.hypot(bx - ax, bz - az);
      world.quad([ax, 0, az], [bx, 0, bz], [bx, h, bz], [ax, h, az], N[f], [col[0], col[1], col[2], h], id, 1, [[0, 0], [len, 0], [len, h], [0, h]]);
    }
    world.quad([x - hw, h, z - hd], [x + hw, h, z - hd], [x + hw, h, z + hd], [x - hw, h, z + hd], [0, 1, 0], roof, id, 0);
    // rooftop details
    if (kind !== 'bad' && rand() > 0.35) {
      const rw = 0.25 + rand() * 0.25;
      const rx = x + (rand() - 0.5) * (w - rw * 2) * 0.6; const rz = z + (rand() - 0.5) * (d - rw * 2) * 0.6;
      const rh = 0.25 + rand() * 0.35;
      world.cone(rx, h, rz, rw, h + rh, rw, 4, roof, id, 0, Math.PI / 4);
    }
    if (kind === 'city' && h > 2.3) world.cone(x + hw * 0.5, h, z - hd * 0.4, 0.03, h + 0.9, 0.01, 3, hex('#8890b0'), id, 0);
    if (kind === 'bad') {
      // neon sign on two poles, facing the default camera
      const sy = h + 0.25;
      const dirA = 0.62;
      const cxs = Math.cos(dirA); const sxs = Math.sin(dirA);
      const sw = 0.82; const sh = 1.1;
      const p = (u, v) => [x + cxs * u, sy + v, z - sxs * u];
      const n = [sxs, 0, cxs];
      const nc = hex(NEON[key]);
      world.quad(p(-sw, 0.22), p(sw, 0.22), p(sw, 0.22 + sh), p(-sw, 0.22 + sh), n, [nc[0], nc[1], nc[2], 1], id, SIGN[key], [[0, 0], [1, 0], [1, 1], [0, 1]]);
      world.quad(p(sw, 0.22), p(-sw, 0.22), p(-sw, 0.22 + sh), p(sw, 0.22 + sh), [-n[0], 0, -n[2]], [nc[0], nc[1], nc[2], 1], id, SIGN[key], [[0, 0], [1, 0], [1, 1], [0, 1]]);
      world.cone(x + cxs * -sw * 0.7, h, z - sxs * -sw * 0.7, 0.035, sy + 0.25, 0.035, 4, hex('#5a6080'), id, 0);
      world.cone(x + cxs * sw * 0.7, h, z - sxs * sw * 0.7, 0.035, sy + 0.25, 0.035, 4, hex('#5a6080'), id, 0);
      b.sign = [x, sy + 0.22 + sh / 2, z];
    }
    return b;
  });
  const byId = new Map(buildings.map((b) => [b.id, b]));

  // island: top disc, cliff, rocky underside
  const SEG = 44;
  const R = [];
  for (let j = 0; j < SEG; j += 1) R.push(8.1 + (rand() - 0.5) * 0.7 + Math.sin(j * 0.9) * 0.18);
  const ring = (y, k, jitY, jitR) => R.map((r, j) => {
    const a = (j / SEG) * Math.PI * 2;
    const rr = r * k * (1 + (rand() - 0.5) * jitR);
    return [Math.cos(a) * rr, y + (rand() - 0.5) * jitY, Math.sin(a) * rr];
  });
  const r0 = ring(0, 1, 0, 0);
  const r1 = ring(-0.55, 0.985, 0.12, 0.03);
  const r2 = ring(-2.0, 0.78, 0.5, 0.12);
  const r3 = ring(-3.9, 0.48, 0.7, 0.2);
  const r4 = ring(-5.6, 0.2, 0.6, 0.3);
  const tip = [0.4, -7.6, -0.3];
  const groundCol = hex('#171c2e');
  for (let j = 0; j < SEG; j += 1) {
    const k = (j + 1) % SEG;
    world.tri([0, 0, 0], r0[j], r0[k], groundCol, [0, 2, 0, 0], [0, 1, 0]);
  }
  const band = (A, B, colA, colB) => {
    for (let j = 0; j < SEG; j += 1) {
      const k = (j + 1) % SEG;
      const out = [A[j][0] + B[j][0], 0, A[j][2] + B[j][2]];
      world.tri(A[j], A[k], B[k], colA, [0, 0, 0, 0], out);
      world.tri(A[j], B[k], B[j], colB, [0, 0, 0, 0], out);
    }
  };
  band(r0, r1, hex('#2b4a43'), hex('#27443e'));
  band(r1, r2, hex('#55436a'), hex('#4c3c62'));
  band(r2, r3, hex('#42345a'), hex('#3c2f52'));
  band(r3, r4, hex('#30264a'), hex('#2b2243'));
  for (let j = 0; j < SEG; j += 1) world.tri(r4[j], r4[(j + 1) % SEG], tip, hex('#231c38'), [0, 0, 0, 0], [r4[j][0], -0.5, r4[j][2]]);
  world.blob(tip[0], tip[1] + 0.2, tip[2], 0.55, hex('#b48cff'), 0, 10, 5, 3, 0.25, 1.8);
  // park hill in the middle
  const hillCol = hex('#24503e');
  const h0 = []; const h1 = [];
  for (let j = 0; j < 14; j += 1) {
    const a = (j / 14) * Math.PI * 2;
    h0.push([Math.cos(a) * 1.15, 0.01, Math.sin(a) * 1.15]);
    h1.push([Math.cos(a + 0.2) * 0.7, 0.22, Math.sin(a + 0.2) * 0.7]);
  }
  for (let j = 0; j < 14; j += 1) {
    const k = (j + 1) % 14;
    world.tri(h0[j], h0[k], h1[k], hillCol, [0, 0, 0, 0], [h0[j][0], 1.5, h0[j][2]]);
    world.tri(h0[j], h1[k], h1[j], hillCol, [0, 0, 0, 0], [h0[j][0], 1.5, h0[j][2]]);
    world.tri(h1[j], h1[k], [0, 0.32, 0], hex('#2a5a46'), [0, 0, 0, 0], [0, 1, 0]);
  }
  // pines around the rim
  for (let i = 0; i < 46; i += 1) {
    const a = rand() * Math.PI * 2;
    const r = 6.9 + rand() * 0.9;
    const px = Math.cos(a) * r; const pz = Math.sin(a) * r;
    if (Math.max(Math.abs(px), Math.abs(pz)) < 5.6) continue;
    const s = 0.55 + rand() * 0.5;
    world.cone(px, 0, pz, 0.06 * s, 0.35 * s, 0.05 * s, 4, hex('#3b2c2a'), 0, 0);
    world.cone(px, 0.3 * s, pz, 0.42 * s, 1.15 * s, 0, 6, hex(rand() > 0.5 ? '#1f4a46' : '#245449'), 0, 0, rand());
    world.cone(px, 0.75 * s, pz, 0.3 * s, 1.55 * s, 0, 6, hex('#2b5f53'), 0, 0, rand());
  }
  // moon (emissive)
  // The moon sits at a fixed spot in the sky (camera space), far away.
  const MOON = [0, 0, 0];
  const moon = new Mesh();
  moon.blob(0, 0, 0, 3.2, hex('#e9ecff'), 0, 10, 12, 8, 0.02);
  moon.blob(-0.9, 0.6, 3.0, 0.7, hex('#c8cde6'), 0, 10, 6, 4, 0.05);
  moon.blob(1.1, -0.8, 2.9, 0.55, hex('#c8cde6'), 0, 10, 6, 4, 0.05);

  // the tree (own model matrix, scaled as it grows)
  const tree = new Mesh();
  tree.cone(0, 0, 0, 0.13, 1.25, 0.07, 6, hex('#6b4a35'), T_TREE, 0);
  tree.cone(0.02, 0.8, 0, 0.05, 1.35, 0.02, 4, hex('#6b4a35'), T_TREE, 0);
  tree.blob(0, 1.72, 0, 0.78, hex('#3fa36a'), T_TREE, 11, 8, 5, 0.16);
  tree.blob(0.5, 1.4, 0.18, 0.5, hex('#46ad70'), T_TREE, 11, 7, 4, 0.18);
  tree.blob(-0.45, 1.45, -0.22, 0.52, hex('#379a63'), T_TREE, 11, 7, 4, 0.18);
  tree.blob(0.05, 2.25, -0.1, 0.42, hex('#4cb878'), T_TREE, 11, 6, 4, 0.18);

  // floating rocks
  const rock = new Mesh();
  rock.cone(0, 0, 0, 0.55, -0.9, 0.0, 5, hex('#2a2238'), 0, 0);
  rock.cone(0, 0, 0, 0.55, 0.05, 0.5, 5, hex('#2b4a43'), 0, 0);
  const ROCKS = [[-9.6, -1.2, 3.5, 0.9], [9.8, 0.6, -2.5, 0.7], [6.5, -2.6, 8.1, 0.55], [-7.5, 1.4, -8.6, 0.6]];

  // a UFO that sometimes crosses the sky (hidden)
  const ufo = new Mesh();
  ufo.blob(0, 0, 0, 0.9, hex('#9aa3c7'), T_UFO, 0, 12, 6, 0, 0.28);
  ufo.blob(0, 0.22, 0, 0.42, hex('#7ff0ff'), T_UFO, 10, 10, 5, 0, 0.9);
  for (let i = 0; i < 8; i += 1) { const a = (i / 8) * Math.PI * 2; ufo.blob(Math.cos(a) * 0.78, -0.03, Math.sin(a) * 0.78, 0.08, hex('#ffd36b'), T_UFO, 10, 5, 3, 0); }

  // hemisphere for shield & lock domes
  const dome = [];
  {
    const LAT = 10; const LON = 28;
    const P = (i, j) => { const th = (i / LAT) * (Math.PI / 2); const ph = (j / LON) * Math.PI * 2; return [Math.cos(th) * Math.cos(ph), Math.sin(th), Math.cos(th) * Math.sin(ph)]; };
    for (let i = 0; i < LAT; i += 1) {
      for (let j = 0; j < LON; j += 1) {
        const a = P(i, j); const b = P(i, j + 1); const c = P(i + 1, j); const d = P(i + 1, j + 1);
        dome.push(...a, ...b, ...d, ...a, ...d, ...c);
      }
    }
  }

  // glows: center3 corner2 color3 size1 mode1 obj1
  const glows = [];
  const glow = (p, col, size, mode, obj, k = 1) => {
    const c = hex(col).map((x) => x * k);
    for (const [u, v] of [[-1, -1], [1, -1], [1, 1], [-1, -1], [1, 1], [-1, 1]]) glows.push(p[0], p[1], p[2], u, v, c[0], c[1], c[2], size, mode, obj);
  };
  for (const b of buildings) {
    if (b.kind === 'bad') glow(b.sign, NEON[b.key], 2.6, 0, b.id, 0.9);
    if (b.kind === 'good') glow([b.x, b.h + 0.35, b.z], '#ffcf7a', 1.6, 2, b.id, 0.9);
  }
  for (let i = -2; i <= 1; i += 1) for (let j = -2; j <= 1; j += 1) glow([(i + 0.5) * SP, 0.55, (j + 0.5) * SP], '#ffb35c', 1.1, 1, 0, 0.55);
  glow([0, 1.6, 0], '#9dffb0', 4.4, 2, 0, 0.35);
  glow([tip[0], tip[1], tip[2]], '#a070ff', 6, 1, 0, 0.5);

  const moonGlow = [];
  for (const [u, v] of [[-1, -1], [1, -1], [1, 1], [-1, -1], [1, 1], [-1, 1]]) moonGlow.push(0, 0, 0, u, v, 0.79 * 0.4, 0.83 * 0.4, 1.0 * 0.4, 22, 1, 0);

  // points: pos3 seed1 kind1
  const pts = [];
  for (let i = 0; i < 700; i += 1) {
    const a = rand() * Math.PI * 2; const y = rand() * 2 - 1;
    const r = Math.sqrt(1 - y * y);
    pts.push(Math.cos(a) * r * 95, y * 70, Math.sin(a) * r * 95, rand(), 0);
  }
  for (let i = 0; i < 60; i += 1) {
    const a = rand() * Math.PI * 2; const r = 0.6 + rand() * 4.2;
    pts.push(Math.cos(a) * r, 0.4 + rand() * 2.8, Math.sin(a) * r, rand(), 1);
  }
  const SHOOT_N = 48;
  for (let i = 0; i < SHOOT_N; i += 1) pts.push(0, -999, 0, i / SHOOT_N, 2);

  // ------------------------------------------------------------------ shaders
  const HP = '#ifdef GL_FRAGMENT_PRECISION_HIGH\nprecision highp float;\n#else\nprecision mediump float;\n#endif\n';
  const LIT_VS = `
attribute vec3 aPos; attribute vec3 aNor; attribute vec4 aCol; attribute vec4 aEx;
uniform mat4 uVP; uniform mat4 uM; uniform vec4 uObj[${OBJ_N}];
varying vec3 vNor; varying vec4 vCol; varying vec4 vEx; varying vec3 vW; varying vec4 vObj;
void main() {
  vec4 w = uM * vec4(aPos, 1.0);
  vW = w.xyz; vNor = (uM * vec4(aNor, 0.0)).xyz; vCol = aCol; vEx = aEx;
  vObj = uObj[int(aEx.x + 0.5)];
  gl_Position = uVP * w;
}`;
  const LIT_FS = `${HP}
uniform vec3 uCam; uniform vec3 uFog; uniform float uTime; uniform float uFocus; uniform float uSP;
varying vec3 vNor; varying vec4 vCol; varying vec4 vEx; varying vec3 vW; varying vec4 vObj;
float hash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float box(vec2 p, vec2 b) { vec2 d = abs(p) - b; return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0); }
float symbol(float k, vec2 p) {
  if (k < 3.5) { p.y = p.y * 1.15 + 0.12; p *= 1.4; float a = p.x * p.x + p.y * p.y - 1.0; return step(a * a * a - p.x * p.x * p.y * p.y * p.y, 0.0); }
  if (k < 4.5) { return step(-0.38, p.x) * step(abs(p.y), (0.45 - p.x) * 0.62) * step(p.x, 0.45); }
  if (k < 5.5) { return max(step(box(p, vec2(0.48, 0.14)), 0.0), step(box(p, vec2(0.14, 0.48)), 0.0)); }
  if (k < 6.5) { float l = step(abs(fract(p.y * 2.2 + 0.5) - 0.5), 0.16) * step(abs(p.y), 0.55); return l * step(abs(p.x), 0.48 - step(p.y, -0.2) * 0.18); }
  if (k < 7.5) { float bag = step(box(p - vec2(0.0, -0.1), vec2(0.42, 0.34)), 0.0); float h = abs(length(p - vec2(0.0, 0.25)) - 0.2); return max(bag, step(h, 0.05) * step(0.2, p.y)); }
  float bub = step(length((p - vec2(0.0, 0.08)) * vec2(1.0, 1.45)), 0.5); float tail = step(box(p - vec2(-0.22, -0.32), vec2(0.07, 0.12)), 0.0); return max(bub, tail);
}
void main() {
  vec3 n = normalize(vNor);
  vec3 base = vCol.rgb;
  float flag = vEx.y;
  vec3 em = vec3(0.0);
  float dif = max(dot(n, normalize(vec3(-0.45, 0.8, 0.35))), 0.0);
  vec3 light = mix(vec3(0.09, 0.08, 0.15), vec3(0.30, 0.34, 0.52), n.y * 0.5 + 0.5) + dif * vec3(0.5, 0.56, 0.8);
  light += vec3(0.30, 0.15, 0.06) * (1.0 - smoothstep(0.0, 2.5, vW.y)) * step(-0.05, vW.y) * 0.55;
  if (flag > 0.5 && flag < 1.5) {
    vec2 g = vec2(vEx.z / 0.42, vEx.w / 0.5);
    vec2 cell = floor(g); vec2 f = fract(g);
    float win = step(0.2, f.x) * step(f.x, 0.8) * step(0.24, f.y) * step(f.y, 0.74) * step(vEx.w, vCol.a - 0.3) * step(0.3, vEx.w);
    float h = hash(cell + vEx.x * 7.13);
    float on = step(h, vObj.x);
    float fl = 0.85 + 0.15 * sin(uTime * 1.7 + h * 50.0);
    vec3 wc = mix(vec3(1.0, 0.7, 0.38), vec3(0.62, 0.82, 1.0), step(0.86, hash(cell * 3.1 + vEx.x)));
    em += win * on * wc * 1.35 * fl;
    base = mix(base, vec3(0.06, 0.07, 0.12), win * (1.0 - on));
  } else if (flag > 1.5 && flag < 2.5) {
    vec2 g = vW.xz / uSP;
    vec2 fs = abs(fract(g) - 0.5);
    float inCity = step(max(abs(g.x), abs(g.y)), 2.62);
    float street = (1.0 - smoothstep(0.13, 0.17, min(fs.x, fs.y))) * inCity;
    float park = 1.0 - smoothstep(1.1, 1.3, length(vW.xz));
    base = mix(vec3(0.10, 0.17, 0.14), base, inCity);
    base = mix(base, vec3(0.16, 0.17, 0.25), street * (1.0 - park));
    float dash = step(min(fs.x, fs.y), 0.008) * step(0.5, fract((fs.x < fs.y ? g.y : g.x) * 4.0)) * street;
    em += vec3(0.9, 0.7, 0.3) * dash * 0.25 * (1.0 - park);
    vec2 q = abs(fract(g + 0.5) - 0.5);
    em += vec3(1.0, 0.62, 0.28) * 0.42 * exp(-dot(q, q) * 70.0) * inCity * (1.0 - park);
    base = mix(base, vec3(0.13, 0.27, 0.2), park);
  } else if (flag > 2.5 && flag < 9.5) {
    vec2 p = (vEx.zw - 0.5) * 2.0;
    float s = symbol(flag, p * 1.15);
    float frame = step(0.86, max(abs(p.x), abs(p.y))) * step(max(abs(p.x), abs(p.y)), 0.97);
    float buzz = 0.9 + 0.1 * sin(uTime * 23.0 + vEx.x);
    em += base * (s * (0.12 + 2.1 * vObj.y) + frame * (0.08 + 1.1 * vObj.y)) * buzz;
    base = vec3(0.03, 0.03, 0.05);
  } else if (flag > 9.5 && flag < 10.5) {
    em = base * 1.15; base = vec3(0.0);
  } else if (flag > 10.5) {
    base = mix(base, vec3(1.0, 0.78, 0.3), vObj.y) * (0.72 + 0.5 * vObj.x);
    em += base * 0.16 * vObj.x;
  }
  vec3 col = base * light + em;
  col += vObj.w * vec3(0.16, 0.12, 0.08);
  col = mix(col, col * vec3(0.8, 0.55, 0.65) + vec3(0.05, 0.0, 0.015), vObj.z * 0.55);
  float d = distance(vW, uCam);
  float fog = smoothstep(18.0, 70.0, d);
  fog = max(fog, smoothstep(-3.0, -12.0, vW.y) * 0.5);
  col += vec3(0.22, 0.12, 0.34) * pow(1.0 - abs(dot(n, normalize(uCam - vW))), 2.0) * step(vW.y, -0.3) * 1.2;
  if (flag > 9.5 && flag < 10.5) fog *= 0.12;
  gl_FragColor = vec4(mix(col, uFog, fog), 1.0);
}`;
  const SKY_VS = 'attribute vec2 aPos; varying vec2 vP; void main() { vP = aPos; gl_Position = vec4(aPos, 0.9999, 1.0); }';
  const SKY_FS = `${HP}
uniform float uFocus; uniform float uTime; uniform vec2 uRes; varying vec2 vP;
void main() {
  float y = vP.y * 0.5 + 0.5;
  vec3 topA = vec3(0.035, 0.028, 0.07); vec3 horA = vec3(0.16, 0.05, 0.16);
  vec3 topB = vec3(0.02, 0.035, 0.08); vec3 horB = vec3(0.05, 0.11, 0.17);
  vec3 col = mix(mix(horA, topA, smoothstep(0.1, 0.95, y)), mix(horB, topB, smoothstep(0.1, 0.95, y)), uFocus);
  float x = vP.x * uRes.x / uRes.y;
  float band = sin(x * 2.1 + uTime * 0.21) * 0.06 + sin(x * 5.3 - uTime * 0.13) * 0.025;
  float aur = exp(-pow((y - 0.78 - band) * 9.0, 2.0)) * (0.55 + 0.45 * sin(x * 9.0 + uTime * 0.7));
  col += vec3(0.08, 0.45, 0.35) * aur * 0.42 * uFocus;
  float haze = exp(-pow((y - 0.42) * 4.0, 2.0));
  col += vec3(0.35, 0.05, 0.22) * haze * 0.22 * (1.0 - uFocus);
  vec2 c = vec2(vP.x * uRes.x / uRes.y * 0.62, vP.y * 0.95 - 0.05);
  float vig = smoothstep(0.35, 1.15, length(c));
  col = mix(col, vec3(0.027, 0.035, 0.059), vig);
  gl_FragColor = vec4(col, 1.0);
}`;
  const GLOW_VS = `
attribute vec3 aC; attribute vec2 aQ; attribute vec3 aCol; attribute vec3 aS;
uniform mat4 uVP; uniform vec3 uRight; uniform vec3 uUp; uniform vec3 uOff; uniform vec4 uObj[${OBJ_N}]; uniform float uFocus;
varying vec2 vQ; varying vec3 vCol;
void main() {
  vec4 o = uObj[int(aS.z + 0.5)];
  float k = aS.y < 0.5 ? o.y : aS.y < 1.5 ? 1.0 : aS.y < 2.5 ? uFocus : 1.0 - uFocus;
  vQ = aQ; vCol = aCol * k;
  vec3 p = aC + uOff + (uRight * aQ.x + uUp * aQ.y) * aS.x * 0.5;
  gl_Position = uVP * vec4(p, 1.0);
}`;
  const GLOW_FS = `${HP}
varying vec2 vQ; varying vec3 vCol;
void main() { float d = dot(vQ, vQ); float a = exp(-d * 4.0) - 0.0183; gl_FragColor = vec4(vCol * max(a, 0.0), 1.0); }`;
  const PT_VS = `
attribute vec3 aP; attribute vec2 aK;
uniform mat4 uVP; uniform float uTime; uniform float uFocus; uniform float uDpr; uniform float uH;
varying float vA; varying vec3 vCol;
void main() {
  vec3 p = aP;
  float s = 2.0; vA = 1.0; vCol = vec3(1.0);
  if (aK.y < 0.5) { vA = 0.45 + 0.55 * sin(uTime * (0.6 + aK.x * 2.0) + aK.x * 80.0); s = 1.2 + aK.x * 1.8; vCol = mix(vec3(0.75, 0.82, 1.0), vec3(1.0, 0.9, 0.8), aK.x); vA *= 0.75 + 0.25 * uFocus; }
  else if (aK.y < 1.5) {
    float t = uTime * (0.3 + aK.x * 0.4) + aK.x * 40.0;
    p += vec3(sin(t) * 0.5, sin(t * 1.3) * 0.35, cos(t * 0.8) * 0.5);
    vA = uFocus * (0.55 + 0.45 * sin(uTime * 3.0 + aK.x * 30.0)); s = 6.0; vCol = vec3(1.0, 0.92, 0.45);
  } else { vA = clamp(aP.y > -900.0 ? 1.0 - aK.x : 0.0, 0.0, 1.0); s = 7.0 * (1.0 - aK.x) + 1.0; vCol = vec3(0.85, 0.92, 1.0); }
  vec4 c = uVP * vec4(p, 1.0);
  gl_Position = c;
  gl_PointSize = s * uDpr * (aK.y < 0.5 ? 1.0 : clamp(18.0 / c.w, 0.4, 2.5)) * uH;
}`;
  const PT_FS = `${HP}
varying float vA; varying vec3 vCol;
void main() { vec2 q = gl_PointCoord - 0.5; float d = dot(q, q) * 4.0; gl_FragColor = vec4(vCol * vA * max(0.0, 1.0 - d) * (1.0 - d * 0.5), 1.0); }`;
  const DOME_VS = `
attribute vec3 aP; uniform mat4 uVP; uniform mat4 uM; uniform vec3 uScale;
varying vec3 vP; varying vec3 vN; varying vec3 vW;
void main() { vP = aP; vN = normalize(aP / uScale); vec4 w = uM * vec4(aP, 1.0); vW = w.xyz; gl_Position = uVP * w; }`;
  const DOME_FS = `${HP}
uniform vec3 uCam; uniform vec3 uColor; uniform float uAlpha; uniform float uPulse; uniform float uTime; uniform float uHex;
varying vec3 vP; varying vec3 vN; varying vec3 vW;
void main() {
  vec3 v = normalize(uCam - vW);
  float fr = pow(1.0 - abs(dot(normalize(vN), v)), 2.2);
  float lat = asin(clamp(vP.y, -1.0, 1.0)); float lon = atan(vP.z, vP.x);
  vec2 g = vec2(lon * uHex, lat * uHex * 1.5);
  g.x += step(1.0, mod(floor(g.y), 2.0)) * 0.5;
  vec2 f = abs(fract(g) - 0.5);
  float line = 1.0 - smoothstep(0.0, 0.07, min(f.x, f.y) * 0.9);
  float ripple = exp(-pow((vP.y - uPulse) * 7.0, 2.0)) * step(uPulse, 1.05);
  float shimmer = 0.75 + 0.25 * sin(uTime * 1.5 + vP.y * 6.0 + lon * 3.0);
  gl_FragColor = vec4(uColor * (fr * 0.85 + line * 0.16 * shimmer + ripple * 0.9) * uAlpha, 1.0);
}`;

  // ---------------------------------------------------------------- post
  // Everything above is drawn into a texture; these three passes turn it from
  // "a WebGL scene" into something that looks lit and shot: the bright parts
  // bleed, the whole frame gets a filmic curve, snow falls in front of it.
  const QUAD_VS = `
attribute vec2 aPos; varying vec2 vUv;
void main() { vUv = aPos * 0.5 + 0.5; gl_Position = vec4(aPos, 0.0, 1.0); }`;

  // Bright pass + downsample in one go (the quad is drawn at half size).
  const BRIGHT_FS = `${HP}
uniform sampler2D uTex; uniform vec2 uTexel; varying vec2 vUv;
void main() {
  vec3 c = texture2D(uTex, vUv).rgb;
  c += texture2D(uTex, vUv + vec2( uTexel.x,  uTexel.y)).rgb;
  c += texture2D(uTex, vUv + vec2(-uTexel.x,  uTexel.y)).rgb;
  c += texture2D(uTex, vUv + vec2( uTexel.x, -uTexel.y)).rgb;
  c += texture2D(uTex, vUv + vec2(-uTexel.x, -uTexel.y)).rgb;
  c /= 5.0;
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  float k = smoothstep(0.42, 0.95, l);
  gl_FragColor = vec4(c * k, 1.0);
}`;

  // Separable gaussian, run once across and once down.
  const BLUR_FS = `${HP}
uniform sampler2D uTex; uniform vec2 uDir; varying vec2 vUv;
void main() {
  vec3 c = texture2D(uTex, vUv).rgb * 0.2270270270;
  c += (texture2D(uTex, vUv + uDir * 1.3846153846).rgb + texture2D(uTex, vUv - uDir * 1.3846153846).rgb) * 0.3162162162;
  c += (texture2D(uTex, vUv + uDir * 3.2307692308).rgb + texture2D(uTex, vUv - uDir * 3.2307692308).rgb) * 0.0702702703;
  gl_FragColor = vec4(c, 1.0);
}`;

  // Composite: bloom, winter grade, filmic curve, snow, vignette, grain.
  const POST_FS = `${HP}
uniform sampler2D uTex; uniform sampler2D uBloom;
uniform vec2 uRes; uniform float uTime; uniform float uFocus; uniform float uWinter; uniform float uAberr;
varying vec2 vUv;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }

// One drifting layer of flakes. Cheap: a scrolling grid, one flake per cell.
float snowLayer(vec2 uv, float scale, float speed, float seed, float blur) {
  vec2 g = uv * scale;
  g.y += uTime * speed;
  g.x += sin((g.y + seed) * 0.55) * 0.35 + uTime * speed * 0.22;
  vec2 id = floor(g);
  vec2 f = fract(g) - 0.5;
  float r = hash(id + seed);
  if (r < 0.86) return 0.0;                       // most cells stay empty
  vec2 o = (vec2(hash(id + 3.1 + seed), hash(id + 7.7 + seed)) - 0.5) * 0.7;
  float d = length((f - o) * vec2(1.0, 1.0));
  return smoothstep(blur, 0.0, d) * (0.45 + 0.55 * hash(id + 11.3));
}

// Rodrigo Setti / Narkowicz ACES approximation — keeps highlights from going flat.
vec3 aces(vec3 x) {
  return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0);
}

void main() {
  vec2 uv = vUv;
  vec2 d = uv - 0.5;
  float r2 = dot(d, d);

  // the lens is never perfect at the edges
  float ab = uAberr * (0.0012 + r2 * 0.0065);
  vec3 col;
  col.r = texture2D(uTex, uv + d * ab).r;
  col.g = texture2D(uTex, uv).g;
  col.b = texture2D(uTex, uv - d * ab).b;

  col += texture2D(uBloom, uv).rgb * (0.72 + 0.35 * uFocus);

  // winter grade: shadows go blue, the warm window light is left alone
  float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
  vec3 cold = vec3(0.72, 0.86, 1.08);
  col = mix(col, col * cold, uWinter * (1.0 - smoothstep(0.18, 0.75, l)) * 0.85);

  // snow, three layers so it has depth; the near one is big and soft
  vec2 su = uv * vec2(uRes.x / uRes.y, 1.0);
  float sn = snowLayer(su, 34.0, 0.050, 1.0, 0.34) * 0.26
           + snowLayer(su, 20.0, 0.082, 5.0, 0.30) * 0.42
           + snowLayer(su, 12.0, 0.125, 9.0, 0.26) * 0.60;
  col += vec3(0.86, 0.92, 1.0) * sn * uWinter * (0.42 - 0.14 * r2);

  col = aces(col * 1.06);

  // vignette and a little grain, so flat areas do not band
  col *= 1.0 - smoothstep(0.22, 0.95, r2) * 0.55;
  col += (hash(uv * uRes + fract(uTime)) - 0.5) * 0.022;

  gl_FragColor = vec4(col, 1.0);
}`;

  function compile(vs, fs) {
    const mk = (type, src) => {
      const s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) || 'shader');
      return s;
    };
    const p = gl.createProgram();
    gl.attachShader(p, mk(gl.VERTEX_SHADER, vs));
    gl.attachShader(p, mk(gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) || 'link');
    const u = {};
    const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < n; i += 1) { const info = gl.getActiveUniform(p, i); const name = info.name.replace(/\[0\]$/, ''); u[name] = gl.getUniformLocation(p, name); }
    const a = {};
    const m = gl.getProgramParameter(p, gl.ACTIVE_ATTRIBUTES);
    for (let i = 0; i < m; i += 1) { const info = gl.getActiveAttrib(p, i); a[info.name] = gl.getAttribLocation(p, info.name); }
    return { p, u, a };
  }
  function buffer(data, usage) {
    const b = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, b);
    gl.bufferData(gl.ARRAY_BUFFER, data instanceof Float32Array ? data : new Float32Array(data), usage || gl.STATIC_DRAW);
    return b;
  }
  function attribs(prog, buf, layout, stride) {
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    let off = 0;
    for (const [name, size] of layout) {
      const loc = prog.a[name];
      if (loc != null && loc >= 0) { gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, size, gl.FLOAT, false, stride * 4, off * 4); }
      off += size;
    }
  }
  function off(prog) { for (const k of Object.keys(prog.a)) gl.disableVertexAttribArray(prog.a[k]); }

  let P;
  try {
    P = {
      lit: compile(LIT_VS, LIT_FS), sky: compile(SKY_VS, SKY_FS), glow: compile(GLOW_VS, GLOW_FS),
      pt: compile(PT_VS, PT_FS), dome: compile(DOME_VS, DOME_FS),
      bright: compile(QUAD_VS, BRIGHT_FS), blur: compile(QUAD_VS, BLUR_FS), post: compile(QUAD_VS, POST_FS),
    };
  } catch (e) {
    console.warn('[halyra] 3D off:', e && e.message);
    const fresh = cv.cloneNode(true);
    cv.replaceWith(fresh);
    fallback();
    return;
  }
  const LIT_LAYOUT = [['aPos', 3], ['aNor', 3], ['aCol', 4], ['aEx', 4]];
  const B = {
    world: buffer(world.v), worldN: world.v.length / STRIDE,
    tree: buffer(tree.v), treeN: tree.v.length / STRIDE,
    rock: buffer(rock.v), rockN: rock.v.length / STRIDE,
    ufo: buffer(ufo.v), ufoN: ufo.v.length / STRIDE,
    dome: buffer(dome), domeN: dome.length / 3,
    sky: buffer([-1, -1, 3, -1, -1, 3]),
    glow: buffer(glows), glowN: glows.length / 11,
    moon: buffer(moon.v), moonN: moon.v.length / STRIDE,
    moonGlow: buffer(moonGlow),
  };
  const ptData = new Float32Array(pts);
  B.pt = buffer(ptData, gl.DYNAMIC_DRAW);
  B.ptN = ptData.length / 5;
  const shootBase = (B.ptN - SHOOT_N) * 5;

  // ------------------------------------------------------------------ state
  let W = 0; let H = 0; let dpr = 1;
  const VP = mat(); const PR = mat(); const VW = mat(); const M = mat();
  let eye = [0, 0, 0];
  let yaw = 0.62; let yawV = 0; const pitch = 0.44; let dist = 22;
  let mouseX = 0; let mouseY = 0; let mx = 0; let my = 0;
  let focus = 0; let focusOn = false; let focusAt = 0; let endAt = 0;
  let shield = 0; let pulse = 2; let grow = 0.32; let treeShake = 0; let gold = 0;
  let auto = !reduce; let lastAuto = performance.now();
  let visible = true; let running = true;
  let ufoT = -1; let nextUfo = performance.now() + 25000 + Math.random() * 20000;
  let shootT = -1; let shootSeeds = [];
  let moonClicks = 0; let treeClicks = 0;
  let scrollK = 0;
  let hover = null;

  // labels
  const labels = new Map();
  for (const b of buildings) {
    if (b.kind === 'city') continue;
    const el = document.createElement('div');
    el.className = `c-label ${b.kind}`;
    el.innerHTML = `<span class="dot"></span><span class="nm">${L[b.key] || b.key}</span><span class="lk" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg></span>`;
    labelsEl.appendChild(el);
    labels.set(b, el);
  }

  // ---- offscreen targets for the post chain. If anything here is unsupported
  // the whole chain is skipped and the scene is drawn straight to the canvas,
  // which still looks like it did before.
  const FB = { scene: null, a: null, b: null, w: 0, h: 0, ok: true };

  function makeTarget(w, h, depth) {
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const fb = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    let rb = null;
    if (depth) {
      rb = gl.createRenderbuffer();
      gl.bindRenderbuffer(gl.RENDERBUFFER, rb);
      gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, w, h);
      gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, rb);
    }
    const done = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    if (!done) return null;
    return { fb, tex, rb, w, h };
  }

  function dropTarget(t) {
    if (!t) return;
    gl.deleteFramebuffer(t.fb); gl.deleteTexture(t.tex);
    if (t.rb) gl.deleteRenderbuffer(t.rb);
  }

  function sizeTargets() {
    const w = cv.width; const h = cv.height;
    if (!FB.ok || (FB.w === w && FB.h === h)) return;
    dropTarget(FB.scene); dropTarget(FB.a); dropTarget(FB.b);
    const hw = Math.max(1, w >> 1); const hh = Math.max(1, h >> 1);
    FB.scene = makeTarget(w, h, true);
    FB.a = makeTarget(hw, hh, false);
    FB.b = makeTarget(hw, hh, false);
    FB.ok = Boolean(FB.scene && FB.a && FB.b);
    FB.w = w; FB.h = h;
  }

  function fullQuad(prog) {
    attribs(prog, B.sky, [['aPos', 2]], 2);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    off(prog);
  }

  function resize() {
    const r = stage.getBoundingClientRect();
    dpr = Math.min(window.devicePixelRatio || 1, r.width < 700 ? 1.5 : 1.75);
    W = Math.max(1, r.width); H = Math.max(1, r.height);
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    cv.style.width = `${W}px`; cv.style.height = `${H}px`;
    sizeTargets();
  }

  function project(p) {
    const x = VP[0] * p[0] + VP[4] * p[1] + VP[8] * p[2] + VP[12];
    const y = VP[1] * p[0] + VP[5] * p[1] + VP[9] * p[2] + VP[13];
    const w = VP[3] * p[0] + VP[7] * p[1] + VP[11] * p[2] + VP[15];
    if (w <= 0.01) return null;
    return [(x / w * 0.5 + 0.5) * W, (1 - (y / w * 0.5 + 0.5)) * H, w];
  }

  function setFocus(on, fromUser) {
    focusOn = on;
    focusAt = performance.now();
    if (fromUser) auto = false;
    if (on) { endAt = Date.now() + 25 * 60000; pulse = -0.05; }
    toggle.setAttribute('aria-pressed', String(on));
    stage.classList.toggle('is-focus', on);
    if (overlay) {
      overlay.classList.remove('show');
      if (on) setTimeout(() => { if (focusOn) overlay.classList.add('show'); }, 1100);
      setTimeout(() => overlay.classList.remove('show'), 4600);
    }
  }
  toggle.addEventListener('click', () => setFocus(!focusOn, true));
  document.addEventListener('halyra:focus', (e) => { setFocus(true, true); if (e.detail && e.detail.gold) gold = 1; });
  document.addEventListener('halyra:ufo', () => { ufoT = 0; });

  // ------------------------------------------------------------------ input
  let drag = null;
  const pick = (x, y) => {
    let best = null; let bd = 1e9;
    const consider = (p, obj, r) => { const s = project(p); if (!s) return; const d = Math.hypot(s[0] - x, s[1] - y); if (d < r && d < bd) { bd = d; best = obj; } };
    for (const b of buildings) if (b.kind !== 'city') consider([b.x, b.h * 0.6, b.z], b, 42);
    consider([0, 2.2 * (0.4 + grow * 1.2) * 0.7 + 0.3, 0], 'tree', 44);
    consider(MOON, 'moon', 40);
    if (ufoT >= 0) consider(ufoPos, 'ufo', 46);
    return best;
  };
  stage.addEventListener('pointerdown', (e) => {
    if (e.target.closest('button, a')) return;
    drag = { x: e.clientX, y: e.clientY, moved: 0, yaw };
    stage.classList.add('touched');
    stage.setPointerCapture && stage.setPointerCapture(e.pointerId);
  });
  stage.addEventListener('pointermove', (e) => {
    const r = stage.getBoundingClientRect();
    mouseX = (e.clientX - r.left) / r.width - 0.5;
    mouseY = (e.clientY - r.top) / r.height - 0.5;
    if (drag) {
      const dx = e.clientX - drag.x;
      drag.moved = Math.max(drag.moved, Math.abs(dx) + Math.abs(e.clientY - drag.y));
      if (drag.moved > 4) { yawV = 0; yaw = drag.yaw - dx * 0.006; auto = false; }
      return;
    }
    const h = pick(e.clientX - r.left, e.clientY - r.top);
    if (h !== hover) { hover = h; stage.style.cursor = h ? 'pointer' : ''; }
  });
  const endDrag = (e) => {
    if (!drag) return;
    const r = stage.getBoundingClientRect();
    if (drag.moved <= 4 && e && e.type === 'pointerup') click(pick(e.clientX - r.left, e.clientY - r.top));
    drag = null;
  };
  stage.addEventListener('pointerup', endDrag);
  stage.addEventListener('pointercancel', () => { drag = null; });
  stage.addEventListener('pointerleave', () => { mouseX = 0; mouseY = 0; if (hover) { hover = null; stage.style.cursor = ''; } });

  function click(o) {
    if (!o) return;
    if (o === 'moon') {
      moonClicks += 1;
      startShoot();
      if (moonClicks === 5) egg('moon');
      return;
    }
    if (o === 'ufo') { ufoT = -1; egg('ufo'); startShoot(); return; }
    if (o === 'tree') {
      treeClicks += 1; treeShake = 1;
      if (treeClicks === 7) egg('tree');
      return;
    }
    auto = false;
    if (o.kind === 'bad') { o.manual = !o.manual; o.bounce = 1; }
    else { o.bounce = 1; o.flash = 1; }
  }
  function startShoot() {
    shootT = 0;
    shootSeeds = [0, 1, 2, 3, 4, 5].map(() => ({ x: -58 + Math.random() * 40, y: -6 - Math.random() * 9, z: -42 - Math.random() * 15, vx: 30 + Math.random() * 16, vy: -4 - Math.random() * 4, d: Math.random() * 0.9 }));
  }

  if ('IntersectionObserver' in window) new IntersectionObserver((es) => { visible = es[0].isIntersecting; }).observe(stage);
  document.addEventListener('visibilitychange', () => { running = !document.hidden; });
  cv.addEventListener('webglcontextlost', (e) => { e.preventDefault(); running = false; visible = false; });
  window.addEventListener('resize', resize);
  if ('ResizeObserver' in window) new ResizeObserver(resize).observe(stage);
  addEventListener('scroll', () => { const r = stage.getBoundingClientRect(); scrollK = Math.max(0, Math.min(1, -r.top / Math.max(1, r.height))); }, { passive: true });
  resize();

  // ------------------------------------------------------------------ frame
  const ufoPos = [0, 0, 0];
  const RIGHT = [1, 0, 0]; const UP = [0, 1, 0];
  let last = performance.now();
  let slow = 0;
  function frame(now) {
    requestAnimationFrame(frame);
    if (!visible || !running) { last = now; return; }
    const dt = Math.min(0.2, (now - last) / 1000);
    last = now;
    if (dt > 0.04) { slow += 1; if (slow > 40 && dpr > 1) { dpr = 1; resize(); slow = -1e9; } }
    const t = now / 1000;

    if (auto && now - lastAuto > (focusOn ? 7000 : 4200)) { lastAuto = now; setFocus(!focusOn, false); }
    const ease = (cur, target, k) => cur + (target - cur) * Math.min(1, dt * k);
    focus = ease(focus, focusOn ? 1 : 0, 1.6);
    winter = ease(winter, wantWinter(), 1.1);
    shield = ease(shield, focusOn ? 1 : 0, 2.2);
    if (pulse < 1.2) pulse += dt * 0.55;
    grow = ease(grow, focusOn ? 1 : 0.34, focusOn ? 0.55 : 1.2);
    treeShake = Math.max(0, treeShake - dt * 1.6);
    gold = Math.max(0, gold - dt * 0.02);

    // buildings
    const since = (now - focusAt) / 1000;
    for (const b of buildings) {
      const lockT = b.kind === 'bad' && (focusOn ? since > b.delay : false) ? 1 : 0;
      const locked = b.kind === 'bad' && (lockT || b.manual);
      b.lock = ease(b.lock, locked ? 1 : 0, 3);
      const flick = locked && b.lock < 0.9 ? (Math.sin(t * 60 + b.id) > 0.2 ? 0.25 : 1) : 1;
      b.neon = b.kind === 'bad' ? ease(b.neon, locked ? 0 : 1, 2.6) * flick : 0;
      const target = b.kind === 'bad' ? b.lit * (1 - b.lock * 0.92) : b.kind === 'good' ? Math.min(0.95, b.lit + focus * 0.3) : b.lit;
      b.light = ease(b.light, target, 2.5);
      b.hover = ease(b.hover, hover === b ? 1 : 0, 10);
      b.bounce = Math.max(0, b.bounce - dt * 2.5);
      b.flash = Math.max(0, (b.flash || 0) - dt * 1.5);
      const o = b.id * 4;
      objs[o] = Math.min(1, b.light + (b.flash || 0) * 0.6);
      objs[o + 1] = b.neon;
      objs[o + 2] = b.lock;
      objs[o + 3] = b.hover + b.bounce * 0.6;
    }
    objs[T_TREE * 4] = 0.35 + focus * 0.65;
    objs[T_TREE * 4 + 1] = gold;
    objs[T_TREE * 4 + 3] = hover === 'tree' ? 0.5 : 0;
    objs[T_UFO * 4 + 3] = hover === 'ufo' ? 0.6 : 0;

    // camera
    mx += (mouseX - mx) * Math.min(1, dt * 3);
    my += (mouseY - my) * Math.min(1, dt * 3);
    if (!drag) { yaw += yawV * dt; yawV *= 0.95; if (!reduce) yaw += dt * 0.035; }
    const aspect = W / H;
    const yw = yaw + mx * 0.35;
    const pt = pitch + my * 0.12 - scrollK * 0.18;
    // The canvas is the whole hero on a wide screen, so the island needs more
    // room around it: cropped edges read as a bug, space reads as a photograph.
    dist = aspect >= 0.95 ? 38 / Math.min(1.05, aspect * 0.86) : 26.5 / Math.sqrt(Math.max(0.5, aspect));
    eye = [Math.sin(yw) * Math.cos(pt) * dist, Math.sin(pt) * dist + 1.2, Math.cos(yw) * Math.cos(pt) * dist];
    persp(PR, 0.72, aspect, 0.5, 300);
    const wide = aspect > 0.95 ? 1 : 0;
    // On a wide screen the canvas now covers the whole hero, so the island is
    // pushed off-centre to the right and leaves the left side to the words.
    // This shifts the lens rather than the camera, so the scene keeps looking
    // straight at you instead of being seen from the side.
    PR[8] = -0.34 * wide;
    const tx = -Math.cos(yw) * 1.2 * wide; const tz = Math.sin(yw) * 1.2 * wide;
    lookAt(VW, eye, [tx, -0.6 - scrollK * 2.5, tz], [0, 1, 0]);
    mul(VP, PR, VW);
    RIGHT[0] = VW[0]; RIGHT[1] = VW[4]; RIGHT[2] = VW[8];
    UP[0] = VW[1]; UP[1] = VW[5]; UP[2] = VW[9];
    {
      const fx = -VW[2]; const fy = -VW[6]; const fz = -VW[10];
      // The moon used to hang over the left half, which is now where the
      // headline lives. On a wide screen it moves across to the open sky.
      const th = Math.tan(0.36); const mxs = (wide ? 0.78 : -0.5) * th * aspect; const mys = (wide ? 0.72 : 0.72) * th;
      MOON[0] = eye[0] + (fx + RIGHT[0] * mxs + UP[0] * mys) * 110;
      MOON[1] = eye[1] + (fy + RIGHT[1] * mxs + UP[1] * mys) * 110;
      MOON[2] = eye[2] + (fz + RIGHT[2] * mxs + UP[2] * mys) * 110;
    }

    if (FB.ok) gl.bindFramebuffer(gl.FRAMEBUFFER, FB.scene.fb);
    gl.viewport(0, 0, cv.width, cv.height);
    gl.clearColor(0.03, 0.03, 0.06, 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    // sky
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.BLEND);
    gl.useProgram(P.sky.p);
    attribs(P.sky, B.sky, [['aPos', 2]], 2);
    gl.uniform1f(P.sky.u.uFocus, focus);
    gl.uniform1f(P.sky.u.uTime, t);
    gl.uniform2f(P.sky.u.uRes, W, H);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    off(P.sky);

    // points behind everything (stars), additive
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);
    drawPoints(t, true);

    // opaque world
    gl.disable(gl.BLEND);
    gl.enable(gl.DEPTH_TEST);
    gl.depthMask(true);
    const fog = [0.035, 0.035 + 0.02 * focus, 0.07 + 0.015 * focus];
    gl.useProgram(P.lit.p);
    gl.uniformMatrix4fv(P.lit.u.uVP, false, VP);
    gl.uniform4fv(P.lit.u.uObj, objs);
    gl.uniform3fv(P.lit.u.uCam, eye);
    gl.uniform3fv(P.lit.u.uFog, fog);
    gl.uniform1f(P.lit.u.uTime, t);
    gl.uniform1f(P.lit.u.uFocus, focus);
    gl.uniform1f(P.lit.u.uSP, SP);
    const bob = reduce ? 0 : Math.sin(t * 0.6) * 0.12;
    gl.uniformMatrix4fv(P.lit.u.uM, false, trs(M, 0, bob, 0, 0, 1, 1, 1));
    attribs(P.lit, B.world, LIT_LAYOUT, STRIDE);
    gl.drawArrays(gl.TRIANGLES, 0, B.worldN);
    // tree
    const s = 0.4 + grow * 1.2;
    const shake = Math.sin(t * 30) * treeShake * 0.06;
    gl.uniformMatrix4fv(P.lit.u.uM, false, trs(M, 0, 0.3 + bob, 0, shake + t * 0.05, s, s * (1 + Math.sin(t * 1.4) * 0.015), s));
    attribs(P.lit, B.tree, LIT_LAYOUT, STRIDE);
    gl.drawArrays(gl.TRIANGLES, 0, B.treeN);
    // moon
    attribs(P.lit, B.moon, LIT_LAYOUT, STRIDE);
    gl.uniformMatrix4fv(P.lit.u.uM, false, trs(M, MOON[0], MOON[1], MOON[2], -yw + 2.2, 1, 1, 1));
    gl.drawArrays(gl.TRIANGLES, 0, B.moonN);
    // rocks
    attribs(P.lit, B.rock, LIT_LAYOUT, STRIDE);
    ROCKS.forEach(([x, y, z, k], i) => {
      gl.uniformMatrix4fv(P.lit.u.uM, false, trs(M, x, y + (reduce ? 0 : Math.sin(t * 0.7 + i * 2) * 0.35), z, t * 0.1 + i, k, k, k));
      gl.drawArrays(gl.TRIANGLES, 0, B.rockN);
    });
    // UFO
    if (!reduce && ufoT < 0 && now > nextUfo) ufoT = 0;
    if (ufoT >= 0) {
      ufoT += dt / 9;
      const u = ufoT;
      ufoPos[0] = -34 + u * 68; ufoPos[1] = -1.5 + Math.sin(u * 9) * 1.2; ufoPos[2] = -15 + Math.sin(u * 3) * 5;
      attribs(P.lit, B.ufo, LIT_LAYOUT, STRIDE);
      gl.uniformMatrix4fv(P.lit.u.uM, false, trs(M, ufoPos[0], ufoPos[1], ufoPos[2], t * 2, 1, 1, 1));
      gl.drawArrays(gl.TRIANGLES, 0, B.ufoN);
      if (ufoT > 1) { ufoT = -1; nextUfo = now + 60000 + Math.random() * 60000; }
    }
    off(P.lit);

    // glows & domes (additive, no depth write)
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);
    gl.depthMask(false);
    gl.useProgram(P.glow.p);
    gl.uniformMatrix4fv(P.glow.u.uVP, false, VP);
    gl.uniform3fv(P.glow.u.uRight, RIGHT);
    gl.uniform3fv(P.glow.u.uUp, UP);
    gl.uniform4fv(P.glow.u.uObj, objs);
    gl.uniform1f(P.glow.u.uFocus, focus);
    gl.uniform3f(P.glow.u.uOff, 0, 0, 0);
    attribs(P.glow, B.glow, [['aC', 3], ['aQ', 2], ['aCol', 3], ['aS', 3]], 11);
    gl.drawArrays(gl.TRIANGLES, 0, B.glowN);
    gl.uniform3fv(P.glow.u.uOff, MOON);
    attribs(P.glow, B.moonGlow, [['aC', 3], ['aQ', 2], ['aCol', 3], ['aS', 3]], 11);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    off(P.glow);

    gl.useProgram(P.dome.p);
    gl.uniformMatrix4fv(P.dome.u.uVP, false, VP);
    gl.uniform3fv(P.dome.u.uCam, eye);
    gl.uniform1f(P.dome.u.uTime, t);
    attribs(P.dome, B.dome, [['aP', 3]], 3);
    for (const b of buildings) {
      if (b.kind !== 'bad' || b.lock < 0.02) continue;
      const r = Math.max(b.w, b.d) * 0.88;
      const hh = (b.h + 1.6) * (0.4 + 0.6 * b.lock);
      gl.uniformMatrix4fv(P.dome.u.uM, false, trs(M, b.x, bob, b.z, 0, r, hh, r));
      gl.uniform3f(P.dome.u.uScale, r, hh, r);
      gl.uniform3f(P.dome.u.uColor, 1.0, 0.32, 0.38);
      gl.uniform1f(P.dome.u.uAlpha, b.lock * 0.85);
      gl.uniform1f(P.dome.u.uPulse, 2);
      gl.uniform1f(P.dome.u.uHex, 5);
      gl.drawArrays(gl.TRIANGLES, 0, B.domeN);
    }
    if (shield > 0.01) {
      gl.uniformMatrix4fv(P.dome.u.uM, false, trs(M, 0, bob - 0.05, 0, t * 0.02, 9.2, 7.4, 9.2));
      gl.uniform3f(P.dome.u.uScale, 9.2, 7.4, 9.2);
      gl.uniform3f(P.dome.u.uColor, 1.0, 0.66, 0.3);
      gl.uniform1f(P.dome.u.uAlpha, shield * 0.26);
      gl.uniform1f(P.dome.u.uPulse, pulse);
      gl.uniform1f(P.dome.u.uHex, 9);
      gl.drawArrays(gl.TRIANGLES, 0, B.domeN);
    }
    off(P.dome);

    drawPoints(t, false);
    gl.depthMask(true);

    // ---- post: bloom, grade, snow, grain
    if (FB.ok) {
      gl.disable(gl.DEPTH_TEST);
      gl.disable(gl.BLEND);

      gl.bindFramebuffer(gl.FRAMEBUFFER, FB.a.fb);
      gl.viewport(0, 0, FB.a.w, FB.a.h);
      gl.useProgram(P.bright.p);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, FB.scene.tex);
      gl.uniform1i(P.bright.u.uTex, 0);
      gl.uniform2f(P.bright.u.uTexel, 1 / cv.width, 1 / cv.height);
      fullQuad(P.bright);

      gl.useProgram(P.blur.p);
      gl.uniform1i(P.blur.u.uTex, 0);
      for (let i = 0; i < 2; i += 1) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, FB.b.fb);
        gl.bindTexture(gl.TEXTURE_2D, FB.a.tex);
        gl.uniform2f(P.blur.u.uDir, 1 / FB.a.w, 0);
        fullQuad(P.blur);
        gl.useProgram(P.blur.p);
        gl.bindFramebuffer(gl.FRAMEBUFFER, FB.a.fb);
        gl.bindTexture(gl.TEXTURE_2D, FB.b.tex);
        gl.uniform2f(P.blur.u.uDir, 0, 1 / FB.a.h);
        fullQuad(P.blur);
        gl.useProgram(P.blur.p);
      }

      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, cv.width, cv.height);
      gl.useProgram(P.post.p);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, FB.scene.tex);
      gl.uniform1i(P.post.u.uTex, 0);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, FB.a.tex);
      gl.uniform1i(P.post.u.uBloom, 1);
      gl.activeTexture(gl.TEXTURE0);
      gl.uniform2f(P.post.u.uRes, cv.width, cv.height);
      gl.uniform1f(P.post.u.uTime, t);
      gl.uniform1f(P.post.u.uFocus, focus);
      gl.uniform1f(P.post.u.uWinter, winter);
      gl.uniform1f(P.post.u.uAberr, reduce ? 0 : 1);
      fullQuad(P.post);
    }

    // labels
    for (const [b, el] of labels) {
      const p = project([b.x, b.h + (b.kind === 'bad' ? 1.65 : 0.55) + bob, b.z]);
      if (!p) { el.style.opacity = '0'; continue; }
      el.style.opacity = '';
      el.style.transform = `translate(${p[0]}px, ${p[1]}px) translate(-50%, -100%)`;
      el.classList.toggle('blocked', b.kind === 'bad' && b.lock > 0.5);
      el.classList.toggle('boost', b.kind === 'good' && focus > 0.5);
    }
    if (timerEl) {
      const left = focusOn ? Math.max(0, endAt - Date.now()) : 25 * 60000;
      timerEl.textContent = `${String(Math.floor(left / 60000)).padStart(2, '0')}:${String(Math.floor((left % 60000) / 1000)).padStart(2, '0')}`;
    }
  }

  function drawPoints(t, stars) {
    gl.useProgram(P.pt.p);
    gl.uniformMatrix4fv(P.pt.u.uVP, false, VP);
    gl.uniform1f(P.pt.u.uTime, t);
    gl.uniform1f(P.pt.u.uFocus, focus);
    gl.uniform1f(P.pt.u.uDpr, dpr);
    gl.uniform1f(P.pt.u.uH, Math.min(1.4, H / 560));
    if (!stars && shootT >= 0) {
      shootT += 1 / 60;
      for (let i = 0; i < SHOOT_N; i += 1) {
        const s = shootSeeds[i % shootSeeds.length];
        const k = Math.floor(i / shootSeeds.length) / (SHOOT_N / shootSeeds.length);
        const tt = shootT * 1.3 - s.d - k * 0.05;
        const o = shootBase + i * 5;
        if (tt < 0 || tt > 1.4) { ptData[o + 1] = -999; continue; }
        ptData[o] = s.x + s.vx * tt; ptData[o + 1] = s.y + s.vy * tt; ptData[o + 2] = s.z;
        ptData[o + 3] = k;
      }
      gl.bindBuffer(gl.ARRAY_BUFFER, B.pt);
      gl.bufferSubData(gl.ARRAY_BUFFER, shootBase * 4, ptData.subarray(shootBase));
      if (shootT > 3) { shootT = -1; for (let i = 0; i < SHOOT_N; i += 1) ptData[shootBase + i * 5 + 1] = -999; gl.bufferSubData(gl.ARRAY_BUFFER, shootBase * 4, ptData.subarray(shootBase)); }
    }
    attribs(P.pt, B.pt, [['aP', 3], ['aK', 2]], 5);
    if (stars) gl.drawArrays(gl.POINTS, 0, 700);
    else gl.drawArrays(gl.POINTS, 700, B.ptN - 700);
    off(P.pt);
  }

  stage.classList.add('is-3d');
  window.__world = { setFocus: (on) => setFocus(on, true), ufo: () => { ufoT = 0; }, shoot: startShoot };
  requestAnimationFrame(frame);
}());
