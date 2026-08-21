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

function take(teamId, role) {
  send({ t: 'seat', teamId, role });
}
function drop() {
  send({ t: 'unseat' });
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
          <template v-if="v.phase !== 'lobby'"><br>Неделя уже идёт, сейчас откроется ваш день.</template>
          <template v-else><br>Ждём ведущего: сначала разминка, потом рабочая неделя — пять дней на время.</template>
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
      <button v-if="mySeat" class="btn ghost" @click="drop">Освободить роль</button>
      <div v-else class="ask" style="text-align:center">Выберите роль в любой команде</div>
    </div>
  </div>
</template>
