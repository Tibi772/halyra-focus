'use strict';
const test = require('node:test');
const assert = require('node:assert');
const sg = require('../src/core/stylegen');

test('colours are read in the forms a model actually returns', () => {
  assert.deepEqual(sg.fromHex('#0b0e18'), [11, 14, 24]);
  assert.deepEqual(sg.fromHex('0B0E18'), [11, 14, 24]);
  assert.deepEqual(sg.fromHex('#fff'), [255, 255, 255]);
  assert.deepEqual(sg.fromHex('#F0A'), [255, 0, 170]);
  assert.deepEqual(sg.fromHex('rgb(12, 14, 22)'), [12, 14, 22]);
  assert.deepEqual(sg.fromHex('rgba(12 14 22 / 0.5)'), [12, 14, 22]);
  assert.equal(sg.fromHex('not a colour'), null);
  assert.equal(sg.fromHex(''), null);
  assert.equal(sg.fromHex(null), null);
  assert.equal(sg.fromHex('rgb(300, 0, 0)'), null);
});

test('a theme written in short hex is accepted, not thrown away', () => {
  const t = sg.sanitizeTheme({ name: 'Short', mode: 'dark', colors: { bg: '#102', text: '#fff', accent: '#f90', accent2: '#0cf' }, radius: 14, font: 'sans', effect: 'aurora' });
  assert.ok(t, 'short hex used to fail every required colour and drop the whole theme');
  assert.equal(sg.contrast(t.colors.text, t.colors.bg) >= 7, true);
});

test('generated themes stay readable whatever the description', () => {
  const words = ['neon tokyo night', 'calm forest', 'pink pastel', 'matrix hacker', 'beach sunset',
    'gold luxury', 'gameboy', 'deep space', 'téli reggel', 'blinding white', 'pure black', ''];
  for (const w of words) {
    const th = sg.generate(w);
    const c = th.colors;
    assert.ok(sg.contrast(c.text, c.bg) >= 7, `text on bg for "${w}": ${sg.contrast(c.text, c.bg).toFixed(2)}`);
    assert.ok(sg.contrast(c.muted, c.bg) >= 4.5, `muted on bg for "${w}"`);
    assert.ok(sg.contrast(c.accentInk, c.accent) >= 4.5, `ink on accent for "${w}"`);
    assert.ok(sg.contrast(c.btnInk, c.btn) >= 4.5, `ink on button for "${w}"`);
  }
});
