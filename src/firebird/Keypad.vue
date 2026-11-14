<script setup>
import { onBeforeUnmount, onMounted, reactive, ref } from 'vue';
import { layout, directions } from './keys.js';
import Key from './Key.vue';
import { createTouchpadGesture } from './touchpad.js';
import { createKeyActivation } from './key-activation.js';
import { supportsSwitchHaptics, vibrateFeedback } from './haptics.js';
const emit = defineEmits(['tap', 'touch', 'reload-request']);
const modifiers = reactive({ ctrl: false, shift: false });
const pad = ref();
const nativeSwitch = supportsSwitchHaptics();
let direction, region, nativeTapReady;
const touching = ref(false), point = reactive({ x: 0.5, y: 0.5 });
const gesture = createTouchpadGesture(value => {
  touching.value = value.contact; Object.assign(point, { x: value.x, y: value.y }); emit('touch', value);
}, () => { if (direction) { nativeTapReady = direction; activateDirection(direction); } });
const activations = Object.fromEntries(Object.keys(directions).map(name => [name, createKeyActivation(() => activateDirection(name))]));
function activateDirection(name) { vibrateFeedback('control'); press(name); }
function press(name) {
  if (name === 'ctrl' || name === 'shift') { modifiers[name] = !modifiers[name]; return; }
  emit('tap', { name, ...modifiers }); modifiers.ctrl = modifiers.shift = false;
}
function down(event) {
  nativeTapReady = undefined;
  const target = event.target.closest('.hh-pad-key');
  const rect = target?.getBoundingClientRect();
  if (rect && (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom)) {
    event.preventDefault(); return;
  }
  if (gesture.start(event, pad.value.getBoundingClientRect())) {
    direction = target?.dataset.direction; region = rect;
    if (direction) activations[direction].markPointer();
    if (!nativeSwitch) event.preventDefault();
    (target || pad.value).setPointerCapture(event.pointerId); vibrateFeedback('touchpad');
  } else event.preventDefault();
}
function up(event) {
  if (gesture.pointerId === event.pointerId && region
    && (event.clientX < region.left || event.clientX > region.right || event.clientY < region.top || event.clientY > region.bottom)) direction = undefined;
  gesture.end(event);
}
function click(event, name) {
  if (!nativeSwitch) { activations[name].fallback(event); return; }
  if (nativeTapReady !== name) { event.preventDefault(); activations[name].cancel(); }
  nativeTapReady = undefined;
}
function keyboard(event, name) {
  if (!['Enter', ' '].includes(event.key)) return;
  activations[name].keyboard();
  if (nativeSwitch && event.key === 'Enter') {
    event.preventDefault(); if (!event.repeat) activateDirection(name);
  }
}
const cancel = event => {
  const pointer = event?.pointerId !== undefined ? event : undefined;
  if (pointer && gesture.pointerId !== pointer.pointerId) return;
  gesture.cancel(pointer); nativeTapReady = undefined;
  Object.values(activations).forEach(activation => activation.cancel());
};
const lostCapture = event => { if (gesture.pointerId === event.pointerId) cancel(event); };
const visibility = () => { if (document.hidden) cancel(); };
onMounted(() => { window.addEventListener('blur', cancel); document.addEventListener('visibilitychange', visibility); });
onBeforeUnmount(() => {
  cancel(); window.removeEventListener('blur', cancel); document.removeEventListener('visibilitychange', visibility);
});
</script>
<template>
  <aside class="keypad-dock" aria-label="计算器键盘 / Calculator keypad">
    <section class="handheld-keyboard">
      <div class="hh-navigation">
        <div v-for="side in ['left', 'right']" :key="side" :class="`hh-nav-${side}`">
          <Key v-for="item in layout[side]" :key="item.name" :item="item" @press="press" @reload-request="emit('reload-request')"/>
        </div>
        <div ref="pad" class="hh-touchpad"
          @pointerdown="down" @pointermove="gesture.move" @pointerup="up" @pointercancel="cancel"
          @lostpointercapture="lostCapture" @contextmenu.prevent>
          <span v-if="touching" class="hh-pad-contact" :style="{ left: `${point.x * 100}%`, top: `${point.y * 100}%` }" aria-hidden="true"></span>
          <component :is="nativeSwitch ? 'label' : 'button'" v-for="(point, name) in directions" :key="name"
            :type="nativeSwitch ? undefined : 'button'" class="hh-pad-key" :class="[`hh-pad-${name}`, { 'hh-active': touching && direction === name }]" :data-direction="name"
            :aria-label="nativeSwitch ? undefined : name" @keydown="keyboard($event, name)" @click="click($event, name)">
            <input v-if="nativeSwitch" class="native-haptic" type="checkbox" switch role="button" :aria-label="name"
              @click.stop @change="activations[name].fallback">
            {{ { up: '▴', right: '▸', down: '▾', left: '◂', select: '' }[name] }}
          </component>
        </div>
      </div>
      <div class="hh-modifiers"><Key v-for="item in layout.modifiers" :key="item.name" :item="item" :pressed="!!modifiers[item.name]" @press="press"/></div>
      <div class="hh-main-keys"><div v-for="(row, index) in layout.rows" :key="index" class="hh-main-row">
        <div class="hh-pair"><Key v-for="item in row.slice(0, 2)" :key="item.name" :item="item" @press="press"/></div>
        <div class="hh-number-group"><Key v-for="item in row.slice(2, 5)" :key="item.name" :item="item" number @press="press"/></div>
        <div class="hh-pair"><Key v-for="item in row.slice(5)" :key="item.name" :item="item" @press="press"/></div>
      </div></div>
      <div class="hh-alphabet"><div v-for="(row, index) in layout.alphabet" :key="index" class="hh-alpha-row">
        <Key v-for="item in row" :key="item.name" :item="item" @press="press"/>
      </div></div>
    </section>
  </aside>
</template>
