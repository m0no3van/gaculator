import test from 'node:test';
import assert from 'node:assert/strict';
import { createAutosave } from '../../src/firebird/autosave.js';

function fixture() {
  let now = 0, nextId = 0;
  const tasks = new Map(), requests = [], errors = [];
  const timers = { performance: { now: () => now },
    setTimeout(run, delay) { const id = ++nextId; tasks.set(id, { run, at: now + delay }); return id; },
    clearTimeout(id) { tasks.delete(id); } };
  const autosave = createAutosave(() => new Promise((resolve, reject) => requests.push({ at: now, resolve, reject })), problem => errors.push(problem), timers);
  return { autosave, requests, errors,
    advance(duration) {
      now += duration;
      for (const [id, task] of tasks) if (task.at <= now) { tasks.delete(id); task.run(); }
    },
    async settle() { for (let i = 0; i < 5; i++) await Promise.resolve(); },
  };
}

test('initial state saves after thirty seconds; unchanged foreground and hidden pauses do not recompress', async () => {
  const f = fixture(); f.advance(29999); assert.equal(f.requests.length, 0);
  f.advance(1); assert.equal(f.requests.length, 1); f.requests[0].resolve(); await f.settle();
  f.advance(300000); await f.autosave.flush(); await f.autosave.flush();
  assert.equal(f.requests.length, 1);
});

test('activity near a deadline waits for two seconds idle and subsequent autosaves are thirty seconds apart', async () => {
  const f = fixture(); f.advance(29500); f.autosave.changed(); f.advance(500); assert.equal(f.requests.length, 0);
  f.advance(1499); assert.equal(f.requests.length, 0); f.advance(1); assert.equal(f.requests[0].at, 31500);
  f.autosave.changed(); f.requests[0].resolve(); await f.settle();
  f.advance(29999); assert.equal(f.requests.length, 1); f.advance(1); assert.equal(f.requests[1].at, 61500);
});

test('held contact is not idle; releasing schedules a save without sending one on the direction tap', () => {
  const f = fixture(); f.advance(29000); f.autosave.changed(true); f.advance(31000);
  assert.equal(f.requests.length, 0);
  f.autosave.changed(false); f.advance(1999); assert.equal(f.requests.length, 0);
  f.advance(1); assert.equal(f.requests.length, 1);
});

test('hidden flush waits for an older in-flight snapshot then saves later input before resolving', async () => {
  const f = fixture(); f.advance(30000); assert.equal(f.requests.length, 1);
  f.autosave.changed(); let flushed = false;
  const pending = f.autosave.flush().then(() => { flushed = true; });
  f.requests[0].resolve(); await f.settle();
  assert.equal(f.requests.length, 2); assert.equal(flushed, false);
  f.autosave.changed(); f.requests[1].resolve(); await f.settle();
  assert.equal(f.requests.length, 3); assert.equal(flushed, false);
  f.requests[2].resolve(); await pending;
  f.advance(300000); assert.equal(f.requests.length, 3);
});

test('a hidden flush saves initial or changed state immediately, bypassing the automatic interval', async () => {
  const f = fixture(); f.advance(500); let pending = f.autosave.flush();
  assert.equal(f.requests[0].at, 500); f.requests[0].resolve(); await pending;
  f.autosave.changed(); pending = f.autosave.flush();
  assert.equal(f.requests[1].at, 500); f.requests[1].resolve(); await pending;
});

test('returning visible during a hidden flush leaves new input to idle autosave instead of forcing repeated snapshots', async () => {
  const f = fixture(); let hidden = true; f.advance(30000);
  const pending = f.autosave.flush(() => hidden); hidden = false; f.autosave.changed();
  f.requests[0].resolve(); await pending; assert.equal(f.requests.length, 1);
  f.advance(29999); assert.equal(f.requests.length, 1); f.advance(1); assert.equal(f.requests.length, 2);
});

test('failed saves remain dirty, report errors and wait before automatic retry', async () => {
  const f = fixture(), problem = new Error('Storage failed'); f.advance(30000);
  f.requests[0].reject(problem); await f.settle(); assert.deepEqual(f.errors, [problem]);
  f.advance(29999); assert.equal(f.requests.length, 1); f.advance(1); assert.equal(f.requests.length, 2);
  f.requests[1].reject(problem); await f.settle();
  const pending = f.autosave.flush(); f.requests[2].reject(problem);
  await assert.rejects(pending, /Storage failed/);
});

test('stopping cancels timers, preserves an in-flight operation and never reschedules it', async () => {
  const f = fixture(); f.advance(30000); f.autosave.changed(); f.autosave.stop();
  f.requests[0].resolve(); await f.settle(); f.autosave.changed(); f.advance(300000); await f.autosave.flush();
  assert.equal(f.requests.length, 1);
  const stopped = fixture(); stopped.autosave.stop(); stopped.advance(300000); assert.equal(stopped.requests.length, 0);
});
