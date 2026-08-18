<script setup>
import { computed } from 'vue';
import { S, send } from '../store.js';
import StatBar from '../components/StatBar.vue';

const v = computed(() => S.view);
const mySeat = computed(() => {
  const x = v.value;
  if (!x.you.teamId) return null;
  const team = x.teams.find((t) => t.id === x.you.teamId);
  return team ? { team, role: x.you.role } : null;
});
const anySeated = computed(() => v.value.teams.some((t) => t.players > 0));

function take(teamId, role) {
  send({ t: 'seat', teamId, role });
}
function drop() {
  send({ t: 'unseat' });
}
function start() {
  send({ t: 'host:start' });
}
</script>

<template>
  <div class="app">
    <StatBar />
    <div class="view">
      <div class="pane">
        <div class="kicker">Занятие {{ v.code }}</div>
        <h1 v-if="!mySeat">Займи роль</h1>
        <h1 v-else>{{ v.roles[mySeat.role].name }}</h1>
        <p v-if="!mySeat" class="hint">
          Три роли в команде, у каждой свои решения — ходить за чужую роль нельзя.
          Занятые роли не кликаются.
        </p>
        <p v-else class="hint">
          {{ mySeat.team.name }} · {{ v.roles[mySeat.role].job }}
          <template v-if="v.phase !== 'lobby'"><br>Смена уже идёт, сейчас откроется ваш раунд.</template>
          <template v-else-if="v.you.canHost"><br>Ведущего нет — смену начинаете сами, кнопка ниже.</template>
          <template v-else><br>Ждём ведущего: сначала разминка, потом три раунда на время.</template>
        </p>
      </div>

      <div v-for="team in v.teams" :key="team.id" class="card">
        <h2>{{ team.name }}<span class="st">{{ team.status }}</span></h2>
        <button
          v-for="(seat, r) in team.seats" :key="r"
          class="seat"
          :class="{ mine: seat && v.you.teamId === team.id && v.you.role === r }"
          :disabled="!!seat"
          @click="take(team.id, r)">
          <span class="rl" :class="'c' + r">{{ v.roles[r].name }}</span>
          <span class="pl" :class="{ free: !seat }">
            {{ seat ? seat.name : 'свободно' }}
            <template v-if="seat && !seat.online"> · нет связи</template>
          </span>
        </button>
      </div>
    </div>
    <div class="act">
      <template v-if="v.you.canHost && v.phase === 'lobby'">
        <div class="ask" style="text-align:center">Ведущего нет — смену начинаете сами</div>
        <button class="btn primary" :disabled="!anySeated" @click="start">Начать смену</button>
        <button v-if="mySeat" class="btn ghost small mt" @click="drop">Освободить роль</button>
      </template>
      <template v-else>
        <button v-if="mySeat" class="btn ghost" @click="drop">Освободить роль</button>
        <div v-else class="ask" style="text-align:center">Выберите роль в любой команде</div>
      </template>
    </div>
  </div>
</template>
