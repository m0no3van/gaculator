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

test('Safari native-switch path requires a touch device and actual switch support, without synthetic clicks', () => {
  const supported = { createElement() { return { switch: false }; } };
  assert.equal(supportsSwitchHaptics({ maxTouchPoints: 5 }, supported), true);
  assert.equal(supportsSwitchHaptics({ maxTouchPoints: 0 }, supported), false);
  assert.equal(supportsSwitchHaptics({ maxTouchPoints: 5, vibrate() {} }, supported), false);
  assert.equal(supportsSwitchHaptics({ maxTouchPoints: 5 }, { createElement() { return {}; } }), false);
});
