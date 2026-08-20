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
        <th>Очки</th>
        <th>Уточнения</th>
        <th>Доверие</th>
        <th>Модули</th>
        <th>Запас</th>
      </tr>
    </thead>
    <tbody>
      <tr v-for="r in rows" :key="r.teamId" :class="{ mine: r.teamId === myTeam }">
        <td>{{ r.rank }}</td>
        <td>
          {{ r.name }}
          <span v-if="r.lost" class="d bad">день провален</span>
          <span v-else-if="r.cut" class="d bad">не успели по таймеру</span>
          <span v-else-if="r.deploy && !r.deploy.ok" class="d bad">деплой упал</span>
        </td>
        <td>{{ r.score }}</td>
        <td>
          {{ r.asks }}
          <span v-if="deltas && r.d && r.d.asks" class="d">{{ sign(r.d.asks) }}</span>
        </td>
        <td>
          {{ r.trust }}
          <span v-if="deltas && r.d && r.d.trust" class="d" :class="{ bad: r.d.trust < 0 }">{{ sign(r.d.trust) }}</span>
        </td>
        <td>
          {{ r.okModules }}
          <span v-if="deltas && r.d && r.d.okModules" class="d">{{ sign(r.d.okModules) }}</span>
        </td>
        <td>
          {{ r.spare }}
          <span v-if="deltas && r.d && r.d.spare" class="d" :class="{ bad: r.d.spare < 0 }">{{ sign(r.d.spare) }}</span>
        </td>
      </tr>
    </tbody>
  </table>
  </div>
</template>
