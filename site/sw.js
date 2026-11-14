const VERSION="8bf893c9b2abfafb";
const ASSETS=["assets/index-C0imWdoj.js","assets/index-DkJaxAvL.css","assets/worker-Be7cPeDW.js","icon-192.png","icon-512.png","icon.svg","index.html","manifest.webmanifest","vendor/firebird-device/boot1.img.gz","vendor/firebird-device/device.json","vendor/firebird-device/flash.img.gz","vendor/firebird/LICENSE.txt","vendor/firebird/build.json","vendor/firebird/compiler-notices.txt","vendor/firebird/firebird.mjs","vendor/firebird/firebird.wasm","vendor/firebird/frontend-notices.txt","vendor/firebird/source.zip"];
const HASHES={"assets/index-C0imWdoj.js":"77cee653666585425176220e684aa2a2e1155fcd91cacf29dd9e48308e32e68d","assets/index-DkJaxAvL.css":"bcd4094d73aba8eb3242e637959125872cea43a726eee2e689d47cc69a8cb180","assets/worker-Be7cPeDW.js":"49303b7ab5531d6abc3cd32b743a04547a6337b43f8f3b6db0a493b87223a13b","icon-192.png":"7495fc1fc274174b163833b123bd09b9f3c04d161555a68e34084f1a613e9035","icon-512.png":"7844f0efd8aa2aa53859ca1e9b64a8bf640c9cd0b455945b3a3f7e25ff08b03a","icon.svg":"b3c1aeab57374cc76ed8dd19d3e784fe1281ec89c17fa46aab9c65a8e32d975c","index.html":"032647828219d45f32592bb4f07e7d97e5f099487dbb1b6b156e7fbf3186e257","manifest.webmanifest":"aa8d0d7004381513039cfd647f66c7437803ce67edcafb178fb54a173543c1ff","vendor/firebird-device/boot1.img.gz":"c05d29e284adfbac87b106e56425772f150e0f5ce5d4d6f7e07009b6d93ae29f","vendor/firebird-device/device.json":"c45548c28729f3c455299f5d5e798fa3677bd219b7e339af5108a8fcf687ebcc","vendor/firebird-device/flash.img.gz":"05ac362fc5cbfc2bd10d35a496c3e6babb1b3c03b40c7818794c3410256727ea","vendor/firebird/LICENSE.txt":"8ceb4b9ee5adedde47b31e975c1d90c73ad27b6b165a1dcd80c7c545eb65b903","vendor/firebird/build.json":"65ce393c6fe970d61ef4892d4cb28b5612d1764164850b652c98a8faa48cfd1a","vendor/firebird/compiler-notices.txt":"0d51fc16cb0e58b9a9880ae6617ac58f1c6588f2bcc10ae5e3ce3c1f6808f8bf","vendor/firebird/firebird.mjs":"91eba38a028b77fb3237deb368713205c2e596a5cfaf7a3b2935c9671602d7f4","vendor/firebird/firebird.wasm":"a82e4f828435e36c0869b017446cd1373bcb17cd3a649b931495323198632b93","vendor/firebird/frontend-notices.txt":"913013ac5797f151774ccfba0b7424ae79aa9019f453b6954fa7ee50c1895a5c","vendor/firebird/source.zip":"fe3fe246264507db367cdd929cffe3ce4e43b8d7eb54ba269fb6a0a3dbf9c1c2"};
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
