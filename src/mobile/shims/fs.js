'use strict';
// fs for the phone: files live in the app's private storage (via the native bridge).
const { files } = require('./native');

const key = (p) => String(p).replace(/^\/+data\/+/, '').replace(/^\/+/, '');
const enoent = (p) => Object.assign(new Error(`ENOENT: no such file, open '${p}'`), { code: 'ENOENT' });

module.exports = {
  readFileSync(p) { const v = files.read(key(p)); if (v == null) throw enoent(p); return v; },
  writeFileSync(p, data) { files.write(key(p), typeof data === 'string' ? data : String(data)); },
  renameSync(a, b) { const v = files.read(key(a)); if (v == null) throw enoent(a); files.write(key(b), v); files.remove(key(a)); },
  rmSync(p) { files.remove(key(p)); },
  unlinkSync(p) { files.remove(key(p)); },
  existsSync(p) { return files.read(key(p)) != null; },
  mkdirSync() {},
};
