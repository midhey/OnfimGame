<script setup>
import { onUnmounted, ref, watch } from 'vue';
import { S } from '../store.js';

/* Полноэкранное объявление новой задачи. Следит за сменой задачи
   у команды, показывается ~3 секунды, касание закрывает сразу. */
const splash = ref(null);
let timer = null;

/* браузер разрешает вибрацию только после первого касания страницы */
let touched = false;
window.addEventListener('pointerdown', () => { touched = true; }, { once: true, capture: true });

function close() {
  if (timer) clearTimeout(timer);
  timer = null;
  splash.value = null;
}

watch(
  () => {
    const v = S.view;
    if (!v || v.phase !== 'round' || !v.team) return null;
    return v.roundIndex + ':' + v.team.incIndex;
  },
  (key) => {
    if (key === null) { close(); return; }
    const v = S.view;
    const t = v.team;
    if (t.roundDone || !t.feed) return;
    let inc = null;
    for (let i = t.feed.length - 1; i >= 0; i--) {
      if (t.feed[i].kind === 'inc') { inc = t.feed[i]; break; }
    }
    if (!inc) return;
    splash.value = {
      no: inc.no,
      place: inc.place,
      clock: inc.clock,
      channel: inc.channel || '',
      idx: t.incIndex + 1,
      total: t.incTotal,
      roundTitle: v.round ? v.round.title : ''
    };
    try { if (touched && navigator.vibrate) navigator.vibrate(35); } catch {}
    if (timer) clearTimeout(timer);
    timer = setTimeout(close, 3000);
  },
  { immediate: true }
);
onUnmounted(() => { if (timer) clearTimeout(timer); });
</script>

<template>
  <div v-if="splash" class="splash" role="status" @click="close">
      <div class="spin">
        <div class="sk">{{ splash.roundTitle }} &middot; задача {{ splash.idx }} из {{ splash.total }}</div>
        <div class="sk2">Новая заявка</div>
        <div class="sno">{{ splash.no }}</div>
        <div class="dotstrip inv" aria-hidden="true"></div>
        <div class="sm">{{ splash.place }} &middot; {{ splash.clock }}</div>
        <div v-if="splash.channel" class="sm2">Чат «{{ splash.channel }}»</div>
        <div class="sh">Касание, чтобы открыть</div>
      </div>
  </div>
</template>
