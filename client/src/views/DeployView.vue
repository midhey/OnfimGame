<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { S } from '../store.js';
import StatBar from '../components/StatBar.vue';

const v = computed(() => S.view);
const team = computed(() => v.value.team);
const dep = computed(() => (team.value && team.value.deploy) || null);

/* Деплой идёт пайплайном: стадии загораются по очереди, результат — на
   последней. Данные уже пришли с сервера, тянем только показ. */
const STAGES = ['сборка', 'тесты', 'выкладка', 'прод'];
const noAnim = typeof window !== 'undefined' && window.matchMedia
  && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const running = ref(!noAnim && !!dep.value);
const stage = ref(running.value ? 0 : STAGES.length);
let timers = [];

onMounted(() => {
  if (!running.value) return;
  for (let s = 1; s <= STAGES.length; s++) {
    timers.push(setTimeout(() => { stage.value = s; }, s * 480));
  }
  timers.push(setTimeout(() => { running.value = false; }, STAGES.length * 480 + 700));
});
onUnmounted(() => { for (const t of timers) clearTimeout(t); });

/* последняя стадия у упавшего модуля краснеет */
const stageClass = (k) => {
  const last = k === STAGES.length - 1;
  const fell = dep.value && !dep.value.ok && last;
  return { on: stage.value > k && !fell, bad: fell && stage.value > k, now: stage.value === k && running.value };
};
</script>

<template>
  <div class="app">
    <StatBar />
    <div class="view">
      <div class="pane">
        <div class="kicker">Деплой модулей</div>
        <h1 v-if="running">Выкладываем в прод…</h1>
        <h1 v-else-if="!dep">Внедрять было нечего</h1>
        <h1 v-else-if="dep.ok">Деплой прошёл</h1>
        <h1 v-else>Деплой упал</h1>
      </div>

      <!-- идёт пайплайн -->
      <div v-if="running" class="dep run">
        <div class="dl">пайплайн идёт</div>
        <div class="dn">{{ dep ? dep.name : 'модуля нет' }}</div>
        <span class="bpipe">
          <template v-for="(s, k) in STAGES" :key="k">
            <i v-if="k" class="barr" aria-hidden="true">→</i>
            <i class="bstg" :class="stageClass(k)">{{ s }}</i>
          </template>
        </span>
        <p class="dt mt">Сейчас увидим, держится ли модуль на проде.</p>
      </div>

      <template v-else>
        <div v-if="dep" class="dep" :class="dep.ok ? 'good' : 'bad'">
          <div class="dl">{{ dep.ok ? 'в продакшене' : 'откатили' }}</div>
          <div class="dn">{{ dep.name }}</div>
          <p v-if="dep.ok" class="dt">
            Модуль работает. Бизнес это заметил.
          </p>
          <template v-else>
            <p class="dt">Причина падения: {{ dep.flaw }}.</p>
            <div class="chips"><span class="chip bad">−1 доверие</span></div>
          </template>
        </div>

        <div v-else class="wait mt">
          <div class="wl">Модулей не было</div>
          <div class="ch">
            {{ team && team.lost ? 'День провален: минуты кончились.' : 'Ни одна задача не доведена до внедрения.' }}
          </div>
        </div>
      </template>

      <p class="hint mt">
        Модуль падает не от везения: изъян появляется там, где проверку сделали для галочки
        или закрыли решение костылём.
      </p>
    </div>
    <div class="act">
      <div class="wait">
        <div class="wl">{{ running ? 'Деплой идёт' : 'Деплой окончен' }}</div>
        <div class="wv">Ждём ведущего</div>
        <div class="ch">Дальше — общий рейтинг.</div>
      </div>
    </div>
  </div>
</template>
