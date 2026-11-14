import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';

const source = await readFile(new URL('../../src/firebird/service-worker.js', import.meta.url), 'utf8');
const scope = 'https://calculator.test/app/';
const prefix = `gaculator-${encodeURIComponent(scope)}-`;

function environment(failInstall = false, online = false) {
  const listeners = {}, stores = new Map();
  const caches = {
    async open(name) {
      if (!stores.has(name)) stores.set(name, new Map());
      const entries = stores.get(name);
      return {
        async addAll(urls) {
          for (const request of urls) {
            assert.equal(request.cache, 'reload', 'fresh installation bypasses the browser HTTP cache');
            const url = request.url; entries.set(url, new Response(url)); if (failInstall) throw new Error('offline');
          }
        },
        async match(url) { return entries.get(typeof url === 'string' ? url : url.url)?.clone(); },
      };
    },
    async keys() { return [...stores.keys()]; },
    async delete(name) { return stores.delete(name); },
  };
  const self = { registration: { scope }, location: { origin: 'https://calculator.test' },
    clients: { async claim() {} }, addEventListener(type, listener) { listeners[type] = listener; } };
  runInNewContext(`const VERSION='test';const ASSETS=['index.html','vendor/firebird/firebird.wasm','vendor/firebird-device/flash.img.gz'];${source}`,
    { self, caches, URL, Request, encodeURIComponent, fetch: async (url, options) => {
      if (!online) throw new Error('Network unavailable');
      assert.equal(options.cache, 'reload'); return new Response(`fresh:${url}`);
    } });
  function event(type, fields = {}) {
    let work;
    listeners[type]({ ...fields, waitUntil(promise) { work = promise; }, respondWith(promise) { work = promise; } });
    return work;
  }
  return { event, stores, caches };
}

test('offline precache includes real WASM/NAND, serves navigation without network, checks completeness', async () => {
  const { event, stores } = environment();
  await event('install'); await event('activate');
  const nav = await event('fetch', { request: { method: 'GET', url: scope + 'page', mode: 'navigate' } });
  assert.equal(await nav.text(), scope + 'index.html');
  const worker = await event('fetch', { request: { method: 'GET', url: scope + 'vendor/firebird/firebird.wasm' } });
  assert.equal(await worker.text(), scope + 'vendor/firebird/firebird.wasm');
  const nand = await event('fetch', { request: { method: 'GET', url: scope + 'vendor/firebird-device/flash.img.gz' } });
  assert.equal(await nand.text(), scope + 'vendor/firebird-device/flash.img.gz');
  assert.equal(event('fetch', { request: { method: 'GET', url: scope + 'missing.js' } }), undefined);
  let report;
  await event('message', { data: 'CHECK', ports: [{ postMessage(value) { report = value; } }] });
  assert.equal(report.ready, true);
  stores.get(prefix + 'test').delete(scope + 'vendor/firebird-device/flash.img.gz');
  await event('message', { data: 'CHECK', ports: [{ postMessage(value) { report = value; } }] });
  assert.equal(report.ready, false);
});

test('after explicit cache deletion an already controlling Worker loads fresh HTML instead of a blank page', async () => {
  const { event, stores } = environment(false, true);
  await event('install');
  stores.delete(prefix + 'test');
  const response = await event('fetch', { request: { method: 'GET', mode: 'navigate', url: scope + 'index.html?pwa-reload=1' } });
  assert.equal(await response.text(), `fresh:${scope}index.html`);
  assert.equal(event('fetch', { request: { method: 'HEAD', url: scope + 'sw.js' } }), undefined);
});

test('incomplete install removes only new cache and retains existing usable version', async () => {
  const { event, caches, stores } = environment(true);
  await caches.open(prefix + 'previous');
  await assert.rejects(event('install'), /offline/);
  assert.equal(stores.has(prefix + 'test'), false);
  assert.equal(stores.has(prefix + 'previous'), true);
});

test('activation retires this project version without deleting sibling project caches', async () => {
  const { event, caches, stores } = environment();
  const sibling = `gaculator-${encodeURIComponent('https://calculator.test/other/')}-previous`;
  for (const name of [prefix + 'previous', sibling, 'gaculator-legacy']) await caches.open(name);
  await event('install'); await event('activate');
  assert.equal(stores.has(prefix + 'previous'), false);
  assert.equal(stores.has(prefix + 'test'), true);
  assert.equal(stores.has(sibling), true);
  assert.equal(stores.has('gaculator-legacy'), true);
});

test('failed first Service Worker installation reports failure instead of waiting forever', async () => {
  const offline = await readFile(new URL('../../src/firebird/offline.js', import.meta.url), 'utf8');
  const states = {};
  const installing = { state: 'installing', addEventListener(type, handler) { states[type] = handler; } };
  const registration = { installing, active: null, waiting: null, addEventListener() {} };
  const context = { setTimeout, clearTimeout, window: { isSecureContext: true }, navigator: { serviceWorker: {
    async register() { return registration; }, ready: new Promise(() => {}), addEventListener() {},
  } } };
  runInNewContext(offline.replaceAll('export ', '').replace('import.meta.env.DEV', 'false')
    + '\nglobalThis.prepare = prepareOffline;', context);
  const messages = [];
  const pending = context.prepare(message => messages.push(message));
  await new Promise(setImmediate);
  installing.state = 'redundant'; states.statechange();
  await pending;
  assert.match(messages.at(-1), /Offline setup failed/);
  assert.equal(messages.some(message => /Offline assets ready/.test(message)), false);
});

test('first launch waits for the complete cache even before this page has a controller', async () => {
  const offline = await readFile(new URL('../../src/firebird/offline.js', import.meta.url), 'utf8');
  let installed, reply, checkTimeout;
  const registration = { active: { postMessage(message, ports) {
    assert.equal(message, 'CHECK'); reply = ports[0];
  } }, addEventListener() {} };
  class Channel {
    constructor() {
      this.port1 = { close() {} };
      this.port2 = { postMessage: data => this.port1.onmessage({ data }) };
    }
  }
  const context = { window: { isSecureContext: true }, navigator: { serviceWorker: {
    controller: null, async register() { return registration; },
    ready: new Promise(resolve => { installed = resolve; }), addEventListener() {},
  } }, MessageChannel: Channel, setTimeout(callback, delay) { if (delay === 10000) checkTimeout = callback; return 1; }, clearTimeout() {} };
  runInNewContext(offline.replaceAll('export ', '').replace('import.meta.env.DEV', 'false')
    + '\nglobalThis.prepare = prepareOffline;', context);
  const messages = [];
  let finished = false;
  const pending = context.prepare(message => messages.push(message)).then(value => { finished = true; return value; });
  await new Promise(setImmediate);
  assert.equal(finished, false);
  assert.equal(reply, undefined);
  installed(registration);
  await new Promise(setImmediate);
  assert.equal(finished, false);
  reply.postMessage({ ready: true });
  assert.equal(await pending, true);
  assert.match(messages.at(-1), /Offline assets ready/);
  assert.equal(typeof checkTimeout, 'function');
});
