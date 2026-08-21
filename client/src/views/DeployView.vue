<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { S } from '../store.js';
import StatBar from '../components/StatBar.vue';

const v = computed(() => S.view);
const team = computed(() => v.value.team);
const dep = computed(() => (team.value && team.value.deploy) || null);

/* Деплой идёт пайплайном: стадии загораются по очереди. Упавший модуль
   встаёт на своей стадии — её присылает сервер. */
const STAGES = ['сборка', 'тесты', 'выкладка', 'прод'];
const noAnim = typeof window !== 'undefined' && window.matchMedia
  && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const lastStage = computed(() => {
  const d = dep.value;
  if (!d) return STAGES.length;
  return d.ok ? STAGES.length : Math.min(d.stage + 1, STAGES.length);
});
const running = ref(!noAnim && !!dep.value);
const stage = ref(running.value ? 0 : STAGES.length);
let timers = [];

onMounted(() => {
  if (!running.value) return;
  let at = 0;
  for (let s = 1; s <= lastStage.value; s++) {
    at += 480 * (dep.value.retry === s - 1 ? 1.8 : 1);
    const when = at;
    timers.push(setTimeout(() => { stage.value = s; }, when));
  }
  timers.push(setTimeout(() => { running.value = false; }, at + 700));
});
onUnmounted(() => { for (const t of timers) clearTimeout(t); });

const stageClass = (k) => {
  const d = dep.value;
  const fell = d && !d.ok && k === d.stage;
  return {
    on: stage.value > k && !fell,
    bad: fell && stage.value > k,
    now: stage.value === k && running.value,
    again: d && d.ok && d.retry === k && stage.value > k
  };
};
const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : '');
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

      <!-- пайплайн: он виден и пока идёт, и после -->
      <div v-if="dep" class="dep" :class="running ? 'run' : (dep.ok ? 'good' : 'bad')">
        <div class="dl">
          <template v-if="running">пайплайн идёт</template>
          <template v-else-if="dep.ok">в продакшене</template>
          <template v-else>откатили</template>
        </div>
        <div class="dn">{{ dep.name }}</div>
        <span class="bpipe">
          <template v-for="(s, k) in STAGES" :key="k">
            <i v-if="k" class="barr" aria-hidden="true">→</i>
            <i class="bstg" :class="stageClass(k)">{{ s }}<em v-if="stageClass(k).again"> ×2</em></i>
          </template>
        </span>
        <p v-if="running" class="dt mt">Сейчас увидим, дойдёт ли модуль до прода.</p>
        <p v-else-if="dep.ok" class="dt mt">Модуль работает. Бизнес это заметил.</p>
      </div>

      <!-- разбор падения: подробно и простыми словами -->
      <div v-if="!running && dep && !dep.ok" class="why mt">
        <div class="wq">Что случилось</div>
        <p>Пайплайн встал на стадии «{{ dep.stageName }}». {{ dep.what }}</p>
        <div class="wq">Из-за чего</div>
        <p>
          <template v-if="dep.who && dep.pick">{{ dep.who }} выбрал «{{ dep.pick }}».</template>
          {{ cap(dep.flaw) }}.
        </p>
        <template v-if="dep.better">
          <div class="wq">А надо было</div>
          <p>«{{ dep.better }}» — тогда изъяна бы не было и модуль дошёл бы до прода.</p>
        </template>
        <div class="chips"><span class="chip bad">−1 доверие</span></div>
      </div>

      <div v-if="!dep" class="wait mt">
        <div class="wl">Модулей не было</div>
        <div class="ch">
          {{ team && team.lost ? 'День провален: минуты кончились.' : 'Ни одна задача не доведена до внедрения.' }}
        </div>
      </div>

      <p class="hint mt">
        Модуль падает не от везения: изъян появляется там, где проверку сделали для галочки
        или закрыли решение костылём. Стадия, на которой он упадёт, — дело случая.
      </p>
    </div>
    <div class="act">
      <div class="wait">
        <div class="wl">{{ running ? 'Пайплайн идёт' : 'Деплой окончен' }}</div>
        <div class="wv">Ждём ведущего</div>
        <div class="ch">Дальше — общий рейтинг.</div>
      </div>
    </div>
  </div>
</template>
