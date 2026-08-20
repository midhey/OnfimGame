<script setup>
import { computed } from 'vue';
import { S } from './store.js';
import JoinView from './views/JoinView.vue';
import LobbyView from './views/LobbyView.vue';
import RoundView from './views/RoundView.vue';
import ActivateView from './views/ActivateView.vue';
import DeployView from './views/DeployView.vue';
import RatingView from './views/RatingView.vue';
import FinalView from './views/FinalView.vue';
import HostAuth from './views/HostAuth.vue';
import HostView from './views/HostView.vue';
import BoardView from './views/BoardView.vue';

const v = computed(() => S.view);

const screen = computed(() => {
  /* отдельные страницы: табло и ведущий */
  if (S.page === 'board') return BoardView;
  if (S.page === 'host') {
    return v.value && v.value.you && v.value.you.isHost ? HostView : HostAuth;
  }
  /* обычный игрок */
  if (!v.value || !v.value.you) return JoinView;
  if (v.value.you.isHost) return HostView;
  if (v.value.phase === 'lobby') return LobbyView;
  if (v.value.phase === 'round') return v.value.team ? RoundView : LobbyView;
  if (v.value.phase === 'activate') return v.value.team ? ActivateView : LobbyView;
  if (v.value.phase === 'deploy') return v.value.team ? DeployView : LobbyView;
  if (v.value.phase === 'rating') return RatingView;
  if (v.value.phase === 'final') return FinalView;
  return LobbyView;
});
</script>

<template>
  <component :is="screen" />
  <div v-if="S.error" class="toast">{{ S.error }}</div>
</template>

<style>
.toast{
  position:fixed; left:50%; transform:translateX(-50%); bottom:16px; z-index:20;
  max-width:min(460px, calc(100vw - 24px));
  background:var(--ink); color:#fff; border-radius:10px;
  padding:11px 14px; font-size:14px; line-height:1.35; text-align:center;
  box-shadow:0 6px 24px rgba(33,38,46,.22);
}
</style>
