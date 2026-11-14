const VERSION="65ca594aaa8afe54";
const ASSETS=["assets/index-BK05paKM.js","assets/index-DkJaxAvL.css","assets/worker-W50bPPDV.js","icon-192.png","icon-512.png","icon.svg","index.html","manifest.webmanifest","vendor/firebird-device/boot1.img.gz","vendor/firebird-device/device.json","vendor/firebird-device/flash.img.gz","vendor/firebird/LICENSE.txt","vendor/firebird/build.json","vendor/firebird/compiler-notices.txt","vendor/firebird/firebird.mjs","vendor/firebird/firebird.wasm","vendor/firebird/frontend-notices.txt","vendor/firebird/source.zip"];
const HASHES={"assets/index-BK05paKM.js":"c5f377e7e1c1489aa5e7f318f11d61b08f3e9605c42d675ea6035350d6b75015","assets/index-DkJaxAvL.css":"bcd4094d73aba8eb3242e637959125872cea43a726eee2e689d47cc69a8cb180","assets/worker-W50bPPDV.js":"0bb37fe5f6cb88fd7c118ab3ed7a4bf63be406c208c3d06296d3b1535e8bb1f2","icon-192.png":"7495fc1fc274174b163833b123bd09b9f3c04d161555a68e34084f1a613e9035","icon-512.png":"7844f0efd8aa2aa53859ca1e9b64a8bf640c9cd0b455945b3a3f7e25ff08b03a","icon.svg":"b3c1aeab57374cc76ed8dd19d3e784fe1281ec89c17fa46aab9c65a8e32d975c","index.html":"3aed1098d2d0aa96f60966760fee0f6987ed0921890ce4b918648ccfc07b4357","manifest.webmanifest":"aa8d0d7004381513039cfd647f66c7437803ce67edcafb178fb54a173543c1ff","vendor/firebird-device/boot1.img.gz":"c05d29e284adfbac87b106e56425772f150e0f5ce5d4d6f7e07009b6d93ae29f","vendor/firebird-device/device.json":"c45548c28729f3c455299f5d5e798fa3677bd219b7e339af5108a8fcf687ebcc","vendor/firebird-device/flash.img.gz":"05ac362fc5cbfc2bd10d35a496c3e6babb1b3c03b40c7818794c3410256727ea","vendor/firebird/LICENSE.txt":"8ceb4b9ee5adedde47b31e975c1d90c73ad27b6b165a1dcd80c7c545eb65b903","vendor/firebird/build.json":"65ce393c6fe970d61ef4892d4cb28b5612d1764164850b652c98a8faa48cfd1a","vendor/firebird/compiler-notices.txt":"0d51fc16cb0e58b9a9880ae6617ac58f1c6588f2bcc10ae5e3ce3c1f6808f8bf","vendor/firebird/firebird.mjs":"91eba38a028b77fb3237deb368713205c2e596a5cfaf7a3b2935c9671602d7f4","vendor/firebird/firebird.wasm":"a82e4f828435e36c0869b017446cd1373bcb17cd3a649b931495323198632b93","vendor/firebird/frontend-notices.txt":"913013ac5797f151774ccfba0b7424ae79aa9019f453b6954fa7ee50c1895a5c","vendor/firebird/source.zip":"07e80fdc3acf7ba0579610d4f74188cea815c7451aaf5eb7af4eb5b2f595b59e"};
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
