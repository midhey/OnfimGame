<script setup>
import { computed } from 'vue';
import { S } from '../store.js';
import StatBar from '../components/StatBar.vue';
import RankBars from '../components/RankBars.vue';

const v = computed(() => S.view);
const mine = computed(() => (v.value.rating || []).find((r) => r.teamId === v.value.you.teamId) || null);
const trial = computed(() => v.value.round && v.value.round.trial);
</script>

<template>
  <div class="app">
    <StatBar />
    <div class="view">
      <div class="pane">
        <div class="kicker">
          {{ trial ? 'После разминки' : 'После раунда ' + v.roundIndex + ' из ' + (v.roundsTotal - 1) }}
        </div>
        <h1 v-if="mine">{{ mine.rank }} место · {{ mine.score }} очков</h1>
        <h1 v-else>Дашборд занятия</h1>
        <p v-if="trial" class="hint">
          Это была разминка: очки сейчас обнулятся, роли останутся. Дальше — по-настоящему.
        </p>
        <p v-else-if="mine" class="hint">
          Считается по уточнениям: сколько раз менеджер сначала спросил, а потом делал.
          Очки: уточнение +10, доверие ×5, внедрённый модуль +20, каждые 10 минут запаса +1.
        </p>
      </div>


      <RankBars :rows="v.rating || []" :my-team="v.you.teamId" :max="v.combatTotal" reveal />
      <div class="legend">очки &middot; уточнения &middot; доверие &middot; модули в проде &middot; запас минут</div>
    </div>
    <div class="act">
      <div class="wait">
        <div class="wl">Раунд закрыт</div>
        <div class="wv">Ждём ведущего</div>
        <div class="ch">Он разберёт инциденты и откроет следующий раунд.</div>
      </div>
    </div>
  </div>
</template>
