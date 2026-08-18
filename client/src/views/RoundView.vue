<script setup>
import { computed } from 'vue';
import { S, send } from '../store.js';
import StatBar from '../components/StatBar.vue';
import Feed from '../components/Feed.vue';
import IncidentSplash from '../components/IncidentSplash.vue';

const v = computed(() => S.view);
const team = computed(() => v.value.team);

function pick(k) {
  send({ t: 'pick', k });
}
/* свободную роль можно взять прямо из раунда — но только свободную */
function takeTurnRole() {
  send({ t: 'seat', teamId: team.value.id, role: team.value.turnRole });
}
</script>

<template>
  <div class="app">
    <StatBar />
    <Feed :items="team.feed" />
    <IncidentSplash />
    <div class="act" :class="team.turnRole !== null && !team.roundDone ? 'act' + team.turnRole : ''">
      <!-- ваш ход -->
      <template v-if="team.yourTurn && team.options">
        <div class="ask">
          <span class="rolechip" :class="'c' + team.turnRole">{{ v.roles[team.turnRole].name }}</span>
          твой ход — выбери карточку
        </div>
        <div class="opts">
          <button
            v-for="(o, i) in team.options" :key="i"
            class="btn opt" :class="'o' + team.turnRole" @click="pick(i)">
            <span class="n">{{ i + 1 }}</span><span>{{ o.label }}</span>
          </button>
        </div>
      </template>

      <!-- команда отыграла раунд -->
      <div v-else-if="team.roundDone" class="wait">
        <div class="wl">{{ team.cut ? 'Не успели по таймеру' : 'Раунд отыгран' }}</div>
        <div class="wv">Ждём</div>
        <div class="ch">Остальные команды ещё разбираются. Рейтинг откроется сам.</div>
      </div>

      <!-- роль свободна: предложить занять -->
      <template v-else-if="team.turnFree">
        <div class="wait">
          <div class="wl">Сейчас ход</div>
          <div class="wv" :class="'t' + team.turnRole">{{ team.turnName }}</div>
          <div class="ch">Эта роль в вашей команде свободна.</div>
        </div>
        <button class="btn primary mt" :class="'p' + team.turnRole" @click="takeTurnRole">
          Взять роль {{ team.turnName }}
        </button>
      </template>

      <!-- ход другого игрока -->
      <div v-else class="wait">
        <div class="wl">Сейчас ход</div>
        <div class="wv" :class="'t' + team.turnRole">{{ team.turnName }}</div>
        <div class="ch">
          {{ team.turnWho ? team.turnWho + ' решает. Лента обновится сама.' : 'Лента обновится сама.' }}
        </div>
      </div>
    </div>
  </div>
</template>
