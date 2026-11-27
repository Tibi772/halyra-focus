'use strict';
const test = require('node:test');
const assert = require('node:assert');
const procmatch = require('../src/core/procmatch');

test('a renamed app does not escape the block', () => {
  const apps = [{ name: 'Discord', mac: ['Discord'], win: ['Discord.exe'] }];

  // macOS: the bundle was renamed, but the binary inside keeps its name
  const renamedBundle = [{ pid: 11, path: '/Applications/D.app/Contents/MacOS/Discord' }];
  assert.equal(procmatch.matchMac(renamedBundle, apps, { selfPath: '' }).length, 1);
  // a file that merely has the same name somewhere else is not the app
  const lookalike = [{ pid: 12, path: '/Users/me/Downloads/Discord' }];
  assert.equal(procmatch.matchMac(lookalike, apps, { selfPath: '' }).length, 0);

  // Windows: the copy is called game.exe, but OriginalFilename still says Discord.exe
  const renamedExe = [{ pid: 21, exe: 'game.exe', orig: 'Discord.exe', path: 'C:\\Users\\me\\game.exe' }];
  assert.equal(procmatch.matchWin(renamedExe, apps, { selfExe: 'Halyra Focus.exe' }).length, 1);
  // …and the file it was started from counts too
  const movedExe = [{ pid: 22, exe: 'x.exe', orig: '', path: 'C:\\Temp\\Discord.exe' }];
  assert.equal(procmatch.matchWin(movedExe, apps, { selfExe: 'Halyra Focus.exe' }).length, 1);
  // the plain case still works, and Halyra never blocks itself
  assert.equal(procmatch.matchWin([{ pid: 23, exe: 'Discord.exe' }], apps, {}).length, 1);
  assert.equal(procmatch.matchWin([{ pid: 24, exe: 'x.exe', orig: 'Halyra Focus.exe' }], apps, { selfExe: 'Halyra Focus.exe' }).length, 0);
});

test('the deep Windows scan is parsed, and bad output is ignored', () => {
  const rows = procmatch.parseWinDeep('[{"Id":5,"Name":"game","Path":"C:\\\\x\\\\game.exe","Orig":"Discord.exe"}]');
  assert.deepEqual(rows, [{ pid: 5, exe: 'game.exe', orig: 'Discord.exe', path: 'C:\\x\\game.exe' }]);
  assert.deepEqual(procmatch.parseWinDeep('{"Id":7,"Name":"a","Path":null,"Orig":null}'), [{ pid: 7, exe: 'a.exe', orig: '', path: '' }]);
  assert.deepEqual(procmatch.parseWinDeep('not json'), []);
  assert.deepEqual(procmatch.parseWinDeep(''), []);
});
