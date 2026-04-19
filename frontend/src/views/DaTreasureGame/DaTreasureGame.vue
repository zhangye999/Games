<template>
  <div id="game-page" class="da-game-page">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
    <div class="room-info">
      大A宝藏 · 房间 {{ roomId }}
      <span class="market-diff-tag">市场：{{ marketDifficultyLabel }}</span>
    </div>
    <div class="game-status-area">
        <div class="game-status">
          <div class="round-info">第 {{ currentRound }} 轮</div>
          <div class="deck-info">剩余牌数: {{ remainingCards }}</div>
          <div v-if="stakingPhase" class="staking-banner">入市阶段：请提交本场携带资金</div>
          <div v-if="stakingPhase && couldNotEnterRound" class="cant-enter-banner">
            资金不足1000，本轮无法入场。你仍算作「不在场」，参与宝石涨幅的「少一人加成」判定。
          </div>
          <div v-if="treasuresOnGround.length > 0" class="treasures-info">
            场上未兑付宝藏: {{ treasuresOnGround.map(t => t.value).join(', ') }}（终局百分比）
          </div>
        </div>
        <div class="da-panel-head da-panel-head--charts">
            <button
              type="button"
              class="da-collapse-trigger"
              @click="chartsPanelCollapsed = !chartsPanelCollapsed"
              :aria-expanded="!chartsPanelCollapsed"
            >
              <span class="collapse-tri" :class="{ open: !chartsPanelCollapsed }" aria-hidden="true" />
              <span>图表</span>
            </button>
          </div>
    </div>
    

    <div
      v-if="chartHistory.length > 0 || fullSessionChartHistory.length > 0"
      class="da-charts-outer"
    >
      
      <div v-show="!chartsPanelCollapsed" class="da-charts-panel-body">
        <div class="chart-style-toggle">
          <span class="chart-style-label">图表样式（仅本机）</span>
          <button
            type="button"
            class="chart-style-btn"
            :class="{ active: chartDisplayMode === 'line' }"
            @click="setChartDisplayMode('line')"
          >
            折线
          </button>
          <button
            type="button"
            class="chart-style-btn"
            :class="{ active: chartDisplayMode === 'candle' }"
            @click="setChartDisplayMode('candle')"
          >
            蜡烛
          </button>
        </div>

        <!-- 本局（本轮）走势图：默认隐藏，代码保留；将 showRoundMarketChart 设为 true 可显示 -->
        <div v-show="showRoundMarketChart" class="chart-block chart-block--round da-chart-round-legacy">
          <div class="chart-title">本轮市场指数（每轮从 100 起）</div>
          <p class="chart-hint">{{ marketGemChartHint }}</p>
          <svg class="chart-svg chart-svg--round" viewBox="0 0 400 110" preserveAspectRatio="none">
            <g v-if="chartDisplayMode === 'line'">
              <polyline fill="none" stroke="#f7d17d" stroke-width="2" :points="marketRoundLinePoints()" />
            </g>
            <g v-else>
              <line
                v-for="(c, ci) in marketRoundCandleBars"
                :key="'rwk-' + ci"
                :x1="c.xMid"
                :y1="c.wickTop"
                :x2="c.xMid"
                :y2="c.wickBot"
                stroke="rgba(255,255,255,0.35)"
                stroke-width="1"
              />
              <rect
                v-for="(c, ci) in marketRoundCandleBars"
                :key="'rwb-' + ci"
                :x="c.xMid - c.cw / 2"
                :y="c.bodyY"
                :width="c.cw"
                :height="c.bodyH"
                :fill="c.bull ? 'rgba(247, 209, 125, 0.45)' : 'rgba(248, 113, 113, 0.45)'"
                :stroke="c.bull ? '#f7d17d' : '#f87171'"
                stroke-width="1"
              />
            </g>
          </svg>
          <div class="chart-caption">本轮 {{ formatMoney(roundMarketIndex) }}</div>
        </div>

        <div
          v-if="fullSessionChartHistory.length > 0"
          class="da-charts-main-row"
        >
          <div class="da-chart-col da-chart-col--session">
            <div class="chart-block chart-block--session">
              <div class="chart-title">全周期市场指数（整局连续）</div>
              <p class="chart-hint">{{ marketSessionChartHint }}</p>
              <svg class="chart-svg chart-svg--session" viewBox="0 0 400 200" preserveAspectRatio="none">
                <g v-if="chartDisplayMode === 'line'">
                  <polyline fill="none" stroke="#6ee7b7" stroke-width="2" :points="marketSessionLinePoints()" />
                </g>
                <g v-else>
                  <line
                    v-for="(c, ci) in marketSessionCandleBars"
                    :key="'swk-' + ci"
                    :x1="c.xMid"
                    :y1="c.wickTop"
                    :x2="c.xMid"
                    :y2="c.wickBot"
                    stroke="rgba(255,255,255,0.35)"
                    stroke-width="1"
                  />
                  <rect
                    v-for="(c, ci) in marketSessionCandleBars"
                    :key="'swb-' + ci"
                    :x="c.xMid - c.cw / 2"
                    :y="c.bodyY"
                    :width="c.cw"
                    :height="c.bodyH"
                    :fill="c.bull ? 'rgba(110, 231, 183, 0.45)' : 'rgba(248, 113, 113, 0.45)'"
                    :stroke="c.bull ? '#6ee7b7' : '#f87171'"
                    stroke-width="1"
                  />
                </g>
              </svg>
              <div class="chart-caption">全周期 {{ formatMoney(sessionMarketIndex) }}</div>
              <div class="session-debug-inline">
                <button
                  type="button"
                  class="da-collapse-trigger session-debug-toggle"
                  @click="debugLogCollapsed = !debugLogCollapsed"
                  :aria-expanded="!debugLogCollapsed"
                >
                  <span class="collapse-tri" :class="{ open: !debugLogCollapsed }" aria-hidden="true" />
                  <span>调试信息</span>
                </button>
                <div class="game-footer-panel">
                  <div class="game-footer-actions">
                    <button type="button" class="normal-button" :disabled="!canNextRound" @click="nextRound">下一轮</button>
                    <button type="button" class="normal-button" @click="resetGame">重置</button>
                    <button type="button" class="normal-button debug-foot-btn" @click="debugState">调试</button>
                  </div>
                </div>
                
              </div>
              <div
                  v-show="!debugLogCollapsed"
                  class="game-messages session-debug-messages"
                >
                  <div v-for="(message, idx) in messages" :key="'sd-' + idx" class="message">{{ message }}</div>
                </div>
            </div>
          </div>
          <div class="da-chart-col da-chart-col--wealth">
            <div class="wealth-charts-section wealth-charts-section--inline">
              <div class="wealth-section-title">
                总资金走势（账外+场内）
                <span class="wealth-section-sub">同一纵轴比例；虚线为轮次分界</span>
              </div>
              <div class="wealth-charts-stack">
                <div
                  v-for="(player, index) in players"
                  :key="'w-' + index"
                  class="wealth-chart-card"
                >
                  <div class="wealth-chart-name">{{ player.playerName }}</div>
                  <svg class="wealth-chart-svg" viewBox="0 0 280 100" preserveAspectRatio="none">
                    <line
                      v-for="(rx, ri) in wealthRoundDividerXs"
                      :key="'rd-' + ri"
                      :x1="rx"
                      y1="0"
                      :x2="rx"
                      y2="100"
                      stroke="rgba(255,255,255,0.22)"
                      stroke-width="1"
                      stroke-dasharray="4 4"
                    />
                    <g v-if="chartDisplayMode === 'line'">
                      <polyline
                        fill="none"
                        stroke="#ffa64d"
                        stroke-width="2"
                        :points="wealthFullLinePoints(player.playerId)"
                      />
                    </g>
                    <g v-else>
                      <line
                        v-for="(c, ci) in wealthCandleBarsForPlayer(player.playerId)"
                        :key="'wwk-' + player.playerId + '-' + ci"
                        :x1="c.xMid"
                        :y1="c.wickTop"
                        :x2="c.xMid"
                        :y2="c.wickBot"
                        stroke="rgba(255,255,255,0.35)"
                        stroke-width="1"
                      />
                      <rect
                        v-for="(c, ci) in wealthCandleBarsForPlayer(player.playerId)"
                        :key="'wwb-' + player.playerId + '-' + ci"
                        :x="c.xMid - c.cw / 2"
                        :y="c.bodyY"
                        :width="c.cw"
                        :height="c.bodyH"
                        :fill="c.bull ? 'rgba(255, 166, 77, 0.45)' : 'rgba(248, 113, 113, 0.45)'"
                        :stroke="c.bull ? '#ffa64d' : '#f87171'"
                        stroke-width="1"
                      />
                    </g>
                  </svg>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div id="player-info-area">
      <div
        v-for="(player, index) in players"
        :key="index"
        class="player-info"
        :class="{ 'current-player': player.playerId === playerIdLocal }"
      >
        <div class="player-name-status">
          <div id="player-name">
            <div>{{ player.playerName }}</div>
            <div v-if="player.playerId === playerIdLocal" id="player-name-you">(你)</div>
          </div>
          <div class="player-status">
            <div>
              <span v-if="player.couldNotEnterRound">观望（不足1000）</span>
              <span v-else>{{ player.inCamp ? '已离场' : '在场内' }}</span>
            </div>
            <div v-if="isVotingPhase && !player.inCamp">
              {{ player.hasVoted ? '已表决' : '表决中…' }}
            </div>
          </div>
        </div>
        <div class="total-gem">
          <div>账外资金</div>
          <div class="gem-number">{{ formatMoney(player.totalCapital) }}</div>
        </div>
        <div class="round-gem" v-if="!player.inCamp">
          <div>场内资金</div>
          <div class="gem-number">{{ formatMoney(player.roundCapital) }}</div>
        </div>
        <div v-if="player.ownedTreasures && player.ownedTreasures.length" class="owned-t">
          已获宝藏(终局): {{ player.ownedTreasures.map(t => '+' + t + '%').join('、') }}
        </div>
      </div>
    </div>

    <div v-if="canSubmitStake && !couldNotEnterRound" class="staking-panel">
      <div class="staking-title">本场携带资金（{{ minStakeHint }}）</div>
      <div class="staking-row">
        <input v-model="stakeInput" type="number" class="stake-input" placeholder="金额" />
        <button type="button" class="normal-button" @click="fillAllIn">全仓</button>
        <button type="button" class="normal-button primary" @click="submitStake">确认入市</button>
      </div>
    </div>

    <div class="card-display-area da-card-zone">
      <div class="da-card-zone-main">
        <div class="card-stack-wrap">
          <div
            id="card-stack"
            :class="{ 'da-card-stack--voting-ui': cardStackVotingUiActive }"
            @click="handleClick($event, drawCard)"
            @touchstart="handleTouch($event, drawCard)"
          >
            <div v-for="i in 9" :key="i" class="card-stack-layer"></div>
            <div class="card-stack-top" :class="{ disabled: !canDrawCard }">
              <img src="../../assets/4-3card2.jpg" alt="抽牌">
              <div v-if="canDrawCard && !canVote" class="draw-hint">开牌</div>
            </div>
            <div
              v-if="canVote"
              class="card-stack-vote-overlay"
              role="presentation"
              @click.stop
              @touchstart.stop
            >
              <div
                class="vote-mask vote-mask--stay"
                title="继续持有"
                @click="handleClick($event, () => vote('stay'))"
                @touchstart="handleTouch($event, () => vote('stay'))"
              >
                <span class="vote-mask__label">继续持有</span>
              </div>
              <div
                class="vote-mask vote-mask--sell"
                title="卖出"
                @click="handleClick($event, () => vote('leave'))"
                @touchstart="handleTouch($event, () => vote('leave'))"
              >
                <span class="vote-mask__label">卖出</span>
              </div>
            </div>
            <div
              v-else-if="hasVoted && isVotingPhase && !isInCamp"
              class="card-stack-wait-hint"
              @click.stop
              @touchstart.stop
            >
              等待表决…
            </div>
          </div>
        </div>
        <div id="card-display">
          <div
            v-for="(card, index) in cards"
            :key="index"
            class="card"
            :class="[card.type, { disaster: card.type === 'disaster' }, getDisasterClass(card)]"
          >
            <div class="card-value">{{ getCardName(card) }}</div>
          </div>
        </div>
      </div>
      <div v-if="isVotingPhase && isInCamp" class="da-vote-banner">已离场 · 等待他人表决</div>
    </div>

    <DaGameOverModal :show="showGameOverModal" :players="gameOverPlayers" @restart="resetGame" />
  </div>
