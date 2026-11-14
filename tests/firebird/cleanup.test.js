import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import { saveNamespace } from '../../src/firebird/saves.js';

const source = (await readFile(new URL('../../src/firebird/cleanup.js', import.meta.url), 'utf8'))
  .replace(/^import .*;$/m, '').replace('export ', '');
const scope = 'https://calculator.test/app/';
const prefix = `gaculator-${encodeURIComponent(scope)}-`;

function environment({ blocked = false, scopeOverride = scope, installing } = {}) {
  const removed = [], order = [];
  const names = [prefix + 'current', prefix + 'old', 'gaculator-legacy', `gaculator-${encodeURIComponent('https://calculator.test/other/')}-v1`];
  const registration = { scope: scopeOverride, installing, async unregister() { order.push('unregister'); return true; } };
  const context = { URL, encodeURIComponent, saveNamespace, setTimeout, clearTimeout,
    navigator: { serviceWorker: { async getRegistration() { return registration; } } },
    caches: { async keys() { return names; }, async delete(name) { order.push('cache'); removed.push(name); return true; } },
    indexedDB: { deleteDatabase(name) {
      removed.push(name); order.push('database');
      const request = {};
      queueMicrotask(() => blocked ? request.onblocked() : request.onsuccess());
      return request;
    } },
  };
  runInNewContext(source + '\nglobalThis.clear = clearProjectData;', context);
  return { clear: () => context.clear(scope), removed, order };
}

test('explicit cleanup unregisters this project and deletes its versions/save, preserving siblings and legacy data', async () => {
  const env = environment();
  await env.clear();
  assert.deepEqual(env.removed, [prefix + 'current', prefix + 'old', 'gaculator-firebird:/app/']);
  assert.deepEqual(env.order, ['unregister', 'cache', 'cache', 'database']);
});

test('cleanup does not unregister an ancestor scope and reports a blocked database', async () => {
  const env = environment({ blocked: true, scopeOverride: 'https://calculator.test/' });
  await assert.rejects(env.clear(), /Close other calculator windows/);
  assert.equal(env.order.includes('unregister'), false);
});

test('cleanup waits for an in-progress cache installation before deleting caches', async () => {
  let changed;
  const installing = { state: 'installing', addEventListener(type, handler) { changed = handler; }, removeEventListener() {} };
  const env = environment({ installing });
  const pending = env.clear();
  await new Promise(setImmediate);
  assert.deepEqual(env.order, ['unregister']);
  installing.state = 'redundant'; changed();
  await pending;
  assert.equal(env.order.at(-1), 'database');
});
