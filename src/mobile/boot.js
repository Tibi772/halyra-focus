'use strict';
// Phone entry point: Node-ish globals, then the shared desktop "brain" (main.js)
// and the shared UI bridge (preload.js), both unchanged.
const { Buffer } = require('./shims/buffer');

window.global = window;
window.Buffer = Buffer;
window.process = { argv: [], env: {}, platform: 'android', versions: {}, nextTick: (fn, ...a) => Promise.resolve().then(() => fn(...a)) };
if (!window.setImmediate) window.setImmediate = (fn, ...a) => setTimeout(fn, 0, ...a);
window.__halyraErrors = [];
window.addEventListener('error', (e) => { window.__halyraErrors.push(String(e.message || e)); });
window.addEventListener('unhandledrejection', (e) => { window.__halyraErrors.push(`unhandled: ${e.reason && (e.reason.stack || e.reason.message || e.reason)}`); });
document.documentElement.classList.add('is-mobile');

require('../main/main.js');
require('../preload.js');
