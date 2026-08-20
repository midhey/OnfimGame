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
    .sort((a, b) => b.score - a.score || b.asks - a.asks || b.time - a.time);
});

/* Лидерборд раскрывается снизу вверх: последнему месту — нулевая задержка */
const leaders = computed(() => (v.value && v.value.rating ? v.value.rating : []));
const revealDelay = (i) => {
  const n = leaders.value.length;
  const step = Math.min(0.45, 2.7 / Math.max(n - 1, 1));
  return ((n - 1 - i) * step).toFixed(2) + 's';
};
const bestScore = computed(() => Math.max(1, ...leaders.value.map((r) => r.score || 0)));
const barWidth = (r) =>
  Math.max(3, Math.round((100 * Math.max(r.score || 0, 0)) / bestScore.value)) + '%';

const label = computed(() => {
  const x = v.value;
  if (!x) return '';
  if (x.phase === 'lobby') return 'Ждём команды';
  if (x.phase === 'final') return 'Итоги смены';
  if (!x.round) return '';
  const day = x.round.trial ? 'разминки' : 'дня «' + x.round.title + '»';
  if (x.phase === 'activate') return 'Выбор модулей · ' + day;
  if (x.phase === 'deploy') return 'Деплой · ' + day;
  if (x.phase === 'rating') return 'Итоги ' + day;
  return x.round.trial ? 'Разминка' : x.round.title;
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
          <span class="bnum"><b>{{ team.time }}</b><em>минут</em></span>
          <span class="bnum"><b>{{ team.score }}</b><em>очков</em></span>
        </div>
      </TransitionGroup>
    </main>

    <!-- ВЫБОР МОДУЛЕЙ -->
    <main v-else-if="v.phase === 'activate'" class="bmain">
      <div class="bhead">Менеджеры выбирают, что уйдёт в продакшн</div>
      <div class="brows" :style="{ '--rows': Math.max(ranked.length, 1) }">
        <div v-for="(team, i) in ranked" :key="team.id" class="brow" :class="{ top: i === 0 }">
          <span class="bpos">{{ i + 1 }}</span>
          <span class="bname">{{ team.name }}</span>
          <span class="bstate wide">
            <template v-if="team.lost">день провален — внедрять нечего</template>
            <template v-else-if="!team.modulesReady">инцидентов не закрыто</template>
            <template v-else-if="team.picked">модуль выбран</template>
            <template v-else>выбирают из {{ team.modulesReady }}</template>
          </span>
          <span class="bnum"><b :class="{ neg: !team.picked && !team.lost && team.modulesReady }">{{ team.picked ? 'готово' : '…' }}</b><em>решение</em></span>
        </div>
      </div>
    </main>

    <!-- ДЕПЛОЙ: у кого поднялось, у кого упало -->
    <main v-else-if="v.phase === 'deploy'" class="bmain">
      <div class="bhead">Деплой модулей в продакшн</div>
      <div class="brows" :style="{ '--rows': Math.max(ranked.length, 1) }">
        <div v-for="(team, i) in ranked" :key="team.id"
             class="brow dep" :class="team.deploy ? (team.deploy.ok ? 'ok' : 'fail') : 'none'">
          <span class="bpos">{{ team.deploy ? (team.deploy.ok ? '✓' : '×') : '—' }}</span>
          <span class="bname">{{ team.name }}</span>
          <span class="bstate wide">
            <template v-if="!team.deploy">{{ team.lost ? 'день провален' : 'нечего внедрять' }}</template>
            <template v-else>{{ team.deploy.name }}<template v-if="!team.deploy.ok"><i>·</i>{{ team.deploy.flaw }}</template></template>
          </span>
          <span class="bnum"><b :class="{ neg: team.deploy && !team.deploy.ok }">{{ team.deploy ? (team.deploy.ok ? 'в проде' : 'откат') : '—' }}</b><em>итог</em></span>
        </div>
      </div>
    </main>

    <!-- ИТОГИ: только лидерборд, раскрывается снизу вверх -->
    <main v-else class="bmain">
      <div class="brows" :style="{ '--rows': Math.max(leaders.length, 1) }">
        <div v-for="(r, i) in leaders" :key="r.teamId"
             class="brow lb" :class="{ top: r.rank === 1 }"
             :style="{ animationDelay: revealDelay(i) }">
          <span class="bpos">{{ r.rank }}</span>
          <span class="bname">
            {{ r.name }}
            <em v-if="r.lost">день провален</em>
            <em v-else-if="r.cut">не успели</em>
            <em v-else-if="r.deploy && !r.deploy.ok">деплой упал</em>
          </span>
          <span class="bbar"><i :style="{ width: barWidth(r) }"></i></span>
          <span class="bnum big"><b>{{ r.score }}</b><em>очков</em></span>
          <span class="bnum"><b>{{ r.asks }}</b><em>уточнений</em></span>
          <span class="bnum"><b :class="{ neg: r.trust < 0 }">{{ r.trust }}</b><em>доверие</em></span>
          <span class="bnum"><b>{{ r.okModules }}</b><em>модулей</em></span>
        </div>
      </div>
      <div class="bnote">
        очки: уточнение +{{ v.score.ask }} &middot; доверие ×{{ v.score.trust }} &middot;
        модуль в проде +{{ v.score.module }} &middot; каждые {{ v.score.minutes }} минут запаса +1
      </div>
    </main>
  </div>
</template>