</template>

<script>
import DaGameOverModal from '../../components/DaGameOverModal.vue';
import DaTreasureGameLogic from './DaTreasureGame.js';

export default {
  ...DaTreasureGameLogic,
  components: {
    DaGameOverModal,
  },
};
</script>

<style>
@import url(../IncanGoldGame/IncanGoldGame.css);

/* 覆盖基类 #game-page 的 100vw：与 vw 子元素叠加时易横向溢出；改为在父级宽度内收缩 */
#game-page.da-game-page {
  width: 100%;
  min-width:100vw;
  max-width: 100%;
  box-sizing: border-box;
}

.da-game-page .market-diff-tag {
  margin-left: 0.75rem;
  font-size: 0.9rem;
  color: #9be7c4;
}

.wealth-section-sub {
  display: block;
  font-size: 0.72rem;
  font-weight: normal;
  color: rgba(247, 209, 125, 0.65);
  margin-top: 0.35rem;
  line-height: 1.35;
}
.game-status-area {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 0.5rem;
  box-sizing: border-box;
  max-width: 100%;
  margin: 0 2vw 0 2vw;
}

.game-status {
  flex: 1 1 auto;
  min-width: 0;
  padding:0;
  margin:0;
}
.chart-style-toggle {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  margin: 0.5rem auto 0;
  max-width: 960px;
  padding: 0 0.5rem;
  font-size: 0.85rem;
  color: rgba(247, 209, 125, 0.9);
}

