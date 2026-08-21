<script setup>
import { computed, nextTick, ref, watch } from 'vue';
import FeedItem from './FeedItem.vue';

const props = defineProps({ items: { type: Array, default: () => [] } });
const box = ref(null);
const opened = ref({});   // раскрытые вручную старые задачи

function toBottom() {
  const el = box.value;
  if (el) el.scrollTop = el.scrollHeight;
}
watch(
  () => props.items.map((i) => i.id + (i.action ? 'a' : '') + (i.result ? 'r' : '')).join(','),
  () => nextTick(toBottom),
  { immediate: true }
);

/* лента группируется по задачам: старые сворачиваются в одну строку */
const grouped = computed(() => {
  const head = [];
  const groups = [];
  let cur = null;
  for (const it of props.items) {
    if (it.kind === 'inc') {
      cur = { key: it.id, inc: it, items: [it], done: false, dt: 0, dr: 0 };
      groups.push(cur);
      continue;
    }
    if (!cur) { head.push(it); continue; }
    cur.items.push(it);
    if (it.kind === 'truth') cur.done = true;
    if (it.kind === 'turn' && it.result) { cur.dt += it.result.dt || 0; cur.dr += it.result.dr || 0; }
    if (it.kind === 'noise') cur.dt += it.dt || 0;
  }
  return { head, groups };
});

const liveId = computed(() => {
  for (let i = props.items.length - 1; i >= 0; i--) {
    const it = props.items[i];
    if (it.kind === 'turn') return it.result ? null : it.id;
  }
  return null;
});
const liveRole = computed(() => {
  for (let i = props.items.length - 1; i >= 0; i--) {
    const it = props.items[i];
    if (it.kind === 'turn') return it.result ? null : it.role;
  }
  return null;
});

const fmt = (n) => (n < 0 ? '−' : '+') + Math.abs(n);
function toggle(key) {
  opened.value = { ...opened.value, [key]: !opened.value[key] };
}
</script>

<template>
  <div class="view feedbg" :class="liveRole !== null ? 'bg' + liveRole : ''" ref="box">
    <FeedItem v-for="it in grouped.head" :key="it.id" :it="it" :live-id="liveId" />

    <template v-for="(g, gi) in grouped.groups" :key="g.key">
      <!-- старые задачи свёрнуты в одну строку -->
      <template v-if="gi < grouped.groups.length - 1">
        <button type="button" class="arch" @click="toggle(g.key)">
          <span class="an">Задача {{ g.inc.idx }}/{{ g.inc.total }} &middot; {{ g.inc.no }}</span>
          <span class="as">
            {{ fmt(g.dt) }} мин<template v-if="g.dr"> &middot; доверие {{ fmt(g.dr) }}</template>
            &middot; {{ opened[g.key] ? 'скрыть' : 'показать' }}
          </span>
        </button>
        <div v-if="opened[g.key]" class="archbody">
          <FeedItem v-for="it in g.items" :key="it.id" :it="it" :live-id="liveId" />
        </div>
      </template>

      <!-- текущая задача — целиком -->
      <template v-else>
        <FeedItem v-for="it in g.items" :key="it.id" :it="it" :live-id="liveId" />
      </template>
    </template>
  </div>
</template>
