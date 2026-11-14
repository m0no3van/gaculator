import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import { createTouchpadGesture } from '../../src/firebird/touchpad.js';
import { createKeyActivation } from '../../src/firebird/key-activation.js';
import { directions } from '../../src/firebird/keys.js';

const source = (await readFile(new URL('../../src/firebird/Keypad.vue', import.meta.url), 'utf8'))
  .match(/<script setup>([\s\S]*?)<\/script>/)[1].replace(/^import .+;\r?\n/gm, '');
function fixture(nativeSwitch = false) {
  const events = [], feedback = [], captures = [], tasks = new Map(); let taskId = 0;
  const timers = { setTimeout(callback) { tasks.set(++taskId, callback); return taskId; }, clearTimeout(id) { tasks.delete(id); } };
  const rect = { left: 0, top: 0, right: 200, bottom: 100, width: 200, height: 100 };
  const zones = { right: { left: 128, top: 20, right: 200, bottom: 80 }, select: { left: 78, top: 32, right: 122, bottom: 68 } };
  const region = name => ({ dataset: { direction: name }, getBoundingClientRect: () => zones[name],
    setPointerCapture: id => captures.push([name, id]) });
  const pad = { getBoundingClientRect: () => rect, setPointerCapture: id => captures.push(['pad', id]) };
  const context = { defineEmits: () => (...args) => events.push(args), reactive: value => value, ref: value => ({ value }),
    onMounted() {}, onBeforeUnmount() {}, directions, createTouchpadGesture, createKeyActivation: run => createKeyActivation(run, timers),
    supportsSwitchHaptics: () => nativeSwitch, vibrateFeedback: kind => feedback.push(kind) };
  runInNewContext(source + '\npad.value = testPad; globalThis.handlers = { down, up, move: gesture.move, lostCapture, cancel, click, keyboard, press, fallback: name => activations[name].fallback({ type: "change" }) };', Object.assign(context, { testPad: pad }));
  const event = (name, options = {}) => ({ pointerId: 1, button: 0, isPrimary: true,
    clientX: name === 'right' ? 170 : 100, clientY: 50, target: { closest: () => region(name) },
    preventDefault() { this.prevented = true; }, ...options });
  const invoke = (method, name = 'right', options) => { const value = event(name, options); context.handlers[method](value); return value; };
  return { events, feedback, captures, handlers: context.handlers, down: (name, options) => invoke('down', name, options),
    endTask() { for (const [id, run] of tasks) { tasks.delete(id); run(); } },
    up: (name, options) => invoke('up', name, options), move: (name, options) => invoke('move', name, options),
    lost: () => invoke('lostCapture'), taps: () => events.filter(([type]) => type === 'tap').map(([, value]) => JSON.parse(JSON.stringify(value))) };
}

test('Ctrl-right uses the modifier-aware hardware tap after releasing raw tracking contact', () => {
  const pad = fixture(); pad.handlers.press('ctrl'); pad.down('right'); pad.up('right'); pad.lost();
  pad.handlers.click({ detail: 0 }, 'right');
  assert.deepEqual(pad.taps(), [{ name: 'right', ctrl: true, shift: false }]);
  const tapIndex = pad.events.findIndex(([type]) => type === 'tap');
  assert.equal(pad.events[tapIndex - 1][1].cancel, true);
  assert.ok(pad.events.filter(([type]) => type === 'touch').every(([, point]) => !point.down));
  pad.down('select'); pad.up('select');
  assert.deepEqual(pad.taps().at(-1), { name: 'select', ctrl: false, shift: false });
  assert.equal(pad.feedback.filter(kind => kind === 'control').length, 2);
  assert.deepEqual(pad.captures, [['right', 1], ['select', 1]]);
});

test('pad sliding and cancellation preserve cursor contact without a direction press', () => {
  const pad = fixture(); pad.down('right'); pad.move('right', { clientX: 100 }); pad.up('right', { clientX: 100 });
  assert.deepEqual(pad.taps(), []);
  pad.down('right'); pad.handlers.cancel({ type: 'blur' }); pad.up('right');
  assert.deepEqual(pad.taps(), []);
  assert.equal(pad.feedback.filter(kind => kind === 'control').length, 0);
});

