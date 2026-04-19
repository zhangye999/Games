<template>
  <div v-if="show" class="modal-overlay">
    <div class="modal-content">
      <h2>游戏结束</h2>
      <p class="sub">终局已按持有宝藏叠加涨幅结算</p>
      <div class="final-scores">
        <div v-for="(player, index) in sortedPlayers" :key="index" class="player-score">
          <div class="player-name">{{ player.playerName }}</div>
          <div class="player-gems">{{ formatMoney(player.gemNumber) }}</div>
        </div>
      </div>
      <button class="restart-button" @click="handleRestart">
        重新开始
      </button>
    </div>
  </div>
</template>

<script>
export default {
  name: 'DaGameOverModal',
  props: {
    show: { type: Boolean, default: false },
    players: { type: Array, default: () => [] },
  },
  computed: {
    sortedPlayers() {
      return [...this.players].sort((a, b) => b.gemNumber - a.gemNumber);
    },
  },
  methods: {
    formatMoney(n) {
      if (n == null || Number.isNaN(Number(n))) return '—';
      return `${Number(n).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} 资金`;
    },
    handleRestart() {
      this.$emit('restart');
    },
  },
};
</script>

<style scoped>
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-color: rgba(0, 0, 0, 0.7);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1000;
}

.modal-content {
  background: url(/src/assets/DarkWood.jpg);
  padding: 2rem;
  border-radius: 15px;
  min-width: 300px;
  max-width: 520px;
  box-shadow: 0 0 20px rgba(0, 0, 0, 0.5);
  color: #f7d17d;
  text-align: center;
}

h2 {
  margin-bottom: 0.5rem;
  font-size: 1.8rem;
  color: #f7d17d;
  text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.5);
}

.sub {
  margin-bottom: 1.25rem;
  font-size: 0.95rem;
  opacity: 0.9;
}

.final-scores {
  margin-bottom: 2rem;
}

.player-score {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.8rem;
  margin: 0.5rem 0;
  background-color: rgba(0, 0, 0, 0.3);
  border-radius: 8px;
  font-size: 1.1rem;
}

.player-name {
  font-weight: bold;
}

.player-gems {
  color: #ffa64d;
}

.restart-button {
  background: linear-gradient(45deg, #f7d17d, #ffa64d);
  border: none;
  padding: 0.8rem 2rem;
  border-radius: 8px;
  font-size: 1.2rem;
  color: #2c1810;
  cursor: pointer;
  font-weight: bold;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.2);
}
</style>
