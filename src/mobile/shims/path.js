'use strict';
const norm = (parts) => {
  const out = [];
  for (const seg of parts.join('/').split('/')) {
    if (!seg || seg === '.') continue;
    if (seg === '..') out.pop(); else out.push(seg);
  }
  return `/${out.join('/')}`;
};
module.exports = {
  sep: '/',
  join: (...p) => norm(p),
  resolve: (...p) => norm(p),
  dirname: (p) => String(p).replace(/\/[^/]*\/?$/, '') || '/',
  basename: (p, ext) => { const b = String(p).split('/').pop(); return ext && b.endsWith(ext) ? b.slice(0, -ext.length) : b; },
  extname: (p) => { const m = /\.[^./]*$/.exec(String(p)); return m ? m[0] : ''; },
};
