import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import { checkReloadAvailable } from '../../src/firebird/reload.js';
import { saveNamespace } from '../../src/firebird/saves.js';
import { reloadMessages } from '../../src/firebird/dialogs.js';

test('reload probes use uncached network HEAD requests under the project path', async t => {
  const requests = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    requests.push([url, options]); return { ok: true, redirected: false };
  });
  await checkReloadAvailable('https://calculator.test/app/index.html');
  assert.deepEqual(requests.map(([url]) => url.pathname), ['/app/index.html', '/app/sw.js', '/app/vendor/firebird-device/flash.img.gz']);
  for (const [url, options] of requests) {
    assert.ok(url.searchParams.has('pwa-reload'));
    assert.equal(options.method, 'HEAD'); assert.equal(options.cache, 'no-store');
    assert.ok(options.signal instanceof AbortSignal);
  }
});

test('missing or redirected cloud resources reject the preflight', async t => {
  for (const response of [{ ok: false, redirected: false }, { ok: true, redirected: true }]) {
    t.mock.method(globalThis, 'fetch', async () => response);
    await assert.rejects(checkReloadAvailable('https://calculator.test/app/'), /Server resources unavailable/);
  }
});

const app = (await readFile(new URL('../../src/firebird/App.vue', import.meta.url), 'utf8'))
  .match(/<script setup>([\s\S]*?)<\/script>/)[1].replace(/^import .+;\r?\n/gm, '')
  .replaceAll('import.meta.url', '"https://calculator.test/app/assets/main.js"');
function environment({ accept = true, online = true, cleanupFails = false, language = 'en' } = {}) {
  const events = [];
  const context = { saveNamespace, reloadMessages: () => reloadMessages({ languages: [language] }), ref: value => ({ value }), onMounted() {}, onBeforeUnmount() {}, URL, Date,
    location: { href: 'https://calculator.test/app/', replace(url) { events.push(['navigate', url]); } },
    confirm(message) { events.push(['confirm', message]); return accept; }, alert(message) { events.push(['alert', message]); },
    clearInterval() { events.push(['stop-autosave']); }, clearTimeout() {},
    async checkReloadAvailable() { events.push(['network']); if (!online) throw new Error('Offline'); },
    async clearProjectData() { events.push(['delete']); if (cleanupFails) throw new Error('Storage blocked'); },
  };
  runInNewContext(app + `\npreparing.value = starting.value = false; ready.value = ownsLock = true;
    worker = { terminate() { globalThis.events.push(['stop-worker']); } };
    db = { close() { globalThis.events.push(['close-db']); } };
    canvas.value = { getContext() { return { clearRect() {} }; } };
    globalThis.remove = reloadPwa;
    globalThis.setSaving = value => { saveWork = value; };
    globalThis.state = () => ({ ready: ready.value, cleared: cleared.value, error: error.value });`, Object.assign(context, { events, window: context }));
  return { events, remove: context.remove, state: context.state, setSaving: context.setSaving };
}

test('cancelled reload never checks network, stops emulation or deletes data', async () => {
  const env = environment({ accept: false, language: 'zh-CN' }); await env.remove();
  assert.deepEqual(env.events.map(([name]) => name), ['confirm']);
  assert.match(env.events[0][1], /是否重载此 PWA/);
  assert.match(env.events[0][1], /永久清空本机存档/);
  assert.doesNotMatch(env.events[0][1], /Reload this PWA/);
  assert.equal(env.state().ready, true);
});

test('offline reload preserves the running emulator/save and explains failure', async () => {
  const env = environment({ online: false }); await env.remove(true);
  assert.deepEqual(env.events.map(([name]) => name), ['confirm', 'network', 'alert']);
  assert.match(env.events.at(-1)[1], /Local data has been retained/);
  assert.doesNotMatch(env.events.at(-1)[1], /[\u4e00-\u9fff]/);
  assert.equal(env.state().ready, true); assert.equal(env.state().cleared, false);
});

test('confirmed online reload stops writers before deleting and navigates only after success', async () => {
  const env = environment(); await env.remove(true);
  assert.deepEqual(env.events.map(([name]) => name), ['confirm', 'network', 'stop-autosave', 'stop-worker', 'close-db', 'delete', 'navigate']);
  const target = new URL(env.events.at(-1)[1]);
  assert.equal(target.pathname, '/app/index.html'); assert.ok(target.searchParams.has('pwa-reload'));
  assert.equal(env.state().cleared, true);
});

test('cleanup failures report an error and never navigate or claim a successful reload', async () => {
  const env = environment({ cleanupFails: true }); await env.remove(true);
  assert.equal(env.events.some(([name]) => name === 'navigate'), false);
  assert.equal(env.state().cleared, false); assert.match(env.state().error, /Reload did not finish/);
});

test('native reload prompt uses one client language and keeps the destructive warning', async () => {
  for (const language of ['en-GB', 'fr-FR']) {
    const env = environment({ accept: false, language }); await env.remove();
    const message = env.events[0][1];
    assert.match(message, /Reload this PWA/); assert.match(message, /permanently deletes local saves/);
    assert.doesNotMatch(message, /[\u4e00-\u9fff]/);
  }
});

test('an in-flight database save settles before reset closes/deletes storage', async () => {
  const env = environment();
  let finish;
  env.setSaving(new Promise(resolve => { finish = resolve; }));
  const pending = env.remove(true);
  await new Promise(setImmediate);
  assert.deepEqual(env.events.map(([name]) => name), ['confirm', 'network', 'stop-autosave', 'stop-worker']);
  finish(); await pending;
  assert.deepEqual(env.events.slice(-3).map(([name]) => name), ['close-db', 'delete', 'navigate']);
});
