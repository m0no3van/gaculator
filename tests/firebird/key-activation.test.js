import test from 'node:test';
import assert from 'node:assert/strict';
import { createKeyActivation } from '../../src/firebird/key-activation.js';
import { createOnHold } from '../../src/firebird/on-hold.js';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';

const pointer = { button: 0 };
function fixture() {
  const letters = [], tasks = new Map(); let id = 0;
  const timers = { setTimeout(callback) { tasks.set(++id, callback); return id; }, clearTimeout(value) { tasks.delete(value); } };
  const input = createKeyActivation(() => letters.push('a'), timers);
  return { letters, input, flush() { for (const [key, run] of tasks) { tasks.delete(key); run(); } } };
}

test('Safari pointerdown followed by a zero-detail switch click/change types one letter', () => {
  const { letters, input } = fixture();
  input.pointerDown(pointer);
  assert.deepEqual(letters, ['a'], 'touch input remains immediate');
  // Native checkbox click changes state, independent of its MouseEvent.detail value.
  input.fallback({ type: 'change', detail: 0 });
  assert.deepEqual(letters, ['a']);
});

test('ordinary pointerdown plus click emits once for either click detail value', () => {
  for (const detail of [0, 1]) {
    const { letters, input } = fixture();
    input.pointerDown(pointer); input.fallback({ type: 'click', detail });
    assert.deepEqual(letters, ['a']);
  }
});

test('fast repeated taps are not debounced or dropped, and right-click does not type', () => {
  const { letters, input } = fixture();
  for (let i = 0; i < 12; i++) { input.pointerDown(pointer); input.fallback(); }
  assert.equal(letters.length, 12);
  input.pointerDown({ button: 2 }); assert.equal(letters.length, 12);
});

test('keyboard/default-change and assistive clicks retain one activation each', () => {
  const { letters, input } = fixture();
  input.fallback(); // Assistive click with no pointerdown.
  input.pointerDown(pointer); // A cancelled physical gesture cannot duplicate on its later change.
  input.fallback();
  input.keyboard(); input.fallback(); // Enter/click or Space/checkbox change.
  input.fallback(); // Consecutive assistive activation.
  assert.equal(letters.length, 4);
});

test('deferred ON consumes the later browser click without an extra firmware tap', () => {
  const { letters, input } = fixture();
  input.markPointer();
  input.fallback();
  assert.deepEqual(letters, []);
  input.keyboard(); input.fallback();
  assert.deepEqual(letters, ['a']);
});

test('pointercancel does not swallow a subsequent assistive activation', () => {
  const { letters, input } = fixture();
  input.pointerDown(pointer); input.cancel(false);
  input.fallback();
  assert.deepEqual(letters, ['a', 'a']);
});

test('Safari cancellation consumes its synchronous default change, then releases the guard', () => {
  for (const hasDefaultChange of [false, true]) {
    const { letters, input, flush } = fixture();
    input.pointerDown(pointer); input.cancel(true);
    if (hasDefaultChange) input.fallback();
    flush(); input.fallback();
    assert.deepEqual(letters, ['a', 'a']);
  }
});

test('ON keyboard release consumes any same-task fallback without swallowing a later assistive click', () => {
  const { letters, input, flush } = fixture();
  input.consumeDefault(); input.fallback();
  assert.deepEqual(letters, []);
  flush(); input.fallback(); assert.deepEqual(letters, ['a']);
});

test('cancellation task cleanup cannot clear a new rapid physical tap guard', () => {
  const { letters, input, flush } = fixture();
  input.pointerDown(pointer); input.cancel(true);
  input.pointerDown(pointer); flush(); input.fallback();
  assert.deepEqual(letters, ['a', 'a']);
});

const keyScript = (await readFile(new URL('../../src/firebird/Key.vue', import.meta.url), 'utf8'))
  .match(/<script setup>([\s\S]*?)<\/script>/)[1].replace(/^import .+;\r?\n/gm, '');
function component(name) {
  let id = 0, now = 0;
  const tasks = new Map(), events = [];
  const timers = { performance: { now: () => now },
    setTimeout(callback, delay) { tasks.set(++id, { callback, delay, at: now + delay }); return id; }, clearTimeout(value) { tasks.delete(value); } };
  const context = { defineProps: () => ({ item: { name } }), defineEmits: () => (...args) => events.push(args),
    ref: value => ({ value }), onMounted() {}, onBeforeUnmount() {},
    supportsSwitchHaptics: () => false, keyFeedback: () => 'control', vibrateFeedback: () => true,
    createKeyActivation: fn => createKeyActivation(fn, timers), createOnHold: (tap, reload, threshold) => createOnHold(tap, reload, threshold, timers),
    setTimeout: timers.setTimeout, clearTimeout: timers.clearTimeout };
  runInNewContext(keyScript + '\nglobalThis.down = down; globalThis.abort = cancel; globalThis.click = activation.fallback; globalThis.up = hold.end; globalThis.lost = lostCapture;', context);
  return { events, down: () => context.down({ button: 0, pointerId: 1, preventDefault() {}, currentTarget: { setPointerCapture() {} } }),
    cancel: context.abort, click: context.click,
    up: () => context.up({ pointerId: 1 }), lost: context.lost,
    advance(duration) { now += duration; for (const [key, task] of tasks) if (task.at <= now) { tasks.delete(key); task.callback(); } },
    endTask() { for (const [key, task] of tasks) if (task.delay === 0) { tasks.delete(key); task.callback(); } } };
}

test('ON cancellation expires its stale pointer guard without swallowing later assistive clicks', () => {
  for (const defaultClick of [false, true]) {
    const key = component('on'); key.down(); key.cancel();
    if (defaultClick) key.click();
    assert.deepEqual(key.events, []);
    key.endTask(); key.click();
    assert.deepEqual(key.events, [['press', 'on']]);
  }
});

test('ON release keeps its deferred confirmation through normal lostpointercapture', () => {
  const key = component('on'); key.down(); key.advance(5000);
  assert.deepEqual(key.events, [], 'the held pointer cannot confirm a destructive native dialog');
  key.up(); key.lost();
  assert.deepEqual(key.events, []);
  key.endTask(); assert.deepEqual(key.events, [['reload-request']]);
});

test('normal letter lost capture still consumes its following click without duplication', () => {
  const key = component('aa'); key.down(); key.cancel(); key.click(); key.endTask();
  assert.deepEqual(key.events, [['press', 'aa']]);
});
