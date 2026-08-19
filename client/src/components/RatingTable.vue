<script setup>
defineProps({
  rows: { type: Array, default: () => [] },
  myTeam: { type: String, default: null },
  deltas: { type: Boolean, default: true }
});
const sign = (n) => (n > 0 ? '+' + n : '−' + Math.abs(n));
</script>

<template>
  <div class="tblwrap">
  <table class="tbl">
    <thead>
      <tr>
        <th>#</th>
        <th>Команда</th>
        <th>Уточнения</th>
        <th>Доверие</th>
        <th>Запас</th>
        <th>Инциденты</th>
      </tr>
    </thead>
    <tbody>
      <tr v-for="r in rows" :key="r.teamId" :class="{ mine: r.teamId === myTeam }">
        <td>{{ r.rank }}</td>
        <td>
          {{ r.name }}
          <span v-if="r.cut" class="d bad">не успели по таймеру</span>
          <span v-else-if="r.outOfTime" class="d bad">кончилось игровое время</span>
        </td>
        <td>
          {{ r.asks }}
          <span v-if="deltas && r.d && r.d.asks" class="d">{{ sign(r.d.asks) }}</span>
        </td>
        <td>
          {{ r.trust }}
          <span v-if="deltas && r.d && r.d.trust" class="d" :class="{ bad: r.d.trust < 0 }">{{ sign(r.d.trust) }}</span>
        </td>
        <td>
          {{ r.bank }}
          <span v-if="deltas && r.d && r.d.bank" class="d" :class="{ bad: r.d.bank < 0 }">{{ sign(r.d.bank) }}</span>
        </td>
        <td>{{ r.incDone }}</td>
      </tr>
    </tbody>
  </table>
  </div>
</template>
