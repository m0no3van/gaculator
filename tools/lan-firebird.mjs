// Local-only certificate/bootstrap server for the explicitly authorized trusted LAN.
import { mkdir, readFile, writeFile, access } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { networkInterfaces } from 'node:os';
import { createServer } from 'node:http';
import { resolve } from 'node:path';
import { isIP } from 'node:net';
import QRCode from 'qrcode';

const addresses = Object.entries(networkInterfaces()).filter(([name]) => !/vEthernet|WSL|Virtual|Loopback/i.test(name))
  .flatMap(([, items]) => items).filter(item => item?.family === 'IPv4' && !item.internal).map(item => item.address);
const address = process.env.GACULATOR_LAN_ADDRESS || addresses[0];
if (isIP(address) !== 4) throw new Error('No LAN IPv4 found; set GACULATOR_LAN_ADDRESS to the phone-reachable IPv4.');
const certs = resolve('temp/firebird-certs'); await mkdir(certs, { recursive: true });
await writeFile(resolve(certs, 'openssl.cnf'), '[req]\ndistinguished_name=dn\n[dn]\nCN=Gaculator\n');
const openssl = process.env.OPENSSL || 'openssl';
const run = args => execFileSync(openssl, args, { cwd: certs, stdio: 'pipe', env: { ...process.env, OPENSSL_CONF: resolve(certs, 'openssl.cnf') } });
const exists = path => access(resolve(certs, path)).then(() => true, () => false);
if (!await exists('root.pem')) {
  run(['req', '-x509', '-newkey', 'rsa:2048', '-sha256', '-days', '3650', '-nodes',
    '-keyout', 'root.key', '-out', 'root.pem', '-subj', '/CN=Gaculator Local PWA CA',
    '-addext', 'basicConstraints=critical,CA:TRUE', '-addext', 'keyUsage=critical,keyCertSign,cRLSign']);
}
await writeFile(resolve(certs, 'server.ext'), `basicConstraints=CA:FALSE\nkeyUsage=digitalSignature,keyEncipherment\nextendedKeyUsage=serverAuth\nsubjectAltName=DNS:localhost,IP:127.0.0.1,${[...new Set([address, ...addresses])].map(ip => 'IP:' + ip).join(',')}\n`);
run(['req', '-new', '-newkey', 'rsa:2048', '-nodes', '-keyout', 'server.key', '-out', 'server.csr', '-subj', '/CN=Gaculator LAN']);
run(['x509', '-req', '-in', 'server.csr', '-CA', 'root.pem', '-CAkey', 'root.key', '-CAcreateserial', '-out', 'server.pem', '-days', '365', '-sha256', '-extfile', 'server.ext']);
run(['x509', '-in', 'root.pem', '-outform', 'DER', '-out', 'root.cer']);
// Self-check the generated leaf, chain and exact chosen IP before opening either port.
run(['verify', '-CAfile', 'root.pem', '-verify_ip', address, 'server.pem']);
const rootCertificate = await readFile(resolve(certs, 'root.cer'));
const fingerprint = run(['x509', '-in', 'root.pem', '-noout', '-fingerprint', '-sha256']).toString().trim();
const app = `https://${address}:8443/`, entry = `http://${address}:4187/`;
const profile = `<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd"><plist version="1.0"><dict><key>PayloadType</key><string>Configuration</string><key>PayloadVersion</key><integer>1</integer><key>PayloadIdentifier</key><string>local.gaculator.ca</string><key>PayloadUUID</key><string>9744B81B-491B-4EAA-AEA3-59048C6311CE</string><key>PayloadDisplayName</key><string>Gaculator Local PWA</string><key>PayloadContent</key><array><dict><key>PayloadType</key><string>com.apple.security.root</string><key>PayloadVersion</key><integer>1</integer><key>PayloadIdentifier</key><string>local.gaculator.ca.root</string><key>PayloadUUID</key><string>B2B41A2E-84A8-44E1-9D91-BCEB6E611917</string><key>PayloadDisplayName</key><string>Gaculator Local PWA CA</string><key>PayloadContent</key><data>${rootCertificate.toString('base64')}</data></dict></array></dict></plist>`;
const page = `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>安装 Gaculator</title><style>body{font:17px/1.6 system-ui;max-width:620px;margin:35px auto;padding:20px;background:#161a20;color:#e6ebf0}a{color:#8ed8e9}code{overflow-wrap:anywhere}li{margin:15px 0}</style><h1>安装 Gaculator · Firebird</h1><p>仅供你的可信局域网使用。先信任本机证书，再安装应用；浏览器不能静默完成这两步。</p><ol><li>iPhone：用 Safari <a href="/gaculator.mobileconfig">下载证书描述文件</a>，在“设置 → 通用 → VPN 与设备管理”安装，然后在“通用 → 关于本机 → 证书信任设置”开启 Gaculator CA 的完全信任。</li><li>Android：<a href="/root.cer">下载 CA 证书</a>，在系统设置的“安全 / 加密与凭据 → 安装证书 → CA 证书”安装；菜单名称依系统版本而异。</li><li><a href="${app}">打开 Gaculator</a>，首次保持联网、等待系统开机，再用浏览器“安装应用 / 添加到主屏幕”。Safari 使用“分享 → 添加到主屏幕”。</li></ol><p>Trust this local CA, open the HTTPS app, let the system start online, then Install/Add to Home Screen. No public server is used.</p><p>安装地址：<a href="${app}">${app}</a></p><p>本机 CA 指纹（与电脑上显示的值核对）：<br><code>${fingerprint}</code></p><p>首次启动会等系统开机；设备需约 331 MB WASM 内存，初始化峰值更高。手机离线冷启动尚待实测。</p></html>`;
const bootstrap = createServer((request, response) => {
  const path = new URL(request.url, entry).pathname;
  const resource = path === '/' ? [page, 'text/html; charset=utf-8']
    : path === '/root.cer' ? [rootCertificate, 'application/x-x509-ca-cert']
    : path === '/gaculator.mobileconfig' ? [profile, 'application/x-apple-aspen-config'] : null;
  if (!['GET', 'HEAD'].includes(request.method) || !resource) { response.writeHead(404); response.end(); return; }
  response.writeHead(200, { 'Content-Type': resource[1], 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  response.end(request.method === 'HEAD' ? undefined : resource[0]);
});
bootstrap.on('error', error => { console.error(error.message); process.exit(1); });
bootstrap.listen(4187, '0.0.0.0');
await mkdir('temp/qa/firebird', { recursive: true });
await QRCode.toFile('temp/qa/firebird/install-qr.png', entry, { width: 360, margin: 2 });
await writeFile('temp/qa/firebird/lan.json', JSON.stringify({ entry, app, addresses, fingerprint }, null, 2));
console.log(`Phone setup: ${entry}\nHTTPS app: ${app}\n${fingerprint}`);
process.env.PORT = '8443'; process.env.GACULATOR_HOST = '0.0.0.0';
process.env.GACULATOR_CERT = resolve(certs, 'server.pem'); process.env.GACULATOR_KEY = resolve(certs, 'server.key');
await import('./serve.mjs');
