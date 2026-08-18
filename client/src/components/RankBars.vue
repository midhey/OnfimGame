<script setup>
import { computed } from 'vue';

const props = defineProps({
  rows: { type: Array, default: () => [] },
  myTeam: { type: String, default: null },
  max: { type: Number, default: 12 }
});
/* ширина полосы — уточнения относительно максимума занятия */
const pct = computed(() => (r) => {
  const m = Math.max(props.max, 1);
  return Math.max(4, Math.round((100 * r.asks) / m));
});
</script>

<template>
  <div class="dash">
    <div v-for="r in rows" :key="r.teamId" class="drow" :class="{ mine: r.teamId === myTeam }">
      <span class="drank">{{ r.rank }}</span>
      <div class="dmain">
        <div class="dname">
          {{ r.name }}
          <span v-if="r.cut" class="dflag">не успели</span>
        </div>
        <div class="dbar"><span :style="{ width: pct(r) + '%' }"></span></div>
        <div class="dsub">
          уточнений {{ r.asks }} из {{ max }} &middot; доверие {{ r.trust }} &middot;
          банк {{ r.bank }} &middot; инцидентов {{ r.incDone }}
        </div>
      </div>
    </div>
  </div>
</template>
