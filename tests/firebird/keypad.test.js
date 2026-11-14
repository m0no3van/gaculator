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
  const zones = { right: { left: 128, top: 20, right: 200, bottom: 80 }, select: { left: 68, top: 25, right: 128, bottom: 75 } };
  const regions = Object.fromEntries(Object.keys(zones).map(name => [name, {
    dataset: { direction: name }, getBoundingClientRect: () => zones[name],
    setPointerCapture: id => captures.push([name, id]), closest: () => regions[name],
  }]));
  const region = name => regions[name];
  const pad = { getBoundingClientRect: () => rect, setPointerCapture: id => captures.push(['pad', id]), closest: () => null };
  const document = { elementFromPoint(x, y) {
    for (const name of ['select', 'right']) {
      const box = zones[name];
      if (x < box.left || x > box.right || y < box.top || y > box.bottom) continue;
      // Model browser hit testing excluding the transparent rounded corner points.
      if (name === 'select' && [box.left + 1, box.right - 1].includes(x)
        && [box.top + 1, box.bottom - 1].includes(y)) return pad;
      return regions[name];
    }
    return pad;
  } };
  const context = { defineEmits: () => (...args) => events.push(args), reactive: value => value, ref: value => ({ value }),
    onMounted() {}, onBeforeUnmount() {}, document, directions, createTouchpadGesture, createKeyActivation: run => createKeyActivation(run, timers),
    supportsSwitchHaptics: () => nativeSwitch, vibrateFeedback: kind => feedback.push(kind) };
  runInNewContext(source + '\npad.value = testPad; globalThis.handlers = { down, up, move: gesture.move, lostCapture, cancel, click, keyboard, press, fallback: name => activations[name].fallback({ type: "change" }) };', Object.assign(context, { testPad: pad }));
  const event = (name, options = {}) => ({ pointerId: 1, button: 0, isPrimary: true,
    clientX: name === 'right' ? 170 : 100, clientY: 50, target: { closest: () => region(name) },
    preventDefault() { this.prevented = true; }, ...options });
  const invoke = (method, name = 'right', options) => { const value = event(name, options); context.handlers[method](value); return value; };
  return { events, feedback, captures, zones, handlers: context.handlers, down: (name, options) => invoke('down', name, options),
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
    const pad = fixture(native), gap = { clientX: 50, clientY: 15, target: { closest: () => null } };
    pad.handlers.press('ctrl'); pad.down('select', gap); pad.up('select', gap);
    assert.deepEqual(pad.taps(), []);
    assert.equal(pad.feedback.filter(kind => kind === 'control').length, 0);
    assert.deepEqual(pad.captures, [['pad', 1]]);
    pad.down('select', gap); pad.move('select', { clientX: 40, clientY: 15 }); pad.up('select', { clientX: 40, clientY: 15 });
    assert.deepEqual(pad.taps(), []);
    pad.down('right'); pad.up('right');
    assert.deepEqual(pad.taps(), [{ name: 'right', ctrl: true, shift: false }]);
  }
});

test('center requires both press and release inside its original visible region', () => {
  for (const native of [false, true]) {
    const pad = fixture(native);
    const missed = pad.down('select', { clientX: 129 });
    assert.equal(missed.prevented, true, 'expanded browser hit testing cannot activate outside the visible edge');
    assert.deepEqual(pad.taps(), []);
    for (const [start, end] of [[{ clientX: 127 }, { clientX: 129 }], [{ clientY: 26 }, { clientY: 24 }]]) {
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

test('transparent rounded corners cannot confirm even inside the bounding rectangle', () => {
  for (const native of [false, true]) {
    const pad = fixture(native);
    for (const clientX of [69, 127]) for (const clientY of [26, 74]) {
      const missed = pad.down('select', { clientX, clientY });
      assert.equal(missed.prevented, true);
    }
    pad.down('select', { clientX: 71, clientY: 28 });
    pad.up('select', { clientX: 69, clientY: 26 });
    pad.handlers.click({ detail: native ? 0 : 1, preventDefault() {} }, 'select');
    assert.deepEqual(pad.taps(), []);
  }
});

test('rejected ordinary pointer hits consume delayed zero-detail click but retain later assistive activation', () => {
  for (const point of [{ clientX: 129 }, { clientX: 69, clientY: 26 }]) {
    const pad = fixture();
    const missed = pad.down('select', point); assert.equal(missed.prevented, true);
    pad.up('select', point); pad.endTask();
    pad.handlers.click({ detail: 0 }, 'select');
    assert.deepEqual(pad.taps(), [], 'a default click cannot turn a rejected physical hit into confirmation');
    pad.handlers.click({ detail: 0 }, 'select');
    assert.deepEqual(pad.taps(), [{ name: 'select', ctrl: false, shift: false }]);
  }
});

test('release checks the current visible region after its layout moves', () => {
  for (const native of [false, true]) {
    const pad = fixture(native); pad.down('select');
    pad.zones.select = { left: 120, top: 25, right: 180, bottom: 75 };
    pad.up('select');
    pad.handlers.click({ detail: native ? 0 : 1, preventDefault() {} }, 'select');
    assert.deepEqual(pad.taps(), []);
    pad.down('select', { clientX: 150 }); pad.up('select', { clientX: 150 });
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
  pad.down('select', { clientX: 129 });
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
