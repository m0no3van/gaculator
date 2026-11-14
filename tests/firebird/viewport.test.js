import test from 'node:test';
import assert from 'node:assert/strict';
import { fitStandaloneViewport } from '../../src/firebird/viewport.js';

function environment({ standalone = true, width = 402, height = 812, inset = 62, scale = 1 } = {}) {
  const values = new Map(), listeners = {}, writes = [];
  const root = { style: {
    setProperty(name, value) { writes.push(['set', value]); values.set(name, value); },
    removeProperty(name) { writes.push(['remove']); values.delete(name); },
  } };
  const view = {
    navigator: { standalone }, screen: { width: 402, height: 874 }, innerWidth: width, innerHeight: height,
    getComputedStyle() { return { getPropertyValue() { return `${inset}px`; } }; },
    addEventListener(type, callback) { listeners[type] = callback; },
    visualViewport: { scale, addEventListener(type, callback) { listeners[`visual-${type}`] = callback; } },
  };
  fitStandaloneViewport(view, root);
  return { values, listeners, view, writes };
}

test('iOS standalone status-bar double subtraction uses the full measured screen height', () => {
  const { values } = environment();
  assert.equal(values.get('--app-height'), '874px');
});

test('browser tabs, normal standalone geometry and split windows keep CSS viewport sizing', () => {
  for (const options of [{ standalone: false }, { height: 874 }, { width: 350 }, { height: 700 }, { inset: 0 }])
    assert.equal(environment(options).values.has('--app-height'), false);
});

test('correction ignores pinch zoom and only resets on a different window geometry', () => {
  const { values, listeners, view } = environment();
  view.visualViewport.scale = 1.2; view.innerHeight = 650; listeners['visual-resize']();
  assert.equal(values.get('--app-height'), '874px');
  view.visualViewport.scale = 1; view.innerHeight = 874; listeners.resize();
  assert.equal(values.get('--app-height'), '874px');
  view.innerHeight = 700; listeners.resize();
  assert.equal(values.has('--app-height'), false);
  view.innerHeight = 812; listeners.pageshow();
  assert.equal(values.get('--app-height'), '874px');
});

test('alternating corrected and reduced iOS height cannot oscillate root sizing or repaint repeatedly', () => {
  const { values, listeners, view, writes } = environment();
  for (const height of [874, 812, 874, 812, 874, 813, 874, 812]) {
    view.innerHeight = height; listeners.resize(); listeners['visual-resize'](); listeners.pageshow();
    assert.equal(values.get('--app-height'), '874px');
  }
  assert.deepEqual(writes, [['set', '874px']]);
});

test('split-window and orientation changes clear the old correction once and can select it again', () => {
  const { values, listeners, view, writes } = environment();
  view.innerWidth = 350; listeners.resize(); listeners.resize();
  assert.equal(values.has('--app-height'), false);
  assert.deepEqual(writes, [['set', '874px'], ['remove']]);
  view.innerWidth = 402; listeners.resize();
  assert.equal(values.get('--app-height'), '874px');
  view.innerWidth = 874; view.innerHeight = 402; listeners.resize(); listeners.resize();
  assert.equal(values.has('--app-height'), false);
  assert.deepEqual(writes, [['set', '874px'], ['remove'], ['set', '874px'], ['remove']]);
});

test('orientation changes do not use portrait screen height for landscape', () => {
  const { values, listeners, view } = environment();
  view.innerWidth = 874; view.innerHeight = 402; listeners.resize();
  assert.equal(values.has('--app-height'), false);
});

test('the correction follows measured device dimensions rather than a hardcoded phone size', () => {
  const { values, listeners, view } = environment({ width: 393, height: 793, inset: 59 });
  view.screen.width = 393; view.screen.height = 852; listeners.resize();
  assert.equal(values.get('--app-height'), '852px');
});
