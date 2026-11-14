import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { keyIds, layout, browserKey } from '../../src/firebird/keys.js';

test('every physical key matches the pinned upstream matrix and the UI uses valid unique keys', async () => {
  const header = await readFile(new URL('../../third_party/firebird/keymap.h', import.meta.url), 'utf8');
  const names = header.match(/enum\s*\{([^}]+)\}/s)[1].split(',').map(name => name.trim());
  for (const [name, id] of Object.entries(keyIds)) assert.equal(names[id], name);
  const keys = [...layout.left, ...layout.right, ...layout.modifiers, ...layout.rows.flat(), ...layout.alphabet.flat()].filter(k => k.name);
  assert.equal(new Set(keys.map(k => k.name)).size, keys.length);
  for (const key of keys) assert.ok(Number.isInteger(keyIds[key.name]), key.name);
  assert.deepEqual(keys.map(k => k.name).sort(), Object.keys(keyIds).sort());
});

test('calculus chords retain Shift on subtraction/numpad addition without changing normal plus typing', () => {
  assert.deepEqual(browserKey({ key: '_', shiftKey: true, code: 'Minus' }), { name: 'minus', ctrl: false, shift: true });
  assert.deepEqual(browserKey({ key: '-', shiftKey: true, code: 'NumpadSubtract' }), { name: 'minus', ctrl: false, shift: true });
  assert.deepEqual(browserKey({ key: '+', shiftKey: true, code: 'NumpadAdd' }), { name: 'plus', ctrl: false, shift: true });
  assert.deepEqual(browserKey({ key: '+', shiftKey: true, code: 'Equal' }), { name: 'plus', ctrl: false, shift: false });
  assert.match(layout.rows.flat().find(key => key.name === 'plus').legend, /∫/);
  assert.match(layout.rows.flat().find(key => key.name === 'minus').legend, /d\/dx/);
});

test('browser punctuation uses calculator keys without leaking host Shift; Ctrl+/ stays a fraction chord', () => {
  assert.deepEqual(browserKey({ key: '(', shiftKey: true }), { name: 'pleft', ctrl: false, shift: false });
  assert.deepEqual(browserKey({ key: '/', ctrlKey: true }), { name: 'div', ctrl: true, shift: false });
  assert.deepEqual(browserKey({ key: 'A', shiftKey: true }), { name: 'aa', ctrl: false, shift: true });
  assert.equal(browserKey({ key: 'a', metaKey: true }), null);
  assert.equal(browserKey({ key: 'F12' }), null);
});
