import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import { keyIds, directions } from '../../src/firebird/keys.js';
import { createTouchpadInput } from '../../src/firebird/touchpad.js';

test('autosave runs between queued keys, keeps later input, and failed snapshots retain the previous save', async () => {
  const source = (await readFile(new URL('../../src/firebird/worker.js', import.meta.url), 'utf8')).replace(/^import .+;\r?\n/gm, '');
  let now = 0, fail = false; const events = [], messages = [];
  const core = { HEAPU8: new Uint8Array(320 * 240 * 4),
    _fb_key(id, down) { events.push([id, down]); }, _fb_touch(...args) { events.push(args); }, _fb_release() {},
    _fb_step() { return 1; }, _fb_paint() {},
    _fb_ticks() { return now; },
    _fb_save() { events.push('save'); return fail ? 0 : 1; },
    FS: { readFile() { return new Uint8Array(100); }, unlink() {} } };
  const context = { keyIds, directions, createTouchpadInput, performance: { now: () => now }, Date, Uint8Array,
    postMessage(value) { if (value.type !== 'frame') messages.push(value); }, setTimeout() { return 1; }, clearTimeout() {} };
  runInNewContext(source + '\nglobalThis.configure = value => { core = value; touchpad = createTouchpadInput(core); identity = "a"; pixels = 0; }; globalThis.tick = step;', context);
  context.configure(core);
  await context.onmessage({ data: { type: 'tap', name: 'n1' } });
  await context.onmessage({ data: { type: 'save', id: 7 } });
  await context.onmessage({ data: { type: 'tap', name: 'n2' } });
  context.tick(); now = 10; context.tick(); now = 14; context.tick(); now = 16; context.tick();
  assert.deepEqual(events, [[keyIds.n1, 1], [keyIds.n1, 0], 'save', [keyIds.n2, 1]]);
  assert.equal(messages[0].type, 'saved'); assert.equal(messages[0].id, 7);
  fail = true;
  await context.onmessage({ data: { type: 'save', id: 8 } });
  now = 26; context.tick(); now = 30; context.tick();
  assert.equal(messages.at(-1).type, 'save-error'); assert.equal(messages.at(-1).id, 8);
  await context.onmessage({ data: { type: 'touch', x: 0.5, y: 0.5, contact: true, down: true } });
  await context.onmessage({ data: { type: 'touch', x: 0.5, y: 0.5, contact: false, down: false } });
  now = 35; context.tick(); assert.deepEqual(events.at(-1), [0.5, 0.5, 1, 1]);
  now = 40; context.tick(); assert.deepEqual(events.at(-1), [0.5, 0.5, 1, 1]);
  now = 45; context.tick(); assert.deepEqual(events.at(-1), [0.5, 0.5, 0, 0]);
});