test('blank pad gaps never confirm, preserve modifiers and still allow sliding', () => {
  for (const native of [false, true]) {
    const pad = fixture(native), gap = { clientX: 125, target: { closest: () => null } };
    pad.handlers.press('ctrl'); pad.down('select', gap); pad.up('select', gap);
    assert.deepEqual(pad.taps(), []);
    assert.equal(pad.feedback.filter(kind => kind === 'control').length, 0);
    assert.deepEqual(pad.captures, [['pad', 1]]);
    pad.down('select', gap); pad.move('select', { clientX: 150 }); pad.up('select', { clientX: 150 });
    assert.deepEqual(pad.taps(), []);
    pad.down('right'); pad.up('right');
    assert.deepEqual(pad.taps(), [{ name: 'right', ctrl: true, shift: false }]);
  }
});

test('center requires both press and release inside its reduced visible region', () => {
  for (const native of [false, true]) {
    const pad = fixture(native);
    const missed = pad.down('select', { clientX: 125 });
    assert.equal(missed.prevented, true, 'expanded browser hit testing cannot restore the old center area');
    assert.deepEqual(pad.taps(), []);
    for (const [start, end] of [[{ clientX: 121 }, { clientX: 123 }], [{ clientY: 33 }, { clientY: 31 }]]) {
      pad.down('select', start); pad.up('select', end);
      const click = { detail: native ? 0 : 1, preventDefault() { this.prevented = true; } };
      pad.handlers.click(click, 'select'); pad.endTask();
      if (native) assert.equal(click.prevented, true);
      assert.deepEqual(pad.taps(), [], 'crossing the boundary by two pixels cannot confirm');
    }
    pad.down('select'); pad.up('select');
    pad.handlers.click({ detail: 0, preventDefault() {} }, 'select');
    if (native) pad.handlers.fallback('select');
    assert.deepEqual(pad.taps(), [{ name: 'select', ctrl: false, shift: false }]);
  }
});

test('an unrelated finger release cannot disarm the owned center press', () => {
  const pad = fixture(); pad.down('select'); pad.up('select', { pointerId: 2, clientX: 200 });
  assert.deepEqual(pad.taps(), []);
  pad.up('select'); assert.deepEqual(pad.taps(), [{ name: 'select', ctrl: false, shift: false }]);
});

test('a rejected native press cannot reuse an older tap whose default click never arrived', () => {
  const pad = fixture(true); pad.down('select'); pad.up('select');
  pad.down('select', { clientX: 125 });
  const click = { preventDefault() { this.prevented = true; } };
  pad.handlers.click(click, 'select');
  assert.equal(click.prevented, true);
  assert.equal(pad.taps().length, 1);
});

test('native pad labels allow only owned settled taps and consume their default change', () => {
  const pad = fixture(true); pad.down('right'); pad.up('right'); pad.lost();
  const owned = { preventDefault() { this.prevented = true; } }; pad.handlers.click(owned, 'right'); pad.handlers.fallback('right');
  assert.equal(owned.prevented, undefined); assert.equal(pad.taps().length, 1);
  const missed = pad.down('right', { clientX: 120 });
  assert.equal(missed.prevented, true);
  const rejected = { preventDefault() { this.prevented = true; } }; pad.handlers.click(rejected, 'right');
  assert.equal(rejected.prevented, true); assert.equal(pad.taps().length, 1);
  pad.down('right'); pad.move('right', { clientX: 100 }); pad.up('right', { clientX: 100 });
  const slide = { preventDefault() { this.prevented = true; } }; pad.handlers.click(slide, 'right');
  assert.equal(slide.prevented, true); assert.equal(pad.taps().length, 1);
  pad.endTask(); pad.handlers.fallback('right'); assert.equal(pad.taps().length, 2, 'a later assistive activation is not swallowed by a canceled drag');
});

test('native pad center retains keyboard and pointer-free assistive activation with feedback', () => {
  const pad = fixture(true);
  pad.handlers.keyboard({ key: 'Enter', repeat: false, preventDefault() {} }, 'select');
  pad.handlers.keyboard({ key: 'Enter', repeat: true, preventDefault() {} }, 'select');
  pad.handlers.keyboard({ key: ' ' }, 'right'); pad.handlers.fallback('right');
  assert.deepEqual(pad.taps().map(value => value.name), ['select', 'right']);
  assert.deepEqual(pad.feedback, ['control', 'control']);
});
