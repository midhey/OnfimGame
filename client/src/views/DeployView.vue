<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { S } from '../store.js';
import StatBar from '../components/StatBar.vue';

const v = computed(() => S.view);
const team = computed(() => v.value.team);
const dep = computed(() => (team.value && team.value.deploy) || null);

/* Сначала показываем, что деплой идёт, и только потом — результат.
   Данные уже пришли с сервера, тянем только показ. */
const noAnim = typeof window !== 'undefined' && window.matchMedia
  && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const running = ref(!noAnim);
let t = null;
onMounted(() => { if (!noAnim) t = setTimeout(() => { running.value = false; }, 2200); });
onUnmounted(() => clearTimeout(t));
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

      <!-- идёт -->
      <div v-if="running" class="dep run">
        <div class="dl">идёт деплой</div>
        <div class="dn">{{ dep ? dep.name : 'модуля нет' }}</div>
        <span class="bprog"><i></i></span>
        <p class="dt mt">Сейчас увидим, держится ли он на проде.</p>
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
