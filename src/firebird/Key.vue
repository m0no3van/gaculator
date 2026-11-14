<script setup>
import { onBeforeUnmount, onMounted, ref } from 'vue';
import { keyFeedback, supportsSwitchHaptics, vibrateFeedback } from './haptics.js';
import { createOnHold } from './on-hold.js';
import { createKeyActivation } from './key-activation.js';
const props = defineProps({ item: Object, pressed: Boolean, number: Boolean });
const emit = defineEmits(['press', 'reload-request']);
const nativeSwitch = props.item.name !== 'on' && supportsSwitchHaptics();
const active = ref(false);
let timer;
function activate() {
  vibrateFeedback(keyFeedback(props.item.name));
  active.value = true; clearTimeout(timer); timer = setTimeout(() => { active.value = false; }, 90);
  emit('press', props.item.name);
}
const activation = createKeyActivation(activate);
const hold = createOnHold(activate, () => {
  active.value = false; emit('reload-request');
}, () => vibrateFeedback('reload'));
const cancel = () => {
  hold.cancel(); active.value = false;
  if (props.item.name === 'on') activation.cancel(true);
};
const pointerCancelled = () => { cancel(); activation.cancel(nativeSwitch); };
const lostCapture = () => { if (hold.pointerId !== undefined) cancel(); else active.value = false; };
const visibility = () => { if (document.hidden) cancel(); };
const otherPointer = event => {
  if (hold.pointerId !== undefined && event.pointerId !== hold.pointerId) cancel();
};
function down(event) {
  if (event.button !== 0) return;
  if (props.item.name === 'on') {
    event.preventDefault();
    if (hold.start(event)) { activation.markPointer(); active.value = true; event.currentTarget.setPointerCapture(event.pointerId); }
  } else if (!nativeSwitch) { event.preventDefault(); activation.pointerDown(event); }
}
function keydown(event) {
  if (!['Enter', ' '].includes(event.key)) return;
  activation.keyboard();
  if (props.item.name === 'on') {
    event.preventDefault();
    if (!event.repeat && hold.startKey(event)) active.value = true;
  } else if (nativeSwitch && event.key === 'Enter') {
    event.preventDefault(); if (!event.repeat) activate();
  }
}
function keyup(event) {
  if (props.item.name === 'on' && ['Enter', ' '].includes(event.key)) {
    event.preventDefault(); activation.consumeDefault(); hold.endKey(event);
  }
}
function move(event) {
  if (hold.pointerId !== event.pointerId) return;
  const rect = event.currentTarget.getBoundingClientRect();
  if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) cancel();
}
onMounted(() => {
  if (props.item.name !== 'on') return;
  window.addEventListener('blur', cancel);
  window.addEventListener('pointerdown', otherPointer, true);
  document.addEventListener('visibilitychange', visibility);
});
onBeforeUnmount(() => {
  clearTimeout(timer); cancel(); activation.reset();
  if (props.item.name !== 'on') return;
  window.removeEventListener('blur', cancel);
  window.removeEventListener('pointerdown', otherPointer, true);
  document.removeEventListener('visibilitychange', visibility);
});
</script>
<template>
  <span v-if="!item.name" class="hh-spacer"></span>
  <span v-else class="hh-key-wrap">
    <span v-if="item.legend" class="hh-legend" aria-hidden="true">{{ item.legend }}</span>
    <component :is="nativeSwitch ? 'label' : 'button'" :type="nativeSwitch ? undefined : 'button'" class="hh-key"
      :class="{ 'hh-number': number, 'hh-active': active }" :data-key="item.name" :data-feedback="keyFeedback(item.name)"
      :aria-label="nativeSwitch ? undefined : item.name === 'space' ? 'space' : item.label" :aria-pressed="!nativeSwitch && ['ctrl', 'shift'].includes(item.name) ? pressed : undefined"
      :title="item.name === 'plus' ? 'Shift + plus: 积分 / Integral' : item.name === 'minus' ? 'Shift + minus: 求导 / Derivative' : undefined"
      @pointerdown="down" @pointermove="move" @pointerup="hold.end"
      @pointercancel="pointerCancelled" @lostpointercapture="lostCapture" @contextmenu.prevent
      @keydown="keydown" @keyup="keyup"
      @click="() => { if (!nativeSwitch) activation.fallback(); }">
      <input v-if="nativeSwitch" class="native-haptic" type="checkbox" switch role="button" :aria-label="item.name === 'space' ? 'space' : item.label"
        :aria-pressed="['ctrl', 'shift'].includes(item.name) ? pressed : undefined" @pointerdown.stop="activation.pointerDown"
        @click.stop @change="activation.fallback">
      <span class="hh-face">
        <svg v-if="item.label === 'book'" viewBox="0 0 38 30" aria-label="Catalog"><path d="M19 6Q11 1 3 4V25Q11 22 19 27Q27 22 35 25V4Q27 1 19 6V27"/></svg>
        <span v-else>{{ item.label }}</span>
      </span>
    </component>
  </span>
</template>
