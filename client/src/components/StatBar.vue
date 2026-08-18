<script setup>
import { computed } from 'vue';
import { S, leave, timerLeft, fmtTimer } from '../store.js';

const v = computed(() => S.view);
const team = computed(() => v.value.team);
const left = computed(() => timerLeft());

const label = computed(() => {
  const x = v.value;
  if (x.phase === 'lobby') return 'Смена не начата';
  if (x.phase === 'final') return 'Смена закончена';
  const r = x.round;
  if (!r) return '';
  let s = r.trial ? 'Разминка' : 'Раунд ' + x.roundIndex + ' из ' + (x.roundsTotal - 1);
  if (x.phase === 'round' && team.value && team.value.incTotal) {
    s += ' · инцидент ' + Math.min(team.value.incIndex + 1, team.value.incTotal) + '/' + team.value.incTotal;
    if (team.value.stepTotal) s += ' · шаг ' + Math.min(team.value.step + 1, team.value.stepTotal) + '/' + team.value.stepTotal;
  }
  return s;
});
const role = computed(() => {
  const x = v.value;
  return x.you.role === null ? null : x.roles[x.you.role].name;
});
</script>

<template>
  <header class="top">
    <div class="stats">
      <div class="stat">
        <div class="k">Минуты раунда</div>
        <div class="v">
          <span class="num">{{ team && v.phase !== 'lobby' ? team.time : '—' }}</span><span class="u">мин</span>
        </div>
      </div>
      <div class="stat">
        <div class="k">Доверие</div>
        <div class="v">
          <span class="num" :class="{ low: team && team.trust <= 2 }">{{ team ? team.trust : '—' }}</span>
          <span class="u">/ {{ v.maxTrust }}</span>
        </div>
      </div>
      <div class="stat" v-if="left !== null">
        <div class="k">Таймер</div>
        <div class="v"><span class="num" :class="{ low: left < 60 }">{{ fmtTimer(left) }}</span></div>
      </div>
    </div>
    <div class="prog">
      <span class="p">{{ label }}<template v-if="team"> · {{ team.name }}</template></span>
      <span class="p">
        <span class="dot" :class="{ off: S.conn !== 'live' }"></span>
        <span v-if="role" class="rolechip" :class="'c' + v.you.role">{{ role }}</span>
        <template v-else>{{ v.you.name }}</template>
        <button class="lnk" @click="leave('Выйти из занятия? Роль освободится.')">выйти</button>
      </span>
    </div>
  </header>
</template>
