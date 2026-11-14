<script setup>
import { onBeforeUnmount, onMounted, ref } from 'vue';
import { keyFeedback, vibrateFeedback } from './haptics.js';
import { createOnHold } from './on-hold.js';
import { createKeyActivation } from './key-activation.js';
const props = defineProps({ item: Object, pressed: Boolean, number: Boolean });
const emit = defineEmits(['press', 'reload-request']);
const active = ref(false);
let timer, pointerId;
function activate() {
  vibrateFeedback(keyFeedback(props.item.name));
  active.value = true; clearTimeout(timer); timer = setTimeout(() => { active.value = false; }, 90);
  emit('press', props.item.name);
}
const activation = createKeyActivation(activate);
const hold = createOnHold(activate, () => {
  active.value = false; emit('reload-request');
}, () => vibrateFeedback('reload'));
// Abort the hold without turning its eventual captured release into a short ON tap.
const stopHold = () => { hold.cancel(); active.value = false; };
const cancel = () => { pointerId = undefined; stopHold(); activation.cancel(); };
const lostCapture = event => { if (event.pointerId === pointerId) stopHold(); };
const visibility = () => { if (document.hidden) stopHold(); };
const otherPointer = event => {
  if (hold.pointerId !== undefined && event.pointerId !== hold.pointerId) stopHold();
};
function down(event) {
  if (event.button !== 0 || event.isPrimary === false || !inside(event)) return;
  if (pointerId !== undefined) cancel();
  event.preventDefault();
  if (props.item.name === 'on') {
    if (!hold.start(event)) return;
    activation.markPointer(); active.value = true;
  } else activation.pointerDown(event);
  pointerId = event.pointerId;
  event.currentTarget.setPointerCapture(pointerId);
}
function up(event) {
  if (event.pointerId !== pointerId) return;
  pointerId = undefined; hold.end(event);
}
function keydown(event) {
  if (!['Enter', ' '].includes(event.key)) return;
  activation.keyboard();
  if (props.item.name === 'on') {
    event.preventDefault();
    if (!event.repeat && hold.startKey(event)) active.value = true;
  }
}
function keyup(event) {
  if (props.item.name === 'on' && ['Enter', ' '].includes(event.key)) {
    event.preventDefault(); activation.consumeDefault(); hold.endKey(event);
  }
}
function inside(event) {
  const rect = event.currentTarget.getBoundingClientRect();
  return event.clientX >= rect.left && event.clientX <= rect.right && event.clientY >= rect.top && event.clientY <= rect.bottom;
}
function move(event) {
  if (hold.pointerId === event.pointerId && !inside(event)) stopHold();
}
onMounted(() => {
  window.addEventListener('blur', stopHold);
  document.addEventListener('visibilitychange', visibility);
  if (props.item.name === 'on') window.addEventListener('pointerdown', otherPointer, true);
});
onBeforeUnmount(() => {
  clearTimeout(timer); cancel(); activation.reset();
  window.removeEventListener('blur', stopHold);
  document.removeEventListener('visibilitychange', visibility);
  if (props.item.name === 'on') window.removeEventListener('pointerdown', otherPointer, true);
});
</script>
<template>
  <span v-if="!item.name" class="hh-spacer"></span>
  <span v-else class="hh-key-wrap">
    <span v-if="item.legend" class="hh-legend" aria-hidden="true">{{ item.legend }}</span>
    <button type="button" class="hh-key"
      :class="{ 'hh-number': number, 'hh-active': active }" :data-key="item.name" :data-feedback="keyFeedback(item.name)"
      :aria-label="item.name === 'space' ? 'space' : item.label" :aria-pressed="['ctrl', 'shift'].includes(item.name) ? pressed : undefined"
      :title="item.name === 'plus' ? 'Shift + plus: 积分 / Integral' : item.name === 'minus' ? 'Shift + minus: 求导 / Derivative' : undefined"
      @pointerdown="down" @pointermove="move" @pointerup="up"
      @pointercancel="cancel" @lostpointercapture="lostCapture" @contextmenu.prevent
      @keydown="keydown" @keyup="keyup"
      @click="activation.fallback">
      <span class="hh-face">
        <svg v-if="item.label === 'book'" viewBox="0 0 38 30" aria-label="Catalog"><path d="M19 6Q11 1 3 4V25Q11 22 19 27Q27 22 35 25V4Q27 1 19 6V27"/></svg>
        <span v-else>{{ item.label }}</span>
      </span>
    </button>
  </span>
</template>
