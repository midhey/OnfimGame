<script setup>
import { computed, ref } from 'vue';
import { S, watchBoard, timerLeft, fmtTimer } from '../store.js';

const v = computed(() => (S.view && S.view.t === 'board' ? S.view : null));
const code = ref(S.me.boardCode || '');
const live = computed(() => S.conn === 'live');
const digits = computed(() => code.value.replace(/\D/g, '').slice(0, 4));
const left = computed(() => timerLeft());

/* Команды на табло стоят по очкам и меняются местами прямо в раунде:
   уточнения -> доверие -> запас минут. Порядок анимирует TransitionGroup. */
const ranked = computed(() => {
  if (!v.value) return [];
  return v.value.teams
    .filter((t) => t.players > 0)
    .slice()
    .sort((a, b) => b.asks - a.asks || b.trust - a.trust || b.time - a.time);
});

/* Лидерборд раскрывается снизу вверх: последнему месту — нулевая задержка */
const leaders = computed(() => (v.value && v.value.rating ? v.value.rating : []));
const revealDelay = (i) => {
  const n = leaders.value.length;
  const step = Math.min(0.45, 2.7 / Math.max(n - 1, 1));
  return ((n - 1 - i) * step).toFixed(2) + 's';
};
const barWidth = (r) =>
  Math.max(3, Math.round((100 * r.asks) / Math.max(v.value.combatTotal, 1))) + '%';

const label = computed(() => {
  const x = v.value;
  if (!x) return '';
  if (x.phase === 'lobby') return 'Ждём команды';
  if (x.phase === 'final') return 'Итоги смены';
  if (!x.round) return '';
  if (x.phase === 'rating') {
    return x.round.trial ? 'Итоги разминки' : 'Итоги раунда ' + x.roundIndex;
  }
  return x.round.trial ? 'Разминка' : 'Раунд ' + x.roundIndex + ' из ' + (x.roundsTotal - 1);
});

function watch() {
  if (!live.value || digits.value.length !== 4) return;
  watchBoard(digits.value);
}
</script>

<template>
  <!-- подключение табло -->
  <div v-if="!v" class="app">
    <div class="view">
      <div class="pane">
        <div class="kicker">Общий экран</div>
        <h1>Табло занятия</h1>
        <p class="hint">
          Этот экран выводят на проектор: команды, прогресс раунда, таймер и лидерборд.
          Здесь никто не играет — только смотрят.
        </p>
      </div>
    </div>
    <div class="act">
      <div class="ask">Код занятия</div>
      <input class="inp code" v-model="code" inputmode="numeric" maxlength="4"
             placeholder="0000" aria-label="Код занятия" @keyup.enter="watch">
      <button class="btn primary" :disabled="!live || digits.length !== 4" @click="watch">Показать табло</button>
      <div v-if="!live" class="err">Нет связи с сервером. Пробуем ещё…</div>
      <div class="foot"><a class="lnk" href="#/">на страницу игрока</a></div>
    </div>
  </div>

  <!-- само табло: один экран, без прокрутки, команды колонкой -->
  <div v-else class="bd">
    <header class="bhd">
      <span class="bt">Смена<i>·</i>занятие {{ v.code }}<i>·</i>{{ label }}</span>
      <span class="brounds" v-if="v.phase !== 'lobby'">
        <i v-for="i in v.roundsTotal" :key="i" :class="{ on: i <= v.roundIndex + 1 }"></i>
      </span>
      <span class="bt right"><span class="dot" :class="{ off: S.conn !== 'live' }"></span>{{ v.joinUrl }}</span>
    </header>

    <!-- ЛОББИ: код и составы -->
    <main v-if="v.phase === 'lobby'" class="bmain lobby">
      <div class="bjoin">
        <div class="bk">Код занятия</div>
        <div class="bcode">{{ v.code }}</div>
        <div class="dotstrip mid" aria-hidden="true"></div>
        <div class="burl">{{ v.joinUrl }}</div>
      </div>
      <div class="bteams" :style="{ '--cols': Math.min(v.teams.length, 5) }">
        <div v-for="team in v.teams" :key="team.id" class="btile">
          <div class="btname">{{ team.name }}</div>
          <div class="bseats">
            <span v-for="(seat, r) in team.seats" :key="r" class="bseat" :class="['c' + r, { on: !!seat }]">
              {{ seat ? seat.name : '—' }}
            </span>
          </div>
        </div>
      </div>
    </main>

    <!-- РАУНД: таймер и команды колонкой, места меняются на ходу -->
    <main v-else-if="v.phase === 'round'" class="bmain">
      <div class="btimer" :class="{ low: left !== null && left < 60 }">
        {{ left !== null ? fmtTimer(left) : '' }}
      </div>
      <TransitionGroup name="flip" tag="div" class="brows" :style="{ '--rows': Math.max(ranked.length, 1) }">
        <div v-for="(team, i) in ranked" :key="team.id"
             class="brow" :class="{ top: i === 0, fin: team.roundDone }">
          <span class="bpos">{{ i + 1 }}</span>
          <span class="bname">{{ team.name }}</span>
          <span class="bsteps">
            <i v-for="(role, s) in team.stepRoles" :key="s"
               :class="['bstep', 's' + role, {
                 on: s < team.step || team.roundDone,
                 now: s === team.step && !team.roundDone
               }]"></i>
          </span>
          <span class="bstate">
            <template v-if="team.roundDone">{{ team.cut ? 'не успели' : 'раунд отыгран' }}</template>
            <template v-else>инцидент {{ Math.min(team.incIndex + 1, team.incTotal) }}/{{ team.incTotal }}<i>·</i>{{ team.status }}</template>
          </span>
          <span class="bnum"><b>{{ team.asks }}</b><em>уточнений</em></span>
          <span class="bnum"><b :class="{ low: team.trust <= 2, neg: team.trust < 0 }">{{ team.trust }}</b><em>доверие</em></span>
          <span class="bnum"><b>{{ team.time }}</b><em>запас минут</em></span>
        </div>
      </TransitionGroup>
    </main>

    <!-- ИТОГИ: только лидерборд, раскрывается снизу вверх -->
    <main v-else class="bmain">
      <div class="brows" :style="{ '--rows': Math.max(leaders.length, 1) }">
        <div v-for="(r, i) in leaders" :key="r.teamId"
             class="brow lb" :class="{ top: r.rank === 1 }"
             :style="{ animationDelay: revealDelay(i) }">
          <span class="bpos">{{ r.rank }}</span>
          <span class="bname">{{ r.name }}<em v-if="r.cut">не успели</em></span>
          <span class="bbar"><i :style="{ width: barWidth(r) }"></i></span>
          <span class="bnum"><b>{{ r.asks }}</b><em>уточнений</em></span>
          <span class="bnum"><b :class="{ neg: r.trust < 0 }">{{ r.trust }}</b><em>доверие</em></span>
          <span class="bnum"><b>{{ r.bank }}</b><em>запас минут</em></span>
        </div>
      </div>
      <div class="bnote">
        уточнения — сколько раз спросили, прежде чем делать &middot;
        доверие бизнеса от {{ -v.maxTrust }} до {{ v.maxTrust }} &middot;
        запас минут — сколько времени смены сберегли
      </div>
    </main>
  </div>
</template>
