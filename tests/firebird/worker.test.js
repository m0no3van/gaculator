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
  context.tick(); now = 4; context.tick(); now = 6; context.tick(); now = 8; context.tick();
  assert.deepEqual(events, [[keyIds.n1, 1], [keyIds.n1, 0], 'save', [keyIds.n2, 1]]);
  assert.equal(messages[0].type, 'saved'); assert.equal(messages[0].id, 7);
  fail = true;
  await context.onmessage({ data: { type: 'save', id: 8 } });
  now = 12; context.tick(); now = 14; context.tick();
  assert.equal(messages.at(-1).type, 'save-error'); assert.equal(messages.at(-1).id, 8);
  await context.onmessage({ data: { type: 'touch', x: 0.5, y: 0.5, contact: true, down: true } });
  await context.onmessage({ data: { type: 'touch', x: 0.5, y: 0.5, contact: false, down: false } });
  now = 35; context.tick(); assert.deepEqual(events.at(-1), [0.5, 0.5, 1, 1]);
  now = 40; context.tick(); assert.deepEqual(events.at(-1), [0.5, 0.5, 1, 1]);
  now = 45; context.tick(); assert.deepEqual(events.at(-1), [0.5, 0.5, 0, 0]);
});

test('modifiers lead the primary key on guest ticks, frames have backpressure, and resume resets pacing', async () => {
  const source = (await readFile(new URL('../../src/firebird/worker.js', import.meta.url), 'utf8')).replace(/^import .+;\r?\n/gm, '');
  let ticks = 0, time = 0, frames = 0, delay;
  const keys = [];
  const core = { HEAPU8: new Uint8Array(320 * 240 * 4), _fb_ticks: () => ticks,
    _fb_key(id, down) { keys.push([id, down, ticks]); }, _fb_release() {}, _fb_touch() {}, _fb_paint() {},
    _fb_step(budget) { assert.equal(budget, 8); ticks += 2; return 1; } };
  const context = { keyIds, directions, createTouchpadInput, performance: { now: () => time }, Date, Uint8Array,
    postMessage(value) { if (value.type === 'frame') frames++; }, setTimeout(callback, value) { delay = value; return 1; }, clearTimeout() {} };
  runInNewContext(source + '\nglobalThis.configure = value => { core=value; touchpad=createTouchpadInput(core); pixels=0; resetClock(); }; globalThis.tick=step;', context);
  context.configure(core);
  await context.onmessage({ data: { type: 'tap', name: 'plus', shift: true } });
  for (time = 0; time <= 80; time += 20) context.tick();
  assert.deepEqual(keys, [[keyIds.shift, 1, 0], [keyIds.plus, 1, 4], [keyIds.plus, 0, 8], [keyIds.shift, 0, 8]]);
  assert.equal(frames, 1, 'a slow main thread cannot accumulate framebuffer messages');
  await context.onmessage({ data: { type: 'frame-drawn' } });
  time = 120; context.tick(); assert.equal(frames, 1, 'unchanged LCD pixels are not posted or drawn again');
  core.HEAPU8[0] = 1;
  time = 160; context.tick(); assert.equal(frames, 2);
  await context.onmessage({ data: { type: 'pause', value: true } });
  time = 50000;
  await context.onmessage({ data: { type: 'pause', value: false } });
  assert.equal(delay, 20, 'background time is not an emulation catch-up debt');
  time += 200; context.tick();
  assert.equal(delay, 0, 'CPU-bound emulation yields without the former mandatory 16 ms sleep');
});

test('new input cancels the idle wait and can draw a changed LCD before the idle frame interval', async () => {
  const source = (await readFile(new URL('../../src/firebird/worker.js', import.meta.url), 'utf8')).replace(/^import .+;\r?\n/gm, '');
  let time = 0, frames = 0, scheduled, cancelled;
  const sent = [];
  const core = { HEAPU8: new Uint8Array(320 * 240 * 4), _fb_ticks: () => 0,
    _fb_key() {}, _fb_release() {}, _fb_touch() {}, _fb_paint() {}, _fb_step() { return 1; } };
  const context = { keyIds, directions, createTouchpadInput, performance: { now: () => time }, Date, Uint8Array,
    postMessage(value) { if (value.type === 'frame') { frames++; sent.push(value); } },
    setTimeout(callback, delay) { scheduled = { callback, delay }; return 7; }, clearTimeout(id) { cancelled = id; } };
  runInNewContext(source + '\nglobalThis.configure = value => { core=value; touchpad=createTouchpadInput(core); pixels=0; resetClock(); }; globalThis.tick=step;', context);
  context.configure(core); context.tick();
  assert.equal(frames, 1);
  assert.equal(sent[0].y, 0); assert.equal(sent[0].height, 240);
  assert.equal(sent[0].bytes.length, 320 * 240 * 4);
  await context.onmessage({ data: { type: 'frame-drawn' } });
  time = 5; core.HEAPU8[0] = 1;
  await context.onmessage({ data: { type: 'tap', name: 'n1' } });
  assert.equal(cancelled, 7); assert.equal(scheduled.delay, 0);
  scheduled.callback();
  assert.equal(frames, 2, 'input does not wait for the normal 33 ms repaint slot');
  assert.equal(sent[1].y, 0); assert.equal(sent[1].height, 1);
  assert.equal(sent[1].bytes.length, 320 * 4, 'only a changed row crosses the Worker boundary');
  await context.onmessage({ data: { type: 'touch', x: .5, y: .5, contact: true, down: false } });
  assert.equal(scheduled.delay, 0, 'touchpad movement also wakes the Worker');
  await context.onmessage({ data: { type: 'frame-drawn' } });
  core.HEAPU8[(70 * 320 + 5) * 4] = 2;
  core.HEAPU8[(90 * 320 + 7) * 4] = 3;
  time = 10; scheduled.callback();
  assert.equal(sent[2].y, 70); assert.equal(sent[2].height, 21);
  await context.onmessage({ data: { type: 'frame-drawn' } });
  core.HEAPU8[(239 * 320 + 319) * 4 + 2] = 5;
  time = 15; scheduled.callback();
  assert.equal(sent[3].y, 239); assert.equal(sent[3].height, 1, 'the final framebuffer row is included');
  await context.onmessage({ data: { type: 'frame-drawn' } });
  time = 20; scheduled.callback();
  assert.equal(sent.length, 4, 'acknowledging an unchanged framebuffer does not emit a false patch');
  const displayed = new Uint8Array(core.HEAPU8.length);
  for (const frame of sent) displayed.set(frame.bytes, frame.y * 320 * 4);
  assert.deepEqual(displayed, core.HEAPU8, 'dirty-row reconstruction preserves the complete native framebuffer');
});
