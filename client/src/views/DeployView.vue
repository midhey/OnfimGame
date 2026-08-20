<script setup>
import { computed } from 'vue';
import { S } from '../store.js';
import StatBar from '../components/StatBar.vue';

const v = computed(() => S.view);
const team = computed(() => v.value.team);
const dep = computed(() => (team.value && team.value.deploy) || null);
</script>

<template>
  <div class="app">
    <StatBar />
    <div class="view">
      <div class="pane">
        <div class="kicker">Деплой модулей</div>
        <h1 v-if="!dep">Внедрять было нечего</h1>
        <h1 v-else-if="dep.ok">Деплой прошёл</h1>
        <h1 v-else>Деплой упал</h1>
      </div>

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
          {{ team && team.lost ? 'День провален: минуты кончились.' : 'Ни один инцидент не был закрыт.' }}
        </div>
      </div>

      <p class="hint mt">
        Модуль падает не от везения: изъян появляется там, где проверку сделали для галочки
        или закрыли решение костылём.
      </p>
    </div>
    <div class="act">
      <div class="wait">
        <div class="wl">Деплой окончен</div>
        <div class="wv">Ждём ведущего</div>
        <div class="ch">Дальше — общий рейтинг.</div>
      </div>
    </div>
  </div>
</template>
