function bounded(work, milliseconds) {
  let timer;
  return Promise.race([work, new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error('Startup update timed out')), milliseconds);
  })]).finally(() => clearTimeout(timer));
}

function message(worker, data, milliseconds = 3000) {
  const channel = new MessageChannel();
  return bounded(new Promise(resolve => {
    channel.port1.onmessage = event => resolve(event.data);
    worker.postMessage(data, [channel.port2]);
  }), milliseconds).finally(() => channel.port1.close());
}

function state(worker, wanted, milliseconds) {
  let changed;
  const work = new Promise((resolve, reject) => {
    changed = () => {
      if (worker.state === wanted || (wanted === 'installed' && ['activating', 'activated'].includes(worker.state))) resolve();
      else if (worker.state === 'redundant') reject(new Error('Incomplete update cache'));
    };
    worker.addEventListener('statechange', changed); changed();
  });
  return bounded(work, milliseconds).finally(() => worker.removeEventListener('statechange', changed));
}

function firstInstall(registration) {
  const listeners = new Map(); let resolveInstall, rejectInstall;
  const installed = new Promise((resolve, reject) => { resolveInstall = resolve; rejectInstall = reject; });
  const watch = () => {
    const worker = registration.installing || registration.waiting || registration.active;
    if (!worker || listeners.has(worker)) return;
    const changed = () => {
      if (worker.state === 'activated') resolveInstall(worker);
      else if (worker.state === 'redundant') rejectInstall(new Error('Incomplete initial cache'));
    };
    listeners.set(worker, changed); worker.addEventListener('statechange', changed); changed();
  };
  registration.addEventListener('updatefound', watch); watch();
  return bounded(installed, 120000).finally(() => {
    registration.removeEventListener('updatefound', watch);
    for (const [worker, changed] of listeners) worker.removeEventListener('statechange', changed);
  });
}

function reload(version) {
  const target = new URL(window.location.href);
  if (target.searchParams.get('pwa-version') === version)
    throw new Error('更新页面切换失败，请关闭后重开 / Update page did not switch; close and reopen');
  target.searchParams.set('pwa-version', version);
  window.location.replace(target.href);
  return 'reloading';
}

export async function prepareOffline(report) {
  if (!window.isSecureContext || !('serviceWorker' in navigator)) {
    report('需要可信 HTTPS / Trusted HTTPS required'); return;
  }
  if (import.meta.env.DEV) { report('开发预览 / Development preview'); return; }
  let committed = false, current, documentVersion;
  const align = info => {
    if (info?.ready && documentVersion && info.version !== documentVersion) { committed = true; return reload(info.version); }
  };
  try {
    report('检查版本… / Checking for updates…');
    documentVersion = document.querySelector('meta[name="gaculator-build"]')?.content;
    const scope = new URL('./', window.location.href).href;
    let registration = await bounded(navigator.serviceWorker.getRegistration(scope), 4000);
    if (registration?.scope !== scope) registration = undefined;
    if (!registration) registration = await bounded(navigator.serviceWorker.register('./sw.js', {
      scope: './', updateViaCache: 'none',
    }), navigator.serviceWorker.controller?.scriptURL === new URL('./sw.js', window.location.href).href ? 4000 : 120000);
    let firstActive;
    if (!registration.active || registration.active.state !== 'activated') {
      report('准备离线… / Preparing offline…');
      firstActive = await firstInstall(registration);
    }
    const active = registration.active || firstActive;
    current = await message(active, 'CHECK', 10000);
    if (current.ready && documentVersion === current.version)
      await message(active, { type: 'CONFIRM_VERSION', version: documentVersion }).catch(() => {});
    try {
      await bounded(registration.update(), 4000);
      if (registration.installing) {
        report('下载更新… / Downloading update…');
        await state(registration.installing, 'installed', 20000);
      }
      const waiting = registration.waiting;
      if (waiting) {
        const next = await message(waiting, 'CHECK');
        if (!next.ready) throw new Error('Incomplete update cache');
        report('切换新版… / Applying update…');
        // After commit, never boot the old frontend while activation can still finish.
        committed = true;
        const result = await message(waiting, { type: 'ACTIVATE', expires: Date.now() + 3000 }, 4000);
        if (!result.activating) {
          committed = false;
          report('更新已下载，暂用当前版本 / Update downloaded; using current version');
          return align(current) || current.ready;
        }
        await state(waiting, 'activated', 10000);
        return reload(next.version);
      }
      const latest = await message(registration.active, 'CHECK');
      const switched = align(latest); if (switched) return switched;
    } catch (problem) {
      if (committed) throw problem;
      report('更新检查失败，使用当前版本 / Update check failed; using current version');
      return align(current) || current.ready;
    }
    report(current.ready ? '离线资源已就绪 / Offline assets ready' : '资源不完整，请联网重试 / Assets incomplete; reconnect');
    return current.ready;
  } catch (problem) {
    if (committed) throw new Error('更新切换未完成，请关闭后重开 / Update activation did not finish; close and reopen');
    if (!current && navigator.serviceWorker.controller?.scriptURL === new URL('./sw.js', window.location.href).href)
      current = await message(navigator.serviceWorker.controller, 'CHECK').catch(() => undefined);
    if (current?.ready) { report('更新检查失败，使用当前版本 / Update check failed; using current version'); return align(current) || true; }
    report('离线准备失败，请联网重试 / Offline setup failed; reconnect and retry');
    return current?.ready;
  }
}
