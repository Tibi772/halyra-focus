'use strict';
// Just enough of Node's Buffer for the shared code (hex/base64/utf8 conversions).
class MiniBuffer extends Uint8Array {
  static from(v, enc) {
    if (v instanceof Uint8Array || Array.isArray(v)) return new MiniBuffer(v);
    const s = String(v);
    if (enc === 'hex') {
      const out = new MiniBuffer(Math.floor(s.length / 2));
      for (let i = 0; i < out.length; i += 1) out[i] = parseInt(s.substr(i * 2, 2), 16);
      return out;
    }
    if (enc === 'base64') {
      const bin = atob(s);
      const out = new MiniBuffer(bin.length);
      for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
      return out;
    }
    return new MiniBuffer(new TextEncoder().encode(s));
  }
  static alloc(n) { return new MiniBuffer(n); }
  static isBuffer(x) { return x instanceof MiniBuffer; }
  toString(enc) {
    if (enc === 'hex') return Array.from(this, (b) => b.toString(16).padStart(2, '0')).join('');
    if (enc === 'base64') { let s = ''; for (const b of this) s += String.fromCharCode(b); return btoa(s); }
    return new TextDecoder().decode(this);
  }
}
module.exports = { Buffer: MiniBuffer };
