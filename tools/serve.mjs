import { createServer as createHttpServer } from 'node:http';
import { createServer as createHttpsServer } from 'node:https';
import { readFile, stat } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { pipeline } from 'node:stream';
import { resolve, sep, extname } from 'node:path';
import { networkInterfaces } from 'node:os';
import QRCode from 'qrcode';

const root = resolve('temp/firebird-dist');
const port = Number(process.env.PORT || 4173);
const host = process.env.GACULATOR_HOST || '127.0.0.1';
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid PORT');
const certPath = process.env.GACULATOR_CERT, keyPath = process.env.GACULATOR_KEY;
if (Boolean(certPath) !== Boolean(keyPath)) throw new Error('Set both GACULATOR_CERT and GACULATOR_KEY');
await stat(resolve(root, 'index.html')).catch(() => { throw new Error('Run npm run build first'); });
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.wasm': 'application/wasm',
  '.zip': 'application/zip', '.gz': 'application/gzip',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml', '.png': 'image/png',
  '.txt': 'text/plain; charset=utf-8' };

const handle = async (request, response) => {
  try {
    if (!['GET', 'HEAD'].includes(request.method)) { response.writeHead(405); response.end(); return; }
    let path = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    if (path.endsWith('/')) path += 'index.html';
    const file = resolve(root, `.${path}`);
    if (!file.startsWith(root + sep) || path.includes('\\') || !types[extname(file)]) {
      response.writeHead(404); response.end(); return;
    }
    const info = await stat(file);
    if (!info.isFile()) { response.writeHead(404); response.end(); return; }
    response.writeHead(200, { 'Content-Type': types[extname(file)], 'Content-Length': info.size,
      'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff', 'Service-Worker-Allowed': '/' });
    if (request.method === 'HEAD') response.end();
    else pipeline(createReadStream(file), response, () => {});
  } catch { response.writeHead(404); response.end(); }
};
const server = certPath ? createHttpsServer({ cert: await readFile(certPath), key: await readFile(keyPath) }, handle)
  : createHttpServer(handle);
server.listen(port, host, async () => {
  const protocol = certPath ? 'https' : 'http';
  const addresses = host === '0.0.0.0' ? Object.values(networkInterfaces()).flat().filter(info => info?.family === 'IPv4' && !info.internal) : [];
  console.log(`Local: ${protocol}://localhost:${port}/`);
  for (const info of addresses) console.log(`LAN: ${protocol}://${info.address}:${port}/`);
  const address = addresses[0]?.address;
  if (address) console.log(await QRCode.toString(`${protocol}://${address}:${port}/`, { type: 'terminal', small: true }));
  console.log('Private device package: the NAND may contain local documents. Do not expose this server to the public internet.');
  if (!certPath) console.log('HTTP preview. Phone installation/offline requires trusted HTTPS. See docs/firebird-pwa.md.');
});
server.on('error', error => { console.error(error.message); process.exitCode = 1; });
