// GPL-3.0-or-later. All emulation runs locally in this dedicated Worker.
import { keyIds, directions } from './keys.js';
import { createTouchpadInput } from './touchpad.js';
let core, pixels, timer, paused = false, failed = false, taps = [], activeTap, releaseAt = 0;
let identity;
let touchpad;
let clockTime = 0, clockTicks = 0, lastFrameTime = -Infinity, framePending = false;
let interactiveUntil = 0, lastPixels;
const send = (type, fields = {}, transfer = []) => postMessage({ type, ...fields }, transfer);
function resetClock() { clockTime = performance.now(); clockTicks = core._fb_ticks(); }
function inputArrived() {
  interactiveUntil = performance.now() + 150;
  lastFrameTime = -Infinity;
  clearTimeout(timer);
  const ahead = (core._fb_ticks() - clockTicks) * 10 - (performance.now() - clockTime);
  if (ahead <= 20) step();
  else timer = setTimeout(step, ahead - 20);
}
async function checked(url, hash) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Cannot load ${new URL(url).pathname} (${response.status})`);
  const data = new Uint8Array(await response.arrayBuffer());
  const actual = [...new Uint8Array(await crypto.subtle.digest('SHA-256', data))].map(b => b.toString(16).padStart(2, '0')).join('');
  if (actual !== hash) throw new Error('Device/runtime checksum mismatch; reconnect and rebuild the package.');
  return data;
}
function setModifiers(tap, down) {
  if (tap.ctrl) core._fb_key(keyIds.ctrl, down);
  if (tap.shift) core._fb_key(keyIds.shift, down);
}
function setTap(tap, down) {
  if (directions[tap.name]) {
    core._fb_touch(...directions[tap.name], down, down);
  } else core._fb_key(keyIds[tap.name], down);
}
function release() {
  activeTap = null;
  touchpad?.reset();
  if (core) core._fb_release();
}
function snapshot(id) {
  try {
    core._fb_release();
    if (!core._fb_save()) throw new Error('Snapshot failed; previous saved state remains intact.');
    const bytes = core.FS.readFile('state.snap');
    core.FS.unlink('state.snap');
    send('saved', { id, value: { format: 1, identity, savedAt: Date.now(), bytes } }, [bytes.buffer]);
  } catch (error) { send('save-error', { id, message: error.message }); }
  // Snapshot compression pauses guest time; do not fast-forward through that wall time.
  finally { resetClock(); }
}
function step() {
  if (paused || failed) return;
  try {
    // Input must span firmware scans even when emulation is slower than wall time.
    const now = core._fb_ticks();
    if (activeTap && now >= releaseAt) {
      if (activeTap.preparing) { activeTap.preparing = false; setTap(activeTap, 1); releaseAt = now + 4; }
      else { setTap(activeTap, 0); setModifiers(activeTap, 0); activeTap = null; releaseAt = now + 2; }
    }
    if (!activeTap && taps.length && now >= releaseAt && (!taps[0].save || !touchpad.active)) {
      const next = taps.shift();
      if (next.save) snapshot(next.id);
      else {
        activeTap = next; setModifiers(activeTap, 1);
        // Firmware must scan Shift/Ctrl before the primary key (calibrated against OS 4.5.2.8).
        activeTap.preparing = !!(next.ctrl || next.shift);
        if (!activeTap.preparing) setTap(activeTap, 1);
        releaseAt = now + 4;
      }
    }
    touchpad.flush();
    if (!core._fb_step(8)) throw new Error('The emulated system stopped. Reopen to restore the last save.');
    const time = performance.now();
    if (activeTap || taps.length || touchpad.active) interactiveUntil = time + 150;
    if (!framePending && (time < interactiveUntil || time - lastFrameTime >= 1000 / 30)) {
      core._fb_paint(pixels);
      const current = new Uint32Array(core.HEAPU8.buffer, pixels, 320 * 240);
      let first = 0, last = current.length - 1;
      if (lastPixels) {
        while (first < current.length && current[first] === lastPixels[first]) first++;
        while (last > first && current[last] === lastPixels[last]) last--;
      }
      lastFrameTime = time;
      if (first < current.length) {
        const y = Math.floor(first / 320), height = Math.floor(last / 320) - y + 1;
        const start = y * 320, end = (y + height) * 320;
        if (lastPixels) lastPixels.set(current.subarray(start, end), start); else lastPixels = current.slice();
        const frame = core.HEAPU8.slice(pixels + start * 4, pixels + end * 4);
        framePending = true;
        send('frame', { bytes: frame, y, height }, [frame.buffer]);
      }
    }
    // Yield promptly when CPU-bound; sleep only when the 100 Hz guest clock is ahead.
    const ahead = (core._fb_ticks() - clockTicks) * 10 - (time - clockTime);
    timer = setTimeout(step, Math.max(0, ahead));
  } catch (error) { fail(error); }
}
function fail(error) { failed = true; clearTimeout(timer); send('error', { message: error.message || String(error) }); }
async function boot({ base, device, save }) {
  identity = device.identity;
  send('status', { message: '载入本机模拟器和镜像… / Loading local emulator and device…' });
  const runtime = new URL('vendor/firebird/', base);
  const { default: createFirebird } = await import(/* @vite-ignore */ new URL('firebird.mjs', runtime).href);
  core = await createFirebird({ wasmBinary: await checked(new URL('firebird.wasm', runtime), device.wasmSha256),
    print: () => {}, printErr: message => send('log', { message }),
    onAbort: message => fail(new Error(`Firebird: ${message}`)) });
  for (const file of device.files) {
    const compressed = await checked(new URL('vendor/firebird-device/' + file.url, base), file.compressedSha256);
    const stream = new Blob([compressed]).stream().pipeThrough(new DecompressionStream('gzip'));
    const bytes = new Uint8Array(await new Response(stream).arrayBuffer());
    if (bytes.length !== file.bytes) throw new Error('Invalid decompressed device length.');
    core.FS.writeFile(file.name, bytes, { canOwn: true });
  }
  if (save) core.FS.writeFile('state.snap', save.bytes, { canOwn: true });
  send('status', { message: save ? '恢复上次状态… / Restoring saved state…' : '首次启动 TI 系统… / First TI system boot…' });
  if (!core._fb_start(save ? 1 : 0)) throw new Error('Firebird could not start; saved data has been retained.');
  // The core has its own copy-on-write NAND; release the large JS input buffer.
  core.FS.unlink('flash.img');
  // Snapshot restore reopens flash.img, so it is only removed after startup.
  if (save) core.FS.unlink('state.snap');
  pixels = core._malloc(320 * 240 * 4);
  if (!pixels) throw new Error('Not enough memory for the display.');
  touchpad = createTouchpadInput(core);
  release(); resetClock(); send('ready', { identity, memory: core.HEAPU8.byteLength }); step();
}
onmessage = async ({ data }) => {
  try {
    if (data.type === 'boot') { await boot(data); return; }
    if (data.type === 'frame-drawn') { framePending = false; return; }
    if (!core || failed) throw new Error('Emulator is unavailable; the last save has been retained.');
    if (data.type === 'tap' && (Number.isInteger(keyIds[data.name]) || directions[data.name])) {
      if (taps.length < 64) { taps.push({ name: data.name, ctrl: !!data.ctrl, shift: !!data.shift }); inputArrived(); }
    } else if (data.type === 'touch') { touchpad.receive(data); inputArrived(); }
    else if (data.type === 'release') release();
    else if (data.type === 'save') {
      if (paused) snapshot(data.id);
      else taps.push({ save: true, id: data.id });
    } else if (data.type === 'pause') {
      release(); paused = !!data.value; clearTimeout(timer); if (!paused) { resetClock(); step(); }
    }
  } catch (error) {
    if (data.type === 'save') send('save-error', { id: data.id, message: error.message });
    else fail(error);
  }
};
