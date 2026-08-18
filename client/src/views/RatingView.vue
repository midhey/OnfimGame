<script setup>
import { computed } from 'vue';
import { S, send } from '../store.js';
import StatBar from '../components/StatBar.vue';
import RatingTable from '../components/RatingTable.vue';
import RankBars from '../components/RankBars.vue';

const v = computed(() => S.view);
const mine = computed(() => (v.value.rating || []).find((r) => r.teamId === v.value.you.teamId) || null);
const last = computed(() => v.value.roundIndex >= v.value.roundsTotal - 1);
const trial = computed(() => v.value.round && v.value.round.trial);
const next = () => send({ t: 'host:next' });
</script>

<template>
  <div class="app">
    <StatBar />
    <div class="view">
      <div class="pane">
        <div class="kicker">
          {{ trial ? 'После разминки' : 'После раунда ' + v.roundIndex + ' из ' + (v.roundsTotal - 1) }}
        </div>
        <h1 v-if="mine">{{ mine.rank }} место</h1>
        <h1 v-else>Дашборд занятия</h1>
        <p v-if="trial" class="hint">
          Это была разминка: очки сейчас обнулятся, роли останутся. Дальше — по-настоящему.
        </p>
        <p v-else-if="mine" class="hint">
          Считается по уточнениям: сколько раз менеджер сначала спросил, а потом делал.
          При равных — по доверию, потом по банку минут.
        </p>
      </div>

      <template v-if="v.truth">
        <div class="plate">Последний инцидент &middot; {{ v.truth.no }}</div>
        <div class="truth">
          <div class="tl">На самом деле</div>
          <p>{{ v.truth.text }}</p>
        </div>
        <div class="tmeta">{{ v.truth.title }} &middot; {{ v.truth.place }}</div>
      </template>

      <RankBars :rows="v.rating || []" :my-team="v.you.teamId" :max="v.combatTotal" />
      <RatingTable :rows="v.rating || []" :my-team="v.you.teamId" :deltas="!trial" />
      <div class="legend">уточнения · доверие из {{ v.maxTrust }} · банк игровых минут · закрытые инциденты</div>
    </div>
    <div class="act">
      <!-- ведущего нет: следующий раунд открывает любой -->
      <template v-if="v.you.canHost">
        <div class="ask" style="text-align:center">Ведущего нет — открываете сами</div>
        <button class="btn primary" @click="next">{{ last ? 'Итоги смены' : 'Следующий раунд' }}</button>
      </template>
      <div v-else class="wait">
        <div class="wl">Раунд закрыт</div>
        <div class="wv">Ждём ведущего</div>
        <div class="ch">Он разберёт инциденты и откроет следующий раунд.</div>
      </div>
    </div>
  </div>
</template>
