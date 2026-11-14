import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import { createHash, webcrypto } from 'node:crypto';

const source = await readFile(new URL('../../src/firebird/service-worker.js', import.meta.url), 'utf8');
const offline = (await readFile(new URL('../../src/firebird/offline.js', import.meta.url), 'utf8')).replaceAll('export ', '').replace('import.meta.env.DEV', 'false');
const scope = 'https://calculator.test/app/', prefix = `gaculator-${encodeURIComponent(scope)}-`;
const assets = ['index.html', 'vendor/firebird/firebird.wasm', 'vendor/firebird-device/flash.img.gz'];
const body = (path, version = 'test') => path === 'index.html' ? `index:${version}` : `unchanged:${path}`;
const hash = value => createHash('sha256').update(value).digest('hex');

function workerEnvironment({ version = 'test', stores = new Map(), failure, wrong, clients } = {}) {
  const listeners = {}, requests = []; let online = true, now = 1000, skips = 0;
  const caches = {
    async open(name) {
      if (!stores.has(name)) stores.set(name, new Map());
      const entries = stores.get(name);
      return {
        async put(url, response) { entries.set(url, response.clone()); },
        async match(url) { return entries.get(typeof url === 'string' ? url : url.url)?.clone(); },
      };
    }, async keys() { return [...stores.keys()]; }, async delete(name) { return stores.delete(name); },
  };
  const client = { id: 'startup', url: scope }, registration = { scope, installing: null, waiting: null };
  const self = { registration, location: { origin: 'https://calculator.test' },
    clients: { async claim() {}, async matchAll() { return clients ? await clients() : [client]; } },
    async skipWaiting() { skips++; }, addEventListener(type, listener) { listeners[type] = listener; } };
  const hashes = Object.fromEntries(assets.map(path => [path, hash(body(path, version))]));
  runInNewContext(`const VERSION=${JSON.stringify(version)};const ASSETS=${JSON.stringify(assets)};const HASHES=${JSON.stringify(hashes)};${source}`, {
    self, caches, URL, Request, Uint8Array, encodeURIComponent, crypto: webcrypto, Date: { now: () => now },
    fetch: async (input, options) => {
      const request = typeof input === 'string' ? new Request(input, options) : input;
      assert.equal(request.cache, 'reload'); const path = new URL(request.url).pathname.slice('/app/'.length); requests.push(path);
      if (!online || path === failure) throw new Error('Network unavailable');
      return new Response(path === wrong ? 'wrong release bytes' : body(path, version));
    },
  });
  function event(type, fields = {}) {
    let work;
    listeners[type]({ ...fields, waitUntil(promise) { work = promise; }, respondWith(promise) { work = promise; } });
    return work;
  }
  async function message(data, sender = client) {
    let result;
    await event('message', { data, source: sender, ports: [{ postMessage(value) { result = value; } }] });
    return result;
  }
  return { event, message, stores, caches, requests, registration, get skips() { return skips; },
    setOnline(value) { online = value; }, setTime(value) { now = value; } };
}

test('verified precache serves WASM/NAND and navigation offline and reports its content version', async () => {
  const f = workerEnvironment(); await f.event('install'); await f.event('activate'); f.setOnline(false);
  for (const [path, mode] of [['page', 'navigate'], ['vendor/firebird/firebird.wasm'], ['vendor/firebird-device/flash.img.gz']]) {
    const response = await f.event('fetch', { request: { method: 'GET', url: scope + path, mode } });
    assert.equal(await response.text(), body(mode === 'navigate' ? 'index.html' : path));
  }
  assert.equal(f.event('fetch', { request: { method: 'GET', url: scope + 'missing.js' } }), undefined);
  assert.equal((await f.message('CHECK')).version, 'test'); assert.equal((await f.message('CHECK')).ready, true);
  f.stores.get(prefix + 'test').delete(scope + assets[2]); assert.equal((await f.message('CHECK')).ready, false);
});

test('a UI update reuses verified unchanged WASM/NAND without redownloading them', async () => {
  const old = workerEnvironment({ version: 'old' }); await old.event('install');
  const next = workerEnvironment({ version: 'new', stores: old.stores }); await next.event('install');
  assert.deepEqual(next.requests, ['index.html']); assert.equal((await next.message('CHECK')).ready, true);
  const oldNand = await (await old.caches.open(prefix + 'old')).match(scope + assets[2]);
  assert.equal(await oldNand.text(), body(assets[2]));
});

