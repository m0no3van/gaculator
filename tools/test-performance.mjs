// Compare Worker scheduling with the same real WASM/snapshot; this is not an iPhone benchmark.
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { runInNewContext } from 'node:vm';
import createFirebird from '../public/vendor/firebird/firebird.mjs';
import { keyIds, directions } from '../src/firebird/keys.js';
import { createTouchpadInput } from '../src/firebird/touchpad.js';

const workerPath = process.argv[2] || 'src/firebird/worker.js';
await mkdir('temp/qa/performance', { recursive: true });
const core = await createFirebird({ wasmBinary: await readFile('public/vendor/firebird/firebird.wasm'), print: () => {} });
for (const name of ['boot1.img', 'flash.img'])
  core.FS.writeFile(name, gunzipSync(await readFile('public/vendor/firebird-device/' + name + '.gz')), { canOwn: true });
core.FS.writeFile('state.snap', await readFile('temp/qa/firebird/roundtrip.snap'));
assert.equal(core._fb_start(1), 1, 'run test:wasm first to prepare the snapshot');
core.FS.unlink('flash.img'); core.FS.unlink('state.snap'); core._fb_release();
const pixels = core._malloc(320 * 240 * 4);
const source = (await readFile(workerPath, 'utf8')).replace(/^import .+;\r?\n/gm, '');
const started = performance.now(), startTicks = core._fb_ticks();
let presses = 0, releases = 0, frames = 0, frameBytes = 0, steps = 0, cpuMilliseconds = 0, maxStepMilliseconds = 0, queueMilliseconds;
const measured = { ...core, _fb_key(id, down) {
  if (down) presses++; else { releases++; if (releases === 16) queueMilliseconds = performance.now() - started; }
  core._fb_key(id, down);
}, _fb_step(budget) {
  const start = performance.now(); const result = core._fb_step(budget); const duration = performance.now() - start;
  steps++; cpuMilliseconds += duration; maxStepMilliseconds = Math.max(maxStepMilliseconds, duration); return result;
} };
const context = { keyIds, directions, createTouchpadInput, performance, Date, Uint8Array,
  setTimeout(callback, delay) { return setTimeout(callback, Math.max(4, delay)); }, clearTimeout,
  postMessage(message) {
    if (message.type === 'error') throw new Error(message.message);
    if (message.type === 'frame') { frames++; frameBytes += message.bytes.byteLength; queueMicrotask(() => context.onmessage({ data: { type: 'frame-drawn' } })); }
  },
};
runInNewContext(source + '\nglobalThis.configure = (value, pointer) => { core=value; pixels=pointer; touchpad=createTouchpadInput(core); if (typeof resetClock === "function") resetClock(); }; globalThis.tick=step;', context);
context.configure(measured, pixels);
context.tick();
for (const name of '1234567890123456') await context.onmessage({ data: { type: 'tap', name: 'n' + name } });
await new Promise(resolve => setTimeout(resolve, 6000));
await context.onmessage({ data: { type: 'pause', value: true } });
const elapsed = performance.now() - started;
assert.equal(presses, 16); assert.equal(releases, 16, 'queued input drains without dropping keys');
assert.ok(maxStepMilliseconds < 250, 'CPU batches remain bounded');
const report = { environment: `Node ${process.version} ${process.platform}/${process.arch}; nested timers clamped to 4 ms`,
  workerPath, wallMilliseconds: Math.round(elapsed), guestSpeed: Number(((core._fb_ticks() - startTicks) * 10 / elapsed).toFixed(3)),
  queueMilliseconds: Math.round(queueMilliseconds), presses, releases, frames, frameBytes, steps,
  cpuMilliseconds: Math.round(cpuMilliseconds), maxStepMilliseconds: Number(maxStepMilliseconds.toFixed(2)), realIPhone: false };
const name = workerPath.includes('baseline') ? 'baseline' : 'optimized';
await writeFile(`temp/qa/performance/${name}.json`, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
