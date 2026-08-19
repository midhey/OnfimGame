<script setup>
defineProps({
  it: { type: Object, required: true },
  liveId: { type: Number, default: null }
});
const timeChip = (dt) => (dt < 0 ? '−' : '+') + Math.abs(dt) + ' мин';
const trustChip = (dr) => (dr < 0 ? '−' : '+') + Math.abs(dr) + ' ' + (Math.abs(dr) === 1 ? 'доверие' : 'доверия');
</script>

<template>
  <!-- шапка раунда -->
  <div v-if="it.kind === 'round'" class="plate strong">
    {{ it.title }}<template v-if="it.trial"> · очки не считаются</template>
  </div>

  <!-- шапка инцидента -->
  <div v-else-if="it.kind === 'inc'" class="plate">
    Инцидент {{ it.idx }} / {{ it.total }} &middot; {{ it.place }} &middot; {{ it.clock }}
    <template v-if="it.channel"><br>Чат «{{ it.channel }}»</template>
  </div>

  <div v-else-if="it.kind === 'plate'" class="plate">{{ it.text }}</div>

  <!-- карточка хода: ситуация -> выбор -> итог -->
  <article
    v-else-if="it.kind === 'turn'"
    class="kard"
    :class="['r' + it.role, { live: it.id === liveId, done: !!it.result }]">
    <header class="khd">
      <span v-if="it.situation.type === 'chat'">Ход {{ it.roleGen }}</span>
      <span v-else-if="it.situation.type === 'prompt'">Ход {{ it.roleGen }} &middot; {{ it.situation.back ? 'по замечаниям тестировщика' : 'закрытие' }}</span>
      <span v-else>Заявка {{ it.situation.no }} &middot; {{ it.situation.status }} &middot; {{ it.roleName }}</span>
      <span>{{ it.situation.at }}</span>
    </header>

    <div class="kbody">
      <template v-if="it.situation.type === 'chat'">
        <p v-if="it.situation.note" class="knote">{{ it.situation.note }}</p>
        <div v-if="it.situation.author" class="kwho">{{ it.situation.author }}</div>
        <p v-for="(line, i) in it.situation.lines" :key="i" class="kline">{{ line }}</p>
      </template>
      <template v-else-if="it.situation.type === 'prompt'">
        <p class="kline">{{ it.situation.text }}</p>
      </template>
      <template v-else>
        <p class="kline">{{ it.situation.text }}</p>
        <div class="kfoot">Управление по ИТ &middot; {{ it.situation.place }}</div>
      </template>
    </div>

    <div v-if="it.action" class="kpick">
      <div class="klb">Выбор {{ it.roleGen }} &middot; {{ it.action.at }}</div>
      <p class="ktx">{{ it.action.text }}</p>
    </div>

    <div v-if="it.result" class="kres">
      <div class="klb">Итог &middot; {{ it.result.at }}</div>
      <p class="ktx">{{ it.result.text }}</p>
      <div v-if="it.result.dt || it.result.dr" class="chips">
        <span v-if="it.result.dt" class="chip">{{ timeChip(it.result.dt) }}</span>
        <span v-if="it.result.dr" class="chip" :class="it.result.dr < 0 ? 'bad' : 'good'">{{ trustChip(it.result.dr) }}</span>
      </div>
    </div>
  </article>

  <!-- на самом деле -->
  <template v-else-if="it.kind === 'truth'">
    <div class="plate">Инцидент закрыт &middot; {{ it.no }}</div>
    <div class="truth">
      <div class="tl">На самом деле</div>
      <p>{{ it.text }}</p>
    </div>
    <div class="tmeta">{{ it.title }} &middot; {{ it.place }}</div>
  </template>

  <!-- шум -->
  <template v-else-if="it.kind === 'noise'">
    <div class="plate">Пока вы разбирались</div>
    <div class="noise">
      <div class="nl">{{ it.label }}</div>
      <p>{{ it.text }}</p>
      <div v-if="it.meta" class="nm">{{ it.meta }}</div>
      <div v-if="it.dt" class="chips"><span class="chip">{{ timeChip(it.dt) }}</span></div>
    </div>
  </template>
</template>
