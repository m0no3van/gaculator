<script setup>
import { onBeforeUnmount, onMounted, reactive, ref } from 'vue';
import { layout, directions } from './keys.js';
import Key from './Key.vue';
import { createTouchpadGesture } from './touchpad.js';
import { vibrateFeedback } from './haptics.js';
const emit = defineEmits(['tap', 'touch']);
const modifiers = reactive({ ctrl: false, shift: false });
const pad = ref();
const touching = ref(false), point = reactive({ x: 0.5, y: 0.5 });
const gesture = createTouchpadGesture(value => {
  touching.value = value.contact; Object.assign(point, { x: value.x, y: value.y }); emit('touch', value);
}, () => vibrateFeedback('control'));
function press(name) {
  if (name === 'ctrl' || name === 'shift') { modifiers[name] = !modifiers[name]; return; }
  emit('tap', { name, ...modifiers }); modifiers.ctrl = modifiers.shift = false;
}
function down(event) {
  if (gesture.start(event, pad.value.getBoundingClientRect())) {
    event.preventDefault(); pad.value.setPointerCapture(event.pointerId); vibrateFeedback('touchpad');
  }
}
const cancel = () => gesture.cancel();
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
          <Key v-for="item in layout[side]" :key="item.name" :item="item" @press="press"/>
        </div>
        <div ref="pad" class="hh-touchpad"
          @pointerdown="down" @pointermove="gesture.move" @pointerup="gesture.end" @pointercancel="gesture.cancel"
          @lostpointercapture="gesture.cancel" @contextmenu.prevent>
          <span class="hh-pad-mark hh-pad-mark-up" aria-hidden="true">▴</span>
          <span class="hh-pad-mark hh-pad-mark-right" aria-hidden="true">▸</span>
          <span class="hh-pad-mark hh-pad-mark-down" aria-hidden="true">▾</span>
          <span class="hh-pad-mark hh-pad-mark-left" aria-hidden="true">◂</span>
          <span v-if="touching" class="hh-pad-contact" :style="{ left: `${point.x * 100}%`, top: `${point.y * 100}%` }" aria-hidden="true"></span>
          <button v-for="(point, direction) in directions" :key="direction" type="button" :class="`hh-pad-${direction}`"
            :aria-label="direction" @click="event => { if (event.detail === 0) press(direction); }">
            {{ { up: '▴', right: '▸', down: '▾', left: '◂', select: '' }[direction] }}
          </button>
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
