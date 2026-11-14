import test from 'node:test';
import assert from 'node:assert/strict';
import { createKeyActivation } from '../../src/firebird/key-activation.js';
import { createOnHold } from '../../src/firebird/on-hold.js';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';

const pointer = { button: 0, pointerId: 1, isPrimary: true };
function fixture() {
  const letters = [], tasks = new Map(); let id = 0;
  const timers = { setTimeout(callback) { tasks.set(++id, callback); return id; }, clearTimeout(value) { tasks.delete(value); } };
  const input = createKeyActivation(() => letters.push('a'), timers);
  return { letters, input, flush() { for (const [key, run] of tasks) { tasks.delete(key); run(); } } };
}

test('pointerdown types immediately and consumes a subsequent zero-detail click', () => {
  for (const detail of [0, 1]) {
    const { letters, input } = fixture(); input.pointerDown(pointer);
    assert.deepEqual(letters, ['a']);
    input.fallback({ detail }); assert.deepEqual(letters, ['a']);
  }
});

test('fast repeated taps are not debounced or dropped, and non-primary pointers do not type', () => {
  const { letters, input } = fixture();
  for (let i = 0; i < 12; i++) { input.pointerDown(pointer); input.fallback(); }
  assert.equal(letters.length, 12);
  input.pointerDown({ button: 2 }); input.pointerDown({ ...pointer, isPrimary: false });
  assert.equal(letters.length, 12);
});

test('a physical click retargeted to another key cannot activate its fallback', () => {
  for (const event of [{ pointerType: 'touch', detail: 0 }, { detail: 1 }, { detail: 0, sourceCapabilities: { firesTouchEvents: true } }]) {
    const { letters, input } = fixture(); input.fallback(event); assert.deepEqual(letters, []);
  }
});

test('keyboard and assistive clicks retain one activation each', () => {
  const { letters, input } = fixture();
  input.fallback({ detail: 0 });
  input.pointerDown(pointer); input.fallback({ detail: 0 });
  input.keyboard(); input.fallback({ detail: 0, pointerType: '' });
  input.fallback({ detail: 0 }); assert.equal(letters.length, 4);
});

test('deferred ON consumes the browser click without an extra firmware tap', () => {
  const { letters, input } = fixture(); input.markPointer(); input.fallback({ detail: 0 });
  assert.deepEqual(letters, []);
  input.keyboard(); input.fallback({ detail: 0 }); assert.deepEqual(letters, ['a']);
});

test('cancellation consumes same-task default click then permits assistive activation', () => {
  for (const hasDefaultClick of [false, true]) {
    const { letters, input, flush } = fixture(); input.pointerDown(pointer); input.cancel();
    if (hasDefaultClick) input.fallback({ detail: 0 });
    flush(); input.fallback({ detail: 0 }); assert.deepEqual(letters, ['a', 'a']);
  }
});

test('ON keyboard release consumes same-task fallback and preserves later assistive clicks', () => {
  const { letters, input, flush } = fixture(); input.consumeDefault(); input.fallback({ detail: 0 });
  assert.deepEqual(letters, []);
  flush(); input.fallback({ detail: 0 }); assert.deepEqual(letters, ['a']);
});

test('cancellation cleanup cannot clear the guard for a new rapid physical tap', () => {
  const { letters, input, flush } = fixture(); input.pointerDown(pointer); input.cancel();
  input.pointerDown(pointer); flush(); input.fallback({ detail: 0 }); assert.deepEqual(letters, ['a', 'a']);
});

