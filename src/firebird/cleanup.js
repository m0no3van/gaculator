import { saveNamespace } from './saves.js';

// Call only after stopping the emulator/closing its database, while holding the session lock.
export async function clearProjectData(url) {
  const scope = new URL('.', url).href;
  const registration = await navigator.serviceWorker?.getRegistration(scope);
  if (registration?.scope === scope) {
    const installing = registration.installing;
    await registration.unregister();
    if (installing && !['installed', 'activated', 'redundant'].includes(installing.state)) {
      await new Promise((resolve, reject) => {
        const finish = () => {
          if (['installed', 'activated', 'redundant'].includes(installing.state)) {
            clearTimeout(timer); installing.removeEventListener('statechange', finish); resolve();
          }
        };
        const timer = setTimeout(() => {
          installing.removeEventListener('statechange', finish);
          reject(new Error('缓存仍在下载，请重试 / Cache download still running; retry cleanup'));
        }, 120000);
        installing.addEventListener('statechange', finish); finish();
      });
    }
  }
  const prefix = `gaculator-${encodeURIComponent(scope)}-`;
  for (const name of await caches.keys()) if (name.startsWith(prefix)) await caches.delete(name);
  await new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(saveNamespace(url));
    request.onsuccess = resolve;
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('请关闭其他计算器窗口后重试 / Close other calculator windows and retry'));
  });
}