.chart-style-label {
  margin-right: 0.25rem;
}

.chart-style-btn {
  padding: 0.35rem 0.85rem;
  border-radius: 6px;
  border: 1px solid #555;
  background: #2a2a2a;
  color: #ccc;
  cursor: pointer;
}

.chart-style-btn.active {
  border-color: #f7d17d;
  color: #f7d17d;
  background: rgba(247, 209, 125, 0.12);
}

.da-game-page .staking-panel {
  margin: 1rem auto;
  padding: 1rem;
  max-width: 520px;
  background: rgba(0, 0, 0, 0.35);
  border-radius: 10px;
  color: #f7d17d;
}

.staking-title {
  margin-bottom: 0.5rem;
  font-weight: bold;
}

.staking-row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  align-items: center;
}

.stake-input {
  flex: 1;
  min-width: 120px;
  padding: 0.5rem;
  font-size: 1rem;
  border-radius: 6px;
  border: 1px solid #666;
}

.da-game-page .vote-btn {
  padding: 0.75rem 1.5rem;
  font-size: 1rem;
  border-radius: 8px;
  border: none;
  cursor: pointer;
  font-weight: bold;
  margin: 0 0.5rem;
}

.vote-btn.leave {
  background: linear-gradient(180deg, #c0392b, #962d22);
  color: #fff;
}

.vote-btn.stay {
  background: linear-gradient(180deg, #27ae60, #1e8449);
  color: #fff;
}

.staking-banner {
  color: #ffd480;
  font-weight: bold;
}

.owned-t {
  font-size: 0.85rem;
  color: #ffa64d;
  margin-top: 0.25rem;
}

.da-game-page .normal-button.primary {
  background: linear-gradient(180deg, #e67e22, #d35400);
  color: #fff;
}

.cant-enter-banner {
  margin-top: 0.5rem;
  padding: 0.5rem 0.75rem;
  background: rgba(192, 57, 43, 0.35);
  border-radius: 8px;
  color: #ffb3a7;
  font-size: 0.9rem;
}

.da-charts-outer {
  max-width: 960px;
  margin: 0.35rem auto 0.5rem;
  padding: 0 0.5rem;
}

.da-panel-head--charts {
  margin-bottom: 0.25rem;
}

.da-collapse-trigger {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  

  background: rgba(0, 0, 0, 0.25);
  border: 1px solid rgba(247, 209, 125, 0.25);
  border-radius: 6px;
  color: #f7d17d;
  cursor: pointer;
  font-size: 0.6rem;
}

.da-collapse-trigger:hover {
  border-color: rgba(247, 209, 125, 0.45);
}

.collapse-tri {
  display: inline-block;
  width: 0;
  height: 0;
  border-left: 5px solid transparent;
  border-right: 5px solid transparent;
  border-top: 7px solid #f7d17d;
  transform: rotate(-90deg);
  transition: transform 0.2s ease;
}

.collapse-tri.open {
  transform: rotate(0deg);
}

.da-charts-panel-body {
  padding-top: 0.35rem;
}

.da-charts-main-row {
  display: grid;
  grid-template-columns: 60% 40%;
  gap: 0.65rem 0.75rem;
  align-items: stretch;
  margin-top: 0.35rem;
  min-height: 320px;
}

.da-chart-col {
  display: flex;
  flex-direction: column;
  min-height: 0;
}

@media (max-width: 768px) {
  .da-charts-main-row {
    grid-template-columns: 1fr;
    min-height: 0;
  }
}

.da-chart-round-legacy {
  margin-bottom: 0.5rem;
}

.wealth-charts-section.wealth-charts-section--inline {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  max-width: none;
  margin: 0;
  padding: 0.5rem 0.45rem;
  background: rgba(0, 0, 0, 0.22);
}

.da-chart-col--wealth .wealth-charts-stack {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
}

.da-chart-col--wealth .wealth-section-title {
  font-size: 0.88rem;
  margin-bottom: 0.45rem;
  text-align: left;
}

.da-chart-col--wealth .wealth-chart-svg {
  max-width: 100%;
}

.chart-block {
  color: #f7d17d;
  padding: 0.75rem;
  background: rgba(0, 0, 0, 0.25);
  border-radius: 10px;
  height: 100%;
}

.chart-block.chart-block--session {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  height: auto;
}

.chart-title {
  font-size: 0.95rem;
  font-weight: bold;
  margin-bottom: 0.25rem;
}

.chart-hint {
  font-size: 0.72rem;
  color: rgba(247, 209, 125, 0.75);
  margin: 0 0 0.4rem 0;
  line-height: 1.35;
}

.chart-svg {
  width: 100%;
  display: block;
  background: rgba(0, 0, 0, 0.2);
  border-radius: 6px;
}

.chart-svg--round {
  height: 118px;
}

.chart-block--session .chart-svg--session {
  flex: 1 1 auto;
  min-height: 140px;
  width: 100%;
  height: auto;
  max-height: none;
}

.session-debug-inline {
  flex-shrink: 0;
  display:flex;
  margin-top: 0.45rem;
  padding-top: 0.4rem;
  border-top: 1px solid rgba(247, 209, 125, 0.15);
}

.da-game-page .session-debug-toggle.da-collapse-trigger {
  margin-top: 0;
}

.da-game-page .game-messages.session-debug-messages {
  max-width: none;
  margin: 0.35rem 0 0;
  padding: 0.35rem 0.45rem;
  max-height: 96px;
  font-size: 0.82rem;
}

.chart-caption {
  margin-top: 0.35rem;
  font-size: 0.9rem;
  color: #ffd480;
}

.wealth-charts-section {
  max-width: 640px;
  margin: 0.65rem auto 0.85rem;
  padding: 0.65rem 0.85rem;
  background: rgba(0, 0, 0, 0.28);
  border-radius: 12px;
}

.wealth-section-title {
  font-size: 1rem;
  font-weight: bold;
  color: #f7d17d;
  margin-bottom: 0.75rem;
  text-align: center;
}

.wealth-charts-stack {
  display: flex;
  flex-direction: column;
  gap: 0.55rem;
  max-width: 100%;
  margin: 0;
}

.wealth-chart-card {
  background: rgba(0, 0, 0, 0.2);
  border-radius: 8px;
  padding: 0.5rem;
}

.wealth-chart-name {
  font-size: 0.85rem;
  font-weight: bold;
  color: #ffa64d;
  margin-bottom: 0.35rem;
}

.wealth-chart-svg {
  width: 100%;
  max-width: 280px;
  height: 92px;
  margin: 0 auto;
  display: block;
  background: rgba(0, 0, 0, 0.15);
  border-radius: 4px;
}

/* 牌区：主区域 + 右侧表决，紧凑 */
.da-game-page .da-card-zone.card-display-area {
  height: auto;
  min-height: 38vh;
  max-height: 52vh;
  display: flex;
  flex-direction: row;
  flex-wrap: wrap;
  align-items: stretch;
  gap: 0.35rem 0.65rem;
  padding: 0 0.35rem;
}

/*
  牌面宽度与牌堆共用同一套变量，随窗口连续缩放（与单独媒体查询里改 .card 尺寸不同，避免堆与牌不一致）。
  换行：仅当「牌堆旁剩余宽度」≥ 三张牌 + 间隙时，翻牌区才与牌堆同一行（flex 子项 min-width）。
*/
.da-game-page {
  --da-card-gap: 10px;
  --da-play-card-w: clamp(120px, 22vw, 200px);
  --da-play-card-h: calc(var(--da-play-card-w) * 270 / 200);
  --da-stack-h: calc(var(--da-play-card-w) * 280 / 200);
  --da-three-cards-min: calc(3 * var(--da-play-card-w) + 2 * var(--da-card-gap));
}

.da-game-page .da-card-zone-main {
  flex: 1 1 65%;
  min-width: 0;
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  align-content: flex-start;
  gap: 0.65rem 0.85rem;
  min-height: min(48vh, 420px);
  height: auto;
  margin-bottom: 10vh;
  box-sizing: border-box;
}

/* 翻出牌区：与牌堆同一行仅当剩余空间至少容纳三张牌；否则整区换行 */
.da-game-page #card-display {
  width: auto !important;
  max-width: 100%;
  flex: 1 1 var(--da-three-cards-min);
  min-width: min(100%, var(--da-three-cards-min));
  height: auto !important;
  min-height: calc(var(--da-play-card-h) + 24px);
  margin: 0 !important;
  box-sizing: border-box;
}

.da-game-page #card-display .card {
  width: var(--da-play-card-w) !important;
  min-width: var(--da-play-card-w) !important;
  height: var(--da-play-card-h) !important;
  flex-shrink: 0;
}

.da-game-page #card-display .card .card-value {
  font-size: clamp(0.85rem, calc(var(--da-play-card-w) * 0.09), 1.25rem);
}

