// Exercise the actual compiled emulator and a snapshot round trip, without a browser.
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import createFirebird from '../public/vendor/firebird/firebird.mjs';
import { keyIds, directions } from '../src/firebird/keys.js';
const { PNG } = createRequire(import.meta.url)('pngjs');
const wasmBinary = await readFile('public/vendor/firebird/firebird.wasm');
const files = ['boot1.img', 'flash.img'];
const qa = 'temp/qa/firebird'; await mkdir(qa, { recursive: true });
let systemStarted = false;
const core = await createFirebird({ wasmBinary, print: line => { if (line.includes('TI_PM_DIM_settime:')) systemStarted = true; } });
for (const name of files) core.FS.writeFile(name, gunzipSync(await readFile('public/vendor/firebird-device/' + name + '.gz')), { canOwn: true });
assert.equal(core._fb_start(0), 1, 'cold boot accepts the packaged device');
core.FS.unlink('flash.img');
const pixels = core._malloc(320 * 240 * 4);
function frame() { core._fb_paint(pixels); return core.HEAPU8.slice(pixels, pixels + 320 * 240 * 4); }
async function image(name) {
  const png = new PNG({ width: 320, height: 240 }); png.data = Buffer.from(frame());
  await writeFile(`${qa}/${name}.png`, PNG.sync.write(png));
}
const started = performance.now();
for (let i = 0; !systemStarted && performance.now() - started < 120000; ++i) {
  assert.equal(core._fb_step(8), 1);
  if (i === 200 || i === 2000) { await image(`boot-${i}`); console.log('Boot progress', i, 'elapsed ms', Math.round(performance.now() - started)); }
}
assert.ok(systemStarted, 'firmware reached OS UI initialization');
advance(100);
await image('boot-complete');
assert.ok(new Set(frame()).size > 8, 'firmware renders a nonempty LCD');
core._fb_key(keyIds.on, 1); for (let i = 0; i < 30; ++i) assert.equal(core._fb_step(8), 1);
core._fb_key(keyIds.on, 0); for (let i = 0; i < 100; ++i) assert.equal(core._fb_step(8), 1);
await image('home');
function advance(ticks) {
  const end = core._fb_ticks() + ticks;
  for (let i = 0; i < 20000 && core._fb_ticks() < end; ++i) assert.equal(core._fb_step(8), 1);
  assert.ok(core._fb_ticks() >= end, 'the virtual clock continues advancing');
}
function tap(name) {
  if (directions[name]) core._fb_touch(...directions[name], 1, 1);
  else core._fb_key(keyIds[name], 1);
  advance(10);
  if (directions[name]) core._fb_touch(...directions[name], 0, 0);
  else core._fb_key(keyIds[name], 0);
  advance(4);
}
tap('aa'); advance(40); await image('scratchpad');
for (const name of ['n2', 'plus', 'n2', 'enter']) tap(name);
advance(50); await image('arithmetic');
for (const name of ['af', 'aa', 'ac', 'at', 'ao', 'ar', 'pleft', 'ax', 'pow', 'n2', 'right', 'minus', 'n1', 'pright', 'enter']) tap(name);
advance(100); await image('factor');
assert.equal(core._fb_save(), 1);
const snapshot = core.FS.readFile('state.snap');
await writeFile(`${qa}/roundtrip.snap`, snapshot);
const before = frame();
// A fresh instance restores persisted state and NAND deltas against the base device.
const restored = await createFirebird({ wasmBinary, print: () => {} });
for (const name of files) restored.FS.writeFile(name, gunzipSync(await readFile('public/vendor/firebird-device/' + name + '.gz')), { canOwn: true });
restored.FS.writeFile('state.snap', snapshot);
assert.equal(restored._fb_start(1), 1, 'fresh core restores the snapshot');
const rp = restored._malloc(320 * 240 * 4); restored._fb_paint(rp);
assert.deepEqual(restored.HEAPU8.slice(rp, rp + before.length), before, 'restored LCD matches exactly before execution');
restored._fb_release(); for (let i = 0; i < 50; ++i) assert.equal(restored._fb_step(8), 1);
const report = { date: '2026-11-14', environment: `Node ${process.version} on ${process.platform}/${process.arch}`,
  wasmSha256: createHash('sha256').update(wasmBinary).digest('hex'), totalMilliseconds: Math.round(performance.now() - started),
  memoryBytes: core.HEAPU8.byteLength, snapshotBytes: snapshot.length, exactFramebufferRoundTrip: true };
await writeFile(`${qa}/wasm-validation.json`, JSON.stringify(report, null, 2));
console.log('PASS actual WASM boot, keypad, save and fresh-instance restore', report);
