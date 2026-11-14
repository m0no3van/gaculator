// HEAD requests bypass the app's GET-only cache handler, including an older active Worker.
export async function checkReloadAvailable(url) {
  const scope = new URL('.', url);
  for (const path of ['index.html', 'sw.js', 'vendor/firebird-device/flash.img.gz']) {
    const target = new URL(path, scope);
    target.searchParams.set('pwa-reload', Date.now());
    const response = await fetch(target, { method: 'HEAD', cache: 'no-store', signal: AbortSignal.timeout(15000) });
    if (!response.ok || response.redirected) throw new Error('服务器资源不可用 / Server resources unavailable');
  }
}
