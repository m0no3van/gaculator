export async function prepareOffline(report) {
  if (!window.isSecureContext || !('serviceWorker' in navigator)) {
    report('需要可信 HTTPS / Trusted HTTPS required'); return;
  }
  if (import.meta.env.DEV) { report('开发预览 / Development preview'); return; }
  try {
    report('准备离线… / Preparing offline…');
    const registration = await navigator.serviceWorker.register('./sw.js', { scope: './', updateViaCache: 'none' });
    let rejectInstall;
    const failedInstall = new Promise((_, reject) => { rejectInstall = reject; });
    const update = () => {
      if (registration.waiting) report('更新就绪，保存后关闭所有窗口再打开 / Update ready; save and close all windows');
    };
    const watch = () => {
      const installing = registration.installing;
      if (!installing) return;
      installing.addEventListener('statechange', () => {
        if (installing.state === 'redundant') {
          if (!registration.active) rejectInstall(new Error('Incomplete initial cache'));
          else report('更新准备失败，保留现有版本 / Update failed; current version retained');
        }
        update();
      });
    };
    watch();
    registration.addEventListener('updatefound', watch);
    const check = () => new Promise(resolve => {
      const channel = new MessageChannel();
      const finish = (message, ready = false) => { clearTimeout(timer); channel.port1.close(); report(message); resolve(ready); };
      const timer = setTimeout(() => finish('离线检查失败，请重试 / Offline check failed; retry'), 10000);
      channel.port1.onmessage = ({ data }) => {
        finish(data.ready ? '离线资源已就绪 / Offline assets ready' : '资源不完整，请联网重试 / Assets incomplete; reconnect', data.ready);
      };
      registration.active.postMessage('CHECK', [channel.port2]);
    });
    navigator.serviceWorker.addEventListener('controllerchange', check);
    let timeout;
    try {
      await Promise.race([navigator.serviceWorker.ready, failedInstall, new Promise((_, reject) => {
        timeout = setTimeout(() => reject(new Error('Offline installation timed out')), 120000);
      })]);
    } finally { clearTimeout(timeout); }
    const ready = await check();
    update();
    return ready;
  } catch { report('离线准备失败，请联网重试 / Offline setup failed; reconnect and retry'); }
}
