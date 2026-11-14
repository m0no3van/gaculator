<script setup>
import { onBeforeUnmount, onMounted, ref } from 'vue';
import { keyFeedback, supportsSwitchHaptics, vibrateFeedback } from './haptics.js';
import { createOnHold } from './on-hold.js';
import { createKeyActivation } from './key-activation.js';
const props = defineProps({ item: Object, pressed: Boolean, number: Boolean });
const emit = defineEmits(['press', 'reload-request']);
const nativeSwitch = props.item.name !== 'on' && supportsSwitchHaptics();
const active = ref(false);
let timer, pointerId, nativePress = false, pointerFeedback = false;
function activate() {
  vibrateFeedback(keyFeedback(props.item.name));
  active.value = true; clearTimeout(timer);
  if (!pointerFeedback) timer = setTimeout(() => { active.value = false; }, 90);
  emit('press', props.item.name);
}
function clearFeedback() { clearTimeout(timer); pointerFeedback = false; active.value = false; }
const activation = createKeyActivation(activate);
const hold = createOnHold(activate, () => {
  clearFeedback(); emit('reload-request');
}, () => vibrateFeedback('reload'));
// Abort the hold without turning its eventual captured release into a short ON tap.
const stopHold = () => { hold.cancel(); clearFeedback(); };
const cancel = () => { pointerId = undefined; nativePress = false; stopHold(); activation.cancel(); };
const lostCapture = event => { if (event.pointerId === pointerId) stopHold(); };
const visibility = () => { if (document.hidden) stopHold(); };
const otherPointer = event => {
  if (hold.pending || (hold.pointerId !== undefined && event.pointerId !== hold.pointerId)) stopHold();
};
const otherKey = () => { if (hold.pending) stopHold(); };
function down(event) {
  if (event.button !== 0 || (event.isPrimary === false && event.pointerType !== 'touch') || !inside(event)) {
    if (nativeSwitch) { nativePress = false; event.preventDefault(); }
    return;
  }
  if (pointerId !== undefined) cancel();
  pointerId = event.pointerId; pointerFeedback = true;
  if (!nativeSwitch) event.preventDefault();
  if (props.item.name === 'on') {
    if (!hold.start(event)) { pointerId = undefined; pointerFeedback = false; return; }
    activation.markPointer(); clearTimeout(timer); active.value = true;
  } else activation.pointerDown(event);
  nativePress = nativeSwitch;
  event.currentTarget.setPointerCapture(pointerId);
}
function up(event) {
  if (event.pointerId !== pointerId) return;
  pointerId = undefined; hold.end(event); clearFeedback();
}
function keydown(event) {
  if (!['Enter', ' '].includes(event.key)) return;
  nativePress = false;
  activation.keyboard();
  if (props.item.name === 'on') {
    event.preventDefault();
    if (!event.repeat && hold.startKey(event)) { clearTimeout(timer); active.value = true; }
  } else if (nativeSwitch && event.key === 'Enter') {
    event.preventDefault(); if (!event.repeat) activate();
  }
}
function clicked(event) {
  if (!nativeSwitch) { activation.fallback(event); return; }
  // Only an owned label tap may forward native activation to its clipped switch.
  if (!nativePress) event.preventDefault();
  nativePress = false;
}
function keyup(event) {
  if (props.item.name === 'on' && ['Enter', ' '].includes(event.key)) {
    event.preventDefault(); activation.consumeDefault(); hold.endKey(event); clearFeedback();
  }
}
function inside(event) {
  const rect = event.currentTarget.getBoundingClientRect();
  return event.clientX >= rect.left && event.clientX <= rect.right && event.clientY >= rect.top && event.clientY <= rect.bottom;
}
function move(event) {
  if (pointerId === event.pointerId && !inside(event)) stopHold();
}
onMounted(() => {
  window.addEventListener('blur', stopHold);
  document.addEventListener('visibilitychange', visibility);
  if (props.item.name === 'on') {
    window.addEventListener('pointerdown', otherPointer, true);
    window.addEventListener('keydown', otherKey, true);
  }
});
onBeforeUnmount(() => {
  clearTimeout(timer); cancel(); activation.reset();
  window.removeEventListener('blur', stopHold);
  document.removeEventListener('visibilitychange', visibility);
  if (props.item.name === 'on') {
    window.removeEventListener('pointerdown', otherPointer, true);
    window.removeEventListener('keydown', otherKey, true);
  }
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
      @pointerdown="down" @pointermove="move" @pointerup="up"
      @pointercancel="cancel" @lostpointercapture="lostCapture" @contextmenu.prevent
      @keydown="keydown" @keyup="keyup"
      @click="clicked">
      <input v-if="nativeSwitch" class="native-haptic" type="checkbox" switch role="button"
        :aria-label="item.name === 'space' ? 'space' : item.label" :aria-pressed="['ctrl', 'shift'].includes(item.name) ? pressed : undefined"
        @click.stop @change="activation.fallback">
      <span class="hh-face">
        <svg v-if="item.label === 'book'" viewBox="0 0 38 30" aria-label="Catalog"><path d="M19 6Q11 1 3 4V25Q11 22 19 27Q27 22 35 25V4Q27 1 19 6V27"/></svg>
        <span v-else>{{ item.label }}</span>
      </span>
    </component>
  </span>
</template>
