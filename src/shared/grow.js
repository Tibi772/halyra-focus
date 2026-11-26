// Grow while you focus: a tree grows or a building goes up during a focus
// session; finished ones are added to the user's forest / city. Pure drawing
// code (SVG strings) shared by the app, the phone app and the web app.
(function (root) {
  'use strict';

  // unlockH = total focus hours needed before it can be picked.
  const CATALOG = [
    { id: 'oak', kind: 'tree', unlockH: 0, name: { en: 'Oak', hu: 'Tölgy' } },
    { id: 'pine', kind: 'tree', unlockH: 0, name: { en: 'Pine', hu: 'Fenyő' } },
    { id: 'birch', kind: 'tree', unlockH: 1, name: { en: 'Birch', hu: 'Nyírfa' } },
    { id: 'cherry', kind: 'tree', unlockH: 3, name: { en: 'Cherry blossom', hu: 'Cseresznyevirág' } },
    { id: 'maple', kind: 'tree', unlockH: 6, name: { en: 'Maple', hu: 'Juhar' } },
    { id: 'cactus', kind: 'tree', unlockH: 10, name: { en: 'Cactus', hu: 'Kaktusz' } },
    { id: 'bonsai', kind: 'tree', unlockH: 20, name: { en: 'Bonsai', hu: 'Bonszai' } },
    { id: 'palm', kind: 'tree', unlockH: 35, name: { en: 'Palm', hu: 'Pálma' } },
    { id: 'golden', kind: 'tree', unlockH: 60, name: { en: 'Golden tree', hu: 'Aranyfa' } },
    { id: 'hut', kind: 'building', unlockH: 0, name: { en: 'Hut', hu: 'Kunyhó' } },
    { id: 'house', kind: 'building', unlockH: 0, name: { en: 'House', hu: 'Ház' } },
    { id: 'shop', kind: 'building', unlockH: 2, name: { en: 'Corner shop', hu: 'Kisbolt' } },
    { id: 'windmill', kind: 'building', unlockH: 5, name: { en: 'Windmill', hu: 'Szélmalom' } },
    { id: 'tower', kind: 'building', unlockH: 8, name: { en: 'Stone tower', hu: 'Kőtorony' } },
    { id: 'lighthouse', kind: 'building', unlockH: 15, name: { en: 'Lighthouse', hu: 'Világítótorony' } },
    { id: 'castle', kind: 'building', unlockH: 25, name: { en: 'Castle', hu: 'Vár' } },
    { id: 'rocket', kind: 'building', unlockH: 40, name: { en: 'Rocket', hu: 'Rakéta' } },
    { id: 'skyscraper', kind: 'building', unlockH: 60, name: { en: 'Skyscraper', hu: 'Felhőkarcoló' } },
  ];
  const BY_ID = Object.fromEntries(CATALOG.map((c) => [c.id, c]));

  // Natural colours; in "mono" (1-bit / CRT themes) everything is drawn with
  // currentColor at the given opacity, so it takes the theme's ink colour.
  const P = {
    soil: ['#7a5236', 0.35], soilDark: ['#5b3a24', 0.5], grass: ['#5fae4e', 0.55], grassDark: ['#3f8a3a', 0.7],
    trunk: ['#7b5134', 0.85], trunkDark: ['#5a3a25', 1], leaf: ['#3f9b4b', 0.75], leafLight: ['#6cc561', 0.5], leafDark: ['#2c7a3a', 0.95],
    pine: ['#2f7d55', 0.85], pineLight: ['#47a06f', 0.55], birchBark: ['#f1ede4', 0.25], birchLeaf: ['#8ccf5e', 0.6],
    pink: ['#f4a6c6', 0.55], pinkLight: ['#fcd2e2', 0.3], pinkDark: ['#e07ba7', 0.8],
    maple: ['#e8692f', 0.75], mapleLight: ['#f6a04a', 0.45], mapleDark: ['#c4471f', 0.95],
    cactus: ['#4aa36a', 0.75], cactusDark: ['#327d4f', 1], flower: ['#ff6f91', 0.9],
    pot: ['#b5603d', 0.9], potDark: ['#8d4529', 1], gold: ['#f5c542', 0.75], goldLight: ['#ffe58a', 0.4], goldDark: ['#d49a1d', 1],
    palmLeaf: ['#43a35a', 0.8], palmTrunk: ['#a7804f', 0.8],
    dead: ['#8b7b6b', 0.6], deadDark: ['#6b5d50', 0.85], deadLeaf: ['#a8865a', 0.5],
    wood: ['#a8703f', 0.8], woodDark: ['#7d4f2a', 1], straw: ['#e2b552', 0.6], strawDark: ['#c08f2e', 0.85],
    wall: ['#f3e6cf', 0.2], wallShade: ['#dcc8a6', 0.35], roof: ['#d2503f', 0.85], roofDark: ['#a83a2d', 1],
    stone: ['#b9b2a6', 0.4], stoneDark: ['#8f877b', 0.7], glass: ['#8fc9ee', 0.35], glassDark: ['#4f8fbd', 0.7],
    win: ['#ffd36b', 0.9], winOff: ['#5c6b7a', 0.55], door: ['#7d4f2a', 1], awning1: ['#e85d5d', 0.9], awning2: ['#fff4e6', 0.15],
    metal: ['#c9d1d9', 0.35], metalDark: ['#7f8b96', 0.75], red: ['#e2483d', 0.9], white: ['#fbfbf8', 0.15], flame: ['#ffb238', 0.9], flameCore: ['#fff2b0', 0.4],
    crane: ['#f2b233', 0.9], scaffold: ['#b98b52', 0.7], found: ['#9b9488', 0.55], beam: ['#fff3b0', 0.35], rubble: ['#8d857a', 0.6],
  };

  const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
  const ease = (t) => 1 - Math.pow(1 - clamp(t), 3);
  const lerp = (a, b, t) => a + (b - a) * t;
  const n = (x) => Math.round(x * 100) / 100;
  const seg = (p, a, b) => clamp((p - a) / (b - a));

  function paint(mono) {
    return (name, extra = '') => {
      const c = P[name] || ['#888', 0.5];
      return mono ? `fill="currentColor" fill-opacity="${c[1]}"${extra}` : `fill="${c[0]}"${extra}`;
    };
  }
  function stroke(mono) {
    return (name, w) => {
      const c = P[name] || ['#888', 0.5];
      return mono ? `stroke="currentColor" stroke-opacity="${c[1]}" stroke-width="${w}"` : `stroke="${c[0]}" stroke-width="${w}"`;
    };
  }

  function ground(f, kind) {
    return kind === 'building'
      ? `<ellipse cx="60" cy="106" rx="44" ry="7" ${f('found')}/><ellipse cx="60" cy="105" rx="38" ry="5" ${f('stone')}/>`
      : `<ellipse cx="60" cy="106" rx="42" ry="7.5" ${f('soil')}/><ellipse cx="60" cy="104.5" rx="36" ry="5.2" ${f('grass')}/><path d="M34 104 l2 -4 l2 4 M80 104 l2 -5 l2 5 M47 105 l1.5 -3 l1.5 3" ${f('grassDark')}/>`;
  }

  // ------------------------------------------------------------------ trees

  function blob(f, cx, cy, s, parts, dark, mid, light) {
    let out = '';
    for (const [dx, dy, r] of parts) out += `<circle cx="${n(cx + dx * s)}" cy="${n(cy + dy * s + 2 * s)}" r="${n(r * s)}" ${f(dark)}/>`;
    for (const [dx, dy, r] of parts) out += `<circle cx="${n(cx + dx * s)}" cy="${n(cy + dy * s)}" r="${n(r * s)}" ${f(mid)}/>`;
    for (const [dx, dy, r] of parts) out += `<circle cx="${n(cx + dx * s - r * s * 0.3)}" cy="${n(cy + dy * s - r * s * 0.35)}" r="${n(r * s * 0.45)}" ${f(light)}/>`;
    return out;
  }

  const OAK = [[0, -4, 17], [-14, 3, 12], [14, 3, 12], [-8, -14, 11], [8, -15, 11], [0, 6, 11]];

  function trunk(f, x, base, h, w, color = 'trunk') {
    const top = base - h;
    return `<path d="M${n(x - w / 2)} ${base} Q${n(x - w * 0.35)} ${n(base - h * 0.5)} ${n(x - w * 0.28)} ${n(top)} L${n(x + w * 0.28)} ${n(top)} Q${n(x + w * 0.35)} ${n(base - h * 0.5)} ${n(x + w / 2)} ${base} Z" ${f(color)}/>`
      + `<path d="M${n(x + w * 0.05)} ${base} Q${n(x + w * 0.12)} ${n(base - h * 0.5)} ${n(x + w * 0.1)} ${n(top)} L${n(x + w * 0.28)} ${n(top)} Q${n(x + w * 0.35)} ${n(base - h * 0.5)} ${n(x + w / 2)} ${base} Z" ${f('trunkDark')}/>`;
  }

  function sprout(f, sk, x, y, s, color = 'leaf') {
    return `<path d="M${x} ${y} q0 ${n(-6 * s)} 0 ${n(-10 * s)}" fill="none" ${sk('leafDark', n(1.6 * s))} stroke-linecap="round"/>`
      + `<ellipse cx="${n(x - 5 * s)}" cy="${n(y - 11 * s)}" rx="${n(5.5 * s)}" ry="${n(2.8 * s)}" transform="rotate(-28 ${n(x - 5 * s)} ${n(y - 11 * s)})" ${f(color)}/>`
      + `<ellipse cx="${n(x + 5 * s)}" cy="${n(y - 12 * s)}" rx="${n(5.5 * s)}" ry="${n(2.8 * s)}" transform="rotate(28 ${n(x + 5 * s)} ${n(y - 12 * s)})" ${f(color)}/>`;
  }

  function seed(f) {
    return `<ellipse cx="60" cy="103" rx="9" ry="3.5" ${f('soilDark')}/><ellipse cx="60" cy="101.6" rx="3" ry="2.2" ${f('trunk')}/>`;
  }

  function drawTree(id, p, f, mono) {
    const base = 104;
    const g = ease(p);
    if (id === 'cactus') {
      if (p < 0.06) return seed(f);
      const h = lerp(6, 58, g);
      const w = lerp(5, 14, g);
      let s = `<rect x="${n(60 - w / 2)}" y="${n(base - h)}" width="${n(w)}" height="${n(h)}" rx="${n(w / 2)}" ${f('cactus')}/>`
        + `<rect x="${n(60 + w * 0.08)}" y="${n(base - h)}" width="${n(w * 0.42)}" height="${n(h)}" rx="${n(w * 0.21)}" ${f('cactusDark')}/>`;
      const arm = seg(p, 0.45, 0.85);
      if (arm > 0) {
        const ah = 18 * arm;
        s += `<path d="M${n(60 - w / 2 + 1)} ${n(base - h * 0.45)} h${n(-7 * arm)} v${n(-ah)}" fill="none" ${stroke(mono)('cactus', 6 * arm + 1)} stroke-linecap="round" stroke-linejoin="round"/>`;
        s += `<path d="M${n(60 + w / 2 - 1)} ${n(base - h * 0.62)} h${n(7 * arm)} v${n(-ah * 0.8)}" fill="none" ${stroke(mono)('cactusDark', 6 * arm + 1)} stroke-linecap="round" stroke-linejoin="round"/>`;
      }
      if (p >= 0.9) s += `<circle cx="60" cy="${n(base - h - 2)}" r="4.5" ${f('flower')}/><circle cx="60" cy="${n(base - h - 2)}" r="1.6" ${f('gold')}/>`;
      return `<rect x="46" y="98" width="28" height="6" rx="1" ${f('soilDark')}/>${s}`;
    }
    if (id === 'bonsai') {
      const pot = `<path d="M40 104 h40 l-4 -10 h-32 z" ${f('pot')}/><rect x="38" y="91" width="44" height="4" rx="1.5" ${f('potDark')}/>`;
      if (p < 0.06) return pot + `<ellipse cx="60" cy="91" rx="3" ry="2" ${f('trunk')}/>`;
      if (p < 0.25) return pot + sprout(f, stroke(mono), 60, 91, 0.6 + p);
      const h = lerp(10, 34, g);
      const s = seg(p, 0.25, 1);
      const tr = `<path d="M58 91 C 52 ${n(91 - h * 0.4)}, 70 ${n(91 - h * 0.6)}, 62 ${n(91 - h)}" fill="none" ${stroke(mono)('trunk', lerp(2, 6, g))} stroke-linecap="round"/>`;
      const pads = [[62, 91 - h, 13], [47, 91 - h * 0.55, 9], [74, 91 - h * 0.7, 8]];
      let pd = '';
      for (const [x, y, r] of pads) pd += `<ellipse cx="${n(x)}" cy="${n(y + 1.5)}" rx="${n(r * s)}" ry="${n(r * s * 0.5)}" ${f('leafDark')}/><ellipse cx="${n(x)}" cy="${n(y)}" rx="${n(r * s)}" ry="${n(r * s * 0.48)}" ${f('leaf')}/><ellipse cx="${n(x - r * s * 0.3)}" cy="${n(y - r * s * 0.15)}" rx="${n(r * s * 0.45)}" ry="${n(r * s * 0.2)}" ${f('leafLight')}/>`;
      return pot + tr + pd;
    }
    if (p < 0.06) return seed(f);
    if (p < 0.24) return seed(f) + sprout(f, stroke(mono), 60, 102, 0.55 + p * 1.8, id === 'cherry' ? 'leaf' : id === 'maple' ? 'mapleLight' : 'leaf');
    const s = ease(seg(p, 0.24, 1));
    if (id === 'palm') {
      const h = lerp(12, 62, s);
      const tx = 60 + 10 * s;
      let out = `<path d="M58 ${base} Q ${n(56 + 2 * s)} ${n(base - h * 0.6)} ${n(tx)} ${n(base - h)}" fill="none" ${stroke(mono)('palmTrunk', lerp(3, 6.5, s))} stroke-linecap="round"/>`;
      for (let i = 0; i < 5; i += 1) out += `<path d="M58 ${base - i * h / 5 - 3} l5 -1" ${stroke(mono)('trunkDark', 1)} />`;
      const fr = [[-32, 6], [-16, -10], [4, -14], [24, -8], [34, 8]];
      for (const [dx, dy] of fr) {
        out += `<path d="M${n(tx)} ${n(base - h)} q ${n(dx * 0.5 * s)} ${n((dy - 10) * s)} ${n(dx * s)} ${n((dy + 6) * s)} q ${n(-dx * 0.45 * s)} ${n(-6 * s)} ${n(-dx * s)} ${n(-(dy + 6) * s)} z" ${f('palmLeaf')}/>`;
      }
      if (p >= 0.9) out += `<circle cx="${n(tx - 3)}" cy="${n(base - h + 4)}" r="2.6" ${f('trunk')}/><circle cx="${n(tx + 2)}" cy="${n(base - h + 5)}" r="2.6" ${f('trunkDark')}/>`;
      return out;
    }
    if (id === 'pine') {
      const h = lerp(8, 18, s);
      let out = trunk(f, 60, base, h, lerp(2, 6, s));
      const top = base - h;
      const layers = [[38, 22, 0], [30, 20, 13], [22, 18, 25]];
      for (const [w, lh, up] of layers) {
        const y = top - up * s;
        out += `<path d="M${n(60 - w * s / 2)} ${n(y + 2)} L60 ${n(y - lh * s)} L${n(60 + w * s / 2)} ${n(y + 2)} Z" ${f('pine')}/>`;
        out += `<path d="M60 ${n(y - lh * s)} L${n(60 + w * s / 2)} ${n(y + 2)} L${n(60 + w * s * 0.12)} ${n(y + 2)} Z" ${f('leafDark')}/>`;
        out += `<path d="M${n(60 - w * s * 0.28)} ${n(y - 2)} L60 ${n(y - lh * s * 0.8)}" ${stroke(mono)('pineLight', 1.4 * s)} stroke-linecap="round"/>`;
      }
      return out;
    }
    if (id === 'birch') {
      const h = lerp(10, 40, s);
      const w = lerp(2, 5.5, s);
      let out = `<rect x="${n(60 - w / 2)}" y="${n(base - h)}" width="${n(w)}" height="${n(h)}" rx="${n(w / 3)}" ${f('birchBark')}/>`;
      for (let i = 1; i < 6; i += 1) out += `<rect x="${n(60 - w / 2 + (i % 2) * w * 0.4)}" y="${n(base - h * i / 6)}" width="${n(w * 0.55)}" height="1.2" ${f('trunkDark')}/>`;
      const cy = base - h - 8 * s;
      out += `<ellipse cx="60" cy="${n(cy + 2)}" rx="${n(15 * s)}" ry="${n(22 * s)}" ${f('leafDark')}/><ellipse cx="60" cy="${n(cy)}" rx="${n(15 * s)}" ry="${n(22 * s)}" ${f('birchLeaf')}/><ellipse cx="${n(55)}" cy="${n(cy - 7 * s)}" rx="${n(6 * s)}" ry="${n(9 * s)}" ${f('leafLight')}/>`;
      return out;
    }
    // oak-like crowns: oak, cherry, maple, golden
    const h = lerp(8, 30, s);
    const colors = {
      oak: ['leafDark', 'leaf', 'leafLight'], cherry: ['pinkDark', 'pink', 'pinkLight'],
      maple: ['mapleDark', 'maple', 'mapleLight'], golden: ['goldDark', 'gold', 'goldLight'],
    }[id] || ['leafDark', 'leaf', 'leafLight'];
    let out = '';
    if (id === 'golden' && p >= 0.9) out += `<circle cx="60" cy="${n(base - h - 14)}" r="38" ${f('goldLight')} opacity=".35"/>`;
    out += trunk(f, 60, base, h + 4 * s, lerp(2, 8, s), id === 'golden' ? 'goldDark' : 'trunk');
    out += `<path d="M60 ${n(base - h * 0.6)} l${n(-9 * s)} ${n(-8 * s)} M60 ${n(base - h * 0.75)} l${n(8 * s)} ${n(-7 * s)}" ${stroke(mono)(id === 'golden' ? 'goldDark' : 'trunk', 2.2 * s)} stroke-linecap="round"/>`;
    out += blob(f, 60, base - h - 10 * s, s, OAK, colors[0], colors[1], colors[2]);
    if (id === 'cherry' && p >= 0.6) for (const [dx, dy] of [[-12, -8], [6, -20], [14, 0], [-4, 2], [-16, -2], [10, -10]]) out += `<circle cx="${n(60 + dx * s)}" cy="${n(base - h - 10 * s + dy * s)}" r="${n(1.8 * s)}" fill="#fff" fill-opacity="${mono ? 0.0 : 0.85}"/>`;
    if (id === 'maple' && p >= 0.9) out += `<path d="M30 92 l3 -2 l1 3 z M88 96 l3 -3 l1 3 z" ${f('maple')}/>`;
    if (id === 'golden' && p >= 0.9) for (const [x, y] of [[32, 40], [90, 50], [78, 22], [40, 70]]) out += `<path d="M${x} ${y - 4} l1.2 3 3 1.2 -3 1.2 -1.2 3 -1.2 -3 -3 -1.2 3 -1.2z" ${f('goldLight')}/>`;
    return out;
  }

  function drawDeadTree(f, mono) {
    const s = stroke(mono);
    return `<path d="M58 104 Q57 86 60 72 L63 72 Q63 88 64 104 Z" ${f('dead')}/>`
      + `<path d="M61 80 l-10 -10 M61 76 l9 -11 M53 72 l-4 -6 M68 68 l5 -4" fill="none" ${s('deadDark', 2.2)} stroke-linecap="round"/>`
      + `<path d="M44 103 l4 -2 l1 3 z M72 104 l4 -3 l1 3 z M64 102 l3 -1 l0 3 z" ${f('deadLeaf')}/>`;
  }

  // ------------------------------------------------------------------ buildings

  function scaffold(s, x, y, w, h) {
    let o = `<path d="M${n(x - 3)} ${n(y + h)} V${n(y - 2)} M${n(x + w + 3)} ${n(y + h)} V${n(y - 2)}" ${s('scaffold', 1.4)}/>`;
    for (let yy = y + h - 7; yy > y - 2; yy -= 9) o += `<path d="M${n(x - 3)} ${n(yy)} H${n(x + w + 3)}" ${s('scaffold', 1)}/>`;
    return o;
  }

  function crane(s, f, x, top) {
    return `<path d="M${x} 104 V${n(top)} M${n(x - 6)} ${n(top + 3)} H${n(x + 30)} M${x} ${n(top)} L${n(x + 30)} ${n(top + 3)} M${n(x + 22)} ${n(top + 3)} V${n(top + 16)}" fill="none" ${s('crane', 1.6)}/>`
      + `<rect x="${n(x + 19)}" y="${n(top + 16)}" width="6" height="4" ${f('metalDark')}/>`;
  }

  function windows(f, xs, ys, size, lit) {
    let o = '';
    for (const y of ys) for (const x of xs) o += `<rect x="${n(x)}" y="${n(y)}" width="${size}" height="${size}" rx="0.6" ${f(lit ? 'win' : 'winOff')}/>`;
    return o;
  }

  function drawBuilding(id, p, f, mono) {
    const s = stroke(mono);
    const done = p >= 0.95;
    const B = { hut: [34, 20], house: [40, 26], shop: [46, 26], windmill: [22, 46], tower: [24, 60], lighthouse: [20, 62], castle: [56, 34], rocket: [16, 60], skyscraper: [30, 80] }[id] || [40, 26];
    const [W, H] = B;
    const x = 60 - W / 2;
    const wallP = ease(seg(p, 0.1, 0.72));
    const h = H * wallP;
    const y = 104 - h;
    let o = `<rect x="${n(x - 4)}" y="101" width="${n(W + 8)}" height="4" rx="1" ${f('found')}/>`;
    if (p < 0.1) return o + `<path d="M${n(x)} 101 v-5 M${n(x + W)} 101 v-5" ${s('scaffold', 1.4)}/>`;
    const roofP = ease(seg(p, 0.68, 0.95));

    if (id === 'hut' || id === 'house' || id === 'shop') {
      const wall = id === 'hut' ? 'wood' : 'wall';
      o += `<rect x="${n(x)}" y="${n(y)}" width="${W}" height="${n(h)}" ${f(wall)}/><rect x="${n(x + W * 0.72)}" y="${n(y)}" width="${n(W * 0.28)}" height="${n(h)}" ${f(id === 'hut' ? 'woodDark' : 'wallShade')}/>`;
      if (id === 'hut') for (let yy = y + 5; yy < 104; yy += 5) o += `<path d="M${n(x)} ${n(yy)} H${n(x + W)}" ${s('woodDark', 0.7)}/>`;
      if (roofP > 0) {
        const rh = (id === 'hut' ? 18 : 16) * roofP;
        const over = 5;
        const rc = id === 'hut' ? ['straw', 'strawDark'] : ['roof', 'roofDark'];
        if (id === 'shop') {
          o += `<rect x="${n(x - 2)}" y="${n(y - 6 * roofP)}" width="${W + 4}" height="${n(6 * roofP)}" ${f('roofDark')}/>`;
        } else {
          o += `<path d="M${n(x - over)} ${n(y + 1)} L60 ${n(y - rh)} L${n(x + W + over)} ${n(y + 1)} Z" ${f(rc[0])}/><path d="M60 ${n(y - rh)} L${n(x + W + over)} ${n(y + 1)} L${n(60 + 4)} ${n(y + 1)} Z" ${f(rc[1])}/>`;
          if (id === 'house') o += `<rect x="${n(x + W * 0.7)}" y="${n(y - rh * 0.75)}" width="5" height="${n(rh * 0.55)}" ${f('roofDark')}/>`;
        }
      }
      if (h > H * 0.9) {
        if (id === 'shop') {
          for (let i = 0; i < 6; i += 1) o += `<path d="M${n(x + i * W / 6)} ${n(y + 2)} h${n(W / 6)} l-1 7 h${n(-W / 6 + 2)} z" ${f(i % 2 ? 'awning2' : 'awning1')}/>`;
          o += `<rect x="${n(x + 4)}" y="${n(y + 11)}" width="${n(W * 0.5)}" height="11" ${f(done ? 'win' : 'glass')}/><rect x="${n(x + W * 0.66)}" y="${n(y + 10)}" width="9" height="${n(h - 10)}" ${f('door')}/>`;
        } else {
          o += `<rect x="${n(60 - 4)}" y="${n(104 - 12)}" width="8" height="12" rx="1" ${f('door')}/>`;
          o += windows(f, [x + 5, x + W - 12], [y + 5], 7, done);
        }
      }
      if (done && id === 'house') o += `<path d="M${n(x + W * 0.7 + 2.5)} ${n(y - 18)} q 4 -6 0 -10 q -3 -4 2 -8" fill="none" ${s('metal', 2)} stroke-linecap="round" opacity=".7"/>`;
    } else if (id === 'windmill') {
      o += `<path d="M${n(x)} 104 L${n(x + 4)} ${n(y)} L${n(x + W - 4)} ${n(y)} L${n(x + W)} 104 Z" ${f('wall')}/><path d="M${n(60 + 2)} 104 L${n(60 + 2)} ${n(y)} L${n(x + W - 4)} ${n(y)} L${n(x + W)} 104 Z" ${f('wallShade')}/>`;
      if (h > 20) o += `<rect x="57" y="92" width="6" height="12" rx="1" ${f('door')}/>` + windows(f, [57.5], [y + 10], 5, done);
      if (roofP > 0) {
        o += `<path d="M${n(x + 1)} ${n(y + 1)} Q60 ${n(y - 14 * roofP)} ${n(x + W - 1)} ${n(y + 1)} Z" ${f('roof')}/>`;
        const cx = 60;
        const cy = y - 2;
        const L = 26 * roofP;
        let blades = '';
        for (let a = 0; a < 4; a += 1) blades += `<g transform="rotate(${a * 90 + 20} ${cx} ${n(cy)})"><rect x="${cx - 1}" y="${n(cy - L)}" width="2" height="${n(L)}" ${f('woodDark')}/><rect x="${cx + 1}" y="${n(cy - L)}" width="6" height="${n(L * 0.75)}" ${f('white')}/></g>`;
        o += `<g class="${done ? 'gw-spin' : ''}" style="transform-origin:${cx}px ${n(cy)}px">${blades}</g><circle cx="${cx}" cy="${n(cy)}" r="2.4" ${f('woodDark')}/>`;
      }
    } else if (id === 'tower' || id === 'castle') {
      const towers = id === 'castle' ? [[x - 4, 14, H + 10], [x + W - 10, 14, H + 10], [60 - 9, 18, H + 18]] : [[x, W, H]];
      if (id === 'castle') o += `<rect x="${n(x)}" y="${n(104 - h * 0.7)}" width="${W}" height="${n(h * 0.7)}" ${f('stone')}/>`;
      for (const [tx, tw, th] of towers) {
        const hh = th * wallP;
        const ty = 104 - hh;
        o += `<rect x="${n(tx)}" y="${n(ty)}" width="${tw}" height="${n(hh)}" ${f('stone')}/><rect x="${n(tx + tw * 0.65)}" y="${n(ty)}" width="${n(tw * 0.35)}" height="${n(hh)}" ${f('stoneDark')}/>`;
        for (let yy = ty + 6; yy < 100; yy += 7) o += `<path d="M${n(tx)} ${n(yy)} H${n(tx + tw)}" ${s('stoneDark', 0.6)}/>`;
        if (roofP > 0) {
          for (let i = 0; i < Math.floor(tw / 5); i += 1) o += `<rect x="${n(tx + i * 5)}" y="${n(ty - 4 * roofP)}" width="3" height="${n(4 * roofP)}" ${f('stoneDark')}/>`;
          if (hh > 20) o += windows(f, [tx + tw / 2 - 1.5], [ty + 10, ty + 24], 3, done);
        }
        if (done && id === 'castle') o += `<path d="M${n(tx + tw / 2)} ${n(ty - 4)} v-12" ${s('metalDark', 1)}/><path d="M${n(tx + tw / 2)} ${n(ty - 16)} l9 3 l-9 3 z" ${f('red')}/>`;
      }
      if (id === 'castle' && h > H * 0.6) o += `<path d="M54 104 v-9 q6 -7 12 0 v9 z" ${f('door')}/>`;
    } else if (id === 'lighthouse') {
      o += `<path d="M${n(x - 3)} 104 L${n(x + 3)} ${n(y)} L${n(x + W - 3)} ${n(y)} L${n(x + W + 3)} 104 Z" ${f('white')}/>`;
      for (let i = 0; i < 4; i += 1) {
        const sy = 104 - (i * 2 + 1) * (H / 8);
        if (sy < y) break;
        const t1 = (104 - sy) / H;
        const t2 = Math.min(1, t1 + 1 / 8);
        const xl1 = lerp(x - 3, x + 3, t1); const xr1 = lerp(x + W + 3, x + W - 3, t1);
        const xl2 = lerp(x - 3, x + 3, t2); const xr2 = lerp(x + W + 3, x + W - 3, t2);
        const yTop = Math.max(y, 104 - t2 * H);
        o += `<path d="M${n(xl1)} ${n(sy)} L${n(xl2)} ${n(yTop)} L${n(xr2)} ${n(yTop)} L${n(xr1)} ${n(sy)} Z" ${f('red')}/>`;
      }
      if (roofP > 0) {
        o += `<rect x="${n(x + 1)}" y="${n(y - 10 * roofP)}" width="${W - 2}" height="${n(10 * roofP)}" ${f(done ? 'win' : 'glass')}/><path d="M${n(x - 1)} ${n(y - 10 * roofP)} L60 ${n(y - 18 * roofP)} L${n(x + W + 1)} ${n(y - 10 * roofP)} Z" ${f('roofDark')}/><rect x="${n(x - 3)}" y="${n(y - 1)}" width="${W + 6}" height="2.5" ${f('metalDark')}/>`;
        if (done) o += `<path d="M60 ${n(y - 5)} L4 ${n(y - 18)} L4 ${n(y + 6)} Z" ${f('beam')} class="gw-beam"/>`;
      }
    } else if (id === 'rocket') {
      o += `<rect x="38" y="100" width="44" height="4" ${f('metalDark')}/><path d="M78 104 V${n(104 - 70 * wallP)} M78 ${n(104 - 30 * wallP)} h-10" ${s('metalDark', 2)}/>`;
      const by = 98 - h;
      o += `<rect x="${n(x)}" y="${n(by + 12)}" width="${W}" height="${n(Math.max(0, h - 12))}" ${f('white')}/><rect x="${n(x + W * 0.6)}" y="${n(by + 12)}" width="${n(W * 0.4)}" height="${n(Math.max(0, h - 12))}" ${f('metal')}/>`;
      if (roofP > 0) o += `<path d="M${n(x)} ${n(by + 12)} Q60 ${n(by - 14 * roofP)} ${n(x + W)} ${n(by + 12)} Z" ${f('red')}/>`;
      if (h > H * 0.6) o += `<circle cx="60" cy="${n(by + 24)}" r="4" ${f('glassDark')}/><circle cx="59" cy="${n(by + 23)}" r="2" ${f('glass')}/><path d="M${n(x)} 98 l-7 4 v-14 l7 -6 z M${n(x + W)} 98 l7 4 v-14 l-7 -6 z" ${f('red')}/>`;
      if (done) o += `<g class="gw-flame"><path d="M54 99 Q60 120 66 99 Z" ${f('flame')}/><path d="M57 99 Q60 112 63 99 Z" ${f('flameCore')}/></g>`;
    } else if (id === 'skyscraper') {
      o += `<rect x="${n(x)}" y="${n(y)}" width="${W}" height="${n(h)}" ${f('glassDark')}/><rect x="${n(x + W * 0.62)}" y="${n(y)}" width="${n(W * 0.38)}" height="${n(h)}" ${f('glass')}/>`;
      const ys = [];
      for (let yy = y + 4; yy < 100; yy += 6) ys.push(yy);
      o += windows(f, [x + 3, x + 10, x + 17, x + 24], ys, 3, false);
      if (done) {
        let lit = '';
        ys.forEach((yy, i) => { [x + 3, x + 10, x + 17, x + 24].forEach((xx, j) => { if ((i * 7 + j * 3) % 5 < 2) lit += `<rect x="${n(xx)}" y="${n(yy)}" width="3" height="3" rx="0.6" ${f('win')}/>`; }); });
        o += lit + `<path d="M60 ${n(y)} v-14" ${s('metalDark', 1.4)}/><circle cx="60" cy="${n(y - 14)}" r="1.6" ${f('red')} class="gw-blink"/>`;
      }
      if (roofP > 0) o += `<rect x="${n(x - 1)}" y="${n(y - 3 * roofP)}" width="${W + 2}" height="${n(3 * roofP)}" ${f('metalDark')}/>`;
    }
    if (!done) {
      if (id !== 'rocket') o += scaffold(s, x, y, W, h);
      o += crane(s, f, id === 'castle' ? 92 : 88, 104 - Math.max(H, 30) - 18);
    }
    return o;
  }

  function drawRuin(id, f, mono) {
    const s = stroke(mono);
    const B = { hut: [34, 20], house: [40, 26], shop: [46, 26], windmill: [22, 46], tower: [24, 60], lighthouse: [20, 62], castle: [56, 34], rocket: [16, 60], skyscraper: [30, 80] }[id] || [40, 26];
    const W = Math.max(30, B[0]);
    const x = 60 - W / 2;
    const h = Math.min(30, B[1] * 0.45);
    return `<rect x="${n(x - 4)}" y="101" width="${n(W + 8)}" height="4" rx="1" ${f('found')}/>`
      + `<path d="M${n(x)} 104 V${n(104 - h)} l6 5 l5 -8 l6 9 l5 -4 l6 7 L${n(x + W)} ${n(104 - h * 0.5)} V104 Z" ${f('rubble')}/>`
      + `<path d="M${n(x + 6)} ${n(104 - h * 0.6)} l4 6 M${n(x + W - 9)} ${n(104 - h * 0.4)} l-3 5" ${s('stoneDark', 1)}/>`
      + `<path d="M${n(x - 6)} 104 l4 -4 l4 4 z M${n(x + W + 2)} 104 l3 -3 l3 3 z" ${f('stoneDark')}/>`;
  }

  /**
   * SVG for one item. p = growth 0..1; opts: { dead, mono, minutes, size, ground }.
   * Size tier follows the session length (short sessions grow smaller ones).
   */
  function draw(id, p, opts = {}) {
    const item = BY_ID[id] || BY_ID.oak;
    const mono = Boolean(opts.mono);
    const f = paint(mono);
    const mins = opts.minutes || 0;
    const scale = opts.minutes == null ? 1 : mins >= 60 ? 1 : mins >= 25 ? 0.9 : 0.78;
    let body;
    if (opts.dead) body = item.kind === 'tree' ? drawDeadTree(f, mono) : drawRuin(item.id, f, mono);
    else body = item.kind === 'tree' ? drawTree(item.id, clamp(p), f, mono) : drawBuilding(item.id, clamp(p), f, mono);
    const g = opts.ground === false ? '' : ground(f, item.kind);
    const size = opts.size ? ` width="${opts.size}" height="${opts.size}"` : '';
    const cls = `grow-art${opts.dead ? ' dead' : ''}${p >= 1 && !opts.dead ? ' done' : ''}`;
    return `<svg class="${cls}" viewBox="0 0 120 120"${size} xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${g}<g transform="translate(60 104) scale(${scale}) translate(-60 -104)">${body}</g></svg>`;
  }

  /** Items the user can pick with `hours` of total focus, and the next one to unlock. */
  function unlocked(hours) {
    const open = CATALOG.filter((c) => c.unlockH <= hours);
    const next = CATALOG.filter((c) => c.unlockH > hours).sort((a, b) => a.unlockH - b.unlockH)[0] || null;
    return { open: open.map((c) => c.id), next };
  }

  /**
   * A landscape with the user's grown items (newest in front), as one SVG.
   * items: [{ i: id, ok, m: minutes }]
   */
  function landscape(items, opts = {}) {
    const mono = Boolean(opts.mono);
    const f = paint(mono);
    const Wd = opts.wide === false ? 480 : 1000;
    const Ht = 230;
    const perRow = opts.wide === false ? 5 : 10;
    const list = items.slice(-(perRow * 5));
    const rows = Math.max(1, Math.ceil(list.length / perRow));
    // Rows sit on the hills: the oldest items at the back, the newest in front.
    const ordered = list.slice().reverse();
    let art = '';
    for (let r = rows - 1; r >= 0; r -= 1) {
      const rowItems = ordered.slice(r * perRow, r * perRow + perRow);
      const depth = rows === 1 ? 0 : r / Math.max(1, rows - 1); // 0 = front
      const sz = lerp(opts.wide === false ? 116 : 122, 70, depth);
      const yBase = lerp(220, 170, depth);
      rowItems.forEach((it, k) => {
        const jitter = ((k * 37 + r * 13) % 11) - 5;
        const xc = ((k + 0.5 + (r % 2) * 0.5) / (perRow + 0.5)) * Wd + jitter;
        art += `<svg x="${n(xc - sz / 2)}" y="${n(yBase - sz * 0.9)}" width="${n(sz)}" height="${n(sz)}" viewBox="0 0 120 120">${draw(it.i, 1, { dead: !it.ok, mono, minutes: it.m, ground: false }).replace(/^<svg[^>]*>|<\/svg>$/g, '')}</svg>`;
      });
    }
    const hills = [
      [`M0 146 Q${Wd * 0.25} 112 ${Wd * 0.5} 140 T${Wd} 128 V${Ht} H0Z`, 'grassDark', 0.4],
      [`M0 176 Q${Wd * 0.3} 152 ${Wd * 0.6} 172 T${Wd} 166 V${Ht} H0Z`, 'grass', 0.6],
      [`M0 206 Q${Wd * 0.35} 192 ${Wd * 0.65} 204 T${Wd} 200 V${Ht} H0Z`, 'grassDark', 0.55],
    ];
    const hill = hills.map(([d, c, o]) => (mono ? `<path d="${d}" fill="currentColor" fill-opacity="${o * 0.2}"/>` : `<path d="${d}" ${f(c)} opacity="${o}"/>`)).join('');
    return `<svg class="grow-land" viewBox="0 0 ${Wd} ${Ht}" preserveAspectRatio="xMidYMax slice" xmlns="http://www.w3.org/2000/svg">${hill}${art}</svg>`;
  }

  const api = { CATALOG, BY_ID, draw, unlocked, landscape };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.GROW = api;
}(typeof window !== 'undefined' ? window : globalThis));
