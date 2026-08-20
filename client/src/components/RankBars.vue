<script setup>
import { computed } from 'vue';

const props = defineProps({
  rows: { type: Array, default: () => [] },
  myTeam: { type: String, default: null },
  max: { type: Number, default: 12 },
  reveal: { type: Boolean, default: false }
});
/* последнему месту — нулевая задержка, первое появляется последним */
const delay = (i) => {
  if (!props.reveal) return null;
  const n = props.rows.length;
  const step = Math.min(0.4, 2.4 / Math.max(n - 1, 1));
  return { animationDelay: ((n - 1 - i) * step).toFixed(2) + 's' };
};
/* полоса — общий счёт относительно лучшего в занятии */
const best = computed(() => Math.max(1, ...props.rows.map((r) => r.score || 0)));
const pct = computed(() => (r) => Math.max(4, Math.round((100 * Math.max(r.score || 0, 0)) / best.value)));
</script>

<template>
  <div class="dash">
    <div v-for="(r, i) in rows" :key="r.teamId" class="drow"
         :class="{ mine: r.teamId === myTeam, rise: reveal }" :style="delay(i)">
      <span class="drank">{{ r.rank }}</span>
      <div class="dmain">
        <div class="dname">
          {{ r.name }}
          <span class="dscore">{{ r.score }}</span>
          <span v-if="r.lost" class="dflag">день провален</span>
          <span v-else-if="r.cut" class="dflag">не успели</span>
          <span v-else-if="r.deploy && !r.deploy.ok" class="dflag">деплой упал</span>
        </div>
        <div class="dbar"><span :style="{ width: pct(r) + '%' }"></span></div>
        <div class="dsub">
          уточнений {{ r.asks }} из {{ max }} &middot; доверие {{ r.trust }} &middot;
          модулей в проде {{ r.okModules }} &middot; запас {{ r.spare }} мин
        </div>
      </div>
    </div>
  </div>
</template>
