import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import createFirebird from '../public/vendor/firebird/firebird.mjs';
import { createTouchpadGesture, createTouchpadInput } from '../src/firebird/touchpad.js';
import { keyIds, directions } from '../src/firebird/keys.js';
const { PNG } = createRequire(import.meta.url)('pngjs');
const qa = 'temp/qa/firebird';
const wasmBinary = await readFile('public/vendor/firebird/firebird.wasm');
const prior = JSON.parse(await readFile(`${qa}/wasm-validation.json`, 'utf8'));
assert.equal(createHash('sha256').update(wasmBinary).digest('hex'), prior.wasmSha256, 'Run test:wasm first after changing the core');
const core = await createFirebird({ wasmBinary, print: () => {} });
for (const name of ['boot1.img', 'flash.img']) core.FS.writeFile(name, gunzipSync(await readFile('public/vendor/firebird-device/' + name + '.gz')), { canOwn: true });
core.FS.writeFile('state.snap', await readFile(`${qa}/roundtrip.snap`));
assert.equal(core._fb_start(1), 1); core.FS.unlink('flash.img'); core._fb_release();
const pixels = core._malloc(320 * 240 * 4), input = createTouchpadInput(core);
function advance(ticks) {
  const end = core._fb_ticks() + ticks;
  for (let i = 0; i < 20000 && core._fb_ticks() < end; ++i) { assert.equal(core._fb_step(8), 1); input.flush(); }
  assert.ok(core._fb_ticks() >= end);
}
function tap(name, ctrl = false) {
  if (ctrl) { core._fb_key(keyIds.ctrl, 1); advance(4); }
  const set = down => directions[name] ? core._fb_touch(...directions[name], down, down) : core._fb_key(keyIds[name], down);
  set(1); advance(4); set(0);
  if (ctrl) core._fb_key(keyIds.ctrl, 0);
  advance(2);
}
async function capture(name) {
  core._fb_paint(pixels);
  const png = new PNG({ width: 320, height: 240 }); png.data = Buffer.from(core.HEAPU8.slice(pixels, pixels + 320 * 240 * 4));
  await writeFile(`${qa}/${name}.png`, PNG.sync.write(png)); return png.data;
}
tap('on'); advance(30); tap('ab'); advance(150); tap('esc'); advance(30);
const before = await capture('touchpad-graph-before');
const messages = [], gesture = createTouchpadGesture(value => { messages.push(value); input.receive(value); });
const point = (x, y) => ({ pointerId: 1, button: 0, buttons: 0, clientX: x, clientY: y });
gesture.start(point(50, 50), { left: 0, top: 0, width: 200, height: 100 }); advance(6);
gesture.move(point(70, 54)); advance(40);
await capture('touchpad-graph-moved');
gesture.end(point(70, 54)); advance(10);
const after = await capture('touchpad-graph-released');
assert.ok(messages.every(message => !message.down), 'movement never clicks');
assert.equal(input.active, false, 'lifting releases the guest contact');
function darkCount(frame, left, top, right, bottom) {
  let count = 0;
  for (let y = top; y < bottom; ++y) for (let x = left; x < right; ++x)
    if (frame[(y * 320 + x) * 4] < 128) ++count;
  return count;
}
// Inspect arrow bodies away from graph axes, which the guest cursor can invert.
assert.ok(darkCount(before, 163, 124, 169, 130) > darkCount(after, 163, 124, 169, 130) + 8,
  'the firmware cursor left its original graph position');
assert.ok(darkCount(after, 236, 134, 242, 140) > darkCount(before, 236, 134, 242, 140) + 8,
  'the firmware cursor arrived to the right, beyond a caret blink');
// The GUI cancels tracking before routing a settled pad tap through the modifier-aware key queue.
let navigationDirection;
const navigation = createTouchpadGesture(value => input.receive(value), () => tap(navigationDirection, true));
function navigate(name) {
  navigationDirection = name;
  const x = name === 'right' ? 190 : 10;
  navigation.start(point(x, 50), { left: 0, top: 0, width: 200, height: 100 });
  navigation.end(point(x, 50)); advance(30);
}
const graphAxis = darkCount(after, 158, 45, 160, 220);
assert.ok(graphAxis > 100, 'the initial page has a real graph axis');
navigate('left'); const calculator = await capture('touchpad-ctrl-left-calculator');
assert.ok(darkCount(calculator, 158, 45, 160, 220) < graphAxis / 4, 'Ctrl-left switched graph to calculator');
navigate('right'); const returnedGraph = await capture('touchpad-ctrl-right-graph');
assert.ok(darkCount(returnedGraph, 158, 45, 160, 220) > graphAxis / 2, 'Ctrl-right switched calculator back to graph');
assert.equal(input.active, false, 'semantic navigation leaves no raw contact held');
await writeFile(`${qa}/touchpad-validation.json`, JSON.stringify({ wasmSha256: prior.wasmSha256,
  guestCursorMovedRight: true, dragHeldClick: false, released: true, ctrlLeftRightRoundtrip: true, phoneVerified: false }, null, 2));
console.log('PASS actual WASM graph touchpad movement/release and Ctrl-left/right calculator/graph roundtrip.');
