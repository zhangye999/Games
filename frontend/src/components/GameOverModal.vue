<template>
  <div v-if="show" class="modal-overlay">
    <div class="modal-content">
      <h2>游戏结束</h2>
      <div class="final-scores">
        <div v-for="(player, index) in sortedPlayers" :key="index" class="player-score">
          <div class="player-name">{{ player.playerName }}</div>
          <div class="player-gems">{{ player.gemNumber }} 宝石</div>
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
  name: 'GameOverModal',
  props: {
    show: {
      type: Boolean,
      default: false
    },
    players: {
      type: Array,
      default: () => []
    }
  },
  computed: {
    sortedPlayers() {
      return [...this.players].sort((a, b) => b.gemNumber - a.gemNumber);
    }
  },
  methods: {
    handleRestart() {
      this.$emit('restart');
    }
  }
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
  max-width: 500px;
  box-shadow: 0 0 20px rgba(0, 0, 0, 0.5);
  color: #f7d17d;
  text-align: center;
}

h2 {
  margin-bottom: 1.5rem;
  font-size: 1.8rem;
  color: #f7d17d;
  text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.5);
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
  font-size: 1.2rem;
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
  transition: transform 0.2s, box-shadow 0.2s;
  font-weight: bold;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.2);
}

.restart-button:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 8px rgba(0, 0, 0, 0.3);
}

.restart-button:active {
  transform: translateY(0);
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
}

/* 移动端适配 */
@media screen and (max-width: 768px) {
  .modal-content {
    margin: 0 1rem;
    padding: 1.5rem;
  }

  h2 {
    font-size: 1.5rem;
  }

  .player-score {
    font-size: 1rem;
    padding: 0.6rem;
  }

  .restart-button {
    padding: 0.6rem 1.5rem;
    font-size: 1rem;
  }
}
</style> 