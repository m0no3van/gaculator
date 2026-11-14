<script setup>
import { onMounted, onBeforeUnmount, ref } from 'vue';
import Keypad from './Keypad.vue';
import { browserKey } from './keys.js';
import { openSaves, storedState, validateSave, saveNamespace } from './saves.js';
import { prepareOffline } from './offline.js';
import { clearProjectData } from './cleanup.js';
import { checkReloadAvailable } from './reload.js';
import { reloadMessages } from './dialogs.js';
import { createAutosave } from './autosave.js';

const canvas = ref(), ready = ref(false), error = ref(''), status = ref('正在准备… / Preparing…');
const offline = ref('');
const preparing = ref(true), starting = ref(true), cleaning = ref(false), cleared = ref(false);
const namespace = saveNamespace(location.href);
let worker, db, device, latestSave, autosave, nextId = 0, saveWork, releaseLock, ownsLock = false;
const pending = new Map();
const post = (type, fields = {}) => worker?.postMessage({ type, ...fields });
const tap = value => { if (ready.value) { autosave?.changed(); post('tap', value); } };
const touch = value => { if (ready.value) { autosave?.changed(value.contact); post('touch', value); } };
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
async function reloadPwa() {
  if (preparing.value || starting.value || cleaning.value || cleared.value) return;
  const messages = reloadMessages();
  if (!window.confirm(messages.confirm)) return;
  cleaning.value = true;
  let stopped = false;
  try {
    await checkReloadAvailable(location.href);
    const remove = async () => {
      stopped = true;
      autosave?.stop(); ready.value = false;
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
    const target = new URL('index.html', location.href);
    target.searchParams.set('pwa-reload', Date.now());
    location.replace(target.href);
  } catch (problem) {
    if (!stopped) window.alert(messages.unavailable);
    else showError(new Error(messages.failed));
  }
  finally { cleaning.value = false; }
}
async function visibility() {
  if (!ready.value) return;
  if (document.hidden) {
    try { await autosave.flush(() => document.hidden); post('pause', { value: document.hidden }); } catch (problem) { showError(problem); }
  } else post('pause', { value: false });
}
function keyboard(event) {
  if (!ready.value || event.target.closest('input, textarea, select, button, a')) return;
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
    autosave?.stop(); ready.value = false; error.value = message;
    for (const entry of pending.values()) { clearTimeout(entry.timeout); entry.reject(new Error(message)); }
    pending.clear();
  };
  worker.onerror = event => crashed(event.message || 'Emulator Worker crashed; previous save retained.');
  worker.onmessage = async ({ data }) => {
    if (data.type === 'frame') {
      canvas.value.getContext('2d', { alpha: false }).putImageData(new ImageData(new Uint8ClampedArray(data.bytes.buffer), 320, data.height), 0, data.y);
      post('frame-drawn');
    }
    else if (data.type === 'status') status.value = data.message;
    else if (data.type === 'ready') {
      ready.value = true; autosave = createAutosave(save, showError);
      status.value = `${device.model} · OS ${device.os} · 本机运行 / Local emulation`; if (document.hidden) visibility();
    }
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
  navigator.storage?.persist?.().catch(() => {});
}
onMounted(async () => {
  window.addEventListener('keydown', keyboard);
  document.addEventListener('visibilitychange', visibility);
  try {
    if (!navigator.locks) throw new Error('需要支持 Web Locks 的安全浏览器 / Secure browser with Web Locks required');
    navigator.locks.request(`${namespace}-session`, { ifAvailable: true }, async lock => {
      if (!lock) throw new Error('请关闭另一个计算器窗口 / Close the other calculator window');
      ownsLock = true;
      try {
        // Check/switch versions only while no other emulator can be writing a save.
        if (await prepareOffline(message => { offline.value = message; }) === 'reloading') return;
        preparing.value = false;
        await start(); starting.value = false;
        await new Promise(resolve => { releaseLock = resolve; });
      } finally { ownsLock = false; }
    }).catch(problem => { preparing.value = starting.value = false; showError(problem); });
  } catch (problem) { preparing.value = starting.value = false; showError(problem); }
});
onBeforeUnmount(() => {
  autosave?.stop(); worker?.terminate(); db?.close(); releaseLock?.();
  window.removeEventListener('keydown', keyboard);
  document.removeEventListener('visibilitychange', visibility);
});
</script>
<template>
  <main>
    <section class="display-dock">
      <div class="lcd-frame">
        <canvas ref="canvas" width="320" height="240" tabindex="0" aria-label="计算器屏幕 / Calculator screen" :aria-busy="!ready"></canvas>
        <template v-if="!ready && !error && !cleared">
          <span class="screen-loading" aria-hidden="true"></span>
          <p class="screen-status">{{ preparing ? offline : status }}</p>
        </template>
        <p v-if="error" role="alert" class="screen-error">{{ error }}</p>
      </div>
      <p class="sr-only" role="status">{{ status }} {{ offline }}</p>
    </section>
    <Keypad :inert="!ready" @tap="tap" @touch="touch" @reload-request="reloadPwa"/>
  </main>
</template>
