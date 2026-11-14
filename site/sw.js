const VERSION="34d0049ace3d79db";
const ASSETS=["assets/index-BQEbAsP4.js","assets/index-D6Pt-S51.css","assets/worker-W50bPPDV.js","icon-192.png","icon-512.png","icon.svg","index.html","manifest.webmanifest","vendor/firebird-device/boot1.img.gz","vendor/firebird-device/device.json","vendor/firebird-device/flash.img.gz","vendor/firebird/LICENSE.txt","vendor/firebird/build.json","vendor/firebird/compiler-notices.txt","vendor/firebird/firebird.mjs","vendor/firebird/firebird.wasm","vendor/firebird/frontend-notices.txt","vendor/firebird/source.zip"];
const cachePrefix = `gaculator-${encodeURIComponent(self.registration.scope)}-`;
const cacheName = `${cachePrefix}${VERSION}`;
const absoluteAssets = ASSETS.map(path => new URL(path, self.registration.scope).href);
self.addEventListener('install', event => {
  event.waitUntil((async () => {
    try { await (await caches.open(cacheName)).addAll(absoluteAssets.map(url => new Request(url, { cache: 'reload' }))); }
    catch (error) { await caches.delete(cacheName); throw error; }
  })());
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) if (key.startsWith(cachePrefix) && key !== cacheName) await caches.delete(key);
    await self.clients.claim();
  })());
});
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin || !url.href.startsWith(self.registration.scope)) return;
  if (event.request.mode === 'navigate') {
    event.respondWith((async () => {
      const index = new URL('index.html', self.registration.scope).href;
      return (await (await caches.open(cacheName)).match(index)) || fetch(index, { cache: 'reload' });
    })());
  } else if (absoluteAssets.includes(url.href)) {
    event.respondWith((async () => (await (await caches.open(cacheName)).match(url.href)) || fetch(event.request))());
  }
});
self.addEventListener('message', event => {
  if (event.data !== 'CHECK' || !event.ports[0]) return;
  event.waitUntil((async () => {
    const cache = await caches.open(cacheName);
    const hits = await Promise.all(absoluteAssets.map(url => cache.match(url)));
    event.ports[0].postMessage({ ready: hits.every(Boolean), version: VERSION });
  })());
});