/* 表决/等待表决时：不触发牌堆悬停、按下抬起动画与「开牌」提示显隐 */
.da-game-page #card-stack.da-card-stack--voting-ui:hover .card-stack-top,
.da-game-page #card-stack.da-card-stack--voting-ui:hover .card-stack-layer {
  transform: none !important;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
}

.da-game-page #card-stack.da-card-stack--voting-ui:active .card-stack-top {
  transform: none !important;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
  transition: transform 0.1s ease, box-shadow 0.1s ease;
}

.da-game-page #card-stack.da-card-stack--voting-ui:hover .draw-hint {
  opacity: 0;
}

/* 牌堆：抵消 IncanGoldGame.css 窄屏下的 scale/减高度，并完整显示牌背（避免 cover 裁切） */
.da-game-page .card-stack-wrap {
  flex: 0 0 auto;
  align-self: flex-start;
}

/* 表决：叠在牌堆表面，上半绿半透明=继续持有，下半红半透明=卖出 */
.da-game-page .card-stack-vote-overlay {
  position: absolute;
  left: 0;
  top: 0;
  right: 0;
  bottom: 0;
  z-index: 8;
  display: flex;
  flex-direction: column;
  border-radius: 10px;
  overflow: hidden;
  box-sizing: border-box;
  pointer-events: auto;
  touch-action: manipulation;
}

