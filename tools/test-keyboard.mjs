// Calibrate faster guest-clock key pulses and calculus chords against the real TI OS.
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import { MessageChannel } from 'node:worker_threads';
import createFirebird from '../public/vendor/firebird/firebird.mjs';
import { keyIds, directions } from '../src/firebird/keys.js';
import { createTouchpadInput } from '../src/firebird/touchpad.js';
const { PNG } = createRequire(import.meta.url)('pngjs');
const wasmBinary = await readFile('public/vendor/firebird/firebird.wasm');
const deviceFiles = await Promise.all(['boot1.img', 'flash.img'].map(async name => [name, gunzipSync(await readFile('public/vendor/firebird-device/' + name + '.gz'))]));
const state = await readFile('temp/qa/firebird/roundtrip.snap');

async function run(hold, gap, worker = false) {
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
  let context;
  if (worker) {
    context = { keyIds, directions, createTouchpadInput, performance, Date, Uint8Array, MessageChannel,
      setTimeout: (callback, delay) => setTimeout(callback, Math.max(4, delay)), clearTimeout,
      postMessage(message) {
        if (message.type === 'error') throw new Error(message.message);
        if (message.type === 'frame') queueMicrotask(() => context.onmessage({ data: { type: 'frame-drawn' } }));
      } };
    const source = (await readFile('src/firebird/worker.js', 'utf8')).replace(/^import .+;\r?\n/gm, '');
    runInNewContext(source + '\nglobalThis.configure = (value, pointer) => { core=value; pixels=pointer; touchpad=createTouchpadInput(core); paused=true; resetClock(); }; globalThis.idle=()=>!activeTap && !taps.length; globalThis.closeScheduler=()=>{ wakeup.port1.close(); wakeup.port2.close(); };', context);
    context.configure(core, pixels);
  }
  async function play(sequence) {
    if (!context) { for (const item of sequence) tap(item.name, item.shift, item.ctrl); return; }
    try {
      await context.onmessage({ data: { type: 'pause', value: false } });
      for (const item of sequence) await context.onmessage({ data: { type: 'tap', ...item } });
      const deadline = performance.now() + 5000;
      while (!context.idle() && performance.now() < deadline) await new Promise(resolve => setTimeout(resolve, 5));
      assert.ok(context.idle(), 'real Worker drains every input without a stuck key');
    } catch (error) { context.closeScheduler(); throw error; }
    finally { await context.onmessage({ data: { type: 'pause', value: true } }); }
  }
  // Identical final guest time keeps the blinking caret comparable across pulse lengths.
  const started = core._fb_ticks();
  await play([...'123456789001122334455667788990'].map(digit => ({ name: 'n' + digit })));
  advance(Math.max(0, started + 600 - core._fb_ticks()));
  const typed = frame();
  await play([{ name: 'del', ctrl: true }]); advance(30);
  await play([{ name: 'plus', shift: true }]); advance(30); const integral = frame();
  await play([{ name: 'del', ctrl: true }]); advance(30);
  await play([{ name: 'minus', shift: true }]); advance(30); const derivative = frame();
  context?.closeScheduler();
  for (const [name, data] of Object.entries({ typed, integral, derivative })) {
    const png = new PNG({ width: 320, height: 240 }); png.data = Buffer.from(data);
    await writeFile(`temp/qa/firebird/keyboard-${worker ? 'worker' : `${hold}-${gap}`}-${name}.png`, PNG.sync.write(png));
  }
  return { typed, integral, derivative };
}
const reference = await run(10, 4), faster = await run(4, 2), worker = await run(4, 2, true);
// The title bar clock and caret are excluded; compare the rendered math/input area.
function content(frame) {
  return frame.slice(40 * 320 * 4, 210 * 320 * 4);
}
for (const [label, result] of Object.entries({ faster, worker })) for (const name of ['typed', 'integral', 'derivative']) {
  const left = content(result[name]), right = content(reference[name]);
  const differences = [];
  for (let i = 0; i < left.length; i += 4) if (left[i] !== right[i] || left[i + 1] !== right[i + 1] || left[i + 2] !== right[i + 2]) differences.push(i / 4);
  const xs = differences.map(i => i % 320), ys = differences.map(i => Math.floor(i / 320));
  assert.ok(differences.length === 0 || (differences.length <= 32 && Math.max(...xs) - Math.min(...xs) <= 1 && Math.max(...ys) - Math.min(...ys) <= 22), `${label}/${name}: only the blinking caret may differ (${differences.length} pixels)`);
}
assert.notDeepEqual(content(faster.integral), content(faster.derivative), 'integral and derivative chords open different templates');
console.log('PASS: direct 40/20 ms pulses and the accelerated real Worker match conservative 100/40 ms pulses for 28 repeated/different digits and Ctrl/Shift calculus chords.');