test('failed or wrong release downloads remove only candidate cache and retain the usable old version', async () => {
  for (const options of [{ failure: 'index.html' }, { wrong: 'index.html' }]) {
    const old = workerEnvironment({ version: 'old' }); await old.event('install');
    const next = workerEnvironment({ version: 'new', stores: old.stores, ...options });
    await assert.rejects(next.event('install'));
    assert.equal(next.stores.has(prefix + 'new'), false); assert.equal(next.stores.has(prefix + 'old'), true);
  }
});

test('activation keeps the old cache until matching loaded document confirms, preserving siblings and candidates', async () => {
  const f = workerEnvironment(); await f.caches.open(prefix + 'old');
  const sibling = `gaculator-${encodeURIComponent('https://calculator.test/other/')}-old`; await f.caches.open(sibling);
  await f.event('install'); await f.event('activate'); assert.equal(f.stores.has(prefix + 'old'), true);
  await f.message({ type: 'CONFIRM_VERSION', version: 'old' }); assert.equal(f.stores.has(prefix + 'old'), true);
  await f.caches.open(prefix + 'candidate'); f.registration.installing = {};
  await f.message({ type: 'CONFIRM_VERSION', version: 'test' }); assert.equal(f.stores.has(prefix + 'candidate'), true);
  f.registration.installing = null; f.registration.waiting = {};
  await f.message({ type: 'CONFIRM_VERSION', version: 'test' }); assert.equal(f.stores.has(prefix + 'old'), true);
  f.registration.waiting = null; await f.message({ type: 'CONFIRM_VERSION', version: 'test' });
  assert.equal(f.stores.has(prefix + 'old'), false); assert.equal(f.stores.has(prefix + 'test'), true); assert.equal(f.stores.has(sibling), true);
});

test('only complete sole-client updates with an unexpired activation request can skip waiting', async () => {
  const f = workerEnvironment(); await f.event('install');
  for (const expires of [undefined, NaN, 1000, 999]) {
    assert.equal((await f.message({ type: 'ACTIVATE', expires })).activating, false);
  }
  assert.equal(f.skips, 0);
  assert.equal((await f.message({ type: 'ACTIVATE', expires: 4000 })).activating, true); assert.equal(f.skips, 1);
  const busy = workerEnvironment({ clients: async () => [{ id: 'startup', url: scope }, { id: 'other', url: scope + 'index.html' }] });
  await busy.event('install'); assert.equal((await busy.message({ type: 'ACTIVATE', expires: 4000 })).activating, false); assert.equal(busy.skips, 0);
});

test('activation expiry is rechecked after asynchronous client/cache checks', async () => {
  let answer;
  const f = workerEnvironment({ clients: () => new Promise(resolve => { answer = resolve; }) }); await f.event('install');
  const pending = f.message({ type: 'ACTIVATE', expires: 2000 });
  while (!answer) await new Promise(setImmediate);
  f.setTime(2001); answer([{ id: 'startup', url: scope }]);
  assert.equal((await pending).activating, false); assert.equal(f.skips, 0);
});

test('cache deletion keeps navigation network fallback and uncached HEAD probes', async () => {
  const f = workerEnvironment(); await f.event('install'); f.stores.delete(prefix + 'test');
  const response = await f.event('fetch', { request: { method: 'GET', mode: 'navigate', url: scope + 'index.html?pwa-reload=1' } });
  assert.equal(await response.text(), body('index.html'));
  assert.equal(f.event('fetch', { request: { method: 'HEAD', url: scope + 'sw.js' } }), undefined);
});

