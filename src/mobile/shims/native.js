'use strict';
// The Android app injects `HalyraNative` (a Java object, synchronous calls that
// return strings). In a desktop browser (UI preview/tests) a localStorage-backed
// stand-in is used so the whole backend still runs.
const N = (typeof window !== 'undefined' && window.HalyraNative) || null;

const callbacks = new Map();
let seq = 0;
if (typeof window !== 'undefined') {
  window.__halyraCallback = (id, json) => {
    const cb = callbacks.get(id);
    if (!cb) return;
    callbacks.delete(id);
    let v = null;
    try { v = json == null ? null : JSON.parse(json); } catch (_) { v = json; }
    cb(v);
  };
}

function async(method, ...args) {
  return new Promise((resolve) => {
    if (!N || typeof N[method] !== 'function') { resolve(null); return; }
    seq += 1;
    const id = `cb${seq}`;
    callbacks.set(id, resolve);
    try { N[method](...args, id); } catch (_) { callbacks.delete(id); resolve(null); }
  });
}

function json(method, ...args) {
  if (!N || typeof N[method] !== 'function') return null;
  try { const r = N[method](...args); return r == null ? null : JSON.parse(r); } catch (_) { return null; }
}

function call(method, ...args) {
  if (!N || typeof N[method] !== 'function') return null;
  try { return N[method](...args); } catch (_) { return null; }
}

const ls = (() => { try { return window.localStorage; } catch (_) { return null; } })();
const files = {
  read(name) { if (N) { const v = call('readFile', name); return v == null ? null : String(v); } return ls ? ls.getItem(`hf:${name}`) : null; },
  write(name, data) { if (N) return call('writeFile', name, String(data)); if (ls) ls.setItem(`hf:${name}`, String(data)); return true; },
  remove(name) { if (N) return call('removeFile', name); if (ls) ls.removeItem(`hf:${name}`); return true; },
};

module.exports = { native: N, async, json, call, files, available: Boolean(N) };
