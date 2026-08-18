<script setup>
import { computed } from 'vue';
import { S } from '../store.js';
import StatBar from '../components/StatBar.vue';
import RatingTable from '../components/RatingTable.vue';
import RankBars from '../components/RankBars.vue';

const v = computed(() => S.view);
const mine = computed(() => (v.value.rating || []).find((r) => r.teamId === v.value.you.teamId) || null);
const times = (n) => {
  const a = Math.abs(n) % 100, b = a % 10;
  if (a > 10 && a < 20) return 'раз';
  return b > 1 && b < 5 ? 'раза' : 'раз';
};
</script>

<template>
  <div class="app">
    <StatBar />
    <div class="view">
      <div class="pane">
        <div class="kicker">Смена закончена</div>
        <h1>{{ mine ? mine.name : 'Смена' }}</h1>
        <template v-if="mine">
          <p class="fl">
            Вы уточняли, прежде чем действовать:
            <b class="mono">{{ mine.asks }} {{ times(mine.asks) }} из {{ v.combatTotal }}</b>
          </p>
          <p class="fl">
            Доверие бизнеса: <b class="mono">{{ mine.trust }} из {{ v.maxTrust }}</b> ·
            банк минут: <b class="mono">{{ mine.bank }}</b> ·
            закрыто инцидентов: <b class="mono">{{ mine.incDone }} из {{ v.combatTotal }}</b>
          </p>
          <div class="board">
            <div class="bc">Место в занятии</div>
            <div class="bl">{{ mine.rank }} из {{ (v.rating || []).length }}</div>
            <div class="bg">{{ mine.asks }}/{{ v.combatTotal }} · доверие {{ mine.trust }}/{{ v.maxTrust }} · банк {{ mine.bank }}</div>
          </div>
        </template>
      </div>
      <div class="mt">
        <RankBars :rows="v.rating || []" :my-team="v.you.teamId" :max="v.combatTotal" />
        <RatingTable :rows="v.rating || []" :my-team="v.you.teamId" :deltas="false" />
        <div class="legend">уточнения · доверие · банк минут · инциденты</div>
      </div>
    </div>
    <div class="act">
      <div class="ask" style="text-align:center">Смена закончена. Дальше — разбор у ведущего.</div>
    </div>
  </div>
</template>
