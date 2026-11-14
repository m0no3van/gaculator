import test from 'node:test';
import assert from 'node:assert/strict';
import { createOnHold } from '../../src/firebird/on-hold.js';

function fixture() {
  let now = 0, next = 0;
  const pending = new Map(), events = [];
  const timers = {
    performance: { now: () => now },
    setTimeout(callback, delay) { const id = ++next; pending.set(id, { at: now + delay, callback }); return id; },
    clearTimeout(id) { pending.delete(id); },
  };
  const hold = createOnHold(() => events.push('tap'), () => events.push('reload'), () => events.push('feedback'), timers);
  function advance(duration, runTimers = true) {
    now += duration;
    if (runTimers) for (const [id, task] of pending) if (task.at <= now) { pending.delete(id); task.callback(); }
  }
  return { hold, advance, events };
}
const pointer = (pointerId = 1, isPrimary = true) => ({ pointerId, isPrimary, button: 0 });

test('ON releases before five seconds tap once without a reload or an early firmware ON command', () => {
  const { hold, advance, events } = fixture();
  assert.equal(hold.start(pointer()), true);
  advance(4999); assert.deepEqual(events, []);
  hold.end(pointer()); assert.deepEqual(events, ['tap']);
  advance(5001); assert.deepEqual(events, ['tap']);
});

test('ON gives threshold feedback while held and requests confirmation only after release/default events finish', () => {
  const { hold, advance, events } = fixture();
  hold.start(pointer()); advance(4999); assert.deepEqual(events, []);
  advance(1); assert.deepEqual(events, ['feedback']);
  advance(5000); assert.deepEqual(events, ['feedback']);
  hold.end(pointer()); assert.deepEqual(events, ['feedback']);
  advance(0); assert.deepEqual(events, ['feedback', 'reload']);
});

test('cancel, secondary pointers and non-primary input disarm the long hold', () => {
  for (const interrupt of [hold => hold.cancel(), hold => hold.start(pointer(2)), hold => hold.start(pointer(2, false))]) {
    const { hold, advance, events } = fixture();
    hold.start(pointer()); advance(4999); interrupt(hold); advance(1);
    hold.end(pointer()); assert.deepEqual(events, []);
    assert.equal(hold.pointerId, undefined);
  }
  const { hold, advance, events } = fixture();
  assert.equal(hold.start({ ...pointer(), button: 2 }), false);
  assert.equal(hold.start(pointer(2, false)), false);
  advance(5000); assert.deepEqual(events, []);
});

test('unrelated pointer release cannot turn an active hold into a short ON tap', () => {
  const { hold, advance, events } = fixture();
  hold.start(pointer()); hold.end(pointer(2)); advance(5000);
  assert.deepEqual(events, ['feedback']);
  hold.end(pointer()); advance(0); assert.deepEqual(events, ['feedback', 'reload']);
});

test('a busy event loop cannot turn a completed five-second hold into a short tap', () => {
  const { hold, advance, events } = fixture();
  hold.start(pointer()); advance(5000, false);
  hold.end(pointer()); advance(1);
  assert.deepEqual(events, ['feedback', 'reload']);
});

test('ON Enter/Space hold uses the same five-second threshold without key-repeat or click duplicates', () => {
  for (const key of ['Enter', ' ']) {
    const { hold, advance, events } = fixture();
    assert.equal(hold.startKey({ key, repeat: false }), true);
    advance(4999); assert.deepEqual(events, []);
    assert.equal(hold.startKey({ key, repeat: true }), false);
    advance(1); assert.deepEqual(events, ['feedback']);
    hold.endKey({ key }); assert.deepEqual(events, ['feedback']);
    advance(0); assert.deepEqual(events, ['feedback', 'reload']);
  }
});

test('cancel after threshold feedback or before the deferred confirmation prevents reload', () => {
  for (const releaseFirst of [false, true]) {
    const { hold, advance, events } = fixture();
    hold.start(pointer()); advance(5000);
    if (releaseFirst) hold.end(pointer());
    hold.cancel(); advance(1);
    assert.deepEqual(events, ['feedback']);
  }
});

test('ON keyboard short release taps once; cancellation prevents a later keyup from firing', () => {
  const { hold, advance, events } = fixture();
  hold.startKey({ key: 'Enter' }); advance(100); hold.endKey({ key: 'Enter' });
  assert.deepEqual(events, ['tap']);
  hold.startKey({ key: ' ' }); advance(4999); hold.cancel(); advance(1); hold.endKey({ key: ' ' });
  assert.deepEqual(events, ['tap']);
  assert.equal(hold.startKey({ key: 'x' }), false);
});
