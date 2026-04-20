<template>
  <div id="home-page">
    <div id="WelcomeToIncan">
      <div>大A宝藏</div>
      <div>印加宝藏 · 股市版</div>
    </div>
    <div class="player-options">
      <div>请选择游戏人数</div>
      <div class="player-option-buttons">
        <button
          v-for="num in playerOptions"
          :key="num"
          type="button"
          @click="selectPlayers(num)"
          :class="{ selected: selectedPlayers === num }"
        >
          {{ num }} 人
        </button>
      </div>
    </div>
    <div class="player-options da-difficulty">
      <div class="da-difficulty-title-row">
        <span>市场难度</span>
        <div
          class="da-difficulty-help"
          :class="{ 'is-open': showDifficultyHint }"
        >
          <button
            type="button"
            class="da-difficulty-help-icon"
            @click="showDifficultyHint = !showDifficultyHint"
          >
            ?
          </button>
          <div class="da-difficulty-hint">
            温和：灾难 3%/10%/30%，抛压 0/3/10/30%，宝石 3%~17% + 不在场 20%/人。<br />
            波动：灾难 10%/30%/50%，抛压与残酷相同；宝石基数×3（约 9%~51% 档）+ 不在场 30%/人。<br />
            震荡：灾难与残酷相同；宝石基数×2（约 6%~34% 档）+ 不在场 30%/人。<br />
            残酷：灾难 10%/50%/90%，抛压 0/10/30/50%，宝石 3%~17% + 不在场 30%/人。
          </div>
        </div>
      </div>
      <div class="player-option-buttons">
        <button
          type="button"
          @click="selectMarketDifficulty('mild')"
          :class="{ selected: marketDifficulty === 'mild' }"
        >
          温和
        </button>
        <button
          type="button"
          @click="selectMarketDifficulty('volatile')"
          :class="{ selected: marketDifficulty === 'volatile' }"
        >
          波动
        </button>
        <button
          type="button"
          @click="selectMarketDifficulty('choppy')"
          :class="{ selected: marketDifficulty === 'choppy' }"
        >
          震荡
        </button>
        <button
          type="button"
          @click="selectMarketDifficulty('brutal')"
          :class="{ selected: marketDifficulty === 'brutal' }"
        >
          残酷
        </button>
      </div>
    </div>
    <div id="player-name-input">
      <input v-model="playerName" placeholder="请输入您的昵称" />
    </div>
    <div id="start-game">
      <button
        type="button"
        :disabled="selectedPlayers === null || inMatchQueue || !playerName"
        @click="matchPlayers"
        class="start-btn"
        id="start-button"
      >
        {{ inMatchQueue ? '匹配中...' : '开始游戏' }}
      </button>
    </div>
    <div v-if="errorMessage" class="error-message">{{ errorMessage }}</div>
    <div v-if="inMatchQueue && !showPopup" class="matching-queue-bar">
      <span>正在匹配中…</span>
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

<script src="./DaTreasureIndex.js"></script>

<style>
@import '../IncanGoldIndex/IncanGoldIndex.css';

#home-page{
  background: url(/src/assets/DaA-background.png);
  width: 100vw;
    
  min-height: 90vh;
  
  background-size: cover;
  background-repeat: no-repeat;
}
.error-message {
  text-align: center;
  color: #ff6b6b;
  margin-top: 1rem;
}

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

.da-difficulty {
  margin-top: 1rem;
}

.da-difficulty-title-row {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  position: relative;
}

.da-difficulty-help {
  position: relative;
  display: inline-flex;
  align-items: center;
}

.da-difficulty-help-icon {
  width: 1.2rem;
  height: 1.2rem;
  border-radius: 50%;
  border: 1px solid rgba(247, 209, 125, 0.7);
  background: rgba(0, 0, 0, 0.45);
  color: #f7d17d;
  font-size: 0.8rem;
  line-height: 1;
  font-weight: 700;
  padding: 0;
  cursor: pointer;
}

.da-difficulty-hint {
  position: absolute;
  top: calc(100% + 0.45rem);
  left: 50%;
  transform: translateX(-50%);
  z-index: 5;
  width: min(90vw, 520px);
  padding: 0.65rem 0.75rem;
  border-radius: 8px;
  border: 1px solid rgba(247, 209, 125, 0.25);
  background: rgba(0, 0, 0, 0.62);
  backdrop-filter: blur(2px);
  pointer-events: none;
  opacity: 0;
  visibility: hidden;
  transition: opacity 0.18s ease, visibility 0.18s ease;
  font-size: 0.78rem;
  color: rgba(247, 209, 125, 0.75);
  line-height: 1.45;
  text-align: left;
}

.da-difficulty-help:hover .da-difficulty-hint,
.da-difficulty-help.is-open .da-difficulty-hint {
  opacity: 1;
  visibility: visible;
}
</style>
