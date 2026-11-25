'use strict';
// "Saját stílus" — turns a free-text description ("neon tokiói éjszaka",
// "calm forest", "gameboy") into a complete, readable UI theme.
// Works fully offline from a small knowledge base + colour math; when the user
// has an AI key, the AI proposes a spec and it goes through the same
// `fromSpec()` so every theme — AI or not — passes the same contrast checks.

const EFFECTS = ['aurora', 'grid', 'scanlines', 'sunset', 'stars', 'dots', 'none'];
const FONTS = ['sans', 'pixel', 'mono', 'serif'];

// ------------------------------------------------------------------ colour math
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
function hslToRgb(h, s, l) {
  h = ((h % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return [r + m, g + m, b + m].map((v) => Math.round(clamp(v, 0, 1) * 255));
}
function rgbToHsl([r, g, b]) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) * 60;
  else if (max === g) h = ((b - r) / d + 2) * 60;
  else h = ((r - g) / d + 4) * 60;
  return [h, s, l];
}
const toHex = (rgb) => `#${rgb.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
function fromHex(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || '').trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
const hsl = (h, s, l) => toHex(hslToRgb(h, s, l));
function luminance(rgb) {
  const [r, g, b] = rgb.map((v) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrast(a, b) {
  const la = luminance(fromHex(a));
  const lb = luminance(fromHex(b));
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}
/** Move `fg` lightness until it reaches `ratio` against `bg`. */
function ensureContrast(fg, bg, ratio) {
  if (contrast(fg, bg) >= ratio) return fg;
  const [h, s, l] = rgbToHsl(fromHex(fg));
  const bgDark = luminance(fromHex(bg)) < 0.25;
  for (let i = 1; i <= 100; i += 1) {
    const nl = clamp(bgDark ? l + i / 100 : l - i / 100, 0, 1);
    const c = hsl(h, s, nl);
    if (contrast(c, bg) >= ratio) return c;
  }
  return bgDark ? '#ffffff' : '#000000';
}
const rgba = (hex, a) => { const [r, g, b] = fromHex(hex); return `rgba(${r}, ${g}, ${b}, ${a})`; };

// ------------------------------------------------------------------ knowledge base
// h: hue, s: saturation (0-1), mode: dark|light, a: accent hue, effect, font, r: radius, w: weight
const KB = [
  [['piros', 'pirosas', 'voros', 'voroses', 'red', 'cherry', 'cseresznye', 'eper', 'strawberry'], { h: 355, s: 0.8 }],
  [['narancs', 'orange', 'mandarin', 'barack', 'peach'], { h: 25, s: 0.9 }],
  [['sarga', 'yellow', 'citrom', 'lemon', 'nap', 'sun', 'sunny', 'napsutes'], { h: 48, s: 0.95 }],
  [['arany', 'gold', 'golden'], { h: 44, s: 0.75, a: 44, font: 'serif', effect: 'aurora' }],
  [['zold', 'zoldes', 'green', 'smaragd', 'emerald'], { h: 140, s: 0.65 }],
  [['lime', 'neonzold'], { h: 85, s: 0.9 }],
  [['menta', 'mint'], { h: 158, s: 0.55, mode: 'light' }],
  [['turkiz', 'teal', 'turquoise', 'akva', 'aqua'], { h: 176, s: 0.7 }],
  [['cian', 'cyan'], { h: 188, s: 0.9 }],
  [['kek', 'kekes', 'blue', 'azur', 'azure', 'kobalt', 'cobalt'], { h: 215, s: 0.8 }],
  [['sotetkek', 'navy', 'tengereszkek', 'indigo'], { h: 230, s: 0.6, mode: 'dark' }],
  [['lila', 'purple', 'ibolya', 'violet', 'levendula', 'lavender'], { h: 270, s: 0.7 }],
  [['magenta', 'fuchsia', 'fukszia'], { h: 305, s: 0.9 }],
  [['rozsaszin', 'pink', 'pinky', 'rozsa', 'rose'], { h: 330, s: 0.85, r: 22 }],
  [['barbie', 'babababa', 'dollhouse'], { h: 325, s: 0.9, mode: 'light', r: 24, effect: 'dots', w: 3 }],
  [['barna', 'brown', 'csoki', 'chocolate', 'kave', 'coffee', 'kakao', 'cocoa'], { h: 25, s: 0.45, mode: 'dark', r: 14 }],
  [['bezs', 'beige', 'homok', 'sand', 'papir', 'paper', 'pergamen'], { h: 38, s: 0.35, mode: 'light', font: 'serif', effect: 'none' }],
  [['fekete', 'black', 'noir', 'sotet', 'dark', 'ejjeli', 'night', 'ejszaka', 'ejfel', 'midnight'], { mode: 'dark', w: 2 }],
  [['feher', 'white', 'vilagos', 'light', 'nappal', 'day', 'tiszta', 'clean'], { mode: 'light', w: 2 }],
  [['szurke', 'gray', 'grey', 'ezust', 'silver', 'acel', 'steel', 'grafit', 'graphite'], { s: 0.08 }],
  [['neon', 'glow', 'vilagito'], { s: 1, mode: 'dark', effect: 'grid', w: 2 }],
  [['cyberpunk', 'cyber', 'kiberpunk', 'blade', 'runner'], { h: 305, a: 185, s: 1, mode: 'dark', effect: 'grid', font: 'mono', r: 4, w: 3 }],
  [['tokio', 'tokyo', 'japan', 'japan', 'shibuya', 'osaka'], { h: 330, a: 195, s: 0.95, mode: 'dark', effect: 'grid', w: 2 }],
  [['synthwave', 'vapor', 'vaporwave', 'retrowave', 'outrun', '80s', '80as', 'nyolcvanas'], { h: 300, a: 190, s: 0.95, mode: 'dark', effect: 'sunset', w: 3 }],
  [['matrix', 'hacker', 'terminal', 'konzol', 'console', 'crt', 'fosfor', 'phosphor'], { h: 130, a: 130, s: 1, mode: 'dark', effect: 'scanlines', font: 'mono', r: 0, w: 3 }],
  [['retro', 'pixel', '8bit', '8', 'bit', 'arcade', 'jatekterem', 'nes', 'oldschool'], { font: 'pixel', r: 2, effect: 'scanlines', w: 2 }],
  [['gameboy', 'gb'], { h: 85, a: 95, s: 0.45, mode: 'light', font: 'pixel', r: 2, effect: 'dots', w: 3 }],
  [['erdo', 'erdei', 'forest', 'fa', 'fak', 'tree', 'moha', 'moss', 'liget'], { h: 140, a: 95, s: 0.45, mode: 'dark', effect: 'aurora', r: 18, w: 2 }],
  [['termeszet', 'nature', 'novenyek', 'plant', 'kert', 'garden', 'level', 'leaf'], { h: 115, s: 0.5, effect: 'aurora' }],
  [['dzsungel', 'jungle', 'tropus', 'tropical', 'tropusi'], { h: 135, a: 45, s: 0.75, mode: 'dark' }],
  [['ocean', 'oceani', 'tenger', 'sea', 'viz', 'water', 'hullam', 'wave', 'mely', 'deep'], { h: 200, a: 175, s: 0.7, mode: 'dark', effect: 'aurora', w: 2 }],
  [['tengerpart', 'beach', 'nyar', 'summer', 'strand'], { h: 190, a: 38, s: 0.75, mode: 'light', effect: 'sunset', r: 20, w: 2 }],
  [['naplemente', 'sunset', 'alkony', 'dusk', 'esti'], { h: 18, a: 330, s: 0.9, mode: 'dark', effect: 'sunset', w: 2 }],
  [['hajnal', 'sunrise', 'reggel', 'morning'], { h: 32, a: 350, s: 0.75, mode: 'light', effect: 'aurora' }],
  [['ur', 'space', 'galaxis', 'galaxy', 'csillag', 'csillagok', 'star', 'stars', 'cosmos', 'kozmosz', 'univerzum', 'nebula'], { h: 255, a: 300, s: 0.75, mode: 'dark', effect: 'stars', w: 3 }],
  [['hold', 'moon', 'holdfeny', 'moonlight'], { h: 225, a: 210, s: 0.35, mode: 'dark', effect: 'stars' }],
  [['tuz', 'fire', 'lang', 'flame', 'lava', 'parazs', 'ember', 'vulkan', 'volcano'], { h: 12, a: 38, s: 0.95, mode: 'dark', effect: 'aurora', w: 2 }],
  [['jeg', 'ice', 'tel', 'teli', 'winter', 'ho', 'havas', 'snow', 'fagy', 'frost', 'jeges'], { h: 198, a: 210, s: 0.45, mode: 'light', effect: 'stars', w: 2 }],
  [['osz', 'autumn', 'fall', 'tok', 'pumpkin'], { h: 26, a: 48, s: 0.75, mode: 'dark' }],
  [['tavasz', 'spring', 'virag', 'flower', 'cseresznyevirag', 'sakura'], { h: 335, a: 125, s: 0.55, mode: 'light', r: 22, w: 2 }],
  [['pasztell', 'pastel', 'puha', 'soft', 'lagy', 'cuki', 'cute', 'kawaii'], { s: 0.45, mode: 'light', r: 24, w: 2 }],
  [['cukor', 'candy', 'cukorka', 'bubblegum', 'fagyi', 'icecream'], { h: 325, a: 190, s: 0.7, mode: 'light', r: 24, effect: 'dots' }],
  [['luxus', 'luxury', 'elegans', 'elegant', 'premium', 'klasszikus', 'classic', 'royal', 'kiralyi'], { h: 44, a: 44, s: 0.7, mode: 'dark', font: 'serif', r: 8, effect: 'none', w: 2 }],
  [['minimal', 'minimalista', 'minimalist', 'egyszeru', 'simple', 'letisztult', 'tiszta'], { s: 0.05, effect: 'none', r: 8, w: 2 }],
  [['bor', 'wine', 'bordo', 'burgundy', 'merlot'], { h: 345, s: 0.6, mode: 'dark', font: 'serif' }],
  [['sivatag', 'desert', 'szahara', 'dune', 'dune'], { h: 33, a: 18, s: 0.55, mode: 'light', effect: 'sunset' }],
  [['zen', 'nyugodt', 'calm', 'nyugalom', 'meditacio', 'meditation', 'relax', 'pihentato', 'chill'], { s: 0.35, effect: 'aurora', r: 22 }],
  [['energikus', 'energetic', 'eros', 'bold', 'vad', 'wild', 'agressziv', 'aggressive', 'hatarozott', 'loud'], { s: 1, r: 6 }],
  [['gotikus', 'gothic', 'goth', 'horror', 'halloween', 'vampir', 'vampire'], { h: 280, a: 0, s: 0.6, mode: 'dark', font: 'serif' }],
  [['iroda', 'office', 'business', 'uzleti', 'professzionalis', 'professional', 'corporate'], { h: 215, s: 0.45, effect: 'none', r: 10 }],
  [['gamer', 'gaming', 'jatek', 'game', 'esport', 'rgb'], { h: 280, a: 160, s: 1, mode: 'dark', effect: 'grid', r: 8, w: 2 }],
  [['kod', 'code', 'coding', 'programozas', 'dev', 'developer', 'ide', 'vim'], { h: 215, a: 130, s: 0.6, mode: 'dark', font: 'mono', r: 6 }],
  [['ujsag', 'newspaper', 'nyomtatott', 'print', 'konyv', 'book', 'irodalom', 'kave', 'coffee'], { font: 'serif' }],
  [['kerek', 'rounded', 'gomboly', 'buborek', 'bubble'], { r: 24 }],
  [['szogletes', 'square', 'eles', 'sharp', 'brutal', 'brutalist'], { r: 0, effect: 'none' }],
  [['racs', 'grid', 'halo'], { effect: 'grid' }],
  [['pottyos', 'dots', 'polka', 'pont'], { effect: 'dots' }],
];

function normalize(text) {
  return String(text || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
}

function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i += 1) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

/** Turn text into a compact spec: {name, mode, hue, accentHue, sat, font, radius, effect}. */
function analyze(text, seed = 0) {
  const words = normalize(text).split(' ').filter(Boolean);
  const joined = ` ${words.join(' ')} `;
  const hues = [];
  const accents = [];
  const sats = [];
  const votes = { mode: {}, font: {}, effect: {} };
  const radii = [];
  const vote = (k, v, w) => { votes[k][v] = (votes[k][v] || 0) + w; };
  let matched = 0;
  for (const [keys, info] of KB) {
    const hit = keys.some((k) => joined.includes(` ${k} `) || (k.length >= 4 && joined.includes(` ${k}`)));
    if (!hit) continue;
    matched += 1;
    const w = info.w || 1;
    if (info.h != null) hues.push([info.h, w]);
    if (info.a != null) accents.push([info.a, w]);
    if (info.s != null) sats.push([info.s, w]);
    if (info.mode) vote('mode', info.mode, w);
    if (info.font) vote('font', info.font, w);
    if (info.effect) vote('effect', info.effect, w);
    if (info.r != null) radii.push([info.r, w]);
  }
  const circMean = (list) => {
    let x = 0; let y = 0;
    for (const [h, w] of list) { x += Math.cos((h * Math.PI) / 180) * w; y += Math.sin((h * Math.PI) / 180) * w; }
    return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
  };
  const avg = (list, d) => (list.length ? list.reduce((a, [v, w]) => a + v * w, 0) / list.reduce((a, [, w]) => a + w, 0) : d);
  const top = (o, d) => Object.entries(o).sort((a, b) => b[1] - a[1])[0]?.[0] || d;
  const hs = hash(`${words.join(' ')}#${seed}`);
  let hue = hues.length ? circMean(hues) : hs % 360;
  if (seed) hue = (hue + ((hs % 41) - 20)) % 360;
  let accentHue = accents.length ? circMean(accents) : (hue + (seed ? (hs % 2 ? 30 : -30) : 0) + 360) % 360;
  if (seed && accents.length) accentHue = (accentHue + (((hs >> 5) % 61) - 30) + 360) % 360;
  const name = String(text || '').trim().replace(/\s+/g, ' ').slice(0, 28) || 'Saját stílus';
  return {
    name: name.charAt(0).toUpperCase() + name.slice(1),
    mode: top(votes.mode, 'dark'),
    hue: Math.round(hue),
    accentHue: Math.round(accentHue),
    sat: clamp(avg(sats, 0.75), 0, 1),
    font: top(votes.font, 'sans'),
    radius: Math.round(avg(radii, 16)),
    effect: top(votes.effect, 'aurora'),
    matched,
  };
}

