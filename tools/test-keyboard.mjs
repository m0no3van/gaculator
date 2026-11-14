// Calibrate faster guest-clock key pulses and calculus chords against the real TI OS.
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { createRequire } from 'node:module';
import createFirebird from '../public/vendor/firebird/firebird.mjs';
import { keyIds } from '../src/firebird/keys.js';
const { PNG } = createRequire(import.meta.url)('pngjs');
const wasmBinary = await readFile('public/vendor/firebird/firebird.wasm');
const deviceFiles = await Promise.all(['boot1.img', 'flash.img'].map(async name => [name, gunzipSync(await readFile('public/vendor/firebird-device/' + name + '.gz'))]));
const state = await readFile('temp/qa/firebird/roundtrip.snap');

async function run(hold, gap) {
  const core = await createFirebird({ wasmBinary, print: () => {} });
  for (const [name, bytes] of deviceFiles) core.FS.writeFile(name, bytes.slice(), { canOwn: true });
  core.FS.writeFile('state.snap', state.slice(), { canOwn: true });
  assert.equal(core._fb_start(1), 1); core.FS.unlink('flash.img'); core.FS.unlink('state.snap'); core._fb_release();
  const pixels = core._malloc(320 * 240 * 4);
  function advance(ticks) {
    const end = core._fb_ticks() + ticks;
    for (let steps = 0; core._fb_ticks() < end && steps < 20000; steps++) assert.equal(core._fb_step(8), 1);
    assert.ok(core._fb_ticks() >= end);
  }
  function tap(name, shift = false, ctrl = false) {
    if (shift) core._fb_key(keyIds.shift, 1);
    if (ctrl) core._fb_key(keyIds.ctrl, 1);
    if (shift || ctrl) advance(4);
    core._fb_key(keyIds[name], 1); advance(hold);
    core._fb_key(keyIds[name], 0);
    if (shift) core._fb_key(keyIds.shift, 0);
    if (ctrl) core._fb_key(keyIds.ctrl, 0);
    advance(gap);
  }
  function frame() { core._fb_paint(pixels); return core.HEAPU8.slice(pixels, pixels + 320 * 240 * 4); }
  // Identical final guest time keeps the blinking caret comparable across pulse lengths.
  const started = core._fb_ticks();
  for (const digit of '123456789001122334455667788990') tap('n' + digit);
  advance(Math.max(0, started + 600 - core._fb_ticks()));
  const typed = frame();
  tap('del', false, true); advance(30);
  tap('plus', true); advance(30); const integral = frame();
  tap('del', false, true); advance(30);
  tap('minus', true); advance(30); const derivative = frame();
  for (const [name, data] of Object.entries({ typed, integral, derivative })) {
    const png = new PNG({ width: 320, height: 240 }); png.data = Buffer.from(data);
    await writeFile(`temp/qa/firebird/keyboard-${hold}-${gap}-${name}.png`, PNG.sync.write(png));
  }
  return { typed, integral, derivative };
}
const reference = await run(10, 4), faster = await run(4, 2);
// The title bar clock and caret are excluded; compare the rendered math/input area.
function content(frame) {
  return frame.slice(40 * 320 * 4, 210 * 320 * 4);
}
for (const name of ['typed', 'integral', 'derivative']) {
  const left = content(faster[name]), right = content(reference[name]);
  const differences = [];
  for (let i = 0; i < left.length; i += 4) if (left[i] !== right[i] || left[i + 1] !== right[i + 1] || left[i + 2] !== right[i + 2]) differences.push(i / 4);
  const xs = differences.map(i => i % 320), ys = differences.map(i => Math.floor(i / 320));
  assert.ok(differences.length === 0 || (differences.length <= 32 && Math.max(...xs) - Math.min(...xs) <= 1 && Math.max(...ys) - Math.min(...ys) <= 22), `${name}: only the blinking caret may differ (${differences.length} pixels)`);
}
assert.notDeepEqual(content(faster.integral), content(faster.derivative), 'integral and derivative chords open different templates');
console.log('PASS: 28 repeated/different digits and Shift+plus/minus match conservative 100/40 ms guest pulses at 40/20 ms. Inspect calculus screenshots.');
