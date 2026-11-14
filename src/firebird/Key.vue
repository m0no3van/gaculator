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
      :aria-label="nativeSwitch ? undefined : item.label" :aria-pressed="!nativeSwitch && ['ctrl', 'shift'].includes(item.name) ? pressed : undefined"
      @pointerdown="event => { if (!nativeSwitch) event.preventDefault(); }" @click="() => { if (!nativeSwitch) activate(); }">
      <input v-if="nativeSwitch" class="native-haptic" type="checkbox" switch role="button" :aria-label="item.label"
        :aria-pressed="['ctrl', 'shift'].includes(item.name) ? pressed : undefined" @change="activate" @click.stop
        @keydown.enter.prevent="activate">
      <span class="hh-face">
        <svg v-if="item.label === 'book'" viewBox="0 0 38 30" aria-label="Catalog"><path d="M19 6Q11 1 3 4V25Q11 22 19 27Q27 22 35 25V4Q27 1 19 6V27"/></svg>
        <span v-else>{{ item.label }}</span>
      </span>
    </component>
  </span>
</template>
