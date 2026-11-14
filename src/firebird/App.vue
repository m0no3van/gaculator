<script setup>
import { onMounted, onBeforeUnmount, ref } from 'vue';
import Keypad from './Keypad.vue';
import { browserKey } from './keys.js';
import { openSaves, storedState, validateSave, saveNamespace } from './saves.js';
import { prepareOffline } from './offline.js';
import { clearProjectData } from './cleanup.js';

const canvas = ref(), ready = ref(false), error = ref(''), status = ref('正在准备… / Preparing…');
const offline = ref('');
const settings = ref(), preparing = ref(true), starting = ref(true), cleaning = ref(false), cleared = ref(false);
const namespace = saveNamespace(location.href);
let worker, db, device, latestSave, autosave, nextId = 0, saveWork, releaseLock, ownsLock = false;
const pending = new Map();
const post = (type, fields = {}) => worker?.postMessage({ type, ...fields });
const tap = value => { if (ready.value) post('tap', value); };
function save() {
  if (!ready.value || !db) return Promise.resolve();
  if (saveWork) return saveWork;
  saveWork = new Promise((resolve, reject) => {
    const id = ++nextId;
    const timeout = setTimeout(() => { pending.delete(id); reject(new Error('保存超时；保留上次存档 / Save timed out; previous save retained')); }, 30000);
    pending.set(id, { resolve, reject, timeout }); post('save', { id });
  }).finally(() => { saveWork = null; });
  return saveWork;
}
function showError(problem) { error.value = problem.message || String(problem); }
async function saveNow() { try { await save(); } catch (problem) { showError(problem); } }
async function clearData() {
  if (!confirm('永久删除此计算器的本机存档和离线缓存？无法撤销。\nPermanently delete this calculator’s local save and offline cache? This cannot be undone.')) return;
  cleaning.value = true;
  try {
    const remove = async () => {
      clearInterval(autosave); ready.value = false;
      worker?.terminate(); worker = null;
      for (const entry of pending.values()) { clearTimeout(entry.timeout); entry.reject(new Error('清理已停止保存 / Cleanup stopped saving')); }
      pending.clear();
      await saveWork?.catch(() => {});
      db?.close(); db = null;
      await clearProjectData(location.href);
      latestSave = null;
      canvas.value.getContext('2d').clearRect(0, 0, 320, 240);
      cleared.value = true; error.value = '';
    };
    if (ownsLock) await remove();
    else if (navigator.locks) await navigator.locks.request(`${namespace}-session`, { ifAvailable: true }, async lock => {
      if (!lock) throw new Error('请关闭另一个计算器窗口后重试 / Close the other calculator window and retry');
      await remove();
    });
    else throw new Error('需要支持 Web Locks 的安全浏览器 / Secure browser with Web Locks required');
  } catch (problem) { showError(problem); }
  finally { cleaning.value = false; }
}
async function visibility() {
  if (!ready.value) return;
  if (document.hidden) {
    try { await save(); post('pause', { value: document.hidden }); } catch (problem) { showError(problem); }
  } else post('pause', { value: false });
}
function keyboard(event) {
  if (!ready.value || settings.value?.open || event.target.closest('input, textarea, select, button, a')) return;
  const value = browserKey(event);
  if (value) { event.preventDefault(); if (!event.repeat) tap(value); }
}
async function start() {
  const response = await fetch(new URL('vendor/firebird-device/device.json', location.href));
  if (!response.ok) throw new Error('镜像包缺失；先运行构建 / Missing device package; build first');
  device = await response.json();
  db = await openSaves(namespace); latestSave = await storedState(db);
  if (latestSave) validateSave(latestSave, device.identity);
  worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
  const crashed = message => {
    ready.value = false; error.value = message;
    for (const entry of pending.values()) { clearTimeout(entry.timeout); entry.reject(new Error(message)); }
    pending.clear();
  };
  worker.onerror = event => crashed(event.message || 'Emulator Worker crashed; previous save retained.');
  worker.onmessage = async ({ data }) => {
    if (data.type === 'frame') {
      canvas.value.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(data.bytes.buffer), 320, 240), 0, 0);
      post('frame-drawn');
    }
    else if (data.type === 'status') status.value = data.message;
    else if (data.type === 'ready') { ready.value = true; status.value = `${device.model} · OS ${device.os} · 本机运行 / Local emulation`; if (document.hidden) visibility(); }
    else if (data.type === 'error') crashed(data.message);
    else if (data.type === 'saved' || data.type === 'save-error') {
      const request = pending.get(data.id); if (!request) return;
      pending.delete(data.id); clearTimeout(request.timeout);
      try {
        if (data.type === 'save-error') throw new Error(data.message);
        validateSave(data.value, device.identity); await storedState(db, data.value); latestSave = data.value;
        request.resolve();
      } catch (problem) { request.reject(problem); }
    }
  };
  post('boot', { base: new URL('.', location.href).href, device, save: latestSave });
  autosave = setInterval(saveNow, 30000);
  navigator.storage?.persist?.().catch(() => {});
}
onMounted(async () => {
  window.addEventListener('keydown', keyboard);
  document.addEventListener('visibilitychange', visibility);
  // Finish the first precache before the Worker fetches the same large NAND.
  await prepareOffline(message => { offline.value = message; });
  preparing.value = false;
  try {
    if (!navigator.locks) throw new Error('需要支持 Web Locks 的安全浏览器 / Secure browser with Web Locks required');
    navigator.locks.request(`${namespace}-session`, { ifAvailable: true }, async lock => {
      if (!lock) throw new Error('请关闭另一个计算器窗口 / Close the other calculator window');
      ownsLock = true;
      try {
        await start(); starting.value = false;
        await new Promise(resolve => { releaseLock = resolve; });
      } finally { ownsLock = false; }
    }).catch(problem => { starting.value = false; showError(problem); });
  } catch (problem) { starting.value = false; showError(problem); }
});
onBeforeUnmount(() => {
  clearInterval(autosave); worker?.terminate(); db?.close(); releaseLock?.();
  window.removeEventListener('keydown', keyboard);
  document.removeEventListener('visibilitychange', visibility);
});
</script>
<template>
  <main>
    <section class="display-dock">
      <div class="lcd-frame">
        <canvas ref="canvas" width="320" height="240" tabindex="0" aria-label="计算器屏幕 / Calculator screen" :aria-busy="!ready"></canvas>
        <button class="settings-button" type="button" aria-label="缓存与清理 / Cache and cleanup" @click="settings.showModal()">⋯</button>
        <template v-if="!ready && !error && !cleared">
          <span class="screen-loading" aria-hidden="true"></span>
          <p class="screen-status">{{ preparing ? offline : status }}</p>
        </template>
        <p v-if="cleared" class="screen-status">本项目数据已清除，可删除主屏幕图标。<br>Project data cleared. You can remove the Home Screen icon.</p>
        <p v-if="error" role="alert" class="screen-error">{{ error }}</p>
      </div>
      <p class="sr-only" role="status">{{ status }} {{ offline }}</p>
    </section>
    <Keypad :inert="!ready" @tap="tap" @touch="value => post('touch', value)"/>
    <dialog ref="settings" class="settings-dialog" aria-labelledby="settings-title" @cancel="event => { if (cleaning) event.preventDefault(); }">
      <h2 id="settings-title">缓存与清理 / Cache and cleanup</h2>
      <p role="status">{{ cleared ? '本项目缓存与存档已清除 / Project cache and save removed' : offline }}</p>
      <p>首次下载约 20 MB 镜像；缓存完成后从本机加载。每次仍需解压、初始化模拟器。</p>
      <p>The first download includes about 20 MB of device images. Later launches use the local cache, then decompress and initialize the emulator.</p>
      <p>卸载前可在此永久删除本项目的离线缓存、存档及离线服务。请在主屏幕应用内执行；Safari 与已安装应用可能使用不同的存储空间。仅删除图标不能保证清除 Safari 数据。</p>
      <p>Before uninstalling, clear this project’s cache, save and offline service here inside the Home Screen app. Safari may use separate storage. Removing an icon does not guarantee removal of Safari data.</p>
      <p>要清理 Safari 的副本：设置 → App → Safari → 高级 → 网站数据，删除对应站点。此操作可能同时删除同域名其他网页的数据。</p>
      <p>For Safari’s copy: Settings → Apps → Safari → Advanced → Website Data; remove the site. This may also clear other pages on the same domain.</p>
      <p v-if="error" role="alert">{{ error }}</p>
      <div class="settings-actions">
        <button type="button" :disabled="preparing || starting || cleaning || cleared" @click="clearData">{{ cleaning ? '清理中… / Clearing…' : '清除本机数据 / Clear local data' }}</button>
        <button type="button" autofocus :disabled="cleaning" @click="settings.close()">关闭 / Close</button>
      </div>
    </dialog>
  </main>
</template>
