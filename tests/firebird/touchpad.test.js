import test from 'node:test';
import assert from 'node:assert/strict';
import { createTouchpadGesture, createTouchpadInput } from '../../src/firebird/touchpad.js';

const rect = { left: 20, top: 30, width: 200, height: 100 };
const pointer = (x, y, id = 1) => ({ clientX: x, clientY: y, pointerId: id, button: 0, buttons: 0 });

test('sliding with touch buttons=0 moves contact without holding click; release outside remains captured', () => {
  const sent = []; let clicks = 0;
  const gesture = createTouchpadGesture(value => sent.push(value), () => clicks++);
  assert.ok(gesture.start(pointer(60, 80), rect));
  gesture.move(pointer(160, 60)); gesture.end(pointer(260, 0));
  assert.equal(clicks, 0); assert.ok(sent.every(value => !value.down));
  assert.deepEqual(sent.at(-1), { x: 1, y: 0, contact: false, down: false });
});

test('a semantic tap releases tracking before its callback and never also clicks; secondary fingers and cancel never tap', () => {
  const sent = []; let clicks = 0;
  const gesture = createTouchpadGesture(value => sent.push(value), () => {
    assert.equal(sent.at(-1).cancel, true); clicks++;
  });
  gesture.start(pointer(100, 80), rect); gesture.end(pointer(101, 81));
  assert.equal(clicks, 1); assert.equal(sent.filter(value => value.down).length, 0);
  gesture.start(pointer(60, 80), rect); assert.equal(gesture.start(pointer(60, 80, 2), rect), false);
  gesture.end(pointer(60, 80, 2)); gesture.cancel(pointer(60, 80)); gesture.end(pointer(60, 80));
  assert.equal(clicks, 1); assert.equal(sent.at(-1).cancel, true);
});

test('default raw tap still clicks once and invalid starts never send contact', () => {
  const sent = [], gesture = createTouchpadGesture(value => sent.push(value));
  for (const value of [pointer(19, 80), pointer(221, 80), pointer(100, 29), pointer(100, 131), { ...pointer(100, 80), isPrimary: false }])
    assert.equal(gesture.start(value, rect), false);
  assert.deepEqual(sent, []);
  gesture.start(pointer(100, 80), rect); gesture.end(pointer(101, 81));
  assert.equal(sent.filter(value => value.down).length, 1);
  assert.equal(sent.at(-1).contact, false);
});

test('touchpad accepts a second finger when the primary finger is on the keyboard, retaining one gesture owner', () => {
  const sent = []; let taps = 0;
  const gesture = createTouchpadGesture(value => sent.push(value), () => taps++);
  const second = { ...pointer(100, 80, 2), pointerType: 'touch', isPrimary: false };
  assert.equal(gesture.start(second, rect), true);
  assert.equal(gesture.start({ ...second, pointerId: 3 }, rect), false);
  gesture.end(pointer(100, 80)); assert.equal(taps, 0);
  gesture.end(second); assert.equal(taps, 1); assert.equal(sent.at(-1).contact, false);
});

test('fast full-pad swipes drain bounded guest-clock deltas before release; taps survive a slow guest', () => {
  let ticks = 0; const calls = [];
  const input = createTouchpadInput({ _fb_ticks: () => ticks, _fb_touch: (...args) => calls.push(args) });
  input.receive({ x: 0, y: 0.5, contact: true, down: false });
  input.receive({ x: 1, y: 0.5, contact: true, down: false });
  input.receive({ x: 1, y: 0.5, contact: false, down: false });
  for (ticks = 1; ticks < 40; ticks++) input.flush();
  assert.equal(input.active, false); assert.ok(calls.every(call => call[3] === 0));
  const contacts = calls.filter(call => call[2]);
  for (let i = 1; i < contacts.length; ++i) assert.ok(contacts[i][0] - contacts[i - 1][0] <= 0.080001);
  assert.equal(contacts.at(-1)[0], 1); assert.deepEqual(calls.at(-1), [1, 0.5, 0, 0]);
  input.receive({ x: 0.5, y: 0.5, contact: true, down: true });
  input.receive({ x: 0.5, y: 0.5, contact: false, down: false });
  input.flush(); assert.equal(calls.at(-1)[3], 0);
  ticks += 2; input.flush(); assert.equal(calls.at(-1)[3], 1);
  ticks += 9; input.flush(); assert.equal(calls.at(-1)[3], 1);
  ticks += 1; input.flush(); assert.equal(calls.at(-1)[2], 0);
});