function pageEnvironment(options = {}) {
  let now = 0, nextTimer = 0;
  const tasks = new Map(), reports = [], navigations = [], commands = [];
  class Worker extends EventTarget {
    constructor(version, state = 'activated') { super(); this.version = version; this.state = state; this.scriptURL = scope + 'sw.js'; }
    change(value) { this.state = value; this.dispatchEvent(new Event('statechange')); }
    postMessage(data, ports) {
      commands.push([this.version, data]);
      if (data === 'CHECK') ports[0].postMessage({ ready: options.incomplete !== this.version, version: this.version });
      else if (data.type === 'CONFIRM_VERSION') ports[0].postMessage({ confirmed: true });
      else if (data.type === 'ACTIVATE') {
        if (options.activationTimeout) return;
        ports[0].postMessage({ activating: !options.busy });
        if (!options.busy && !options.activationStalls) {
          registration.active = this; registration.waiting = null; serviceWorker.controller = this; this.change('activated');
        }
      }
    }
  }
  const old = new Worker('old'), next = new Worker('new', 'installed');
  const registration = Object.assign(new EventTarget(), { scope, active: options.first ? null : old, waiting: options.waiting ? next : null,
    installing: options.first ? new Worker('old', 'installing') : null,
    async update() { if (options.update) return options.update(registration, next); if (options.offline) throw new Error('offline'); },
  });
  let resolveReady;
  const serviceWorker = { controller: options.first ? null : old,
    async getRegistration() { if (options.lookup) return options.lookup(); return options.first ? undefined : registration; },
    async register(_script, config) { assert.equal(config.updateViaCache, 'none'); return registration; },
    ready: options.parentReady ? Promise.resolve({ scope: 'https://calculator.test/' }) : options.first ? new Promise(resolve => { resolveReady = resolve; }) : Promise.resolve(registration),
  };
  class Channel {
    constructor() { this.port1 = { close() { this.closed = true; } }; this.port2 = { postMessage: data => { if (!this.port1.closed) this.port1.onmessage({ data }); } }; }
  }
  const context = { window: { isSecureContext: true, location: { href: options.href || scope, replace(value) { navigations.push(value); } } },
    document: { querySelector: () => options.noMeta ? null : ({ content: options.documentVersion || 'old' }) },
    navigator: { serviceWorker }, URL, MessageChannel: Channel, Date: { now: () => now },
    setTimeout(run, delay) { const id = ++nextTimer; tasks.set(id, { run, at: now + delay }); return id; }, clearTimeout(id) { tasks.delete(id); },
  };
  runInNewContext(offline + '\nglobalThis.prepare = prepareOffline;', context);
  return { registration, old, next, serviceWorker, tasks, commands, reports, navigations,
    prepare: () => context.prepare(value => reports.push(value)),
    advance(milliseconds) { now += milliseconds; for (const [id, task] of tasks) if (task.at <= now) { tasks.delete(id); task.run(); } },
    async settle() { await new Promise(setImmediate); },
    installed() { const worker = registration.installing; registration.active = worker; registration.installing = null; serviceWorker.controller = worker; worker.change('activated'); resolveReady?.(registration); },
  };
}

test('every cached startup explicitly checks cloud; unchanged version continues without reload', async () => {
  let updates = 0; const f = pageEnvironment({ update() { updates++; } });
  assert.equal(await f.prepare(), true); assert.equal(await f.prepare(), true); assert.equal(updates, 2);
  assert.deepEqual(f.navigations, []); assert.match(f.reports.at(-1), /Offline assets ready/); assert.equal(f.tasks.size, 0);
});

test('new complete version automatically activates and reloads once before emulator startup', async () => {
  const f = pageEnvironment({ waiting: true });
  assert.equal(await f.prepare(), 'reloading'); assert.equal(f.navigations.length, 1);
  assert.equal(new URL(f.navigations[0]).searchParams.get('pwa-version'), 'new');
  assert.equal(f.commands.filter(([, data]) => data.type === 'ACTIVATE').length, 1); assert.equal(f.tasks.size, 0);
  const reopened = pageEnvironment({ documentVersion: 'new', href: f.navigations[0] }); reopened.next.change('activated'); reopened.registration.active = reopened.next;
  assert.equal(await reopened.prepare(), true); assert.deepEqual(reopened.navigations, []);
});

test('offline, check timeout, incomplete download and busy-client deferral retain current version', async () => {
  for (const options of [{ offline: true }, { waiting: true, incomplete: 'new' }, { waiting: true, busy: true }]) {
    const f = pageEnvironment(options); assert.equal(await f.prepare(), true); assert.deepEqual(f.navigations, []); assert.equal(f.tasks.size, 0);
  }
  let finishUpdate; const f = pageEnvironment({ update: () => new Promise(resolve => { finishUpdate = resolve; }) });
  const pending = f.prepare(); await f.settle(); f.advance(4000); assert.equal(await pending, true);
  f.registration.waiting = f.next; finishUpdate(); await f.settle();
  assert.deepEqual(f.navigations, []); assert.equal(f.commands.some(([, data]) => data.type === 'ACTIVATE'), false);
});

test('an installation timeout does not leave a late activation or reload callback', async () => {
  const f = pageEnvironment({ update(registration, next) { next.state = 'installing'; registration.installing = next; } });
  const pending = f.prepare(); await f.settle(); f.advance(20000); assert.equal(await pending, true);
  f.registration.installing = null; f.registration.waiting = f.next; f.next.change('installed'); await f.settle();
  assert.deepEqual(f.navigations, []); assert.equal(f.commands.some(([, data]) => data.type === 'ACTIVATE'), false); assert.equal(f.tasks.size, 0);
});

