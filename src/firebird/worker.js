// GPL-3.0-or-later. All emulation runs locally in this dedicated Worker.
import { keyIds, directions } from './keys.js';
import { createTouchpadInput } from './touchpad.js';
let core, pixels, timer, paused = false, failed = false, taps = [], activeTap, releaseAt = 0;
let identity;
let touchpad;
const send = (type, fields = {}, transfer = []) => postMessage({ type, ...fields }, transfer);
async function checked(url, hash) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Cannot load ${new URL(url).pathname} (${response.status})`);
  const data = new Uint8Array(await response.arrayBuffer());
  const actual = [...new Uint8Array(await crypto.subtle.digest('SHA-256', data))].map(b => b.toString(16).padStart(2, '0')).join('');
  if (actual !== hash) throw new Error('Device/runtime checksum mismatch; reconnect and rebuild the package.');
  return data;
}
function setTap(tap, down) {
  if (tap.ctrl) core._fb_key(keyIds.ctrl, down);
  if (tap.shift) core._fb_key(keyIds.shift, down);
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
}
function step() {
  if (paused || failed) return;
  try {
    // Input must span firmware scans even when emulation is slower than wall time.
    const now = core._fb_ticks();
    if (activeTap && now >= releaseAt) { setTap(activeTap, 0); activeTap = null; releaseAt = now + 4; }
    if (!activeTap && taps.length && now >= releaseAt && (!taps[0].save || !touchpad.active)) {
      const next = taps.shift();
      if (next.save) snapshot(next.id);
      else { activeTap = next; setTap(activeTap, 1); releaseAt = now + 10; }
    }
    if (!core._fb_step(8)) throw new Error('The emulated system stopped. Reopen to restore the last save.');
    touchpad.flush();
    core._fb_paint(pixels);
    const frame = core.HEAPU8.slice(pixels, pixels + 320 * 240 * 4);
    send('frame', { bytes: frame }, [frame.buffer]);
    timer = setTimeout(step, 16);
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
  release(); send('ready', { identity, memory: core.HEAPU8.byteLength }); step();
}
onmessage = async ({ data }) => {
  try {
    if (data.type === 'boot') { await boot(data); return; }
    if (!core || failed) throw new Error('Emulator is unavailable; the last save has been retained.');
    if (data.type === 'tap' && (Number.isInteger(keyIds[data.name]) || directions[data.name])) {
      if (taps.length < 64) taps.push({ name: data.name, ctrl: !!data.ctrl, shift: !!data.shift });
    } else if (data.type === 'touch') touchpad.receive(data);
    else if (data.type === 'release') release();
    else if (data.type === 'save') {
      if (paused) snapshot(data.id);
      else taps.push({ save: true, id: data.id });
    } else if (data.type === 'pause') {
      release(); paused = !!data.value; clearTimeout(timer); if (!paused) step();
    }
  } catch (error) {
    if (data.type === 'save') send('save-error', { id: data.id, message: error.message });
    else fail(error);
  }
};
