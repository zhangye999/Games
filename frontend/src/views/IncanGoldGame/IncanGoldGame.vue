<template>
  <div id="game-page">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
    <div class="room-info">欢迎进入房间 {{ roomId }}</div>
    
    <!-- 游戏状态信息 -->
    <div class="game-status">
      <div class="round-info">第 {{ currentRound }} 轮</div>
      <div class="deck-info">剩余牌数: {{ remainingCards }}</div>
      <div class="gems-info">场上宝石: {{ gemsOnGround }}</div>
      <div class="treasures-info" v-if="treasuresOnGround.length > 0">
        场上宝藏: {{ treasuresOnGround.map(t => t.value).join(', ') }}
      </div>
    </div>
    
    <!-- 已移除灾难牌展示区域 -->
    <div class="removed-disasters" v-if="removedDisasters.length > 0">
      <div class="removed-disasters-title">已移除的灾难牌</div>
      <div class="removed-disasters-list">
        <div v-for="(disaster, index) in removedDisasters" 
             :key="index" 
             class="removed-disaster-card card disaster"
             :class="getDisasterClass({ type: 'disaster', value: disaster.value })">
          <div class="removed-disaster-info">
            <div class="disaster-name">{{ disasterTypes[disaster.value] }}</div>
            <div class="disaster-count">剩余: {{ disaster.remainingCount }}张</div>
          </div>
        </div>
      </div>
    </div>
    
    <!-- 玩家信息展示 -->
    <div id="player-info-area">
      <div v-for="(player, index) in players" :key="index" class="player-info"
           :class="{'current-player': player.playerId === playerId}">
        <div class="player-name-status">
          <div id="player-name">
            <div>{{ player.playerName }}</div>
            <div v-if="player.playerId === playerId" id="player-name-you">(你)</div>
          </div>
          <div class="player-status">
            <div>{{ player.inCamp ? "回到营地" : "仍在探险" }}</div>
            <div v-if="isVotingPhase && !player.inCamp">
              {{ player.hasVoted ? "已决策" : "决策中..." }}
            </div>
          </div>
        </div>

        <div class="total-gem">
          <div>总宝石</div>
          <div class="gem-number">{{ player.gemNumber }}</div>
        </div>
        
        <div class="round-gem" v-if="!player.inCamp">
          <div>本轮宝石</div>
          <div class="gem-number">{{ player.roundGems }}</div>
        </div>
      </div>
    </div>

    <div class="card-display-area">
      <div id="card-stack"
           :class="{ 'incan-card-stack--voting-ui': cardStackVotingUiActive }"
           @click="handleClick($event, drawCard)" 
           @touchstart="handleTouch($event, drawCard)">
        <!-- 创建多层牌堆效果 -->
        <div class="card-stack-layer"></div>
        <div class="card-stack-layer"></div>
        <div class="card-stack-layer"></div>
        <div class="card-stack-layer"></div>
        <div class="card-stack-layer"></div>
        <div class="card-stack-layer"></div>
        <div class="card-stack-layer"></div>
        <div class="card-stack-layer"></div>
        <div class="card-stack-layer"></div>
        <div class="card-stack-layer"></div>
        <div class="card-stack-top" :class="{'disabled': !canDrawCard && !canDrawPlaceboCard}">
          <img src="../../assets/4-3card2.jpg" alt="card-stack">
          <div class="draw-hint" v-if="canDrawCard && !canVote">开牌</div>
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
            title="继续探险"
            @click="handleClick($event, () => vote('stay'))"
            @touchstart="handleTouch($event, () => vote('stay'))"
          >
            <span class="vote-mask__label">继续探险</span>
          </div>
          <div
            class="vote-mask vote-mask--leave"
            title="离开矿场"
            @click="handleClick($event, () => vote('leave'))"
            @touchstart="handleTouch($event, () => vote('leave'))"
          >
            <span class="vote-mask__label">离开矿场</span>
          </div>
        </div>
        <div
          v-else-if="hasVoted && isVotingPhase && !isInCamp"
          class="card-stack-wait-hint"
          @click.stop
          @touchstart.stop
        >
          等待其他玩家决策...
        </div>
      </div>
      <div id="card-display">
        <!-- 已翻开的卡牌 -->
        <div v-for="(card, index) in cards" :key="index" 
             class="card" :class="[
               card.type, 
               {'disaster': card.type === 'disaster'}, 
               getDisasterClass(card),
               {'placebo-card': card.isPlacebo}
             ]">
          <div class="card-value">{{ getCardName(card) }}</div>
        </div>
      </div>
    </div>

    <div v-if="isVotingPhase && isInCamp" class="waiting-message">
      你已回到营地，等待其他玩家决策...
    </div>

    <!-- 游戏控制按钮 -->
    <div class="control-buttons">
      <button class="normal-button draw-btn" 
              @click="handleClick($event, drawCard)" 
              @touchstart="handleTouch($event, drawCard)" 
              :disabled="!canDrawCard" 
              :class="{'disabled': !canDrawCard}">开牌</button>
      <button class="normal-button placebo-draw-btn" 
              @click="handleClick($event, drawPlaceboCard)" 
              @touchstart="handleTouch($event, drawPlaceboCard)" 
              :disabled="!canDrawPlaceboCard" 
              :class="{'disabled': !canDrawPlaceboCard}">再开一张牌</button>
      <button class="normal-button next-round-btn" 
              @click="handleClick($event, nextRound)" 
              @touchstart="handleTouch($event, nextRound)" 
              :disabled="!canNextRound"
              :class="{'disabled': !canNextRound}">下一轮</button>
      <button class="normal-button reset-btn" 
              @click="handleClick($event, resetGame)" 
              @touchstart="handleTouch($event, resetGame)">重置游戏</button>
      <button class="normal-button show-deck-btn" 
              @click="handleClick($event, showDeck)" 
              @touchstart="handleTouch($event, showDeck)">显示牌堆</button>
      <!--<button class="normal-button debug-btn" @click="debugState">调试状态</button>-->
      
    </div>

    <!-- 游戏消息区域 -->
    <div class="game-messages">
      <div v-for="(message, index) in messages" :key="index" class="message">
        {{ message }}
      </div>
    </div>

    <!-- 添加游戏结算弹窗 -->
    <GameOverModal 
      :show="showGameOverModal"
      :players="players"
      @restart="resetGame"
    />
  </div>
</template>

<script>
import GameOverModal from '../../components/GameOverModal.vue';
import IncanGoldGameLogic from './IncanGoldGame.js';

export default {
  ...IncanGoldGameLogic,
  components: {
    GameOverModal
  }
};
</script>

<style>
@import url(./IncanGoldGame.css);
</style>
