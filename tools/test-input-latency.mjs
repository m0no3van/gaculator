// Actual WASM input-to-changed-frame timing. Canvas/compositor/iPhone touch latency is not measured.
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { runInNewContext } from 'node:vm';
import createFirebird from '../public/vendor/firebird/firebird.mjs';
import { keyIds, directions } from '../src/firebird/keys.js';
import { createTouchpadInput } from '../src/firebird/touchpad.js';

const workerPath = process.argv[2] || 'src/firebird/worker.js';
const core = await createFirebird({ wasmBinary: await readFile('public/vendor/firebird/firebird.wasm'), print: () => {} });
for (const name of ['boot1.img', 'flash.img'])
  core.FS.writeFile(name, gunzipSync(await readFile('public/vendor/firebird-device/' + name + '.gz')), { canOwn: true });
core.FS.writeFile('state.snap', await readFile('temp/qa/firebird/roundtrip.snap'));
assert.equal(core._fb_start(1), 1, 'run test:wasm first to prepare the snapshot');
core.FS.unlink('flash.img'); core.FS.unlink('state.snap'); core._fb_release();
const pixels = core._malloc(320 * 240 * 4);
const source = (await readFile(workerPath, 'utf8')).replace(/^import .+;\r?\n/gm, '');
let trial, postedFrames = 0, postedBytes = 0;
const displayed = new Uint8Array(320 * 240 * 4);
const context = { keyIds, directions, createTouchpadInput, performance, Date, Uint8Array,
  setTimeout(callback, delay) { return setTimeout(callback, Math.max(4, delay)); }, clearTimeout,
  postMessage(message) {
    if (message.type === 'error') throw new Error(message.message);
    if (message.type !== 'frame') return;
    postedFrames++; postedBytes += message.bytes.byteLength;
    displayed.set(message.bytes, (message.y || 0) * 320 * 4);
    if (trial) {
      let left = 320, right = 0, count = 0;
      // Ignore the header clock and reject a purely vertical blinking caret.
      for (let y = 105; y < 180; y++) for (let x = 8; x < 300; x++) {
        const offset = (y * 320 + x) * 4;
        if (displayed[offset] !== trial.before[offset] || displayed[offset + 1] !== trial.before[offset + 1]) {
          left = Math.min(left, x); right = Math.max(right, x); count++;
        }
      }
      if (count >= 12 && right - left > 2) { trial.resolve(performance.now() - trial.started); trial = null; }
    }
    queueMicrotask(() => context.onmessage({ data: { type: 'frame-drawn' } }));
  },
};
runInNewContext(source + '\nglobalThis.configure = (value, pointer) => { core=value; pixels=pointer; touchpad=createTouchpadInput(core); resetClock(); }; globalThis.tick=step;', context);
context.configure(core, pixels); context.tick();
const samples = [];
try {
  for (const [index, key] of ['n1', 'n2', 'n3', 'n4', 'n5', 'n6', 'plus', 'minus'].entries()) {
    await new Promise(resolve => setTimeout(resolve, 180 + index % 4 * 3));
    core._fb_paint(pixels);
    const before = core.HEAPU8.slice(pixels, pixels + 320 * 240 * 4);
    let timeout;
    const changed = new Promise((resolve, reject) => {
      trial = { before, started: performance.now(), resolve };
      timeout = setTimeout(() => reject(new Error(`${key}: no rendered glyph/template change within one second`)), 1000);
    });
    await context.onmessage({ data: { type: 'tap', name: key, shift: index >= 6 } });
    try { samples.push({ key, shift: index >= 6, milliseconds: Number((await changed).toFixed(2)) }); }
    finally { clearTimeout(timeout); }
  }
} finally { await context.onmessage({ data: { type: 'pause', value: true } }); }
assert.equal(samples.length, 8);
const sorted = samples.map(sample => sample.milliseconds).sort((a, b) => a - b);
const report = { environment: `Node ${process.version} ${process.platform}/${process.arch}; nested timers clamped to 4 ms; immediate main-thread acknowledgement`,
  workerPath, metric: 'Worker input-message arrival to first frame with changed math glyphs/template',
  medianMilliseconds: Number(((sorted[3] + sorted[4]) / 2).toFixed(2)), worstMilliseconds: sorted.at(-1), postedFrames, postedBytes, samples,
  realIPhone: false, browserCanvasAndCompositorIncluded: false };
await mkdir('temp/qa/performance', { recursive: true });
const name = workerPath.includes('before') ? 'input-latency-before' : 'input-latency-after';
await writeFile(`temp/qa/performance/${name}.json`, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