/**
 * Build a full theme from a spec. Accepts either an analyze() result or an AI
 * proposal with hex colours {mode, bg, text, accent, accent2, font, radius, effect}.
 */
function fromSpec(spec, { id, prompt } = {}) {
  const mode = spec.mode === 'light' ? 'light' : 'dark';
  let accent;
  let accent2;
  let bg;
  let text;
  const sat = clamp(Number(spec.sat == null ? 0.75 : spec.sat), 0, 1);
  if (fromHex(spec.accent)) {
    accent = toHex(fromHex(spec.accent));
    accent2 = fromHex(spec.accent2) ? toHex(fromHex(spec.accent2)) : (() => { const [h, s, l] = rgbToHsl(fromHex(accent)); return hsl(h + 28, s, l); })();
    bg = fromHex(spec.bg) ? toHex(fromHex(spec.bg)) : (() => { const [h] = rgbToHsl(fromHex(accent)); return mode === 'dark' ? hsl(h, 0.35, 0.07) : hsl(h, 0.3, 0.95); })();
    text = fromHex(spec.text) ? toHex(fromHex(spec.text)) : null;
  } else {
    const h = Number(spec.hue) || 0;
    const ah = spec.accentHue == null ? h : Number(spec.accentHue);
    const s = sat;
    if (mode === 'dark') {
      bg = hsl(h, clamp(0.25 + s * 0.25, 0, 0.6) * (s < 0.15 ? 0.2 : 1), 0.065);
      accent = hsl(ah, clamp(0.55 + s * 0.45, 0, 1) * (s < 0.15 ? 0.1 : 1), s < 0.15 ? 0.85 : 0.62);
      accent2 = hsl(ah - 35, clamp(0.5 + s * 0.45, 0, 1) * (s < 0.15 ? 0.1 : 1), s < 0.15 ? 0.7 : 0.55);
      if (ah !== h) accent2 = hsl(h, clamp(0.55 + s * 0.4, 0, 1), 0.58);
    } else {
      bg = hsl(h, clamp(0.2 + s * 0.35, 0, 0.6) * (s < 0.15 ? 0.15 : 1), 0.955);
      accent = hsl(ah, clamp(0.55 + s * 0.45, 0, 1) * (s < 0.15 ? 0.05 : 1), s < 0.15 ? 0.12 : 0.47);
      accent2 = ah !== h ? hsl(h, clamp(0.55 + s * 0.4, 0, 1), 0.5) : hsl(ah - 35, clamp(0.5 + s * 0.45, 0, 1) * (s < 0.15 ? 0.05 : 1), s < 0.15 ? 0.3 : 0.5);
    }
  }
  const [bh, bs, bl] = rgbToHsl(fromHex(bg));
  const dark = luminance(fromHex(bg)) < 0.2;
  if (!text) text = dark ? hsl(bh, Math.min(bs, 0.3), 0.94) : hsl(bh, Math.min(bs, 0.35), 0.1);
  text = ensureContrast(text, bg, 10);
  const muted = ensureContrast(dark ? hsl(bh, Math.min(bs, 0.2), 0.66) : hsl(bh, Math.min(bs, 0.15), 0.4), bg, 4.6);
  const faint = ensureContrast(dark ? hsl(bh, Math.min(bs, 0.2), 0.45) : hsl(bh, Math.min(bs, 0.15), 0.58), bg, 2.4);
  accent = ensureContrast(accent, bg, 3.2);
  accent2 = ensureContrast(accent2, bg, 2.6);
  const inkDark = contrast('#000000', accent) >= contrast('#ffffff', accent);
  let accentInk = inkDark ? hsl(rgbToHsl(fromHex(accent))[0], 0.4, 0.08) : '#ffffff';
  if (contrast(accentInk, accent) < 4.5) accentInk = inkDark ? '#000000' : '#ffffff';
  if (contrast(accentInk, accent) < 4.5) {
    // Mid-tone accent: nudge it away from the ink colour until buttons are readable.
    const [ah0, as0, al0] = rgbToHsl(fromHex(accent));
    for (let i = 1; i <= 40 && contrast(accentInk, accent) < 4.5; i += 1) accent = hsl(ah0, as0, clamp(inkDark ? al0 + i / 100 : al0 - i / 100, 0, 1));
  }
  const btn = dark ? hsl(bh, Math.min(bs, 0.25), 0.93) : hsl(bh, Math.min(bs, 0.4), 0.1);
  const panelSolid = dark ? hsl(bh, Math.min(bs, 0.4), Math.min(0.97, bl + 0.06)) : '#ffffff';
  const radius = clamp(Math.round(Number(spec.radius == null ? 16 : spec.radius)), 0, 28);
  return {
    id: id || `t${hash(`${spec.name}${Date.now()}${Math.random()}`).toString(36)}`,
    name: String(spec.name || 'Saját stílus').slice(0, 40),
    prompt: String(prompt || spec.prompt || '').slice(0, 200),
    mode: dark ? 'dark' : 'light',
    font: FONTS.includes(spec.font) ? spec.font : 'sans',
    effect: EFFECTS.includes(spec.effect) ? spec.effect : 'aurora',
    radius,
    colors: {
      bg,
      bg2: dark ? hsl(bh, bs, Math.min(1, bl + 0.025)) : hsl(bh, bs, Math.max(0, bl - 0.03)),
      panel: dark ? rgba(text, 0.04) : rgba('#ffffff', 0.72),
      panel2: dark ? rgba(text, 0.075) : '#ffffff',
      panelSolid,
      border: dark ? rgba(text, 0.09) : rgba(text, 0.1),
      border2: dark ? rgba(text, 0.18) : rgba(text, 0.2),
      text,
      muted,
      faint,
      accent,
      accent2,
      accentInk,
      btn,
      btnInk: ensureContrast(dark ? bg : '#ffffff', btn, 7),
      ok: ensureContrast(dark ? '#4fd1a5' : '#11845f', bg, 3),
      danger: ensureContrast(dark ? '#ff6b6b' : '#d63b3b', bg, 3.2),
      ringTrack: dark ? rgba(text, 0.07) : rgba(text, 0.08),
    },
  };
}

