<script setup>
import { computed, ref } from 'vue';
import { S, send } from '../store.js';

const pass = ref('');
const code = ref(S.me.code || '');
const live = computed(() => S.conn === 'live');
const digits = computed(() => code.value.replace(/\D/g, '').slice(0, 4));

function create() {
  if (!live.value || !pass.value) return;
  send({ t: 'host:create', pass: pass.value });
}
function take() {
  if (!live.value || !pass.value || digits.value.length !== 4) return;
  send({ t: 'host:take', pass: pass.value, code: digits.value });
}
</script>

<template>
  <div class="app">
    <div class="view">
      <div class="pane">
        <div class="kicker">Служебная страница</div>
        <h1>Ведущий</h1>
        <div class="dotstrip" aria-hidden="true"></div>
        <p class="hint">
          Здесь создают занятие и управляют им: старт, таймер, раунды, рейтинг, логи команд.
          Игроки сюда не заходят — им нужна главная страница и код занятия.
        </p>
      </div>
    </div>
    <div class="act">
      <div class="ask">Пароль ведущего</div>
      <input
        class="inp" v-model="pass" type="password" autocomplete="off"
        placeholder="пароль" aria-label="Пароль ведущего" @keyup.enter="create">
      <button class="btn primary" :disabled="!live || !pass" @click="create">Создать занятие</button>
      <div class="ask mt">Или взять идущее занятие по коду</div>
      <input
        class="inp code" v-model="code" inputmode="numeric" autocomplete="off"
        maxlength="4" placeholder="0000" aria-label="Код занятия" @keyup.enter="take">
      <button class="btn" :disabled="!live || !pass || digits.length !== 4" @click="take">
        Взять занятие {{ digits.length === 4 ? digits : '' }}
      </button>
      <div v-if="!live" class="err">Нет связи с сервером. Пробуем ещё…</div>
      <div class="foot"><a class="lnk" href="#/">на страницу игрока</a></div>
    </div>
  </div>
</template>

<style scoped>
.foot{text-align:center; margin-top:6px}
.foot .lnk{display:inline-block; text-decoration:underline}
</style>
