<script setup>
import { onBeforeUnmount, ref } from 'vue';
import { keyFeedback, supportsSwitchHaptics, vibrateFeedback } from './haptics.js';
const props = defineProps({ item: Object, pressed: Boolean, number: Boolean });
const emit = defineEmits(['press']);
const nativeSwitch = supportsSwitchHaptics();
const active = ref(false);
let timer;
function activate() {
  vibrateFeedback(keyFeedback(props.item.name));
  active.value = true; clearTimeout(timer); timer = setTimeout(() => { active.value = false; }, 90);
  emit('press', props.item.name);
}
onBeforeUnmount(() => clearTimeout(timer));
</script>
<template>
  <span v-if="!item.name" class="hh-spacer"></span>
  <span v-else class="hh-key-wrap">
    <span v-if="item.legend" class="hh-legend" aria-hidden="true">{{ item.legend }}</span>
    <component :is="nativeSwitch ? 'label' : 'button'" :type="nativeSwitch ? undefined : 'button'" class="hh-key"
      :class="{ 'hh-number': number, 'hh-active': active }" :data-key="item.name" :data-feedback="keyFeedback(item.name)"
      :aria-label="nativeSwitch ? undefined : item.name === 'space' ? 'space' : item.label" :aria-pressed="!nativeSwitch && ['ctrl', 'shift'].includes(item.name) ? pressed : undefined"
      :title="item.name === 'plus' ? 'Shift + plus: 积分 / Integral' : item.name === 'minus' ? 'Shift + minus: 求导 / Derivative' : undefined"
      @pointerdown="event => { if (!nativeSwitch && event.button === 0) { event.preventDefault(); activate(); } }"
      @click="event => { if (!nativeSwitch && event.detail === 0) activate(); }">
      <input v-if="nativeSwitch" class="native-haptic" type="checkbox" switch role="button" :aria-label="item.name === 'space' ? 'space' : item.label"
        :aria-pressed="['ctrl', 'shift'].includes(item.name) ? pressed : undefined" @pointerdown="event => { if (event.button === 0) activate(); }"
        @click.stop="event => { if (event.detail === 0) activate(); }" @keydown.enter.prevent="activate">
      <span class="hh-face">
        <svg v-if="item.name === 'pad'" viewBox="0 0 38 30" aria-hidden="true"><path d="M6 5H30L26 25H2ZM10 5L6 25M14 5L10 25M18 5L14 25M22 5L18 25M26 5L22 25"/></svg>
        <svg v-else-if="item.name === 'metrix'" viewBox="0 0 38 30" aria-hidden="true"><path d="M2 4V26M36 4V26M7 4V26M31 4V26M12 10H26M12 20H26M15 6V14M23 16V24"/></svg>
        <svg v-else-if="item.label === 'book'" viewBox="0 0 38 30" aria-label="Catalog"><path d="M19 6Q11 1 3 4V25Q11 22 19 27Q27 22 35 25V4Q27 1 19 6V27"/></svg>
        <span v-else>{{ item.label }}</span>
      </span>
    </component>
  </span>
</template>
