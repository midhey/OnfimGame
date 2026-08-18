<script setup>
import { computed, ref } from 'vue';
import { S, send } from '../store.js';

const code = ref(S.me.code || '');
const name = ref(S.me.name || '');

const digits = computed(() => code.value.replace(/\D/g, '').slice(0, 4));
const live = computed(() => S.conn === 'live');
const canJoin = computed(() => live.value && digits.value.length === 4 && !!name.value.trim());

function join() {
  if (!canJoin.value) return;
  S.me.name = name.value.trim();
  send({ t: 'join', code: digits.value, name: S.me.name });
}
</script>

<template>
  <div class="app">
    <div class="view">
      <div class="pane">
        <div class="kicker">Обучающая игра</div>
        <h1>Смена</h1>
        <div class="dotstrip" aria-hidden="true"></div>
        <p class="lead">
          Управление по ИТ группы компаний. Завод минеральных удобрений: Великий Новгород,
          Дорогобуж и Талицкий ГОК в Пермском крае.
        </p>
        <p class="hint">
          Играете командами по три человека: менеджер, инженер, тестировщик. Одна мысль на всю игру:
          прежде чем чинить, надо спросить. У кого сломалось, где, с каких пор, что изменилось.
        </p>
        <div class="roles">
          <div class="rrow"><div class="rn c0">Менеджер</div><div class="rj">Говорит с бизнесом. Заводит заявку.</div></div>
          <div class="rrow"><div class="rn c1">Инженер</div><div class="rj">Работает по заявке. Видит только то, что в ней написано.</div></div>
          <div class="rrow"><div class="rn c2">Тестировщик</div><div class="rj">Проверяет, что стало лучше.</div></div>
        </div>
      </div>
    </div>
    <div class="act">
      <div class="ask">Код занятия</div>
      <input
        class="inp code" v-model="code" inputmode="numeric" autocomplete="off"
        maxlength="4" placeholder="0000" aria-label="Код занятия" @keyup.enter="join">
      <input
        class="inp" v-model="name" maxlength="24" autocomplete="off"
        placeholder="Как тебя зовут" aria-label="Имя" @keyup.enter="join">
      <button class="btn primary" :disabled="!canJoin" @click="join">Войти</button>
      <div v-if="!live" class="err">Нет связи с сервером. Пробуем ещё…</div>
      <div v-else-if="!canJoin" class="ask mt" style="text-align:center">
        Нужны код из четырёх цифр и имя
      </div>
      <div class="foot"><a class="lnk" href="#/board">табло занятия</a></div>
    </div>
  </div>
</template>

<style scoped>
.roles{border-top:1px solid var(--line); padding-top:12px}
.rrow{display:flex; gap:10px; padding:5px 0}
.rn{flex:0 0 108px; font:600 11px/1.5 var(--mono); letter-spacing:.04em; text-transform:uppercase}
.rn.c0{color:var(--r0)} .rn.c1{color:var(--r1)} .rn.c2{color:var(--r2)}
.rj{flex:1 1 auto; font-size:14px; color:var(--muted)}
.foot{text-align:center; margin-top:6px}
.foot .lnk{display:inline-block; text-decoration:underline}
</style>
