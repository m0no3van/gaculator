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
  const hold = createOnHold(() => events.push('tap'), () => events.push('reload'), timers);
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

test('ON held for five seconds requests confirmation once and never emits the short tap', () => {
  const { hold, advance, events } = fixture();
  hold.start(pointer()); advance(4999); assert.deepEqual(events, []);
  advance(1); assert.deepEqual(events, ['reload']);
  advance(5000); hold.end(pointer()); assert.deepEqual(events, ['reload']);
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
  assert.deepEqual(events, ['reload']);
});

test('a busy event loop cannot turn a completed five-second hold into a short tap', () => {
  const { hold, advance, events } = fixture();
  hold.start(pointer()); advance(5000, false);
  hold.end(pointer()); advance(1);
  assert.deepEqual(events, ['reload']);
});
