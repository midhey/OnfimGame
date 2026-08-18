<script setup>
import { computed, ref } from 'vue';
import { S, watchBoard, timerLeft, fmtTimer } from '../store.js';
import RankBars from '../components/RankBars.vue';

const v = computed(() => (S.view && S.view.t === 'board' ? S.view : null));
const code = ref(S.me.boardCode || '');
const live = computed(() => S.conn === 'live');
const digits = computed(() => code.value.replace(/\D/g, '').slice(0, 4));
const left = computed(() => timerLeft());
const active = computed(() => (v.value ? v.value.teams.filter((t) => t.players > 0) : []));

const label = computed(() => {
  const x = v.value;
  if (!x) return '';
  if (x.phase === 'lobby') return 'Ждём команды';
  if (x.phase === 'final') return 'Итоги смены';
  const name = x.round ? (x.round.trial ? 'Разминка' : 'Раунд ' + x.roundIndex + ' из ' + (x.roundsTotal - 1)) : '';
  return x.phase === 'rating' ? 'Рейтинг · ' + name.toLowerCase() : name;
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
          Этот экран выводят на проектор: команды, прогресс раунда, таймер и рейтинг.
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

  <!-- само табло -->
  <div v-else class="app wide host board">
    <header class="top">
      <div class="prog">
        <span class="p">Смена · занятие {{ v.code }} · {{ label }}</span>
        <span class="p"><span class="dot" :class="{ off: S.conn !== 'live' }"></span>{{ v.joinUrl }}</span>
      </div>
      <div class="bars" v-if="v.phase !== 'lobby'">
        <span v-for="i in v.roundsTotal" :key="i" :class="{ on: i <= v.roundIndex + 1 }"></span>
      </div>
    </header>

    <div class="view">
      <!-- гигантский таймер во время раунда -->
      <div v-if="v.phase === 'round'" class="btimer" :class="{ low: left !== null && left < 60 }">
        {{ left !== null ? fmtTimer(left) : '' }}
      </div>

      <!-- лобби: код крупно -->
      <template v-if="v.phase === 'lobby'">
        <div class="center">
          <div class="kicker">Код занятия</div>
          <div class="code">{{ v.code }}</div>
          <p class="big">{{ v.joinUrl }}</p>
          <div class="dotstrip mid" aria-hidden="true"></div>
        </div>
      </template>

      <!-- команды -->
      <div v-if="v.phase === 'lobby' || v.phase === 'round'" class="grid">
        <div v-for="team in (v.phase === 'lobby' ? v.teams : active)" :key="team.id" class="card">
          <h2>{{ team.name }}<span class="st">{{ team.status }}</span></h2>
          <template v-if="v.phase === 'round'">
            <div class="pbar big">
              <span v-for="i in team.incTotal" :key="i"
                    :class="{ on: i <= team.incIndex + (team.roundDone && !team.cut ? 1 : 0),
                              half: !team.roundDone && i === team.incIndex + 1 }"></span>
            </div>
            <div class="stats">
              <div class="stat"><div class="k">Минуты</div><div class="v"><span class="num">{{ team.time }}</span></div></div>
              <div class="stat"><div class="k">Доверие</div><div class="v"><span class="num" :class="{ low: team.trust <= 2 }">{{ team.trust }}</span></div></div>
              <div class="stat"><div class="k">Уточнения</div><div class="v"><span class="num">{{ team.asks }}</span></div></div>
            </div>
          </template>
          <template v-else>
            <div class="bseats">
              <span v-for="(seat, r) in team.seats" :key="r" class="bseat" :class="['c' + r, { on: !!seat }]">
                {{ seat ? seat.name : '·' }}
              </span>
            </div>
          </template>
        </div>
      </div>

      <!-- рейтинг и итоги -->
      <template v-if="v.phase === 'rating' || v.phase === 'final'">
        <template v-if="v.truth">
          <div class="truth mb">
            <div class="tl">На самом деле &middot; {{ v.truth.title }}</div>
            <p>{{ v.truth.text }}</p>
          </div>
        </template>
        <RankBars :rows="v.rating || []" :max="v.combatTotal" />
        <div class="tblwrap">
        <table class="tbl">
          <thead>
            <tr><th>#</th><th>Команда</th><th>Уточнения</th><th>Доверие</th><th>Минуты</th><th>Инциденты</th></tr>
          </thead>
          <tbody>
            <tr v-for="r in v.rating || []" :key="r.teamId">
              <td>{{ r.rank }}</td>
              <td>{{ r.name }}<span v-if="r.cut" class="d bad">не успели</span></td>
              <td>{{ r.asks }}</td>
              <td>{{ r.trust }}</td>
              <td>{{ r.bank }}</td>
              <td>{{ r.incDone }}</td>
            </tr>
          </tbody>
        </table>
        </div>
        <div class="legend">уточнения · доверие из {{ v.maxTrust }} · банк игровых минут · закрытые инциденты</div>
      </template>
    </div>
  </div>
</template>

<style scoped>
.center{text-align:center; margin-bottom:18px}
.dotstrip.mid{margin-left:auto; margin-right:auto}
.foot{text-align:center; margin-top:6px}
.foot .lnk{display:inline-block; text-decoration:underline}
.btimer{
  text-align:center; font:700 clamp(56px, 12vw, 128px)/1 var(--mono);
  letter-spacing:.04em; margin:4px 0 18px; color:var(--accent);
}
.btimer.low{color:var(--alert)}
.bseats{display:flex; flex-direction:column; gap:6px}
.bseat{
  font:600 13px/1.3 var(--sans); padding:7px 10px; border-radius:8px;
  background:var(--bg); border:1px solid var(--line); color:var(--muted);
}
.bseat.on{color:var(--ink); border-left-width:3px}
.bseat.c0{border-left:3px solid var(--r0)}
.bseat.c1{border-left:3px solid var(--r1)}
.bseat.c2{border-left:3px solid var(--r2)}
</style>
