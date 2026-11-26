'use strict';
// crypto for the phone. PIN hashing uses the native PBKDF2-HMAC-SHA256 (Android
// has no scrypt); a PIN hash never leaves the device, so it only has to match itself.
const { Buffer } = require('./buffer');
const { call } = require('./native');

const g = typeof globalThis !== 'undefined' ? globalThis.crypto : null;

function randomBytes(n) {
  const b = Buffer.alloc(n);
  if (g && g.getRandomValues) g.getRandomValues(b);
  else for (let i = 0; i < n; i += 1) b[i] = Math.floor(Math.random() * 256);
  return b;
}

function randomUUID() {
  if (g && g.randomUUID) return g.randomUUID();
  const b = randomBytes(16);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = b.toString('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

// --- small synchronous SHA-256/HMAC/PBKDF2, used only when the native KDF is absent (UI preview)
const K = new Uint32Array([0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2]);
function sha256(msg) {
  const l = msg.length;
  const withPad = new Uint8Array(((l + 9 + 63) >> 6) << 6);
  withPad.set(msg);
  withPad[l] = 0x80;
  const dv = new DataView(withPad.buffer);
  dv.setUint32(withPad.length - 4, l * 8);
  dv.setUint32(withPad.length - 8, Math.floor(l / 0x20000000));
  const H = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]);
  const W = new Uint32Array(64);
  const r = (x, n) => (x >>> n) | (x << (32 - n));
  for (let o = 0; o < withPad.length; o += 64) {
    for (let i = 0; i < 16; i += 1) W[i] = dv.getUint32(o + i * 4);
    for (let i = 16; i < 64; i += 1) {
      const s0 = r(W[i - 15], 7) ^ r(W[i - 15], 18) ^ (W[i - 15] >>> 3);
      const s1 = r(W[i - 2], 17) ^ r(W[i - 2], 19) ^ (W[i - 2] >>> 10);
      W[i] = (W[i - 16] + s0 + W[i - 7] + s1) >>> 0;
    }
    let [a, b, c, d, e, f, gg, h] = H;
    for (let i = 0; i < 64; i += 1) {
      const t1 = (h + (r(e, 6) ^ r(e, 11) ^ r(e, 25)) + ((e & f) ^ (~e & gg)) + K[i] + W[i]) >>> 0;
      const t2 = ((r(a, 2) ^ r(a, 13) ^ r(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) >>> 0;
      h = gg; gg = f; f = e; e = (d + t1) >>> 0; d = c; c = b; b = a; a = (t1 + t2) >>> 0;
    }
    H[0] += a; H[1] += b; H[2] += c; H[3] += d; H[4] += e; H[5] += f; H[6] += gg; H[7] += h;
  }
  const out = new Uint8Array(32);
  const odv = new DataView(out.buffer);
  for (let i = 0; i < 8; i += 1) odv.setUint32(i * 4, H[i]);
  return out;
}
function hmac(key, msg) {
  let k = key.length > 64 ? sha256(key) : key;
  const kp = new Uint8Array(64); kp.set(k);
  const ipad = kp.map((x) => x ^ 0x36);
  const opad = kp.map((x) => x ^ 0x5c);
  const inner = new Uint8Array(64 + msg.length); inner.set(ipad); inner.set(msg, 64);
  const ih = sha256(inner);
  const outer = new Uint8Array(96); outer.set(opad); outer.set(ih, 64);
  return sha256(outer);
}
function pbkdf2(pw, salt, iters, len) {
  const out = new Uint8Array(len);
  for (let block = 1, off = 0; off < len; block += 1) {
    const s = new Uint8Array(salt.length + 4); s.set(salt);
    new DataView(s.buffer).setUint32(salt.length, block);
    let u = hmac(pw, s);
    const tt = u.slice();
    for (let i = 1; i < iters; i += 1) { u = hmac(pw, u); for (let j = 0; j < 32; j += 1) tt[j] ^= u[j]; }
    out.set(tt.slice(0, Math.min(32, len - off)), off);
    off += 32;
  }
  return out;
}

function scryptSync(password, salt, keylen) {
  const hex = call('kdf', String(password), String(salt), keylen);
  if (hex) return Buffer.from(String(hex), 'hex');
  const enc = new TextEncoder();
  return Buffer.from(pbkdf2(enc.encode(String(password)), enc.encode(String(salt)), 4000, keylen));
}

function timingSafeEqual(a, b) {
  if (a.length !== b.length) throw new RangeError('Input buffers must have the same byte length');
  let d = 0;
  for (let i = 0; i < a.length; i += 1) d |= a[i] ^ b[i];
  return d === 0;
}

module.exports = { randomBytes, randomUUID, scryptSync, timingSafeEqual, _sha256: sha256 };
