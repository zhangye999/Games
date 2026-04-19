import { config, resolveWebSocketUrl } from '../../config';

export default {
  name: 'DaTreasureGame',
  props: ['roomId', 'playerName', 'playerId'],
  data() {
    return {
      players: [],
      ws: null,
      currentPlayerName: '',
      playerIdLocal: null,
      cards: [],
      currentRound: 1,
      remainingCards: 0,
      isRoundOver: false,
      isVotingPhase: false,
      hasVoted: false,
      treasuresOnGround: [],
      messages: [],
      maxMessages: 8,
      isMobile: false,
      touchProcessed: false,
      isProcessingNextRound: false,
      stakingPhase: false,
      stakeInput: '',
      showGameOverModal: false,
      gameOverPlayers: [],
      /** 仅前端展示名，与后端牌面值无关 */
      disasterDisplayNames: {
        '-14': '反垄断调查',
        '-11': '战争爆发',
        '-8': '美联储加息',
        '-5': '工厂起火',
        '-2': '财务造假',
      },
      roundMarketIndex: 100,
      sessionMarketIndex: 100,
      chartHistory: [],
      fullSessionChartHistory: [],
      /** 来自房间：brutal | mild | choppy | volatile */
      marketDifficulty: 'brutal',
      /** 仅本机：line | candle，存 localStorage */
      chartDisplayMode: 'line',
      /** UI：折叠图表区 / 调试信息区 */
      chartsPanelCollapsed: false,
      debugLogCollapsed: false,
      /** 设为 true 可重新显示「本轮市场指数」图（默认隐藏保留代码） */
      showRoundMarketChart: false,
    };
  },
  computed: {
    currentPlayer() {
      return this.players.find((p) => p.playerId === this.playerIdLocal) || {};
    },
    isInCamp() {
      return this.currentPlayer.inCamp || false;
    },
    wallet() {
      return this.currentPlayer.totalCapital ?? 0;
    },
    roundCapital() {
      return this.currentPlayer.roundCapital ?? 0;
    },
    stakingSubmitted() {
      return this.currentPlayer.stakingSubmitted || false;
    },
    couldNotEnterRound() {
      return this.currentPlayer.couldNotEnterRound || false;
    },
    canSubmitStake() {
      const w = Number(this.wallet) || 0;
      return (
        this.stakingPhase &&
        !this.isInCamp &&
        !this.stakingSubmitted &&
        !this.isRoundOver &&
        !this.isVotingPhase &&
        !this.couldNotEnterRound &&
        w >= 1000
      );
    },
    canDrawCard() {
      return (
        !this.stakingPhase &&
        !this.isVotingPhase &&
        !this.isRoundOver &&
        !this.isInCamp
      );
    },
    canVote() {
      return this.isVotingPhase && !this.hasVoted && !this.isInCamp;
    },
    /** 表决遮罩或「等待表决」时，禁用牌堆 hover/active 动画 */
    cardStackVotingUiActive() {
      return (
        this.canVote ||
        (this.hasVoted && this.isVotingPhase && !this.isInCamp)
      );
    },
    canNextRound() {
      return this.isRoundOver;
    },
    minStakeHint() {
      if (this.couldNotEnterRound) return '资金不足1000，本轮无法入场（仍参与「不在场」涨幅加成）';
      return this.wallet < 1000 ? '资金不足1000，无法入场' : '最低带入 1000，全仓须 ≥1000';
    },
    marketDifficultyLabel() {
      if (this.marketDifficulty === 'mild') return '温和';
      if (this.marketDifficulty === 'choppy') return '震荡';
      if (this.marketDifficulty === 'volatile') return '波动';
      return '残酷';
    },
    gemAbsentBonusPct() {
      return this.marketDifficulty === 'mild' ? 20 : 30;
    },
    marketRoundCandleBars() {
      const vals = (this.chartHistory || []).map((h) => h.roundMarketIndex);
      return this.candleBarsFromIndexValues(vals, 400, 110, 'index', null);
    },
    marketSessionCandleBars() {
      const vals = (this.fullSessionChartHistory || []).map((h) => h.sessionMarketIndex);
      return this.candleBarsFromIndexValues(vals, 400, 200, 'index', null);
    },
    /** 全局长图：所有玩家共用纵轴，便于对比同一时刻资金 */
    wealthChartScale() {
      const h = this.fullSessionChartHistory || [];
      if (!h.length || !this.players.length) {
        const z = 1;
        return { lo: 0, hi: z };
      }
      let min = Infinity;
      let max = -Infinity;
      this.players.forEach((p) => {
        h.forEach((pt) => {
          const w = pt.wealthByPlayer && pt.wealthByPlayer[p.playerId];
          if (w != null && Number.isFinite(Number(w))) {
            const n = Number(w);
            min = Math.min(min, n);
            max = Math.max(max, n);
          }
        });
      });
      if (!Number.isFinite(min)) {
        return { lo: 0, hi: 1 };
      }
      const span = Math.max(1e-6, max - min);
      const pad = span * 0.08;
      return { lo: min - pad, hi: max + pad };
    },
    /** 轮次变化处在快照索引 i 画竖线（与折线 x 计算一致） */
    wealthRoundDividerXs() {
      const h = this.fullSessionChartHistory || [];
      const w = 280;
      const innerW = w - 24;
      const n = h.length;
      if (n < 2) return [];
      const xs = [];
      for (let i = 1; i < n; i += 1) {
        if (h[i].round !== h[i - 1].round) {
          xs.push(12 + (i / (n - 1)) * innerW);
        }
      }
      return xs;
    },
    marketGemChartHint() {
      const b = this.gemAbsentBonusPct;
      if (this.marketDifficulty === 'choppy') {
        return `收益牌：震荡模式基数×2（约 6%~34% 档），有效涨幅 = 基数 × (1 + ${b / 100}×不在场人数)。`;
      }
      if (this.marketDifficulty === 'volatile') {
        return `收益牌：波动模式基数×3（约 9%~51% 档），有效涨幅 = 基数 × (1 + ${b / 100}×不在场人数)。`;
      }
      return `收益牌：有效涨幅 = 牌面 × (1 + ${b / 100}×不在场人数)，与场内结算一致。`;
    },
    marketSessionChartHint() {
      if (this.marketDifficulty === 'mild') {
        return '含每轮翻牌涨跌；2 人及以上同时离场后，抛压下调场内与指数（温和：约 3% / 10% / 30%）。';
      }
      if (this.marketDifficulty === 'volatile') {
        return '含每轮翻牌涨跌；波动模式灾难跌幅 10%/30%/50%；2 人及以上同时离场后，抛压约 10% / 30% / 50%。';
      }
      return '含每轮翻牌涨跌；2 人及以上同时离场后，抛压下调场内与指数（残酷/震荡：10% / 30% / 50%）。';
    },
  },
  mounted() {
    this.checkDeviceType();
    window.addEventListener('resize', this.checkDeviceType);

    this.currentPlayerName = this.playerName || localStorage.getItem('playerName');
    if (!this.currentPlayerName) {
      console.error('无法获取玩家名字');
      return;
    }

    const genId = () =>
      `player-${Date.now()}-${Math.random().toString(36).substr(2, 9)}-${this.currentPlayerName}`;
    const keyId = () => `daPlayerId-${this.roomId}-${this.currentPlayerName}`;
    const stored = localStorage.getItem(keyId());
    this.playerIdLocal = this.playerId || stored || localStorage.getItem('daPlayerId');
    if (!this.playerIdLocal || !String(this.playerIdLocal).includes(this.currentPlayerName)) {
      this.playerIdLocal = genId();
    }
    localStorage.setItem(keyId(), this.playerIdLocal);

    const storedWs = localStorage.getItem('daGameServerUrl');
    const wsUrl = resolveWebSocketUrl(storedWs) || config.daGameServerUrl;
    this.ws = new WebSocket(wsUrl);

    if (!localStorage.getItem('daMdRenameVolatile2026')) {
      if (localStorage.getItem('daMarketDifficulty') === 'volatile') {
        localStorage.setItem('daMarketDifficulty', 'choppy');
      }
      localStorage.setItem('daMdRenameVolatile2026', '1');
    }
    const rawMd = localStorage.getItem('daMarketDifficulty');
    const md = ['mild', 'choppy', 'volatile', 'brutal'].includes(rawMd) ? rawMd : 'brutal';

    const cs = localStorage.getItem('daChartDisplayMode');
    if (cs === 'candle' || cs === 'line') this.chartDisplayMode = cs;

    this.ws.onopen = () => {
      this.ws.send(
        JSON.stringify({
          type: 'joinRoom',
          roomId: this.roomId,
          playerId: this.playerIdLocal,
          playerName: this.currentPlayerName,
          marketDifficulty: md,
        })
      );
      this.ws.send(
        JSON.stringify({
          type: 'getGameState',
          roomId: this.roomId,
          playerId: this.playerIdLocal,
          playerName: this.currentPlayerName,
        })
      );
    };

    this.ws.onmessage = (event) => {
      const data = JSON.parse(event.data);

      if (data.type === 'gameOver') {
        this.gameOverPlayers = data.players || [];
        this.showGameOverModal = true;
        this.addMessage(data.message || '游戏结束');
        return;
      }

      if (data.type === 'gameState') {
        this.applyGameState(data);
        return;
      }

      if (data.gameOver === true && data.players) {
        this.gameOverPlayers = data.players;
        this.showGameOverModal = true;
        return;
      }

      if (data.type === 'roundStart') {
        this.applyRoundStart(data);
        return;
      }

      if (data.type === 'newRound') {
        this.currentRound = data.currentRound;
        this.stakingPhase = data.stakingPhase !== false;
        this.stakeInput = '';
        if (data.players) this.players = data.players;
        this.syncChartData(data);
        return;
      }

      if (data.type === 'cardDrawn') {
        this.handleCardDrawn(data);
        return;
      }

      if (data.type === 'stakingComplete') {
        this.stakingPhase = false;
        if (data.players) this.players = data.players;
        this.syncChartData(data);
        this.addMessage(data.message || '');
        return;
      }

      if (data.type === 'playerStaked' && data.players) {
        this.players = data.players;
        return;
      }

      if (data.type === 'stakeRecorded') {
        this.addMessage(data.message || '已提交资金');
        return;
      }

      if (data.type === 'voteRecorded') {
        this.hasVoted = true;
        this.addMessage(data.message);
        return;
      }

      if (data.type === 'playerVoted') {
        if (data.votingStatus) {
          this.players.forEach((player) => {
            const s = data.votingStatus.find((x) => x.playerName === player.playerName);
            if (s) {
              player.hasVoted = s.hasVoted;
              player.inCamp = s.inCamp;
            }
          });
          const me = data.votingStatus.find((s) => s.playerName === this.currentPlayerName);
          if (me) this.hasVoted = me.hasVoted;
        }
        this.addMessage(`${data.playerName} 已表决`);
        return;
      }

      if (data.type === 'voteResults') {
        this.isVotingPhase = data.votingPhase;
        this.isRoundOver = data.roundOver;
        this.treasuresOnGround = data.treasuresOnGround || [];
        this.hasVoted = false;
        this.syncChartData(data);
        if (data.players) {
          this.players = data.players;
          const me = this.players.find((p) => p.playerId === this.playerIdLocal);
          if (me) this.hasVoted = me.hasVoted || false;
        }
        this.addMessage(data.message || '');
        return;
      }

      if (data.type === 'treasureTaken') {
        this.addMessage(data.message || '');
        return;
      }

      if (data.type === 'gameReset') {
        this.resetLocalState(data);
        return;
      }

      if (data.type === 'roundOver' || data.roundOver) {
        this.isRoundOver = true;
        this.addMessage('本轮结束');
        if (data.players) this.players = data.players;
        this.syncChartData(data);
        return;
      }

      if (data.type === 'error') {
        this.addMessage(`错误: ${data.message}`);
        return;
      }

      if (data.players) {
        this.players = data.players;
      }
    };

    this.ws.onclose = () => {
      console.log('[大A] WS 关闭');
    };

    setTimeout(() => this.setupHorizontalScroll(), 100);
  },
  methods: {
    checkDeviceType() {
      this.isMobile = window.innerWidth <= 768;
    },
    handleTouch(event, callback) {
      event.preventDefault();
      if (this.touchProcessed) return;
      this.touchProcessed = true;
      callback();
      setTimeout(() => {
        this.touchProcessed = false;
      }, 300);
    },
    handleClick(event, callback) {
      if (this.isMobile && this.touchProcessed) return;
      callback();
    },
    setupHorizontalScroll() {
      const el = document.getElementById('card-display');
      if (el) {
        el.addEventListener('wheel', (e) => {
          e.preventDefault();
          const d = e.deltaY || 0;
          el.scrollLeft += d > 0 ? 60 : -60;
        });
      } else setTimeout(() => this.setupHorizontalScroll(), 100);
    },
    addMessage(message) {
      if (!message) return;
      this.messages.push(message);
      if (this.messages.length > this.maxMessages) {
        this.messages = this.messages.slice(this.messages.length - this.maxMessages);
      }
    },
    syncChartData(data) {
      if (!data) return;
      if (data.roundMarketIndex != null) this.roundMarketIndex = data.roundMarketIndex;
      if (data.sessionMarketIndex != null) this.sessionMarketIndex = data.sessionMarketIndex;
      if (data.chartHistory) this.chartHistory = data.chartHistory;
      if (data.fullSessionChartHistory) this.fullSessionChartHistory = data.fullSessionChartHistory;
      if (['mild', 'brutal', 'choppy', 'volatile'].includes(data.marketDifficulty)) {
        this.marketDifficulty = data.marketDifficulty;
      }
    },
    applyGameState(data) {
      this.players = data.players || [];
      this.currentRound = data.currentRound;
      this.remainingCards = data.deckSize;
      this.cards = data.drawnCards || [];
      this.isRoundOver = data.isRoundOver || false;
      this.isVotingPhase = data.votingPhase || false;
      this.stakingPhase = !!data.stakingPhase;
      this.treasuresOnGround = data.treasuresOnGround || [];
      this.syncChartData(data);
      if (['mild', 'brutal', 'choppy', 'volatile'].includes(data.marketDifficulty)) {
        this.marketDifficulty = data.marketDifficulty;
      }
      const me = this.players.find((p) => p.playerId === this.playerIdLocal);
      if (me) this.hasVoted = me.hasVoted || false;
    },
    applyRoundStart(data) {
      this.currentRound = data.currentRound || 1;
      this.cards = [];
      this.remainingCards = data.deckSize || 0;
      this.isRoundOver = data.roundOver || false;
      this.isVotingPhase = false;
      this.hasVoted = false;
      this.stakingPhase = data.stakingPhase !== false;
      this.stakeInput = '';
      this.treasuresOnGround = data.treasuresOnGround || [];
      if (data.players) this.players = data.players;
      this.syncChartData(data);
      this.addMessage(data.message || '');
    },
    handleCardDrawn(data) {
      if (data.drawnCard) this.cards = [...this.cards, data.drawnCard];
      this.remainingCards = data.deckSize;
      this.isVotingPhase = data.votingPhase;
      this.isRoundOver = data.roundOver;
      this.treasuresOnGround = data.treasuresOnGround || [];
      this.stakingPhase = !!data.stakingPhase;
      this.syncChartData(data);
      if (data.players) {
        this.players = data.players;
        const me = this.players.find((p) => p.playerId === this.playerIdLocal);
        if (me) this.hasVoted = me.hasVoted || false;
      }
      if (data.message) this.addMessage(data.message);
    },
    resetLocalState(data) {
      this.currentRound = data.currentRound || 1;
      this.cards = [];
      this.remainingCards = data.deckSize || 0;
      this.isRoundOver = false;
      this.isVotingPhase = false;
      this.hasVoted = false;
      this.stakingPhase = data.stakingPhase !== false;
      this.stakeInput = '';
      this.treasuresOnGround = [];
      this.showGameOverModal = false;
      this.gameOverPlayers = [];
      if (data.players) this.players = data.players;
      this.syncChartData(data);
      this.addMessage(data.message || '游戏已重置');
    },
    fillAllIn() {
      const w = Number(this.wallet) || 0;
      if (w < 1000) {
        this.addMessage('资金不足1000，无法入场');
        return;
      }
      this.stakeInput = String(w);
    },
    submitStake() {
      if (!this.canSubmitStake || !this.ws || this.ws.readyState !== WebSocket.OPEN) return;
      const n = Number(this.stakeInput);
      if (!Number.isFinite(n)) {
        this.addMessage('请输入有效数字');
        return;
      }
      if (n < 1000) {
        this.addMessage('最低带入 1000，无法入场');
        return;
      }
      this.ws.send(
        JSON.stringify({
          type: 'submitStake',
          roomId: this.roomId,
          playerId: this.playerIdLocal,
          playerName: this.currentPlayerName,
          amount: n,
        })
      );
    },
    drawCard() {
      if (!this.canDrawCard) return;
      this.ws.send(
        JSON.stringify({
          type: 'drawCard',
          roomId: this.roomId,
          playerId: this.playerIdLocal,
          playerName: this.currentPlayerName,
        })
      );
    },
    vote(choice) {
      if (!this.canVote) return;
      this.ws.send(
        JSON.stringify({
          type: 'vote',
          roomId: this.roomId,
          playerId: this.playerIdLocal,
          playerName: this.currentPlayerName,
          choice,
        })
      );
      this.hasVoted = true;
    },
    nextRound() {
      if (!this.canNextRound || this.isProcessingNextRound) return;
      this.isProcessingNextRound = true;
      this.ws.send(
        JSON.stringify({
          type: 'nextRound',
          roomId: this.roomId,
          playerId: this.playerIdLocal,
          playerName: this.currentPlayerName,
        })
      );
      setTimeout(() => {
        this.isProcessingNextRound = false;
      }, 3000);
    },
    resetGame() {
      this.showGameOverModal = false;
      this.ws.send(
        JSON.stringify({
          type: 'resetGame',
          roomId: this.roomId,
          playerId: this.playerIdLocal,
          playerName: this.currentPlayerName,
        })
      );
    },
    getDisasterClass(card) {
      if (!card || card.type !== 'disaster') return '';
      const map = {
        '-14': 'disaster-snake',
        '-11': 'disaster-mine',
        '-8': 'disaster-zombie',
        '-5': 'disaster-fire',
        '-2': 'disaster-spider',
      };
      return map[card.value] || '';
    },
    setChartDisplayMode(mode) {
      if (mode !== 'line' && mode !== 'candle') return;
      this.chartDisplayMode = mode;
      localStorage.setItem('daChartDisplayMode', mode);
    },
    /** 与折线图一致的纵轴范围（index 含 100 锚点） */
    indexBoundsForChart(nums, mode) {
      if (!nums || nums.length === 0) return { lo: 0, hi: 1 };
      const arr = nums.length === 1 ? [nums[0], nums[0]] : nums.map((v) => Number(v));
      let minV;
      let maxV;
      if (mode === 'wealth') {
        minV = Math.min(...arr);
        maxV = Math.max(...arr);
      } else {
        minV = Math.min(...arr, 100);
        maxV = Math.max(...arr, 100);
      }
      const span = Math.max(1e-6, maxV - minV);
      const pad = span * 0.08;
      return { lo: minV - pad, hi: maxV + pad };
    },
    /**
     * 由相邻两点构造 OHLC 简化为开收高低一致的蜡烛（本地样式）
     * @param fixedLoHi 可选，与 wealth 折线共用比例
     */
    candleBarsFromIndexValues(vals, w, h, boundsMode, fixedLoHi) {
      if (!vals || vals.length < 2) return [];
      const nums0 = vals.map((v) => Number(v));
      const nums = nums0.length === 1 ? [nums0[0], nums0[0]] : nums0;
      let lo;
      let hi;
      if (fixedLoHi && fixedLoHi.lo != null && fixedLoHi.hi != null) {
        lo = fixedLoHi.lo;
        hi = fixedLoHi.hi;
      } else {
        const b = this.indexBoundsForChart(nums, boundsMode);
        lo = b.lo;
        hi = b.hi;
      }
      const innerW = w - 24;
      const innerH = h - 24;
      const n = nums.length;
      const span = Math.max(1e-6, hi - lo);
      const yAt = (v) => 12 + innerH * (1 - (v - lo) / span);
      const candles = [];
      for (let k = 1; k < n; k += 1) {
        const open = nums[k - 1];
        const close = nums[k];
        const high = Math.max(open, close);
        const low = Math.min(open, close);
        const xMid = 12 + ((k - 0.5) / Math.max(1, n - 1)) * innerW;
        const cw = Math.min(10, (innerW / Math.max(1, n - 1)) * 0.75);
        const yHigh = yAt(high);
        const yLow = yAt(low);
        const yO = yAt(open);
        const yC = yAt(close);
        candles.push({
          xMid,
          cw,
          wickTop: Math.min(yHigh, yLow),
          wickBot: Math.max(yHigh, yLow),
          bodyY: Math.min(yO, yC),
          bodyH: Math.max(1, Math.abs(yC - yO)),
          bull: close >= open,
        });
      }
      return candles;
    },
    wealthCandleBarsForPlayer(playerId) {
      const h = this.fullSessionChartHistory || [];
      if (h.length < 2) return [];
      let last = 0;
      const nums = h.map((pt) => {
        const raw = pt.wealthByPlayer && pt.wealthByPlayer[playerId];
        if (raw != null && Number.isFinite(Number(raw))) {
          last = Number(raw);
          return last;
        }
        return last;
      });
      const arr = nums.length === 1 ? [nums[0], nums[0]] : nums;
      const { lo, hi } = this.wealthChartScale;
      return this.candleBarsFromIndexValues(arr, 280, 100, 'wealth', { lo, hi });
    },
    getCardName(card) {
      if (!card) return '';
      if (card.type === 'gem') {
        if (this.marketDifficulty === 'choppy') {
          return `+${Number(card.value) * 2}%`;
        }
        if (this.marketDifficulty === 'volatile') {
          return `+${Number(card.value) * 3}%`;
        }
        return `+${card.value}%`;
      }
      if (card.type === 'treasure') return `宝藏 +${card.value}%`;
      if (card.type === 'disaster') return this.disasterDisplayNames[card.value] || '';
      return '';
    },
    formatMoney(n) {
      if (n == null || Number.isNaN(Number(n))) return '—';
      return Number(n).toLocaleString('zh-CN', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });
    },
    /**
     * @param {'index'|'wealth'} mode - index：纵轴锚定 100；wealth：按数据最小最大值
     */
    linePointsFromValues(values, w, h, mode = 'index') {
      if (!values || values.length === 0) return '';
      let nums = values.map((v) => Number(v));
      if (nums.length === 1) nums = [nums[0], nums[0]];
      let minV;
      let maxV;
      if (mode === 'wealth') {
        minV = Math.min(...nums);
        maxV = Math.max(...nums);
      } else {
        minV = Math.min(...nums, 100);
        maxV = Math.max(...nums, 100);
      }
      const span = Math.max(1e-6, maxV - minV);
      const pad = span * 0.08;
      const lo = minV - pad;
      const hi = maxV + pad;
      return this.linePointsFromValuesWithFixedRange(nums, w, h, lo, hi);
    },
    linePointsFromValuesWithFixedRange(nums, w, h, lo, hi) {
      if (!nums || nums.length === 0) return '';
      const innerW = w - 24;
      const innerH = h - 24;
      const n = nums.length;
      const span = Math.max(1e-6, hi - lo);
      return nums
        .map((v, i) => {
          const x = 12 + (n <= 1 ? innerW / 2 : (i / (n - 1)) * innerW);
          const t = (v - lo) / span;
          const y = 12 + innerH * (1 - t);
          return `${x},${y}`;
        })
        .join(' ');
    },
    marketRoundLinePoints() {
      const vals = (this.chartHistory || []).map((h) => h.roundMarketIndex);
      if (vals.length === 0) return this.linePointsFromValues([100], 400, 110, 'index');
      return this.linePointsFromValues(vals, 400, 110, 'index');
    },
    marketSessionLinePoints() {
      const vals = (this.fullSessionChartHistory || []).map((h) => h.sessionMarketIndex);
      if (vals.length === 0) return this.linePointsFromValues([100], 400, 200, 'index');
      return this.linePointsFromValues(vals, 400, 200, 'index');
    },
    wealthFullLinePoints(playerId) {
      const h = this.fullSessionChartHistory || [];
      if (h.length === 0) return '';
      const { lo, hi } = this.wealthChartScale;
      let last = 0;
      const nums = h.map((pt) => {
        const raw = pt.wealthByPlayer && pt.wealthByPlayer[playerId];
        if (raw != null && Number.isFinite(Number(raw))) {
          last = Number(raw);
          return last;
        }
        return last;
      });
      const arr = nums.length === 1 ? [nums[0], nums[0]] : nums;
      return this.linePointsFromValuesWithFixedRange(arr, 280, 100, lo, hi);
    },
    debugState() {
      console.log('[大A宝藏 调试]', {
        roomId: this.roomId,
        marketDifficulty: this.marketDifficulty,
        currentRound: this.currentRound,
        stakingPhase: this.stakingPhase,
        players: this.players,
        chartHistoryLen: (this.chartHistory || []).length,
        fullSessionLen: (this.fullSessionChartHistory || []).length,
      });
      this.addMessage('已在控制台输出调试信息');
    },
  },
  beforeUnmount() {
    window.removeEventListener('resize', this.checkDeviceType);
    if (this.ws && this.ws.readyState === WebSocket.OPEN) this.ws.close();
  },
};