const keySource = await readFile(new URL('../../src/firebird/Key.vue', import.meta.url), 'utf8');
const keyScript = keySource.match(/<script setup>([\s\S]*?)<\/script>/)[1].replace(/^import .+;\r?\n/gm, '');
function component(name, rect = { left: 0, top: 0, right: 50, bottom: 30 }, nativeSwitch = false) {
  let id = 0, now = 0;
  const tasks = new Map(), events = [], captures = [], preventions = [];
  const timers = { performance: { now: () => now },
    setTimeout(callback, delay) { tasks.set(++id, { callback, delay, at: now + delay }); return id; }, clearTimeout(value) { tasks.delete(value); } };
  const context = { defineProps: () => ({ item: { name } }), defineEmits: () => (...args) => events.push(args),
    ref: value => ({ value }), onMounted() {}, onBeforeUnmount() {},
    keyFeedback: () => 'control', supportsSwitchHaptics: () => nativeSwitch, vibrateFeedback: () => true,
    createKeyActivation: fn => createKeyActivation(fn, timers), createOnHold: (tap, reload, threshold) => createOnHold(tap, reload, threshold, timers),
    setTimeout: timers.setTimeout, clearTimeout: timers.clearTimeout };
  runInNewContext(keyScript + '\nglobalThis.handlers = { down, up, move, cancel, stopHold, otherPointer, otherKey, lostCapture, keydown, keyup, clicked, active, click: activation.fallback };', context);
  const event = options => ({ ...pointer, clientX: (rect.left + rect.right) / 2, clientY: (rect.top + rect.bottom) / 2,
    preventDefault() { preventions.push(true); }, currentTarget: { setPointerCapture(value) { captures.push(value); }, getBoundingClientRect() { return rect; } }, ...options });
  return { events, captures, preventions, isActive: () => context.handlers.active.value,
    down: options => context.handlers.down(event(options)), up: options => context.handlers.up(event(options)),
    move: options => context.handlers.move(event(options)), lost: options => context.handlers.lostCapture(event(options)),
    cancel: context.handlers.cancel, stopHold: context.handlers.stopHold, otherPointer: context.handlers.otherPointer, otherKey: context.handlers.otherKey, click: context.handlers.click,
    labelClick: options => context.handlers.clicked(event(options)),
    keydown: options => context.handlers.keydown(event(options)), keyup: options => context.handlers.keyup(event(options)),
    advance(duration) { now += duration; for (const [key, task] of tasks) if (task.at <= now) { tasks.delete(key); task.callback(); } },
    endTask() { for (const [key, task] of tasks) if (task.delay === 0) { tasks.delete(key); task.callback(); } } };
}

test('twelve rapid DEL presses capture their pointer and never activate the book below', () => {
  const del = component('del'), book = component('cat', { left: 0, top: 40, right: 50, bottom: 70 });
  for (let i = 0; i < 12; i++) {
    del.down(); del.up(); del.lost(); del.click({ pointerType: 'touch', detail: 0 });
    book.up(); book.click({ pointerType: 'touch', detail: 0 });
  }
  assert.equal(del.events.length, 12); assert.deepEqual(book.events, []);
  assert.deepEqual(del.captures, Array(12).fill(1));
});

test('keys reject starts outside measured button boxes and secondary touch', () => {
  const book = component('cat', { left: 40, top: 40, right: 80, bottom: 70 });
  for (const point of [{ clientX: 60, clientY: 20 }, { clientX: 39, clientY: 50 }, { clientX: 81, clientY: 50 }, { clientX: 60, clientY: 71 }, { isPrimary: false }]) book.down(point);
  assert.deepEqual(book.events, []); assert.deepEqual(book.captures, []);
  book.down(); assert.deepEqual(book.events, [['press', 'cat']]);
});

test('dragging DEL over book, cancellation and cross-key release never send a book press', () => {
  const del = component('del'), book = component('cat', { left: 0, top: 40, right: 50, bottom: 70 });
  del.down(); del.move({ clientY: 50 }); book.up(); book.click({ detail: 1 });
  del.cancel(); del.click({ detail: 0 }); del.endTask(); book.click({ pointerType: 'touch', detail: 0 });
  assert.deepEqual(del.events, [['press', 'del']]); assert.deepEqual(book.events, []);
  del.down(); del.up(); del.click({ detail: 0 }); assert.equal(del.events.length, 2);
});

test('normal release keeps the guard through delayed zero-detail Safari clicks', () => {
  const key = component('aa'); key.down(); key.up(); key.lost(); key.endTask(); key.advance(1000); key.click({ detail: 0 });
  assert.deepEqual(key.events, [['press', 'aa']]);
});