test('stale document/current-controller mismatch reloads cached current HTML and cannot loop', async () => {
  const f = pageEnvironment({ documentVersion: 'network-new', offline: true });
  assert.equal(await f.prepare(), 'reloading'); assert.equal(new URL(f.navigations[0]).searchParams.get('pwa-version'), 'old');
  const broken = pageEnvironment({ documentVersion: 'network-new', offline: true, href: f.navigations[0] });
  await assert.rejects(broken.prepare(), /Update activation did not finish/); assert.equal(broken.navigations.length, 0);
});

test('once activation is requested, timeout cannot fall through to boot old frontend or later reload it', async () => {
  const f = pageEnvironment({ waiting: true, activationTimeout: true }); const pending = f.prepare();
  await f.settle(); f.advance(4000); await assert.rejects(pending, /Update activation did not finish/);
  f.next.change('activated'); await f.settle(); assert.deepEqual(f.navigations, []); assert.equal(f.tasks.size, 0);
  const stalled = pageEnvironment({ waiting: true, activationStalls: true }); const blocked = stalled.prepare();
  await stalled.settle(); stalled.advance(10000); await assert.rejects(blocked, /Update activation did not finish/); assert.equal(stalled.tasks.size, 0);
});

test('a stalled local registration lookup is bounded and can use its exact-scope current controller', async () => {
  const f = pageEnvironment({ lookup: () => new Promise(() => {}) }); const pending = f.prepare(); await f.settle();
  f.advance(4000); assert.equal(await pending, true); assert.deepEqual(f.navigations, []); assert.equal(f.tasks.size, 0);
});

test('first launch waits for complete cache and reports redundant installation promptly', async () => {
  const f = pageEnvironment({ first: true }); let done = false; const pending = f.prepare().then(result => { done = true; return result; });
  await f.settle(); assert.equal(done, false); assert.equal(f.commands.length, 0);
  f.installed(); assert.equal(await pending, true); assert.equal(f.tasks.size, 0);
  const failed = pageEnvironment({ first: true }); const failure = failed.prepare(); await failed.settle();
  failed.registration.installing.change('redundant'); assert.equal(await failure, undefined); assert.match(failed.reports.at(-1), /Offline setup failed/); assert.equal(failed.tasks.size, 0);
});

test('a parent-scope ready registration cannot release the first child-scope installation gate', async () => {
  const f = pageEnvironment({ first: true, parentReady: true }); let done = false;
  const pending = f.prepare().then(value => { done = true; return value; }); await f.settle();
  assert.equal(done, false); assert.equal(f.commands.length, 0);
  f.installed(); assert.equal(await pending, true); assert.equal(f.tasks.size, 0);
});

test('the exact active registration is checked when the document still has an older controller', async () => {
  const f = pageEnvironment(); f.next.change('activated'); f.registration.active = f.next;
  assert.equal(await f.prepare(), 'reloading'); assert.equal(f.commands[0][0], 'new');
  assert.equal(new URL(f.navigations[0]).searchParams.get('pwa-version'), 'new');
});

const appSource = (await readFile(new URL('../../src/firebird/App.vue', import.meta.url), 'utf8'))
  .match(/<script setup>([\s\S]*?)<\/script>/)[1].replace(/^import .+;\r?\n/gm, '')
  .replaceAll('import.meta.url', JSON.stringify(scope + 'assets/main.js'));
async function startup({ locked = false, result = true } = {}) {
  const events = []; let mounted, lockJob, owns = false;
  const context = { ref: value => ({ value }), onMounted(fn) { mounted = fn; }, onBeforeUnmount() {},
    saveNamespace: () => 'project', location: { href: scope }, URL,
    window: { addEventListener() {} }, document: { addEventListener() {} },
    navigator: { locks: { request(_name, _options, run) {
      events.push('lock'); owns = !locked;
      lockJob = Promise.resolve().then(() => run(locked ? null : {})).finally(() => { owns = false; }); return lockJob;
    } } },
    async prepareOffline() { assert.equal(owns, true); events.push('version-check'); return result; },
    async fetch() { events.push('start-emulator'); throw new Error('End startup probe'); },
  };
  runInNewContext(appSource, context); await mounted(); await lockJob.catch(() => {}); await new Promise(setImmediate);
  return events;
}

test('startup checks versions inside the session lock and a reload sentinel never starts the emulator', async () => {
  assert.deepEqual(await startup({ result: 'reloading' }), ['lock', 'version-check']);
  assert.deepEqual(await startup(), ['lock', 'version-check', 'start-emulator']);
  assert.deepEqual(await startup({ locked: true }), ['lock']);
});