.da-game-page .vote-mask {
  flex: 1 1 50%;
  min-height: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  border: none;
  margin: 0;
  padding: 0.35rem;
  -webkit-tap-highlight-color: transparent;
  transition: background 0.15s ease;
}

.da-game-page .vote-mask--stay {
  background: rgba(34, 197, 94, 0.42);
}

.da-game-page .vote-mask--stay:active,
.da-game-page .vote-mask--stay:hover {
  background: rgba(34, 197, 94, 0.58);
}

.da-game-page .vote-mask--sell {
  background: rgba(220, 38, 38, 0.42);
}

.da-game-page .vote-mask--sell:active,
.da-game-page .vote-mask--sell:hover {
  background: rgba(220, 38, 38, 0.58);
}

.da-game-page .vote-mask__label {
  font-size: 0.95rem;
  font-weight: 700;
  color: rgba(255, 255, 255, 0.96);
  text-shadow: 0 1px 3px rgba(0, 0, 0, 0.65);
  letter-spacing: 0.02em;
  pointer-events: none;
}

.da-game-page .card-stack-wait-hint {
  position: absolute;
  left: 0;
  top: 0;
  right: 0;
  bottom: 0;
  z-index: 8;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 10px;
  background: rgba(0, 0, 0, 0.4);
  color: #f7d17d;
  font-size: 0.95rem;
  font-weight: 600;
  text-align: center;
  padding: 0.5rem;
  pointer-events: auto;
  box-sizing: border-box;
}

