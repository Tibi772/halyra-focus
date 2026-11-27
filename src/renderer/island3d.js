/* Halyra Focus — your 3D focus island (in the app and the phone app).
   It grows with your level: the island widens, the crystal spire rises, every tree
   or building you grew stands on it, and each achievement is a gem orbiting above.
   Tiny WebGL engine, no libraries. Usage:
     const isl = Island3D.mount(canvas, data, { onPick(gem) {} });
     isl.update(data); isl.celebrate(); isl.destroy();
   data = { level, pct, items: [{ i, ok }], gems: [{ id, shape, color, got, name }], season } */
(function (root) {
  'use strict';

  function mat() { return new Float32Array(16); }
  function persp(o, fovy, aspect, near, far) {
    const f = 1 / Math.tan(fovy / 2); const nf = 1 / (near - far);
    o.fill(0); o[0] = f / aspect; o[5] = f; o[10] = (far + near) * nf; o[11] = -1; o[14] = 2 * far * near * nf; return o;
  }
  function lookAt(o, e, c, up) {
    let zx = e[0] - c[0]; let zy = e[1] - c[1]; let zz = e[2] - c[2];
    let l = Math.hypot(zx, zy, zz); zx /= l; zy /= l; zz /= l;
    let xx = up[1] * zz - up[2] * zy; let xy = up[2] * zx - up[0] * zz; let xz = up[0] * zy - up[1] * zx;
    l = Math.hypot(xx, xy, xz); xx /= l; xy /= l; xz /= l;
    const yx = zy * xz - zz * xy; const yy = zz * xx - zx * xz; const yz = zx * xy - zy * xx;
    o[0] = xx; o[1] = yx; o[2] = zx; o[3] = 0; o[4] = xy; o[5] = yy; o[6] = zy; o[7] = 0; o[8] = xz; o[9] = yz; o[10] = zz; o[11] = 0;
    o[12] = -(xx * e[0] + xy * e[1] + xz * e[2]); o[13] = -(yx * e[0] + yy * e[1] + yz * e[2]); o[14] = -(zx * e[0] + zy * e[1] + zz * e[2]); o[15] = 1; return o;
  }
  function mul(o, a, b) { for (let i = 0; i < 4; i += 1) for (let j = 0; j < 4; j += 1) { let s = 0; for (let k = 0; k < 4; k += 1) s += a[k * 4 + j] * b[i * 4 + k]; o[i * 4 + j] = s; } return o; }
  function trs(o, tx, ty, tz, ry, rx, s) {
    const c = Math.cos(ry); const sn = Math.sin(ry); const cx = Math.cos(rx); const sx = Math.sin(rx);
    // R = Ry * Rx, then scale
    o[0] = c * s; o[1] = 0; o[2] = -sn * s; o[3] = 0;
    o[4] = sn * sx * s; o[5] = cx * s; o[6] = c * sx * s; o[7] = 0;
    o[8] = sn * cx * s; o[9] = -sx * s; o[10] = c * cx * s; o[11] = 0;
    o[12] = tx; o[13] = ty; o[14] = tz; o[15] = 1; return o;
  }
  const hex = (h) => [parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255];
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const norm = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

  // vertex: pos3 nor3 col3 flag1 (0 lit · 1 emissive · 2 snowy leaves · 3 ground)
  function Mesh() { this.v = []; this.seed = 7; }
  Mesh.prototype.rand = function () { this.seed = (this.seed * 16807) % 2147483647; return (this.seed - 1) / 2147483646; };
  Mesh.prototype.tri = function (a, b, c, col, flag, hint) {
    let n = norm(cross(sub(b, a), sub(c, a)));
    if (hint && n[0] * hint[0] + n[1] * hint[1] + n[2] * hint[2] < 0) n = [-n[0], -n[1], -n[2]];
    for (const p of [a, b, c]) this.v.push(p[0], p[1], p[2], n[0], n[1], n[2], col[0], col[1], col[2], flag);
  };
  Mesh.prototype.cone = function (cx, y0, cz, r0, y1, r1, seg, col, flag = 0, rot = 0) {
    for (let j = 0; j < seg; j += 1) {
      const a0 = rot + (j / seg) * Math.PI * 2; const a1 = rot + ((j + 1) / seg) * Math.PI * 2;
      const p0 = [cx + Math.cos(a0) * r0, y0, cz + Math.sin(a0) * r0]; const p1 = [cx + Math.cos(a1) * r0, y0, cz + Math.sin(a1) * r0];
      const q0 = [cx + Math.cos(a0) * r1, y1, cz + Math.sin(a0) * r1]; const q1 = [cx + Math.cos(a1) * r1, y1, cz + Math.sin(a1) * r1];
      const out = [Math.cos((a0 + a1) / 2), 0.3 * Math.sign(y1 - y0 || 1), Math.sin((a0 + a1) / 2)];
      this.tri(p0, p1, q1, col, flag, out);
      if (r1 > 0.001) { this.tri(p0, q1, q0, col, flag, out); this.tri(q0, q1, [cx, y1, cz], col, flag, [0, Math.sign(y1 - y0 || 1), 0]); }
    }
  };
  Mesh.prototype.blob = function (cx, cy, cz, r, col, flag, segU = 7, segV = 5, jit = 0.14, sy = 1) {
    const pts = [];
    for (let i = 0; i <= segV; i += 1) {
      const row = []; const th = (i / segV) * Math.PI;
      for (let j = 0; j < segU; j += 1) {
        const ph = (j / segU) * Math.PI * 2 + (i % 2) * (Math.PI / segU);
        const k = i === 0 || i === segV ? 0 : jit; const rr = r * (1 + (this.rand() - 0.5) * k);
        row.push([cx + Math.sin(th) * Math.cos(ph) * rr, cy + Math.cos(th) * rr * sy, cz + Math.sin(th) * Math.sin(ph) * rr]);
      }
      pts.push(row);
    }
    for (let i = 0; i < segV; i += 1) {
      for (let j = 0; j < segU; j += 1) {
        const a = pts[i][j]; const b = pts[i][(j + 1) % segU]; const c = pts[i + 1][j]; const d = pts[i + 1][(j + 1) % segU];
        const m = (p, q, s) => [(p[0] + q[0] + s[0]) / 3 - cx, (p[1] + q[1] + s[1]) / 3 - cy, (p[2] + q[2] + s[2]) / 3 - cz];
        if (i > 0) this.tri(a, b, c, col, flag, m(a, b, c));
        if (i < segV - 1) this.tri(b, d, c, col, flag, m(b, d, c));
      }
    }
  };
  Mesh.prototype.box = function (x, y, z, w, h, d, col, flag = 0, roofCol) {
    const X = [x - w / 2, x + w / 2]; const Z = [z - d / 2, z + d / 2];
    const P = (i, j, k) => [X[i], y + (j ? h : 0), Z[k]];
    const q = (a, b, c, e, n, cl) => { this.tri(a, b, c, cl, flag, n); this.tri(a, c, e, cl, flag, n); };
    q(P(0, 0, 0), P(1, 0, 0), P(1, 1, 0), P(0, 1, 0), [0, 0, -1], col);
    q(P(1, 0, 0), P(1, 0, 1), P(1, 1, 1), P(1, 1, 0), [1, 0, 0], col);
    q(P(1, 0, 1), P(0, 0, 1), P(0, 1, 1), P(1, 1, 1), [0, 0, 1], col);
    q(P(0, 0, 1), P(0, 0, 0), P(0, 1, 0), P(0, 1, 1), [-1, 0, 0], col);
    q(P(0, 1, 0), P(1, 1, 0), P(1, 1, 1), P(0, 1, 1), [0, 1, 0], roofCol || col);
  };

  // Each gem shape, built around the origin (radius ~0.42).
  function gemMesh(shape, color) {
    const m = new Mesh(); const c = hex(color);
    const dark = c.map((x) => x * 0.55);
    const bi = (r, top, bot, seg, rot = 0) => { m.cone(0, 0, 0, r, top, 0, seg, c, 1, rot); m.cone(0, 0, 0, r, -bot, 0, seg, dark, 1, rot); };
    if (shape === 'octa') bi(0.36, 0.42, 0.42, 4);
    else if (shape === 'icosa') m.blob(0, 0, 0, 0.4, c, 1, 6, 4, 0.0);
    else if (shape === 'dodeca') m.blob(0, 0, 0, 0.42, c, 1, 5, 3, 0.0);
    else if (shape === 'star') { bi(0.18, 0.5, 0.5, 5); for (let i = 0; i < 5; i += 1) { const a = (i / 5) * Math.PI * 2; m.cone(Math.cos(a) * 0.12, 0, Math.sin(a) * 0.12, 0.09, 0.02, 0, 3, c, 1); } m.cone(0, -0.05, 0, 0.42, 0.04, 0.2, 10, c, 1); }
    else if (shape === 'prism') { m.cone(0, -0.36, 0, 0.26, 0.36, 0.26, 6, c, 1); m.cone(0, 0.36, 0, 0.26, 0.55, 0, 6, c, 1); m.cone(0, -0.36, 0, 0.26, -0.55, 0, 6, dark, 1); }
    else if (shape === 'spike') { for (let i = 0; i < 6; i += 1) { const a = (i / 6) * Math.PI * 2; m.cone(0, 0, 0, 0.1, 0.5, 0, 3, i % 2 ? c : dark, 1, a); } m.blob(0, 0, 0, 0.2, c, 1, 6, 4, 0); }
    else if (shape === 'tall') bi(0.22, 0.62, 0.36, 4);
    else if (shape === 'shield') { m.cone(0, -0.05, 0, 0.36, 0.35, 0.3, 6, c, 1); m.cone(0, -0.05, 0, 0.36, -0.5, 0, 6, dark, 1); }
    else if (shape === 'coin') { m.cone(0, -0.08, 0, 0.42, 0.08, 0.42, 14, c, 1); m.cone(0, 0.08, 0, 0.3, 0.12, 0.2, 10, dark, 1); }
    else bi(0.36, 0.42, 0.42, 4);
    return m;
  }

  const TREE = { oak: '#3f9b4b', pine: '#2f7d55', birch: '#8ccf5e', cherry: '#f4a6c6', maple: '#e8692f', cactus: '#4aa36a', bonsai: '#52a35a', palm: '#43a35a', golden: '#f5c542', xmas: '#2a7a4e' };

  function buildWorld(d) {
    const m = new Mesh();
    const L = Math.max(1, d.level || 1);
    const R = 3.0 + Math.min(L, 45) * 0.085;
    m.seed = 11;
    const SEG = 36;
    const rr = []; for (let j = 0; j < SEG; j += 1) rr.push(R * (1 + (m.rand() - 0.5) * 0.12));
    const ring = (y, k, jy) => rr.map((r, j) => { const a = (j / SEG) * Math.PI * 2; return [Math.cos(a) * r * k, y + (m.rand() - 0.5) * jy, Math.sin(a) * r * k]; });
    const r0 = ring(0, 1, 0); const r1 = ring(-0.45, 0.97, 0.1); const r2 = ring(-1.6, 0.72, 0.4); const r3 = ring(-3.0, 0.38, 0.5);
    const tip = [0.2, -4.6 - R * 0.25, -0.1];
    const grass = hex(d.season ? '#dfe8f2' : '#2f6a4c');
    for (let j = 0; j < SEG; j += 1) m.tri([0, 0.02, 0], r0[j], r0[(j + 1) % SEG], grass, 3, [0, 1, 0]);
    const band = (A, B, ca, cb) => { for (let j = 0; j < SEG; j += 1) { const k = (j + 1) % SEG; const o = [A[j][0], 0, A[j][2]]; m.tri(A[j], A[k], B[k], ca, 0, o); m.tri(A[j], B[k], B[j], cb, 0, o); } };
    band(r0, r1, hex(d.season ? '#c8d6e6' : '#2b4a43'), hex('#3e3354'));
    band(r1, r2, hex('#55436a'), hex('#4c3c62'));
    band(r2, r3, hex('#3a2e52'), hex('#33284a'));
    for (let j = 0; j < SEG; j += 1) m.tri(r3[j], r3[(j + 1) % SEG], tip, hex('#231c38'), 0, [r3[j][0], -0.6, r3[j][2]]);
    m.blob(tip[0], tip[1] + 0.25, tip[2], 0.45, hex('#b48cff'), 1, 5, 3, 0.2, 1.7);

    // the spire: rises with the level
    const H = 1.0 + Math.min(L, 60) * 0.055;
    m.cone(0, 0, 0, 0.62, 0.18, 0.5, 8, hex('#5d5a7a'), 0);
    m.cone(0, 0.18, 0, 0.32, H, 0.12, 6, hex('#8fe9ff'), 1, 0.3);
    m.cone(0, H, 0, 0.12, H + 0.5, 0, 6, hex(d.season ? '#ffd36b' : '#ffe9a8'), 1, 0.3);

    // grown items on a spiral around the spire
    const items = (d.items || []).filter((x) => x.ok).slice(-60);
    const g = 2.39996; // golden angle
    items.forEach((it, n) => {
      const t = (n + 0.5) / Math.max(items.length, 8);
      const rad = 1.05 + Math.sqrt(t) * (R - 1.55);
      const a = n * g;
      const x = Math.cos(a) * rad; const z = Math.sin(a) * rad;
      const s = 0.55 + m.rand() * 0.25;
      const id = it.i || 'oak';
      const snow = d.season ? 2 : 0;
      if (TREE[id]) {
        const col = hex(TREE[id]);
        m.cone(x, 0, z, 0.05 * s, 0.35 * s, 0.035 * s, 4, hex('#6b4a35'), 0);
        if (id === 'pine' || id === 'xmas') {
          m.cone(x, 0.25 * s, z, 0.38 * s, 0.95 * s, 0, 6, col, snow, m.rand());
          m.cone(x, 0.62 * s, z, 0.28 * s, 1.3 * s, 0, 6, col, snow, m.rand());
          if (id === 'xmas' || d.season) for (let k = 0; k < 4; k += 1) { const b = k * 1.7 + n; m.blob(x + Math.cos(b) * 0.22 * s, (0.45 + k * 0.17) * s, z + Math.sin(b) * 0.22 * s, 0.045 * s, hex(['#ff5a5a', '#ffd36b', '#6fb8ff', '#ff9ad5'][k]), 1, 4, 3, 0); }
        } else if (id === 'cactus') {
          m.cone(x, 0, z, 0.12 * s, 0.8 * s, 0.1 * s, 6, col, 0);
          m.cone(x + 0.14 * s, 0.3 * s, z, 0.06 * s, 0.6 * s, 0.05 * s, 5, col, 0);
        } else if (id === 'palm') {
          m.cone(x, 0, z, 0.06 * s, 1.1 * s, 0.04 * s, 5, hex('#a7804f'), 0);
          for (let k = 0; k < 5; k += 1) { const b = (k / 5) * Math.PI * 2; m.cone(x + Math.cos(b) * 0.22 * s, 1.0 * s, z + Math.sin(b) * 0.22 * s, 0.12 * s, 1.12 * s, 0, 3, col, snow, b); }
        } else {
          m.blob(x, 0.62 * s, z, 0.34 * s, col, id === 'golden' ? 1 : (snow || 0), 6, 4, 0.2);
          m.blob(x + 0.15 * s, 0.5 * s, z + 0.08 * s, 0.22 * s, col.map((v) => v * 0.85), snow || 0, 5, 3, 0.2);
        }
      } else {
        const wall = hex('#e9dcc4'); const roof = hex('#d2503f');
        if (id === 'lighthouse') { m.cone(x, 0, z, 0.16 * s, 1.1 * s, 0.11 * s, 8, wall, 0); m.cone(x, 0.5 * s, z, 0.15 * s, 0.62 * s, 0.14 * s, 8, roof, 0); m.blob(x, 1.18 * s, z, 0.09 * s, hex('#ffd36b'), 1, 5, 3, 0); }
        else if (id === 'rocket') { m.cone(x, 0.1 * s, z, 0.13 * s, 0.9 * s, 0.13 * s, 8, hex('#e6e9f0'), 0); m.cone(x, 0.9 * s, z, 0.13 * s, 1.25 * s, 0, 8, roof, 0); m.cone(x, 0.1 * s, z, 0.1 * s, -0.05, 0.05 * s, 6, hex('#ffb238'), 1); }
        else if (id === 'skyscraper') { m.box(x, 0, z, 0.32 * s, 1.5 * s, 0.32 * s, hex('#4f8fbd'), 0); m.box(x, 0.2 * s, z, 0.34 * s, 0.06 * s, 0.34 * s, hex('#ffd36b'), 1); m.box(x, 0.7 * s, z, 0.34 * s, 0.06 * s, 0.34 * s, hex('#ffd36b'), 1); }
        else if (id === 'tower' || id === 'castle') { m.cone(x, 0, z, 0.2 * s, 0.85 * s, 0.2 * s, 8, hex('#b9b2a6'), 0); m.cone(x, 0.85 * s, z, 0.24 * s, 1.15 * s, 0, 8, roof, 0); if (id === 'castle') m.box(x + 0.3 * s, 0, z, 0.36 * s, 0.5 * s, 0.3 * s, hex('#b9b2a6'), 0, hex('#8f877b')); }
        else if (id === 'windmill') { m.cone(x, 0, z, 0.2 * s, 0.75 * s, 0.13 * s, 6, wall, 0); m.cone(x, 0.75 * s, z, 0.16 * s, 0.95 * s, 0, 6, roof, 0); m.box(x, 0.68 * s, z + 0.16 * s, 0.7 * s, 0.05 * s, 0.03 * s, hex('#a8703f'), 0); m.box(x, 0.4 * s, z + 0.16 * s, 0.05 * s, 0.6 * s, 0.03 * s, hex('#a8703f'), 0); }
        else { m.box(x, 0, z, 0.42 * s, 0.34 * s, 0.36 * s, wall, 0); m.cone(x, 0.34 * s, z, 0.33 * s, 0.6 * s, 0, 4, d.season ? hex('#f4f7fb') : roof, 0, Math.PI / 4); m.box(x + 0.21 * s, 0.1 * s, z, 0.01, 0.1 * s, 0.1 * s, hex('#ffd36b'), 1); }
      }
    });
    // Christmas lights around the edge (as glow points) are added in buildGlows
    return { m, R, H };
  }

  const VS = `attribute vec3 aP; attribute vec3 aN; attribute vec3 aC; attribute float aF;
uniform mat4 uVP; uniform mat4 uM; varying vec3 vN; varying vec3 vC; varying float vF; varying vec3 vW;
void main() { vec4 w = uM * vec4(aP, 1.0); vW = w.xyz; vN = (uM * vec4(aN, 0.0)).xyz; vC = aC; vF = aF; gl_Position = uVP * w; }`;
  const FS = `precision mediump float;
uniform vec3 uCam; uniform float uSnow; uniform float uGlow; varying vec3 vN; varying vec3 vC; varying float vF; varying vec3 vW;
void main() {
  vec3 n = normalize(vN);
  float dif = max(dot(n, normalize(vec3(-0.4, 0.85, 0.35))), 0.0);
  vec3 light = mix(vec3(0.12, 0.11, 0.2), vec3(0.36, 0.4, 0.6), n.y * 0.5 + 0.5) + dif * vec3(0.62, 0.64, 0.82);
  vec3 col = vC * light;
  if (vF > 0.5 && vF < 1.5) col = vC * (0.95 + 0.25 * uGlow) + vC * light * 0.2;
  if (vF > 1.5 && vF < 2.5) col = mix(col, vec3(0.76, 0.82, 0.94) * min(light, vec3(1.05)), smoothstep(0.35, 0.9, n.y) * uSnow);
  if (vF > 2.5) { float r = length(vW.xz); col *= 0.85 + 0.15 * sin(r * 6.0); }
  float rim = pow(1.0 - abs(dot(n, normalize(uCam - vW))), 3.0);
  col += vec3(0.2, 0.12, 0.32) * rim * step(vW.y, -0.2);
  float fog = smoothstep(-2.5, -9.0, vW.y) * 0.6;
  gl_FragColor = vec4(mix(col, vec3(0.04, 0.04, 0.09), fog), 1.0);
}`;
  const SKY_VS = 'attribute vec2 aQ; varying vec2 vQ; void main() { vQ = aQ; gl_Position = vec4(aQ, 0.9999, 1.0); }';
  const SKY_FS = `precision mediump float; uniform float uT; uniform float uSnow; varying vec2 vQ;
void main() {
  float y = vQ.y * 0.5 + 0.5;
  vec3 col = mix(vec3(0.07, 0.05, 0.14), vec3(0.02, 0.03, 0.07), y);
  float a = exp(-pow((y - 0.78 - sin(vQ.x * 2.2 + uT * 0.2) * 0.05) * 9.0, 2.0));
  col += vec3(0.1, 0.45, 0.35) * a * 0.28;
  col += vec3(0.25, 0.08, 0.2) * exp(-pow((y - 0.35) * 3.5, 2.0)) * 0.25;
  col = mix(col, col + vec3(0.03, 0.04, 0.07), uSnow * 0.5);
  gl_FragColor = vec4(col, 1.0);
}`;
  const GL_VS = `attribute vec3 aC; attribute vec2 aQ; attribute vec4 aK;
uniform mat4 uVP; uniform vec3 uR; uniform vec3 uU; uniform float uT; varying vec2 vQ; varying vec3 vK;
void main() {
  float sz = max(abs(aQ.x), abs(aQ.y));
  vQ = aQ / sz;
  vK = aK.rgb * (0.65 + 0.35 * sin(uT * 2.0 + aK.w * 30.0));
  vec3 p = aC + (uR * aQ.x + uU * aQ.y) * 0.5;
  gl_Position = uVP * vec4(p, 1.0);
}`;
  const GL_FS = 'precision mediump float; varying vec2 vQ; varying vec3 vK; void main() { float d = dot(vQ, vQ); gl_FragColor = vec4(vK * max(0.0, exp(-d * 4.0) - 0.02), 1.0); }';
  const PT_VS = `attribute vec4 aP; uniform mat4 uVP; uniform float uT; uniform float uDpr; uniform float uSnow; varying float vA; varying vec3 vCol;
void main() {
  vec3 p = aP.xyz; float k = aP.w; float s; vA = 1.0; vCol = vec3(1.0);
  if (k < 1.0) { vA = 0.5 + 0.5 * sin(uT * (0.5 + k * 3.0) + k * 90.0); s = 1.3 + k * 1.8; vCol = vec3(0.8, 0.85, 1.0); }
  else if (k < 2.0) { float f = fract(k); p.y = 9.0 - mod(uT * (0.5 + f * 0.6) + f * 37.0, 14.0); p.x += sin(uT * 0.7 + f * 20.0) * 0.6; vA = uSnow * 0.9; s = 3.5 + f * 3.0; }
  else { float f = fract(k); float t = uT * (0.4 + f * 0.5) + f * 40.0; p += vec3(sin(t) * 0.4, sin(t * 1.3) * 0.25, cos(t * 0.8) * 0.4); vA = (1.0 - uSnow) * (0.5 + 0.5 * sin(uT * 3.0 + f * 30.0)); s = 5.0; vCol = vec3(1.0, 0.9, 0.45); }
  vec4 c = uVP * vec4(p, 1.0); gl_Position = c; gl_PointSize = s * uDpr * (k < 1.0 ? 1.0 : clamp(14.0 / c.w, 0.5, 2.5));
}`;
  const PT_FS = 'precision mediump float; varying float vA; varying vec3 vCol; void main() { vec2 q = gl_PointCoord - 0.5; float d = dot(q, q) * 4.0; gl_FragColor = vec4(vCol * vA * max(0.0, 1.0 - d), 1.0); }';

  function mount(canvas, data, opts) {
    opts = opts || {};
    let gl = null;
    try { gl = canvas.getContext('webgl', { antialias: true, alpha: false }) || canvas.getContext('experimental-webgl'); } catch (_) { gl = null; }
    if (!gl) return null;
    const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    function prog(vs, fs) {
      const mk = (t, src) => { const s = gl.createShader(t); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
      const p = gl.createProgram(); gl.attachShader(p, mk(gl.VERTEX_SHADER, vs)); gl.attachShader(p, mk(gl.FRAGMENT_SHADER, fs)); gl.linkProgram(p);
      if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
      const u = {}; const a = {};
      for (let i = 0; i < gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS); i += 1) { const n = gl.getActiveUniform(p, i).name; u[n] = gl.getUniformLocation(p, n); }
      for (let i = 0; i < gl.getProgramParameter(p, gl.ACTIVE_ATTRIBUTES); i += 1) { const n = gl.getActiveAttrib(p, i).name; a[n] = gl.getAttribLocation(p, n); }
      return { p, u, a };
    }
    let P;
    try { P = { lit: prog(VS, FS), sky: prog(SKY_VS, SKY_FS), glow: prog(GL_VS, GL_FS), pt: prog(PT_VS, PT_FS) }; } catch (e) { console.warn('[island]', e && e.message); return null; }
    const buf = (arr) => { const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(arr), gl.STATIC_DRAW); return b; };
    const bind = (pr, b, layout, stride) => {
      gl.bindBuffer(gl.ARRAY_BUFFER, b); let o = 0;
      for (const [n, sz] of layout) { const l = pr.a[n]; if (l != null && l >= 0) { gl.enableVertexAttribArray(l); gl.vertexAttribPointer(l, sz, gl.FLOAT, false, stride * 4, o * 4); } o += sz; }
    };
    const unbind = (pr) => { for (const k of Object.keys(pr.a)) gl.disableVertexAttribArray(pr.a[k]); };

    let D = data || {};
    let W; let worldN = 0; let gemBufs = []; let glowB; let glowN = 0; let ptB; let ptN = 0; const sky = buf([-1, -1, 3, -1, -1, 3]);
    let R = 4; let H = 2;
    const popAt = {}; let seenGot = null; let lastLevel = null; let growAt = -1e9;
    function rebuild() {
      const now0 = performance.now();
      const gotNow = new Set((D.gems || []).filter((g) => g.got).map((g) => g.id));
      if (seenGot) for (const id of gotNow) if (!seenGot.has(id)) popAt[id] = now0;
      seenGot = gotNow;
      if (lastLevel != null && D.level > lastLevel) growAt = now0;
      lastLevel = D.level;
      const w = buildWorld(D);
      R = w.R; H = w.H;
      if (W) gl.deleteBuffer(W);
      W = buf(w.m.v); worldN = w.m.v.length / 10;
      for (const g of gemBufs) gl.deleteBuffer(g.b);
      const gems = (D.gems || []);
      gemBufs = gems.map((g, i) => {
        const mm = gemMesh(g.shape, g.got ? g.color : '#3b3f55');
        return { b: buf(mm.v), n: mm.v.length / 10, gem: g, i, got: g.got };
      });
      // glows: spire top, gems, festive lights
      const gl2 = [];
      const add = (p, col, size, tw) => { const c = hex(col); for (const [u, v] of [[-1, -1], [1, -1], [1, 1], [-1, -1], [1, 1], [-1, 1]]) gl2.push(p[0], p[1], p[2], u * size, v * size, c[0], c[1], c[2], tw); };
      add([0, H + 0.4, 0], '#ffd88a', 2.6, 0.2);
      add([0, H * 0.5, 0], '#5fd8ff', 2.0, 0.6);
      if (D.season) {
        const cols = ['#ff4d4d', '#ffd36b', '#4dd2ff', '#7dff8a', '#ff8ad8'];
        for (let i = 0; i < 40; i += 1) { const a = (i / 40) * Math.PI * 2; add([Math.cos(a) * R * 0.99, 0.08, Math.sin(a) * R * 0.99], cols[i % 5], 0.42, (i * 0.137) % 1); }
      }
      if (glowB) gl.deleteBuffer(glowB);
      glowB = buf(gl2); glowN = gl2.length / 9;
      const pts = [];
      let s = 5;
      const r = () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
      for (let i = 0; i < 380; i += 1) { const a = r() * Math.PI * 2; const y = r() * 2 - 1; const q = Math.sqrt(1 - y * y); pts.push(Math.cos(a) * q * 60, y * 45, Math.sin(a) * q * 60, r() * 0.99); }
      for (let i = 0; i < 160; i += 1) pts.push((r() - 0.5) * R * 3, 0, (r() - 0.5) * R * 3, 1 + r() * 0.99);
      for (let i = 0; i < 30; i += 1) { const a = r() * Math.PI * 2; const q = 0.6 + r() * (R - 0.6); pts.push(Math.cos(a) * q, 0.4 + r() * 1.8, Math.sin(a) * q, 2 + r() * 0.99); }
      if (ptB) gl.deleteBuffer(ptB);
      ptB = buf(pts); ptN = pts.length / 4;
    }
    rebuild();

    const VP = mat(); const PR = mat(); const VW = mat(); const M = mat(); const ID = trs(mat(), 0, 0, 0, 0, 0, 1);
    let yaw = 0.7; let target = 0.7; let drag = null; let view = null; let userOff = 0; let raf = 0; let alive = true; let visible = true; let W2 = 1; let H2 = 1; let dpr = 1;
    let burst = 0; let hover = null; const gemPos = [];
    function resize() {
      const r = canvas.getBoundingClientRect();
      dpr = Math.min(window.devicePixelRatio || 1, 1.75);
      W2 = Math.max(1, r.width); H2 = Math.max(1, r.height);
      canvas.width = Math.round(W2 * dpr); canvas.height = Math.round(H2 * dpr);
    }
    resize();
    const ro = window.ResizeObserver ? new ResizeObserver(resize) : null;
    if (ro) ro.observe(canvas);
    const io = window.IntersectionObserver ? new IntersectionObserver((es) => { visible = es[0].isIntersecting; }) : null;
    if (io) io.observe(canvas);
    const project = (p) => {
      const x = VP[0] * p[0] + VP[4] * p[1] + VP[8] * p[2] + VP[12]; const y = VP[1] * p[0] + VP[5] * p[1] + VP[9] * p[2] + VP[13]; const w = VP[3] * p[0] + VP[7] * p[1] + VP[11] * p[2] + VP[15];
      return w > 0 ? [(x / w * 0.5 + 0.5) * W2, (1 - (y / w * 0.5 + 0.5)) * H2] : null;
    };
    const pickAt = (x, y) => { let best = null; let bd = 34; for (const g of gemPos) { const d = Math.hypot(g.s[0] - x, g.s[1] - y); if (d < bd) { bd = d; best = g.gem; } } return best; };
    const onDown = (e) => { drag = { x: e.clientX, y: e.clientY, yaw: target, off: userOff, moved: 0 }; };
    const onMove = (e) => {
      const r = canvas.getBoundingClientRect();
      if (drag) {
        const dx = e.clientX - drag.x; drag.moved = Math.max(drag.moved, Math.abs(dx));
        if (view) userOff = drag.off - dx * 0.008; else target = drag.yaw - dx * 0.008;
        return;
      }
      const g = pickAt(e.clientX - r.left, e.clientY - r.top);
      if (g !== hover) { hover = g; canvas.style.cursor = g ? 'pointer' : 'grab'; if (opts.onHover) opts.onHover(g, e); }
    };
    const onUp = (e) => {
      if (drag && drag.moved < 5 && opts.onPick) { const r = canvas.getBoundingClientRect(); const g = pickAt(e.clientX - r.left, e.clientY - r.top); if (g) opts.onPick(g); }
      drag = null;
    };
    canvas.addEventListener('pointerdown', onDown);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    canvas.style.cursor = 'grab';
    canvas.style.touchAction = 'pan-y';

    let last = performance.now();
    function frame(now) {
      if (!alive) return;
      raf = requestAnimationFrame(frame);
      if (!visible || document.hidden) { last = now; return; }
      const dt = Math.min(0.1, (now - last) / 1000); last = now;
      const t = now / 1000;
      if (view) target = view.yaw + userOff;
      else if (!drag && !reduce) target += dt * 0.12;
      yaw += (target - yaw) * Math.min(1, dt * (view ? 4 : 6));
      burst = Math.max(0, burst - dt * 0.6);
      const aspect = W2 / H2;
      const dist = ((R * 2.6 + 6) / Math.min(1.1, Math.max(0.65, aspect * 0.85))) * (view && view.zoom ? view.zoom : 1);
      const eye = [Math.sin(yaw) * dist * 0.88, dist * 0.45 + 1 + (view && view.lift ? view.lift : 0), Math.cos(yaw) * dist * 0.88];
      persp(PR, 0.7, aspect, 0.3, 300);
      lookAt(VW, eye, [0, H * 0.35 - 0.6, 0], [0, 1, 0]);
      mul(VP, PR, VW);
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.clearColor(0.03, 0.03, 0.07, 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      // sky
      gl.disable(gl.DEPTH_TEST); gl.disable(gl.BLEND);
      gl.useProgram(P.sky.p); bind(P.sky, sky, [['aQ', 2]], 2); gl.uniform1f(P.sky.u.uT, t); gl.uniform1f(P.sky.u.uSnow, D.season ? 1 : 0); gl.drawArrays(gl.TRIANGLES, 0, 3); unbind(P.sky);
      // stars (before the world)
      gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE);
      const pts = (from, count) => {
        gl.useProgram(P.pt.p); bind(P.pt, ptB, [['aP', 4]], 4);
        gl.uniformMatrix4fv(P.pt.u.uVP, false, VP); gl.uniform1f(P.pt.u.uT, t); gl.uniform1f(P.pt.u.uDpr, dpr); gl.uniform1f(P.pt.u.uSnow, D.season ? 1 : 0);
        gl.drawArrays(gl.POINTS, from, count); unbind(P.pt);
      };
      pts(0, 380);
      // world
      gl.disable(gl.BLEND); gl.enable(gl.DEPTH_TEST); gl.depthMask(true);
      gl.useProgram(P.lit.p);
      gl.uniformMatrix4fv(P.lit.u.uVP, false, VP); gl.uniform3fv(P.lit.u.uCam, eye); gl.uniform1f(P.lit.u.uSnow, D.season ? 1 : 0); gl.uniform1f(P.lit.u.uGlow, burst);
      const bob = reduce ? 0 : Math.sin(t * 0.6) * 0.1;
      const ga = (now - growAt) / 1000;
      const grow = ga < 0.9 ? 1 + Math.sin(Math.min(1, ga / 0.9) * Math.PI) * 0.045 : 1;
      gl.uniformMatrix4fv(P.lit.u.uM, false, trs(M, 0, bob, 0, 0, 0, grow));
      bind(P.lit, W, [['aP', 3], ['aN', 3], ['aC', 3], ['aF', 1]], 10);
      gl.drawArrays(gl.TRIANGLES, 0, worldN);
      gemPos.length = 0;
      const n = gemBufs.length;
      for (const g of gemBufs) {
        const a = (g.i / Math.max(1, n)) * Math.PI * 2 + t * 0.15;
        const rad = R + 0.9;
        const y = H * 0.6 + 1.3 + Math.sin(t * 1.1 + g.i) * 0.18 + (g.got ? 0 : -0.6);
        const pa = popAt[g.gem.id] != null ? (now - popAt[g.gem.id]) / 1000 : 9;
        const pop = pa < 0.7 ? 1 + Math.sin(Math.min(1, pa / 0.7) * Math.PI) * 0.9 : 1;
        const sc = (g.got ? 1 : 0.55) * (hover === g.gem ? 1.25 : 1) * (1 + burst * 0.5) * pop;
        const p = [Math.cos(a) * rad, y + bob, Math.sin(a) * rad];
        gl.uniformMatrix4fv(P.lit.u.uM, false, trs(M, p[0], p[1], p[2], t * (0.6 + g.i * 0.03), 0.25, sc));
        bind(P.lit, g.b, [['aP', 3], ['aN', 3], ['aC', 3], ['aF', 1]], 10);
        gl.drawArrays(gl.TRIANGLES, 0, g.n);
        const s = project(p);
        if (s) gemPos.push({ s, gem: g.gem });
      }
      unbind(P.lit);
      // glows + snow/fireflies
      gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE); gl.depthMask(false);
      gl.useProgram(P.glow.p);
      gl.uniformMatrix4fv(P.glow.u.uVP, false, VP);
      gl.uniform3f(P.glow.u.uR, VW[0], VW[4], VW[8]); gl.uniform3f(P.glow.u.uU, VW[1], VW[5], VW[9]); gl.uniform1f(P.glow.u.uT, t);
      bind(P.glow, glowB, [['aC', 3], ['aQ', 2], ['aK', 4]], 9);
      gl.drawArrays(gl.TRIANGLES, 0, glowN); unbind(P.glow);
      pts(380, ptN - 380);
      gl.depthMask(true);
      if (opts.onFrame) opts.onFrame(gemPos);
    }
    raf = requestAnimationFrame(frame);
    return {
      update(d) { D = d || {}; rebuild(); },
      /** Drive the camera from outside (e.g. scrolling): { yaw, zoom, lift }. null = free orbit again. */
      setView(v) { view = v || null; if (!v) userOff = 0; },
      celebrate() { burst = 1; target += Math.PI; },
      destroy() {
        alive = false; cancelAnimationFrame(raf);
        if (ro) ro.disconnect(); if (io) io.disconnect();
        window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp);
        const ext = gl.getExtension('WEBGL_lose_context'); if (ext) ext.loseContext();
      },
    };
  }

  root.Island3D = { mount };
}(typeof window !== 'undefined' ? window : globalThis));
