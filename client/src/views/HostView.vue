<script setup>
import { computed, ref } from 'vue';
import { S, send, leave, timerLeft, fmtTimer } from '../store.js';
import RatingTable from '../components/RatingTable.vue';
import RankBars from '../components/RankBars.vue';

const v = computed(() => S.view);
const st = computed(() => v.value.hostStats || {});
const active = computed(() => v.value.teams.filter((t) => t.players > 0));
const left = computed(() => timerLeft());

const label = computed(() => {
  const x = v.value;
  if (x.phase === 'lobby') return 'Лобби';
  if (x.phase === 'final') return 'Итоги недели';
  const name = x.round ? x.round.title : '';
  if (x.phase === 'round') return name;
  if (x.phase === 'activate') return 'Выбор модулей · ' + name.toLowerCase();
  if (x.phase === 'deploy') return 'Деплой · ' + name.toLowerCase();
  return 'Итоги дня · ' + name.toLowerCase();
});
const lastRound = computed(() => v.value.roundIndex >= v.value.roundsTotal - 1);

const go = (t) => send({ t });
const removeTeam = (teamId) => send({ t: 'host:removeTeam', teamId });
const vFocus = { mounted: (el) => { el.focus(); el.select(); } };
const editing = ref(null);   // id команды, название которой правим
const draft = ref('');

function startRename(team) {
  editing.value = team.id;
  draft.value = team.name;
}
function saveRename() {
  const id = editing.value;
  if (!id) return;
  const name = draft.value.trim();
  editing.value = null;
  if (name) send({ t: 'host:renameTeam', teamId: id, name });
}
const extend = () => send({ t: 'host:extend', sec: 120 });
function reset() {
  if (confirm('Сбросить занятие в лобби? Все очки команд обнулятся.')) send({ t: 'host:reset' });
}
function endRound() {
  if (confirm('Закрыть раунд у всех команд? Недоделанные задачи сгорят.')) send({ t: 'host:end' });
}
</script>