function generate(text, seed = 0) {
  const spec = analyze(text, seed);
  return fromSpec(spec, { prompt: text });
}

/** Clean a theme coming from the UI or a file. */
function sanitizeTheme(t) {
  if (!t || typeof t !== 'object' || !t.colors) return null;
  const c = t.colors;
  const required = ['bg', 'text', 'accent', 'accent2'];
  if (!required.every((k) => fromHex(c[k]))) return null;
  // Rebuild from the core colours so every derived value is consistent and readable.
  const rebuilt = fromSpec({ name: t.name, mode: t.mode, bg: c.bg, text: c.text, accent: c.accent, accent2: c.accent2, font: t.font, radius: t.radius, effect: t.effect }, { id: /^[\w-]{1,40}$/.test(t.id || '') ? t.id : undefined, prompt: t.prompt });
  return rebuilt;
}

/** CSS custom properties for a theme (applied on <body> or a preview box). */
function cssVars(theme) {
  const c = theme.colors;
  const r = theme.radius;
  return {
    '--bg': c.bg, '--bg-2': c.bg2, '--panel': c.panel, '--panel-2': c.panel2, '--panel-solid': c.panelSolid,
    '--border': c.border, '--border-2': c.border2, '--text': c.text, '--muted': c.muted, '--faint': c.faint,
    '--accent': c.accent, '--accent-2': c.accent2, '--accent-ink': c.accentInk, '--btn': c.btn, '--btn-ink': c.btnInk,
    '--ok': c.ok, '--danger': c.danger, '--ring-track': c.ringTrack,
    '--r-sm': `${Math.round(r * 0.62)}px`, '--r': `${r}px`, '--r-lg': `${Math.round(r * 1.5)}px`, '--r-pill': r >= 12 ? '999px' : `${r}px`,
  };
}

module.exports = { EFFECTS, FONTS, analyze, fromSpec, generate, sanitizeTheme, cssVars, contrast, normalize, fromHex };
