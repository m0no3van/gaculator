import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const base = new URL(process.argv[2] || 'http://127.0.0.1:4173/');
assert(['http:', 'https:'].includes(base.protocol), 'Expected HTTP(S) deployment URL');
const root = 'temp/firebird-dist';
const script = await readFile(`${root}/sw.js`, 'utf8');
const match = script.match(/^const ASSETS=(.+);$/m);
assert(match, 'Build an offline inventory first');
const assets = JSON.parse(match[1]);
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
for (const name of [...assets, 'sw.js']) {
  assert(!name.startsWith('/') && !name.split('/').includes('..'), 'Unexpected asset path');
  const response = await fetch(new URL(name, base), { signal: AbortSignal.timeout(120000) })
    .catch(error => { throw new Error(`${name}: ${error.message}`, { cause: error }); });
  assert.equal(response.status, 200, `${name}: HTTP ${response.status}`);
  const delivered = Buffer.from(await response.arrayBuffer()
    .catch(error => { throw new Error(`${name} body: ${error.message}`, { cause: error }); }));
  assert.equal(digest(delivered), digest(await readFile(`${root}/${name}`)), `${name}: delivered bytes differ`);
}
const head = await fetch(new URL('vendor/firebird-device/flash.img.gz', base), { method: 'HEAD', signal: AbortSignal.timeout(10000) });
assert.equal(head.status, 200); assert.equal((await head.arrayBuffer()).byteLength, 0);
assert.equal(Number(head.headers.get('content-length')), (await readFile(`${root}/vendor/firebird-device/flash.img.gz`)).length);
for (const path of ['temp/analysis/local-cx-cas/flash-report.json', '.reference/firmware/TI-NspireCXIICAS-6.4.0.74.tcc2', 'package.json']) {
  assert.equal((await fetch(new URL(path, base), { signal: AbortSignal.timeout(10000) })).status, 404, 'Research/config exposed');
}
const report = { url: base.href, verifiedFiles: assets.length + 1, deliveredBytesMatchBuild: true, researchInputsExcluded: true };
await mkdir('temp/qa', { recursive: true });
await writeFile('temp/qa/delivery-check.json', JSON.stringify(report, null, 2));
console.log(JSON.stringify(report));