<template>
  <div class="app wide host">
    <header class="top">
      <div class="prog">
        <span class="p">{{ label }} · ведущий · занятие {{ v.code }}</span>
        <span class="p">
          <span v-if="left !== null" class="timer" :class="{ low: left < 60 }">{{ fmtTimer(left) }}</span>
          <span class="dot" :class="{ off: S.conn !== 'live' }"></span>
          <template v-if="!st.players">никто ещё не зашёл</template>
          <template v-else>в занятии {{ st.players }} · на местах {{ st.seated }}<template v-if="st.online < st.players"> · без связи {{ st.players - st.online }}</template></template>
          <button class="lnk" @click="leave('Выйти с экрана ведущего? Занятие останется, его можно снова взять по коду с паролем.')">выйти</button>
        </span>
      </div>
      <div class="bars" v-if="v.phase !== 'lobby'">
        <span v-for="i in v.roundsTotal" :key="i" :class="{ on: i <= v.roundIndex + 1 }"></span>
      </div>
    </header>

    <div class="view">
      <div class="cols">
        <div class="main">
          <!-- ЛОББИ -->
          <template v-if="v.phase === 'lobby'">
            <div class="kicker">Игроки набирают на телефонах</div>
            <div class="code">{{ v.code }}</div>
            <p class="big" v-if="v.joinUrl">адрес: {{ v.joinUrl }}</p>
            <p class="hint">
              Табло для проектора: {{ v.joinUrl }}/#/board — код {{ v.code }}.
              Сначала разминка без очков, потом рабочая неделя: пять дней, у каждой команды свои задачи.
            </p>
            <div class="grid">
              <div v-for="team in v.teams" :key="team.id" class="card">
                <h2>
                  <input v-if="editing === team.id" class="tname" v-model="draft"
                         maxlength="24" @keyup.enter="saveRename" @blur="saveRename"
                         @keyup.esc="editing = null" v-focus>
                  <button v-else class="tname btnlike" @click="startRename(team)" title="Переименовать">
                    {{ team.name }}
                  </button>
                  <span class="st">
                    {{ team.status }}
                    <button v-if="!team.players" class="lnk" @click="removeTeam(team.id)">убрать</button>
                  </span>
                </h2>
                <div v-for="(seat, r) in team.seats" :key="r" class="seat" :class="{ mine: !!seat }">
                  <span class="rl" :class="'c' + r">{{ v.roles[r].name }}</span>
                  <span class="pl" :class="{ free: !seat }">
                    {{ seat ? seat.name : 'свободно' }}
                    <template v-if="seat && !seat.online"> · нет связи</template>
                  </span>
                </div>
              </div>
            </div>
            <p v-if="st.waiting && st.waiting.length" class="hint mt">Без роли: {{ st.waiting.join(', ') }}</p>
          </template>

          <!-- РАУНД -->
          <template v-else-if="v.phase === 'round'">
            <h1>{{ v.round.title }}</h1>
            <p class="big">Готовы {{ st.teamsDone }} из {{ st.teamsActive }} команд</p>
            <div class="grid">
              <div v-for="team in active" :key="team.id" class="card">
                <h2>{{ team.name }}<span class="st">{{ team.status }}</span></h2>
                <div class="pbar">
                  <span v-for="i in team.incTotal" :key="i"
                        :class="{ on: i <= team.incIndex + (team.roundDone && !team.cut ? 1 : 0),
                                  half: !team.roundDone && i === team.incIndex + 1 }"></span>
                </div>
                <div class="stats">
                  <div class="stat"><div class="k">Минуты</div><div class="v"><span class="num">{{ team.time }}</span></div></div>
                  <div class="stat"><div class="k">Доверие</div><div class="v"><span class="num" :class="{ low: team.trust <= 2 && team.trust >= 0, neg: team.trust < 0 }">{{ team.trust }}</span></div></div>
                  <div class="stat"><div class="k">Уточнения</div><div class="v"><span class="num">{{ team.asks }}</span></div></div>
                </div>
              </div>
            </div>
          </template>

          <!-- ВЫБОР МОДУЛЕЙ -->
          <template v-else-if="v.phase === 'activate'">
            <h1>Менеджеры выбирают модуль</h1>
            <p class="big">Определились {{ st.teamsPicked }} из {{ st.teamsActive }} команд</p>
            <p class="hint">
              Каждая команда внедряет один модуль из готовых задач. Изъяны команды
              не видят — судят по своей работе. Запускайте деплой, когда все определятся:
              не выбравшим уйдёт первый модуль.
            </p>
            <div class="grid">
              <div v-for="team in active" :key="team.id" class="card">
                <h2>{{ team.name }}<span class="st">{{ team.status }}</span></h2>
                <div class="stats">
                  <div class="stat"><div class="k">Модулей</div><div class="v"><span class="num">{{ team.modulesReady }}</span></div></div>
                  <div class="stat"><div class="k">Выбрали</div><div class="v"><span class="num">{{ team.picked ? 'да' : '—' }}</span></div></div>
                  <div class="stat"><div class="k">Очки</div><div class="v"><span class="num">{{ team.score }}</span></div></div>
                </div>
              </div>
            </div>
          </template>

          <!-- ДЕПЛОЙ -->
          <template v-else-if="v.phase === 'deploy'">
            <h1>Деплой модулей</h1>
            <div class="grid">
              <div v-for="team in active" :key="team.id" class="card">
                <h2>{{ team.name }}<span class="st">{{ team.status }}</span></h2>
                <template v-if="team.deploy">
                  <p class="dmod" :class="team.deploy.ok ? 'ok' : 'fail'">
                    {{ team.deploy.ok ? 'в проде' : 'откатили' }} &middot; {{ team.deploy.name }}
                  </p>
                  <p v-if="!team.deploy.ok" class="hint">Причина: {{ team.deploy.flaw }}. Доверие −1.</p>
                </template>
                <p v-else class="hint">{{ team.lost ? 'День провален, внедрять нечего.' : 'Модулей не было.' }}</p>
              </div>
            </div>
            <p class="hint mt">
              Модуль падает там, где проверка была для галочки или решение было костылём.
              Это и есть материал для разбора.
            </p>
          </template>

          <!-- РЕЙТИНГ / ИТОГИ -->
          <template v-else>
            <h1 v-if="v.phase === 'rating'">{{ v.round && v.round.trial ? 'Разминка сыграна' : 'Рейтинг' }}</h1>
            <h1 v-else>Итоги недели</h1>
            <template v-if="v.truth">
              <div class="truth mb">
                <div class="tl">На самом деле &middot; {{ v.truth.title }} &middot; {{ v.truth.no }}</div>
                <p>{{ v.truth.text }}</p>
              </div>
            </template>
            <RankBars :rows="v.rating || []" :max="v.combatTotal" />
            <RatingTable :rows="v.rating || []" :deltas="v.phase === 'rating' && !(v.round && v.round.trial)" />
            <div class="legend">
              очки: уточнение +{{ v.score.ask }}, доверие ×{{ v.score.trust }}, модуль в проде +{{ v.score.module }}, каждые {{ v.score.minutes }} минут запаса +1
            </div>
            <p v-if="v.phase === 'rating'" class="hint mt">
              Разберите вслух: что было на самом деле и какой вопрос сэкономил бы время. Потом следующий раунд.
            </p>
          </template>
        </div>

        <!-- ЛОГ -->
        <aside class="aside" v-if="v.logs && v.logs.length">
          <div class="ask">Лог занятия</div>
          <div class="log">
            <div v-for="(l, i) in v.logs" :key="i" class="ln">
              <span class="lt">{{ l.at }}</span>
              <span v-if="l.team" class="lteam">{{ l.team }}</span>
              <span class="lx">{{ l.text }}</span>
            </div>
          </div>
        </aside>
      </div>
    </div>

    <div class="act">
      <div class="row">
        <template v-if="v.phase === 'lobby'">
          <button class="btn primary" :disabled="!st.teamsActive" @click="go('host:start')">
            {{ st.teamsActive ? 'Начать неделю (разминка)' : 'Ждём, пока кто-нибудь займёт роль' }}
          </button>
          <button class="btn small" @click="go('host:addTeam')">+ команда</button>
        </template>

        <template v-else-if="v.phase === 'round'">
          <button class="btn primary" @click="endRound">Закрыть раунд сейчас</button>
          <button class="btn small" @click="extend">+2 минуты</button>
        </template>

        <template v-else-if="v.phase === 'activate'">
          <button class="btn primary" @click="go('host:deploy')">Запустить деплой</button>
        </template>

        <template v-else-if="v.phase === 'deploy'">
          <button class="btn primary" @click="go('host:next')">Показать рейтинг</button>
        </template>

        <template v-else-if="v.phase === 'rating'">
          <button class="btn primary" @click="go('host:next')">
            {{ lastRound ? 'Итоги недели' : 'Следующий день' }}
          </button>
        </template>

        <template v-else>
          <button class="btn primary" @click="reset">Новое занятие</button>
        </template>
      </div>
    </div>
  </div>
</template>
