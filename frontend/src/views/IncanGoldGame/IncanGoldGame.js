import { config } from '../../config';
import GameOverModal from '../../components/GameOverModal.vue';

export default {
    name: 'IncanGoldGame',
    components: {
      GameOverModal
    },
    props: ['roomId', 'playerName', 'playerId'],
    data() {
      return {
        players: [], // 玩家列表
        ws: null, // WebSocket 实例
        playerId: null, // 玩家唯一标识符
        currentPlayerName: '', // 当前玩家的名字
        cards: [], // 当前已翻开的卡牌
        currentRound: 1, // 当前轮次
        remainingCards: 0, // 剩余卡牌数量
        treasureCard: null, // 当前轮次的宝藏牌
        lastDrawnCard: null, // 最后一张翻开的卡牌
        isRoundOver: false, // 当前轮次是否结束
        isVotingPhase: false, // 是否处于投票阶段
        hasVoted: false, // 当前玩家是否已投票
        gemsOnGround: 0, // 场上剩余的宝石
        treasuresOnGround: [], // 场上的宝藏牌
        showGameOverModal: false, // 是否显示游戏结算弹窗
        placeboCards: [], // 安慰剂卡牌
        hasPlaceboDisaster: false, // 是否已经抽到安慰剂灾难牌
        allPlayersInCamp: false, // 是否所有玩家都回到营地
        removedDisasters: [], // 已移除的灾难牌
        // 灾难牌类型和初始数量
        disasterTypes: {
          '-14': '毒蛇',
          '-11': '矿难',
          '-8': '僵尸',
          '-5': '火焰',
          '-2': '蜘蛛'
        },
        initialDisasterCounts: {
          '-14': 3,
          '-11': 3,
          '-8': 3,
          '-5': 3,
          '-2': 3
        },
        messages: [], // 游戏消息
        maxMessages: 5, // 最多显示的消息数量
        isMobile: false, // 是否为移动设备
        touchProcessed: false, // 防止触摸事件和点击事件同时触发
        isProcessingNextRound: false // 防止重复触发下一轮请求
      };
    },
    computed: {
      // 获取当前玩家信息
      currentPlayer() {
        return this.players.find(p => p.playerId === this.playerId) || {};
      },
      
      // 当前玩家是否在营地
      isInCamp() {
        return this.currentPlayer.inCamp || false;
      },
      
      // 当前玩家的宝石数量
      playerGems() {
        return this.currentPlayer.gemNumber || 0;
      },
      
      // 当前玩家本轮获得的宝石数量
      playerRoundGems() {
        return this.currentPlayer.roundGems || 0;
      },
      
      // 是否可以开牌
      canDrawCard() {
        return !this.isRoundOver && !this.isVotingPhase && !this.isInCamp;
      },
      
      // 是否可以投票
      canVote() {
        return this.isVotingPhase && !this.hasVoted && !this.isInCamp;
      },
      // 表决遮罩或等待期间，禁用牌堆悬停动画
      cardStackVotingUiActive() {
        return this.canVote || (this.hasVoted && this.isVotingPhase && !this.isInCamp);
      },
      
      // 是否可以进入下一轮
      canNextRound() {
        return this.isRoundOver;
      },

      // 是否可以使用安慰剂开牌功能
      canDrawPlaceboCard() {
        // 当轮次结束、所有玩家都在营地、且没有出现双灾难时可用
        return this.isRoundOver && this.allPlayersInCamp && !this.hasPlaceboDisaster;
      }
    },
    mounted() {
      // 检测设备类型
      this.checkDeviceType();
      window.addEventListener('resize', this.checkDeviceType);
      
      // 获取玩家名字，优先使用props中的playerName
      this.currentPlayerName = this.playerName || localStorage.getItem('playerName');
      if (!this.currentPlayerName) {
        console.error('无法获取玩家名字');
        return;
      }

      // 生成玩家ID的函数
      const generatePlayerId = () => {
        // 使用时间戳、随机数和玩家名生成唯一ID
        return `player-${Date.now()}-${Math.random().toString(36).substr(2, 9)}-${this.currentPlayerName}`;
      };

      // 获取特定于当前玩家的localStorage键
      const getPlayerIdKey = () => `playerId-${this.roomId}-${this.currentPlayerName}`;

      // 获取玩家ID，优先使用props中的playerId
      const storedId = localStorage.getItem(getPlayerIdKey());
      this.playerId = this.playerId || storedId;
      
      // 如果没有ID或者ID不是针对当前玩家的，生成新ID
      if (!this.playerId || !this.playerId.includes(this.currentPlayerName)) {
        this.playerId = generatePlayerId();
        // 存储ID，使用特定于当前玩家的键
        localStorage.setItem(getPlayerIdKey(), this.playerId);
      }
      
      console.log(`玩家 ${this.currentPlayerName} 使用ID: ${this.playerId}`);
  
      // 创建 WebSocket 连接
      this.ws = new WebSocket(config.gameServerUrl);
  
      this.ws.onopen = () => {
        console.log("游戏服务器已连接");
  
        // 向服务器发送加入请求
        this.ws.send(JSON.stringify({
          type: 'joinRoom',
          roomId: this.roomId,
          playerId: this.playerId,
          playerName: this.currentPlayerName,
        }));
  
        // 请求完整的游戏状态
        this.ws.send(JSON.stringify({
          type: 'getGameState',
          roomId: this.roomId,
          playerId: this.playerId,
          playerName: this.currentPlayerName
        }));
      };
  
      // 监听来自游戏服务器的消息
      this.ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        console.log("收到服务器消息:", data);
        
        // 处理游戏结束
        if (data.type === 'gameOver') {
          this.showGameOverModal = true;
          this.addMessage('游戏结束！');
          return;
        }
        
        // 处理完整的游戏状态
        if (data.type === 'gameState') {
          this.players = data.players;
          this.currentRound = data.currentRound;
          this.remainingCards = data.deckSize;
          this.cards = data.drawnCards || [];
          this.isRoundOver = data.isRoundOver || false;
          this.isVotingPhase = data.votingPhase || false;
          this.gemsOnGround = data.gemsOnGround || 0;
          this.treasuresOnGround = data.treasuresOnGround || [];
          this.hasPlaceboDisaster = data.hasPlaceboDisaster || false; // 从gameState获取双灾难状态
          
          // 更新当前玩家的投票状态
          const currentPlayer = this.players.find(p => p.playerId === this.playerId);
          if (currentPlayer) {
            this.hasVoted = currentPlayer.hasVoted || false;
          }

          // 检查是否所有玩家都在营地
          this.checkAllPlayersInCamp();
          
          console.log('同步游戏状态：', data);
          console.log('当前投票阶段：', this.isVotingPhase, '已投票：', this.hasVoted);
          return;
        }
        
        // 处理安慰剂开牌结果
        if (data.type === 'placeboCardDrawn') {
          // 标记卡牌为安慰剂
          const placeboCard = { ...data.drawnCard, isPlacebo: true };
          
          // 将安慰剂卡牌添加到卡牌列表
          this.placeboCards.push(placeboCard);
          this.cards = [...this.cards, placeboCard];
          
          // 更新安慰剂双灾难状态
          if (data.hasPlaceboDisaster) {
            this.hasPlaceboDisaster = true;
          }
          
          // 如果安慰剂轮结束（出现双灾难），显示相应消息
          if (data.placeboRoundOver) {
            this.addMessage('安慰剂阶段结束：出现了双灾难！');
          }
          
          // 添加消息
          this.addMessage(data.message);
          
          return;
        }
        
        // 处理玩家信息更新
        if (data.players) {
          this.players = data.players;
          // 检查是否所有玩家都在营地
          this.checkAllPlayersInCamp();
          console.log('当前房间玩家：', this.players.map(p => p.playerName));
        }
        
        // 处理游戏重置
        if (data.type === 'gameReset') {
          this.currentRound = 1;
          this.cards = [];
          this.remainingCards = data.deckSize || 0;
          this.lastDrawnCard = null;
          this.isRoundOver = false;
          this.isVotingPhase = false;
          this.hasVoted = false;
          this.gemsOnGround = 0;
          this.treasuresOnGround = [];
          this.showGameOverModal = false;
          this.hasPlaceboDisaster = false; // 重置双灾难状态
          this.allPlayersInCamp = false;
          this.addMessage('游戏已重置');
          console.log('游戏已重置');
        }
        
        // 处理新轮次开始
        if (data.type === 'roundStart') {
          this.currentRound = data.currentRound || 1;
          this.cards = []; // 清空已翻开的卡牌
          this.remainingCards = data.deckSize || 0;
          this.isRoundOver = false; // 确保重置轮次结束状态
          this.isVotingPhase = false;
          this.hasVoted = false;
          this.gemsOnGround = data.gemsOnGround || 0;
          this.treasuresOnGround = data.treasuresOnGround || [];
          this.placeboCards = []; // 清空安慰剂卡牌
          this.hasPlaceboDisaster = false; // 重置安慰剂灾难牌状态
          this.allPlayersInCamp = false; // 重置所有玩家在营地状态
          this.addMessage(`第${this.currentRound}轮开始`);
          console.log(`第${this.currentRound}轮开始，牌堆大小: ${this.remainingCards}，轮次结束状态: ${this.isRoundOver}`);
        }
        
        // 处理开牌结果
        if (data.type === 'cardDrawn') {
          this.handleCardDrawn(data);
        }
        
        // 处理投票记录确认
        if (data.type === 'voteRecorded') {
          this.hasVoted = true;
          this.addMessage(data.message);
        }
        
        // 处理玩家投票状态更新
        if (data.type === 'playerVoted') {
          this.addMessage(`${data.playerName} 已完成决策`);
          
          // 更新所有玩家的投票状态
          if (data.votingStatus) {
            const votingStatus = data.votingStatus;
            this.players.forEach(player => {
              const playerStatus = votingStatus.find(s => s.playerName === player.playerName);
              if (playerStatus) {
                player.hasVoted = playerStatus.hasVoted;
                player.inCamp = playerStatus.inCamp;
              }
            });
            
            // 更新当前玩家的投票状态
            const currentPlayerStatus = votingStatus.find(s => s.playerName === this.currentPlayerName);
            if (currentPlayerStatus) {
              this.hasVoted = currentPlayerStatus.hasVoted;
            }

            // 检查是否所有玩家都在营地
            this.checkAllPlayersInCamp();
          }
        }
        
        // 处理投票结果
        if (data.type === 'voteResults') {
          this.isVotingPhase = data.votingPhase;
          this.isRoundOver = data.roundOver;
          this.gemsOnGround = data.gemsOnGround;
          this.treasuresOnGround = data.treasuresOnGround;
          
          // 重置投票状态
          this.hasVoted = false;
          
          // 更新玩家信息
          if (data.players) {
            this.players = data.players;
            
            // 确保当前玩家状态正确
            const currentPlayer = this.players.find(p => p.playerId === this.playerId);
            if (currentPlayer) {
              this.hasVoted = currentPlayer.hasVoted || false;
            }

            // 检查是否所有玩家都在营地
            this.checkAllPlayersInCamp();
          }
          
          // 显示谁离开谁留下
          if (data.leavingPlayers.length > 0) {
            this.addMessage(`离开的玩家: ${data.leavingPlayers.join(', ')}`);
          }
          if (data.stayingPlayers.length > 0) {
            this.addMessage(`继续探险的玩家: ${data.stayingPlayers.join(', ')}`);
          }
          
          this.addMessage(data.message);
          console.log('投票结果处理完成，当前投票阶段：', this.isVotingPhase, '已投票：', this.hasVoted);
        }
        
        // 处理宝藏被带走
        if (data.type === 'treasureTaken') {
          this.addMessage(data.message);
        }
        
        // 处理错误消息
        if (data.type === 'error') {
          this.addMessage(`错误: ${data.message}`);
        }
        
        // 处理轮次结束
        if (data.type === 'roundOver' || data.roundOver) {
          this.isRoundOver = true;
          this.addMessage("本轮结束");
          console.log("本轮结束");

          // 检查是否所有玩家都在营地
          this.checkAllPlayersInCamp();
        }
      };
  
      this.ws.onclose = () => {
        console.log('连接到游戏服务器已关闭');
      };

      // 添加鼠标滚轮横向滚动功能
      this.setupHorizontalScroll();
    },
    methods: {
      // 检测设备类型
      checkDeviceType() {
        this.isMobile = window.innerWidth <= 768;
      },
      
      // 处理触摸事件
      handleTouch(event, callback) {
        event.preventDefault();
        if (this.touchProcessed) return;
        this.touchProcessed = true;
        callback();
        // 重置标志，允许下一次触摸
        setTimeout(() => {
          this.touchProcessed = false;
        }, 300);
      },
      
      // 处理点击事件
      handleClick(event, callback) {
        if (this.isMobile && this.touchProcessed) {
          // 在移动设备上，如果已处理触摸事件，则忽略点击事件
          return;
        }
        callback();
      },
      
      // 设置鼠标滚轮横向滚动
      setupHorizontalScroll() {
        const cardDisplay = document.getElementById('card-display');
        if (cardDisplay) {
          cardDisplay.addEventListener('wheel', (event) => {
            event.preventDefault();
            // 判断滚动方向，调整滚动量
            const scrollAmount = event.deltaY || event.detail || event.wheelDelta;
            cardDisplay.scrollLeft += (scrollAmount > 0) ? 60 : -60;
          });
        } else {
          // 如果元素还未渲染，使用setTimeout延迟执行
          setTimeout(() => this.setupHorizontalScroll(), 100);
        }
      },
      
      // 添加游戏消息
      addMessage(message) {
        this.messages.push(message);
        // 保持消息数量不超过最大值
        if (this.messages.length > this.maxMessages) {
          this.messages = this.messages.slice(this.messages.length - this.maxMessages);
        }
      },
      
      // 翻开一张卡牌
      drawCard() {
        if (!this.canDrawCard) return;
        
        this.ws.send(JSON.stringify({
          type: 'drawCard',
          roomId: this.roomId,
          playerId: this.playerId,
          playerName: this.currentPlayerName
        }));
      },

      // 检查是否所有玩家都在营地
      checkAllPlayersInCamp() {
        if (this.players.length === 0) return false;
        
        const allInCamp = this.players.every(player => player.inCamp);
        this.allPlayersInCamp = allInCamp;
        
        return allInCamp;
      },

      // 安慰剂开牌功能
      drawPlaceboCard() {
        if (!this.canDrawPlaceboCard) return;
        
        // 发送安慰剂开牌请求
        this.ws.send(JSON.stringify({
          type: 'drawPlaceboCard',  // 使用专门的安慰剂开牌请求类型
          roomId: this.roomId,
          playerId: this.playerId,
          playerName: this.currentPlayerName
        }));
      },
      
      // 重置游戏
      resetGame() {
        this.showGameOverModal = false; // 关闭结算弹窗
        this.placeboCards = []; // 清空安慰剂卡牌
        this.hasPlaceboDisaster = false; // 重置安慰剂灾难牌状态
        this.allPlayersInCamp = false; // 重置所有玩家在营地状态
        this.removedDisasters = []; // 重置已移除的灾难牌
        this.ws.send(JSON.stringify({
          type: 'resetGame',
          roomId: this.roomId,
          playerId: this.playerId,
          playerName: this.currentPlayerName
        }));
      },
      
      // 显示本轮牌堆
      showDeck() {
        this.ws.send(JSON.stringify({
          type: 'showDeck',
          roomId: this.roomId,
          playerId: this.playerId,
          playerName: this.currentPlayerName
        }));
      },
      
      // 进入下一轮
      nextRound() {
        if (!this.canNextRound) {
          console.log("当前轮次尚未结束");
          return;
        }
        
        // 防止重复触发
        if (this.isProcessingNextRound) {
          console.log("正在处理下一轮请求，请稍候");
          return;
        }
        
        // 设置处理状态锁
        this.isProcessingNextRound = true;
        
        console.log("请求进入下一轮");
        this.ws.send(JSON.stringify({
          type: 'nextRound',
          roomId: this.roomId,
          playerId: this.playerId,
          playerName: this.currentPlayerName,
          currentRound: this.currentRound // 发送当前轮次，用于服务器验证
        }));
        
        // 3秒后重置状态锁，防止永久锁定
        setTimeout(() => {
          this.isProcessingNextRound = false;
        }, 3000);
      },
      
      // 投票方法
      vote(choice) {
        if (!this.isVotingPhase || this.hasVoted || this.isInCamp) return;
        
        this.ws.send(JSON.stringify({
          type: 'vote',
          roomId: this.roomId,
          playerId: this.playerId,
          playerName: this.currentPlayerName,
          choice: choice
        }));
        
        // 立即更新UI状态，避免用户重复点击
        this.hasVoted = true;
      },
      
      // 获取灾难牌的CSS类名
      getDisasterClass(card) {
        if (card.type !== 'disaster') return '';
        
        // 根据灾难牌的面值返回对应的CSS类名
        const disasterClassMap = {
          '-14': 'disaster-snake',    // 毒蛇
          '-11': 'disaster-mine',     // 矿难
          '-8': 'disaster-zombie',    // 僵尸
          '-5': 'disaster-fire',      // 火焰
          '-2': 'disaster-spider'     // 蜘蛛
        };
        
        return disasterClassMap[card.value] || '';
      },
      
      // 获取卡牌显示名称
      getCardName(card) {
        if (!card) return '';
        
        if (card.type === 'gem') {
          return card.value; // 宝石牌直接显示面值
        } else if (card.type === 'treasure') {
          return `${card.value}`; // 宝藏牌显示"宝藏"和面值
        } else if (card.type === 'disaster') {
          // 根据灾难牌的面值显示对应类型
          //return this.disasterTypes[card.value] || '灾难';
          return '';
        }
        
        return '';
      },
      
      // 调试当前状态
      debugState() {
        console.log("===== 当前游戏状态 =====");
        console.log("玩家ID:", this.playerId);
        console.log("玩家名字:", this.currentPlayerName);
        console.log("轮次:", this.currentRound);
        console.log("投票阶段:", this.isVotingPhase);
        console.log("已投票:", this.hasVoted);
        console.log("在营地:", this.isInCamp);
        console.log("轮次结束:", this.isRoundOver);
        console.log("场上宝石:", this.gemsOnGround);
        console.log("场上宝藏:", this.treasuresOnGround);
        console.log("玩家列表:", this.players);
        console.log("是否可以投票:", this.canVote);
        console.log("所有玩家都在营地:", this.allPlayersInCamp);
        console.log("安慰剂卡牌数:", this.placeboCards.length);
        console.log("已抽到安慰剂灾难牌:", this.hasPlaceboDisaster);
        console.log("计算条件:", {
          isVotingPhase: this.isVotingPhase,
          hasVoted: this.hasVoted,
          isInCamp: this.isInCamp
        });
        console.log("=======================");
        
        // 向服务器请求最新状态
        this.ws.send(JSON.stringify({
          type: 'getGameState',
          roomId: this.roomId,
          playerId: this.playerId,
          playerName: this.currentPlayerName
        }));
        
        this.addMessage("已在控制台输出调试信息");
      },

      // 处理灾难牌移除
      handleDisasterRemoval(disasterValue) {
        // 查找是否已经有这种灾难牌被移除
        const existingDisaster = this.removedDisasters.find(d => d.value === disasterValue);
        
        if (existingDisaster) {
          // 如果已经有这种灾难牌被移除，更新剩余数量
          existingDisaster.remainingCount = this.initialDisasterCounts[disasterValue] - 2;
        } else {
          // 如果是第一次移除这种灾难牌
          this.removedDisasters.push({
            value: disasterValue,
            remainingCount: this.initialDisasterCounts[disasterValue] - 1
          });
        }
        
        // 添加消息提示
        const disasterName = this.disasterTypes[disasterValue];
        this.addMessage(`由于出现两次${disasterName}，移除一张${disasterName}牌`);
      },
      
      // 处理开牌结果
      handleCardDrawn(data) {
        this.lastDrawnCard = data.drawnCard;
        this.remainingCards = data.deckSize;
        this.cards = [...this.cards, this.lastDrawnCard];
        this.isVotingPhase = data.votingPhase;
        this.isRoundOver = data.roundOver;
        this.gemsOnGround = data.gemsOnGround || 0;
        this.treasuresOnGround = data.treasuresOnGround || [];
        this.hasPlaceboDisaster = data.hasPlaceboDisaster || false; // 从开牌结果获取双灾难状态
        
        // 检查是否因为双灾难结束
        if (!data.isPlaceboPhase && data.roundOver && data.doubleDisasterValue) {
          this.handleDisasterRemoval(data.doubleDisasterValue);
        }
        
        // 更新玩家信息
        if (data.players) {
          this.players = data.players;
          
          // 更新当前玩家的投票状态
          const currentPlayer = this.players.find(p => p.playerId === this.playerId);
          if (currentPlayer) {
            this.hasVoted = currentPlayer.hasVoted || false;
          }

          // 检查是否所有玩家都在营地
          this.checkAllPlayersInCamp();
        }
        
        this.addMessage(data.message);
        console.log(`翻开卡牌:`, this.lastDrawnCard);
        console.log('开牌后投票阶段：', this.isVotingPhase, '已投票：', this.hasVoted);
      }
    },
    beforeDestroy() {
      // 移除事件监听器
      window.removeEventListener('resize', this.checkDeviceType);
      
      // 关闭WebSocket连接
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.close();
      }
    },
    watch: {
      // 监听游戏状态变化
      currentRound(newRound) {
        if (newRound > 5) {
          this.showGameOverModal = true;
        }
      }
    }
  };
  