<template>
  <div id="home-page">
    <div id="WelcomeToIncan">
      <div>勇敢的探险者</div>
      <div>欢迎来到印加宝藏！</div>
    </div>
    <div class="player-options">
      <div>请选择游戏人数</div>
      <div class="player-option-buttons">
        <button 
          v-for="num in playerOptions" 
          :key="num" 
          @click="selectPlayers(num)" 
          :class="{'selected': selectedPlayers === num}">
          {{ num }} 人
        </button>
      </div>
    </div>
    <div id="player-name-input">
      <input v-model="playerName" placeholder="请输入您的昵称" />
    </div>
    <div id="start-game">
      <button
        type="button"
        :disabled="(selectedPlayers === null) || inMatchQueue || (!playerName)"
        @click="matchPlayers"
        class="start-btn"
        id="start-button">
        {{ inMatchQueue ? "匹配中..." : "开始游戏" }}
      </button>
    </div>
    <div v-if="errorMessage" class="error-message">{{ errorMessage }}</div>
    <div v-if="inMatchQueue && !showPopup" class="matching-queue-bar">
      <span>正在匹配中...</span>
      <button type="button" class="queue-bar-btn" @click="showPopup = true">显示进度</button>
      <button type="button" class="queue-bar-btn queue-bar-exit" @click="exitMatchingQueue">
        退出匹配
      </button>
    </div>
    <div v-if="showPopup" class="popup-overlay" @click.self="hideMatchingPopup">
      <div class="popup-box" @click.stop>
        <p>{{ popupMessage }}</p>
        <div class="popup-actions">
          <button type="button" @click="hideMatchingPopup">隐藏</button>
          <button type="button" class="popup-exit" @click="exitMatchingQueue">退出匹配</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script src="../IncanGoldIndex/IncanGoldIndex.js">


</script>



<style>
@import './IncanGoldIndex.css';

.popup-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 999;
}

.popup-box {
  background: #222;
  color: #f7d17d;
  padding: 1.5rem 2rem;
  border-radius: 10px;
  max-width: 90vw;
  text-align: center;
}

.popup-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  justify-content: center;
  margin-top: 1rem;
}

.popup-actions button,
.popup-box .popup-actions button {
  margin-top: 0;
  padding: 0.5rem 1rem;
  cursor: pointer;
}

.popup-exit {
  background: rgba(192, 57, 43, 0.5);
  border: 1px solid #c0392b;
  color: #ffb3a7;
}

.matching-queue-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: 0.75rem;
  margin: 1rem auto;
  padding: 0.65rem 1rem;
  max-width: 520px;
  background: rgba(0, 0, 0, 0.4);
  border-radius: 8px;
  color: #f7d17d;
  font-size: 0.95rem;
}

.queue-bar-btn {
  padding: 0.35rem 0.75rem;
  border-radius: 6px;
  border: 1px solid #666;
  background: #333;
  color: #f7d17d;
  cursor: pointer;
}

.queue-bar-exit {
  border-color: #c0392b;
  color: #ffb3a7;
}
</style>
