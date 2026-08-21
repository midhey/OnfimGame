<script setup>
import { computed } from 'vue';
import { S, send } from '../store.js';
import StatBar from '../components/StatBar.vue';

const v = computed(() => S.view);
const team = computed(() => v.value.team);
const mods = computed(() => (team.value && team.value.modules) || []);
const picked = computed(() => (team.value ? team.value.activated : null));

function activate(k) {
  send({ t: 'activate', k });
}
</script>

<template>
  <div class="app">
    <StatBar />
    <div class="view">
      <div class="pane">
        <div class="kicker">День отыгран</div>
        <h1 v-if="team && team.lost">День провален</h1>
        <h1 v-else-if="team && team.youPickModule && picked === null">Что внедряем?</h1>
        <h1 v-else>Модуль выбран</h1>

        <p v-if="team && team.lost" class="hint">
          Минуты дня кончились — внедрять нечего. Доверие уже списано.
          Ждём остальные команды.
        </p>
        <p v-else-if="!mods.length" class="hint">
          Ни одна задача не доведена — внедрять нечего. Ждём ведущего.
        </p>
        <p v-else-if="team && team.youPickModule && picked === null" class="hint">
          Менеджер выбирает один модуль, который уйдёт в продакшн. Решайте по своей же
          работе: где проверяли честно, а где закрыли на глазок. Изъян всплывёт на деплое.
        </p>
        <p v-else-if="picked !== null" class="hint">
          На внедрение уйдёт «{{ mods[picked] && mods[picked].name }}».
          Ждём, пока ведущий запустит деплой.
        </p>
        <p v-else class="hint">
          Модуль выбирает менеджер вашей команды. Ждём.
        </p>
      </div>

      <div v-if="mods.length" class="mods">
        <button
          v-for="(m, k) in mods" :key="k"
          class="mod" :class="{ on: picked === k }"
          :disabled="!team.youPickModule || team.lost"
          @click="activate(k)">
          <span class="mno">{{ m.no }}</span>
          <span class="mname">{{ m.name }}</span>
          <span class="minc">по задаче «{{ m.incident }}»</span>
          <span v-if="picked === k" class="mok">выбран на внедрение</span>
        </button>
      </div>
    </div>
    <div class="act">
      <div class="wait">
        <div class="wl">{{ picked !== null ? 'Модуль выбран' : 'День закрыт' }}</div>
        <div class="wv">Ждём ведущего</div>
        <div class="ch">Он запустит деплой, когда все команды определятся.</div>
      </div>
    </div>
  </div>
</template>
