import { config, resolveWebSocketUrl } from '../../config';

export default {
  name: 'DaTreasureIndex',
  data() {
    return {
      selectedPlayers: null,
      playerOptions: [3, 4, 5, 6],
      /** 与游戏服一致：brutal=残酷，mild=温和 */
      marketDifficulty: 'brutal',
      ws: null,
      /** 已向服务器发起入队且尚未成功匹配或主动退出（隐藏弹窗时仍为 true） */
      inMatchQueue: false,
      wsConnected: false,
      showPopup: false,
      showDifficultyHint: false,
      popupMessage: '',
      errorMessage: '',
      playerName: '',
      roomId: '',
    };
  },
  methods: {
    selectPlayers(num) {
      this.selectedPlayers = num;
    },
    selectMarketDifficulty(key) {
      if (key === 'mild') this.marketDifficulty = 'mild';
      else if (key === 'choppy') this.marketDifficulty = 'choppy';
      else if (key === 'volatile') this.marketDifficulty = 'volatile';
      else this.marketDifficulty = 'brutal';
    },
    initWebSocket() {
      if (this.ws) return;

      this.ws = new WebSocket(config.matchServerUrl);

      this.ws.onopen = () => {
        this.wsConnected = true;
      };

      this.ws.onmessage = (event) => {
        const response = JSON.parse(event.data);
        if (response.leftQueue) {
          return;
        }
        if (response.success && response.roomId) {
          this.inMatchQueue = false;
          this.showPopup = false;

          localStorage.setItem('playerName', this.playerName);
          localStorage.setItem('currentDaRoomId', response.roomId);
          if (response.playerId) {
            localStorage.setItem('daPlayerId', response.playerId);
          }
          if (response.gameServer) {
            localStorage.setItem(
              'daGameServerUrl',
              resolveWebSocketUrl(response.gameServer) || response.gameServer
            );
          }
          const md = ['mild', 'choppy', 'volatile', 'brutal'].includes(
            response.marketDifficulty
          )
            ? response.marketDifficulty
            : this.marketDifficulty;
          localStorage.setItem('daMarketDifficulty', md);

          this.$router.push({
            name: 'DaTreasureGame',
            params: {
              roomId: response.roomId,
              playerName: this.playerName,
              playerId: response.playerId,
            },
          });
        } else {
          if (response.message) {
            this.popupMessage = response.message;
            this.showPopup = true;
            if (
              response.message.includes('队列已满') ||
              response.message.includes('服务器处理出错')
            ) {
              this.inMatchQueue = false;
            } else {
              this.inMatchQueue = true;
            }
          } else {
            this.inMatchQueue = false;
            this.popupMessage = response.message || '匹配失败，请重试！';
            this.showPopup = true;
          }
        }
      };

      this.ws.onerror = () => {
        this.inMatchQueue = false;
        this.wsConnected = false;
        this.errorMessage = '无法连接到服务器';
        this.popupMessage = '连接服务器失败';
        this.showPopup = true;
      };

      this.ws.onclose = () => {
        this.ws = null;
        this.wsConnected = false;
        this.errorMessage = '与服务器连接已断开';
      };
    },
    matchPlayers() {
      if (!this.selectedPlayers) {
        this.errorMessage = '请选择玩家人数！';
        return;
      }
      if (!this.playerName.trim()) {
        this.errorMessage = '请输入昵称！';
        return;
      }
      if (this.inMatchQueue) {
        this.errorMessage = '你已在匹配队列中。请先退出匹配，或点底部「退出匹配」。';
        return;
      }

      this.initWebSocket();

      if (this.wsConnected) {
        this.showPopup = true;
        this.popupMessage = '匹配中，请稍后...';
        this.errorMessage = '';

        this.ws.send(
          JSON.stringify({
            type: 'join',
            gameType: 'da',
            playerCount: this.selectedPlayers,
            playerName: this.playerName.trim(),
            marketDifficulty: this.marketDifficulty,
          })
        );
        this.inMatchQueue = true;
      } else {
        this.errorMessage = '正在连接服务器，请稍后再试...';
        this.initWebSocket();
      }
    },
    /** 仅收起弹窗，仍在服务器队列中，不可再次点击「开始游戏」 */
    hideMatchingPopup() {
      this.showPopup = false;
    },
    /** 通知服务器出队，可再次匹配 */
    exitMatchingQueue() {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ type: 'leaveQueue' }));
      }
      this.inMatchQueue = false;
      this.showPopup = false;
      this.popupMessage = '';
    },
  },
  created() {
    this.initWebSocket();
    const savedName = localStorage.getItem('playerName');
    if (savedName) this.playerName = savedName;
    /** 旧版「波动」存为 volatile；重命名为震荡(choppy) 后，仅首次把旧 volatile 迁成 choppy */
    if (!localStorage.getItem('daMdRenameVolatile2026')) {
      if (localStorage.getItem('daMarketDifficulty') === 'volatile') {
        localStorage.setItem('daMarketDifficulty', 'choppy');
      }
      localStorage.setItem('daMdRenameVolatile2026', '1');
    }
    const savedDiff = localStorage.getItem('daMarketDifficulty');
    if (['mild', 'choppy', 'volatile', 'brutal'].includes(savedDiff)) {
      this.marketDifficulty = savedDiff;
    }
  },
  beforeUnmount() {
    if (this.ws) this.ws.close();
  },
};
