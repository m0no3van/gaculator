const cachePrefix = `gaculator-${encodeURIComponent(self.registration.scope)}-`;
const cacheName = `${cachePrefix}${VERSION}`;
const absoluteAssets = ASSETS.map(path => new URL(path, self.registration.scope).href);
async function complete() {
  const cache = await caches.open(cacheName);
  return (await Promise.all(absoluteAssets.map(url => cache.match(url)))).every(Boolean);
}
async function verified(response, hash) {
  if (!response?.ok) return false;
  const digest = await crypto.subtle.digest('SHA-256', await response.clone().arrayBuffer());
  return [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2, '0')).join('') === hash;
}
self.addEventListener('install', event => {
  event.waitUntil((async () => {
    try {
      const cache = await caches.open(cacheName);
      const previous = (await caches.keys()).filter(name => name.startsWith(cachePrefix) && name !== cacheName).reverse();
      for (const [index, url] of absoluteAssets.entries()) {
        let response;
        for (const name of previous) {
          const candidate = await (await caches.open(name)).match(url);
          if (await verified(candidate, HASHES[ASSETS[index]])) { response = candidate; break; }
        }
        if (!response) {
          response = await fetch(new Request(url, { cache: 'reload' }));
          if (!await verified(response, HASHES[ASSETS[index]])) throw new Error('Release resource checksum mismatch');
        }
        await cache.put(url, response);
      }
    }
    catch (error) { await caches.delete(cacheName); throw error; }
  })());
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
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
  if (!event.ports[0]) return;
  event.waitUntil((async () => {
    const ready = await complete();
    if (event.data === 'CHECK') event.ports[0].postMessage({ ready, version: VERSION });
    else if (event.data?.type === 'ACTIVATE') {
      const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const source = event.source;
      const alone = source?.id && source.url.startsWith(self.registration.scope)
        && clients.every(client => !client.url.startsWith(self.registration.scope) || client.id === source.id);
      if (!ready || !alone || !Number.isFinite(event.data.expires) || Date.now() >= event.data.expires) {
        event.ports[0].postMessage({ activating: false, version: VERSION }); return;
      }
      await self.skipWaiting();
      event.ports[0].postMessage({ activating: true, version: VERSION });
    } else if (event.data?.type === 'CONFIRM_VERSION' && event.data.version === VERSION && ready) {
      const versions = await caches.keys();
      for (const key of versions) {
        if (self.registration.installing || self.registration.waiting) break;
        if (key.startsWith(cachePrefix) && key !== cacheName) await caches.delete(key);
      }
      event.ports[0].postMessage({ confirmed: true, version: VERSION });
    }
  })());
});