test('lost capture cancels an unfinished gesture without duplicating immediate input', () => {
  const key = component('aa'); key.down(); key.lost(); key.click({ detail: 0 }); key.endTask();
  assert.deepEqual(key.events, [['press', 'aa']]);
  key.click({ detail: 0 }); assert.equal(key.events.length, 2);
});

test('ON cancellation expires its pointer guard without swallowing later assistive clicks', () => {
  for (const defaultClick of [false, true]) {
    const key = component('on'); key.down(); key.cancel(); if (defaultClick) key.click({ detail: 0 });
    assert.deepEqual(key.events, []); key.endTask(); key.click({ detail: 0 });
    assert.deepEqual(key.events, [['press', 'on']]);
  }
});

test('ON release keeps deferred confirmation through normal lostpointercapture', () => {
  const key = component('on'); key.down(); key.advance(5000);
  assert.deepEqual(key.events, [], 'the held pointer cannot confirm a destructive native dialog');
  key.up(); key.lost(); key.click({ detail: 0 }); assert.deepEqual(key.events, []);
  key.advance(499); assert.deepEqual(key.events, []); key.advance(1); assert.deepEqual(key.events, [['reload-request']]);
});

test('moving ON outside its key or losing capture cancels reload', () => {
  for (const cancel of [key => key.move({ clientY: 40 }), key => key.lost()]) {
    const key = component('on'); key.down(); cancel(key); key.advance(5000); key.up(); key.endTask(); assert.deepEqual(key.events, []);
  }
});

test('aborting an ON hold keeps its owned release from becoming a short ON tap', () => {
  for (const abort of [key => key.move({ clientY: 40 }), key => key.stopHold(), key => key.otherPointer({ pointerId: 2 }), key => key.lost()]) {
    const key = component('on'); key.down(); abort(key); key.endTask(); key.advance(6000);
    key.up(); key.lost(); key.endTask(); key.click({ detail: 0 });
    assert.deepEqual(key.events, []);
    key.down(); key.up(); key.click({ detail: 0 }); assert.deepEqual(key.events, [['press', 'on']]);
  }
});

test('a fresh primary press recovers from blur with no old release delivered', () => {
  for (const name of ['on', 'del']) {
    const key = component(name); key.down(); key.stopHold(); key.advance(6000);
    key.down({ pointerId: 2 }); key.up({ pointerId: 2 }); key.click({ detail: 0 }); key.endTask();
    assert.deepEqual(key.events, name === 'on' ? [['press', 'on']] : [['press', 'del'], ['press', 'del']]);
  }
});

test('ON keyboard release requests confirmation once after release even with Enter repeats', () => {
  const key = component('on'); key.keydown({ key: 'Enter', repeat: false }); key.advance(5000);
  key.keydown({ key: 'Enter', repeat: true }); key.keyup({ key: 'Enter' }); key.click({ detail: 0 });
  assert.deepEqual(key.events, []); key.advance(500); assert.deepEqual(key.events, [['reload-request']]);
});

test('native label taps preserve browser default feedback and consume one delayed switch change', () => {
  const key = component('del', undefined, true);
  for (let i = 0; i < 12; i++) {
    key.down(); key.up(); key.lost(); key.endTask(); key.advance(1000);
    key.labelClick(); key.click({ detail: 0 });
  }
  assert.equal(key.events.length, 12); assert.equal(key.preventions.length, 0);
  key.labelClick(); assert.equal(key.preventions.length, 1, 'unowned label activation is blocked');
});

test('native switch labels reject fuzzy hits outside the visible key and canceled releases', () => {
  const key = component('cat', { left: 40, top: 40, right: 80, bottom: 70 }, true);
  key.down({ clientY: 20 }); key.labelClick();
  assert.deepEqual(key.events, []); assert.equal(key.preventions.length, 2);
  key.down(); key.cancel(); key.endTask(); key.labelClick();
  assert.deepEqual(key.events, [['press', 'cat']]); assert.equal(key.preventions.length, 3);
});

