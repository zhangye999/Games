import { config } from '../../config';

export default {
  name: 'IncanGoldIndex',
  data() {
    return {
      selectedPlayers: null, // 当前选择的玩家数量
      playerOptions: [3, 4, 5, 6], // 玩家选项
      ws: null, // WebSocket 实例
      inMatchQueue: false, // 是否在匹配队列中
      wsConnected: false, // WebSocket 连接状态
      showPopup: false, // 是否显示弹窗
      popupMessage: '', // 弹窗提示消息
      errorMessage: '',  // 添加 errorMessage 属性
      playerName: '', // 玩家名字
      roomId: ''
    };
  },
  methods: {
    // 选择玩家数量
    selectPlayers(num) {
      this.selectedPlayers = num;
    },
    // 初始化 WebSocket
    initWebSocket() {
      if (this.ws) return; // 防止重复初始化

      this.ws = new WebSocket(config.matchServerUrl);

      // WebSocket 连接成功
      this.ws.onopen = () => {
        console.log("WebSocket 已连接");
        this.wsConnected = true;
      };

      // 接收消息
      this.ws.onmessage = (event) => {
        const response = JSON.parse(event.data);
        if (response.leftQueue) {
          return;
        }
        if (response.success) {
          this.inMatchQueue = false; // 退出匹配状态
          this.showPopup = false; // 关闭弹窗
          console.log("匹配成功，房间号：", response.roomId);
          
          // 存储玩家信息
          localStorage.setItem('playerName', this.playerName);
          localStorage.setItem('currentRoomId', response.roomId);
          
          // 重要：保存服务器分配的唯一玩家ID
          if (response.playerId) {
            localStorage.setItem('playerId', response.playerId);
            console.log("服务器分配的玩家ID:", response.playerId);
          }
          
          // 跳转到游戏页面
          this.$router.push({
            name: 'IncanGoldGame',
            params: { 
              roomId: response.roomId,
              playerName: this.playerName,
              playerId: response.playerId // 传递服务器分配的ID
            },
          });
        } else {
          if(response.message){
            this.popupMessage = response.message;
            this.showPopup = true; // 显示弹窗
            this.inMatchQueue = true;
          } else {
            this.inMatchQueue = false;
            this.popupMessage = response.message || "匹配失败，请重试！";
            this.showPopup = true; // 显示弹窗
          }
        }
      };

      // WebSocket 错误
      this.ws.onerror = (error) => {
        console.error("WebSocket 错误：", error);
        this.inMatchQueue = false;
        this.wsConnected = false; // 设置连接状态为false
        this.errorMessage = "无法连接到服务器，请确保服务器已启动！"; // 显示在界面上的错误信息
        this.popupMessage = "连接服务器失败，请检查网络连接！";
        this.showPopup = true;
      };

      // WebSocket 关闭
      this.ws.onclose = () => {
        console.log("WebSocket 已关闭");
        this.ws = null;
        this.wsConnected = false;
        this.inMatchQueue = false;
        this.errorMessage = "与服务器的连接已断开";
      };
    },
    // 发送匹配请求
    matchPlayers() {
      if (!this.selectedPlayers) {
        this.errorMessage = "请选择玩家人数！";
        return;
      }

      if (!this.playerName.trim()) {
        this.errorMessage = "请输入您的昵称！";
        return;
      }
      if (this.inMatchQueue) {
        this.errorMessage = "你已在匹配队列中，请先退出匹配";
        return;
      }
  
      // 确保 WebSocket 已初始化
      this.initWebSocket();
  
      // 检查 WebSocket 连接状态
      if (this.wsConnected) {
        this.showPopup = true;
        this.popupMessage = "匹配中，请稍后...";
        this.errorMessage = ''; // 清除错误信息
  
        console.log("发送匹配请求，玩家名字：", this.playerName);
        this.ws.send(
          JSON.stringify({
            type: 'join',
            playerCount: this.selectedPlayers,
            playerName: this.playerName.trim()
          })
        );
        this.inMatchQueue = true;
      } else {
        console.warn("WebSocket 尚未连接！");
        this.errorMessage = "正在尝试连接服务器，请稍后再试...";
        // 尝试重新连接
        this.initWebSocket();
      }
    },
    // 仅隐藏弹窗，仍保留匹配状态
    hideMatchingPopup() {
      this.showPopup = false;
    },
    // 主动退出匹配队列
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
    // 页面加载时初始化 WebSocket
    this.initWebSocket();
    
    // 从localStorage获取之前存储的玩家名字（如果有）
    const savedName = localStorage.getItem('playerName');
    if (savedName) {
      this.playerName = savedName;
    }
  },
  beforeDestroy() {
    // 关闭 WebSocket 连接
    if (this.ws) {
      this.ws.close();
    }
  },
};