import test from 'node:test';
import assert from 'node:assert/strict';
import { fitStandaloneViewport } from '../../src/firebird/viewport.js';

function environment({ standalone = true, width = 402, height = 812, inset = 62, scale = 1 } = {}) {
  const values = new Map(), listeners = {};
  const root = { style: { setProperty(name, value) { values.set(name, value); }, removeProperty(name) { values.delete(name); } } };
  const view = {
    navigator: { standalone }, screen: { width: 402, height: 874 }, innerWidth: width, innerHeight: height,
    getComputedStyle() { return { getPropertyValue() { return `${inset}px`; } }; },
    addEventListener(type, callback) { listeners[type] = callback; },
    visualViewport: { scale, addEventListener(type, callback) { listeners[`visual-${type}`] = callback; } },
  };
  fitStandaloneViewport(view, root);
  return { values, listeners, view };
}

test('iOS standalone status-bar double subtraction uses the full measured screen height', () => {
  const { values } = environment();
  assert.equal(values.get('--app-height'), '874px');
});

test('browser tabs, normal standalone geometry and split windows keep CSS viewport sizing', () => {
  for (const options of [{ standalone: false }, { height: 874 }, { width: 350 }, { height: 700 }, { inset: 0 }])
    assert.equal(environment(options).values.has('--app-height'), false);
});

test('viewport changes restore native sizing when the regression disappears and do not react to pinch zoom', () => {
  const { values, listeners, view } = environment();
  view.visualViewport.scale = 1.2; view.innerHeight = 650; listeners['visual-resize']();
  assert.equal(values.get('--app-height'), '874px');
  view.visualViewport.scale = 1; view.innerHeight = 874; listeners.resize();
  assert.equal(values.has('--app-height'), false);
  view.innerHeight = 812; listeners.pageshow();
  assert.equal(values.get('--app-height'), '874px');
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