test('native switch keyboard and assistive paths activate once without synthetic clicks', () => {
  const key = component('aa', undefined, true);
  key.keydown({ key: 'Enter', repeat: false }); key.keydown({ key: 'Enter', repeat: true });
  assert.equal(key.events.length, 1);
  key.keydown({ key: ' ', repeat: false }); key.click({ type: 'change' });
  key.click({ type: 'change' }); assert.equal(key.events.length, 3);
  assert.doesNotMatch(keySource, /\.click\(/, 'only browser label activation forwards the trusted click');
});

test('ON keeps its ordinary button hold behavior even on native switch devices', () => {
  const key = component('on', undefined, true); key.down(); key.advance(5000); key.up(); key.lost(); key.labelClick();
  assert.deepEqual(key.events, []); key.advance(500); assert.deepEqual(key.events, [['reload-request']]);
});

test('physical function-key feedback lasts only until its own release, without a timer tail', () => {
  for (const native of [false, true]) for (const name of ['squ', 'trig', 'exp', 'templates']) for (const duration of [20, 500]) {
    const key = component(name, undefined, native);
    key.down(); assert.equal(key.isActive(), true);
    key.advance(duration); assert.equal(key.isActive(), true, 'holding cannot expire the physical pressed state');
    key.up(); assert.equal(key.isActive(), false, 'release clears feedback synchronously');
    if (native) key.labelClick();
    key.endTask(); key.advance(1000); key.click({ detail: 0 });
    assert.equal(key.isActive(), false, 'delayed native change/click cannot relight the key');
    assert.equal(key.events.length, 1);
  }
});

test('moving out, cancellation and lost capture immediately clear the owned visual press', () => {
  for (const native of [false, true]) for (const release of [key => key.move({ clientY: 40 }), key => key.cancel(), key => key.lost()]) {
    const key = component('squ', undefined, native); key.down(); assert.equal(key.isActive(), true);
    release(key); assert.equal(key.isActive(), false);
    key.advance(1000); key.up(); assert.equal(key.isActive(), false); assert.equal(key.events.length, 1);
  }
});

test('another pointer release cannot clear a held key, and semantic activation still pulses', () => {
  const key = component('squ'); key.click({ detail: 0 }); assert.equal(key.isActive(), true);
  key.advance(89); assert.equal(key.isActive(), true); key.advance(1); assert.equal(key.isActive(), false);
  key.click({ detail: 0 }); key.advance(20); key.down(); key.advance(100);
  assert.equal(key.isActive(), true, 'an earlier assistive pulse timer cannot end a physical hold');
  key.up({ pointerId: 2 }); assert.equal(key.isActive(), true);
  key.up(); assert.equal(key.isActive(), false);
});

test('ON releases its visual feedback immediately without relighting on its short tap', () => {
  for (const duration of [20, 5000]) {
    const key = component('on'); key.down(); key.advance(duration); assert.equal(key.isActive(), true);
    key.up(); assert.equal(key.isActive(), false); key.endTask(); assert.equal(key.isActive(), false);
  }
  const key = component('on'); key.keydown({ key: 'Enter', repeat: false }); assert.equal(key.isActive(), true);
  key.keyup({ key: 'Enter' }); assert.equal(key.isActive(), false);
});

test('a stale captured owner after blur cannot turn a later assistive pulse into a stuck press', () => {
  for (const native of [false, true]) {
    const key = component('squ', undefined, native); key.down(); key.stopHold();
    key.click({ detail: 0 }); // Consume the retained physical gesture guard.
    key.click({ detail: 0 }); assert.equal(key.isActive(), true);
    key.advance(90); assert.equal(key.isActive(), false);
  }
});

test('fresh input or blur during the release quiet interval cancels the native reload prompt', () => {
  for (const interrupt of [key => key.otherPointer({ pointerId: 2 }), key => key.otherKey(), key => key.stopHold()]) {
    const key = component('on'); key.down(); key.advance(5000); key.up(); key.labelClick(); key.advance(499);
    assert.deepEqual(key.events, []); interrupt(key); key.advance(1000); assert.deepEqual(key.events, []);
  }
});
