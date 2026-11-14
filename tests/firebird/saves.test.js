import test from 'node:test';
import assert from 'node:assert/strict';
import { validateSave, storedState, saveNamespace } from '../../src/firebird/saves.js';

test('Pages projects use distinct stores/locks while the root keeps its existing save name', () => {
  assert.equal(saveNamespace('http://localhost:4173/'), 'gaculator-firebird');
  assert.equal(saveNamespace('https://user.github.io/'), 'gaculator-firebird');
  assert.equal(saveNamespace('https://user.github.io/app/index.html'), 'gaculator-firebird:/app/');
  assert.notEqual(saveNamespace('https://user.github.io/app/'), saveNamespace('https://user.github.io/other/'));
});

test('incompatible or damaged snapshots never silently replace a saved device state', () => {
  const value = { format: 1, identity: 'device-a', bytes: new Uint8Array(100), savedAt: 1 };
  assert.equal(validateSave(value, 'device-a'), value);
  for (const bad of [null, { ...value, format: 2 }, { ...value, identity: 'device-b' },
    { ...value, bytes: new Uint8Array(2) }, { ...value, savedAt: NaN }])
    assert.throws(() => validateSave(bad, 'device-a'), /incompatible or damaged/);
});

test('a successful put request is not reported saved when the enclosing transaction aborts', async () => {
  let transaction;
  const db = { transaction(store, mode) {
    assert.equal(mode, 'readwrite');
    transaction = { objectStore() { return { put() { return { result: 'current' }; } }; } };
    return transaction;
  } };
  const saved = storedState(db, { bytes: new Uint8Array(100) });
  transaction.error = new Error('Quota exceeded'); transaction.onabort();
  await assert.rejects(saved, /Quota exceeded/);
});