.da-game-page #card-stack {
  transform: none;
  width: var(--da-play-card-w);
  min-width: var(--da-play-card-w);
  height: var(--da-stack-h);
  min-height: var(--da-stack-h);
  margin: 12px 10px 12px clamp(10px, 5vw, 60px) !important;
  box-sizing: border-box;
}

.da-game-page #card-stack .card-stack-top {
  min-width: 0;
  width: 100%;
}

.da-game-page #card-stack .card-stack-layer {
  min-width: 0;
}

.da-game-page .card-stack-layer {
  background-size: contain;
  background-repeat: no-repeat;
  background-position: center;
}

.da-game-page .card-stack-top img {
  min-width: 0 !important;
  width: 100%;
  max-width: 100%;
  height: 100%;
  object-fit: contain;
  object-position: center;
}

.da-game-page .da-vote-rail {
  flex: 0 0 auto;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 0.35rem;
  padding: 0.2rem 0.15rem;
}

.da-game-page .vote-btn--compact {
  padding: 0.42rem 0.75rem;
  font-size: 0.88rem;
  margin: 0;
  white-space: nowrap;
}

.da-game-page .da-vote-wait {
  font-size: 0.78rem;
  color: rgba(247, 209, 125, 0.88);
  line-height: 1.35;
  max-width: 5rem;
  align-self: center;
  text-align: center;
}

/* 底部：操作按钮 */
.game-footer-panel {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  max-width: 92%;
  margin: 0 auto 0;
  padding: 0;
  border-radius: 8px;
  box-sizing: border-box;
}

.game-footer-actions {
  display: flex;
  flex-direction: row;
  justify-content: center;
  gap: 0.35rem;
  flex-shrink: 0;
}

.da-game-page .game-footer-actions .normal-button {
  padding: 0.2rem 0.4rem;
  font-size: 0.6rem;
  white-space: nowrap;
}

.debug-foot-btn {
  opacity: 0.85;
  font-size: 0.6rem !important;
}

@media (max-width: 520px) {
  .da-game-page .da-card-zone-main {
    flex-basis: 100%;
    min-height: 40vh;
    height: auto;
  }

  .da-game-page .da-vote-rail {
    flex-direction: row;
    flex-basis: 100%;
    justify-content: center;
  }
}
</style>
