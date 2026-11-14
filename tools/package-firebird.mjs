// GPL-3.0-or-later. Build-time only: package the user's local device for LAN delivery.
import { readFile, writeFile, mkdir, cp, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { resolve } from 'node:path';

const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const notices = ['Gaculator Firebird frontend/core: GPL-3.0. Corresponding source and GPL accompany the runtime. TI OS is separate.'];
const lock = JSON.parse(await readFile('package-lock.json', 'utf8'));
for (const [directory, metadata] of Object.entries(lock.packages)) {
  if (!directory.startsWith('node_modules/') || metadata.dev) continue;
  const name = (await readdir(directory)).find(name => /^licen[sc]e(?:\..*)?$/i.test(name));
  if (name) notices.push(`${directory}\n\n${await readFile(resolve(directory, name), 'utf8')}`);
}
await writeFile('public/vendor/firebird/frontend-notices.txt', notices.join('\n\n---\n\n') + '\n');
const out = resolve('public/vendor/firebird-device');
const input = process.env.GACULATOR_DEVICE_DIR || 'D:/01-Software/VirtualMachines/Calculator';
const build = JSON.parse(await readFile('public/vendor/firebird/build.json', 'utf8').catch(() => {
  throw new Error('Build the core first: npm run build:firebird -- --emcc <path-to-emcc.py>');
}));
if (digest(await readFile('public/vendor/firebird/firebird.wasm')) !== build.wasmSha256)
  throw new Error('Firebird WASM does not match build.json; rebuild it.');
await mkdir(out, { recursive: true });
const files = [];
for (const [source, name, size, expected] of [
  ['Boot1cx.img', 'boot1.img', 524288, null],
  ['TI-NspireCXCAS-4.5.2.8.bin', 'flash.img', 138412032, '43a00d93c97a06969bfcdefca1d7a0356256286c1cbc5e7109a9b0d7a126dc1e'],
]) {
  const data = await readFile(resolve(input, source));
  if (data.length !== size || (expected && digest(data) !== expected))
    throw new Error(`Unexpected ${source}; refusing to package a different or changed device.`);
  const compressed = gzipSync(data, { level: 9 });
  await writeFile(resolve(out, name + '.gz'), compressed);
  files.push({ name, url: name + '.gz', bytes: size, compressedBytes: compressed.length,
    sha256: digest(data), compressedSha256: digest(compressed) });
}
const identity = digest(JSON.stringify({ wasm: build.wasmSha256, files }));
await writeFile(resolve(out, 'device.json'), JSON.stringify({ format: 1, model: 'TI-Nspire CX CAS',
  os: '4.5.2.8', identity, wasmSha256: build.wasmSha256, files }, null, 2) + '\n');
console.log(`Private local device package: ${files.reduce((sum, f) => sum + f.compressedBytes, 0)} bytes compressed.`);
console.log('Contains the local NAND, including any documents it holds. Serve locally; do not publish this directory.');
// An allowlisted staging directory excludes the obsolete CAS/font/runtime assets.
const stage = resolve('temp/firebird-public');
await mkdir(stage, { recursive: true });
for (const name of ['icon.svg', 'icon-192.png', 'icon-512.png', 'manifest.webmanifest'])
  await cp(resolve('public', name), resolve(stage, name));
await cp(resolve('public/vendor/firebird'), resolve(stage, 'vendor/firebird'), { recursive: true });
await cp(out, resolve(stage, 'vendor/firebird-device'), { recursive: true });
