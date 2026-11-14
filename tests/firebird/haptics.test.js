import test from 'node:test';
import assert from 'node:assert/strict';
import { keyFeedback, supportsSwitchHaptics, vibrateFeedback } from '../../src/firebird/haptics.js';

test('entry/operator/control/confirm keys have distinct vibration timing with safe unsupported fallback', () => {
  const sent = [], nav = { vibrate(value) { sent.push(value); return true; } };
  for (const name of ['n1', 'plus', 'ctrl', 'enter']) assert.ok(vibrateFeedback(keyFeedback(name), nav));
  assert.equal(new Set(sent.map(value => JSON.stringify(value))).size, 4);
  assert.equal(vibrateFeedback('entry', {}), false);
  assert.equal(vibrateFeedback('entry', { vibrate() { throw new Error('Unavailable'); } }), false);
});

test('reload threshold uses a distinct supported vibration pattern and safely declines without an API', () => {
  let pattern;
  assert.equal(vibrateFeedback('reload', { vibrate(value) { pattern = value; return true; } }), true);
  assert.deepEqual(pattern, [30, 40, 30]);
  assert.equal(vibrateFeedback('reload', {}), false);
});

test('native switch feedback requires a touch device with switch support and no vibration API', () => {
  const doc = { createElement() { return { switch: false }; } };
  assert.equal(supportsSwitchHaptics({ maxTouchPoints: 5 }, doc), true);
  assert.equal(supportsSwitchHaptics({ maxTouchPoints: 0 }, doc), false);
  assert.equal(supportsSwitchHaptics({ maxTouchPoints: 5, vibrate() {} }, doc), false);
  assert.equal(supportsSwitchHaptics({ maxTouchPoints: 5 }, { createElement() { return {}; } }), false);
  assert.equal(supportsSwitchHaptics({}, undefined), false);
});
