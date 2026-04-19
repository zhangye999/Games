const WebSocket = require('ws');
const config = require('./config');
const wss = new WebSocket.Server({ port: config.gameServerPort });

const rooms = {}; // 房间管理
const CARD_TYPE = {
  GEM: 'gem', // 宝石牌
  DISASTER: 'disaster', // 灾厄牌
  TREASURE: 'treasure', // 宝藏牌
};

// 在文件开头添加玩家连接映射
const playerConnections = new Map(); // 用于存储玩家ID和WebSocket连接的映射

// 辅助函数：创建可序列化的玩家信息对象（不包含WebSocket连接）
function createSerializablePlayerInfo(players) {
  return players.map(player => ({
    playerId: player.playerId,
    playerName: player.playerName,
    gemNumber: player.gemNumber || 0,
    roundGems: player.roundGems || 0, // 本轮获得的宝石
    inCamp: player.inCamp || false,
    hasVoted: player.hasVoted || false // 是否已投票
  }));
}

wss.on('connection', (ws) => {
    console.log('玩家连接到游戏服务器');
    let currentPlayerId = null; // 记录当前连接的玩家ID
    let currentRoomId = null;  // 记录当前连接的房间ID
    let currentPlayerName = null; // 记录当前连接的玩家名字

    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            const { type, roomId, playerId, playerName } = data;
            
            console.log(`收到消息 - 类型: ${type}, 房间: ${roomId}, 玩家: ${playerName}, ID: ${playerId}`);

        // 加入房间
        if (type === 'joinRoom') {
                currentPlayerId = playerId;
                currentRoomId = roomId;
                currentPlayerName = playerName;
                
                // 确保房间存在
                if (!rooms[roomId]) {
                    rooms[roomId] = {
                        players: [],
                        playerNamesArray: [],
                        gameState: {
                            currentRound: 1,
                            roundDeck: [],
                            drawnCards: [],
                            treasureCards: [],
                            playerVotes: {},
                            gemsOnGround: 0, // 场上剩余的宝石
                            treasuresOnGround: [], // 场上的宝藏牌
                            votingPhase: false, // 是否处于投票阶段
                            finished: false,
                            roundOver: false,
                            isPlaceboPhase: false, // 安慰剂阶段标志
                            hasPlaceboDisaster: false // 将双灾难标志移入gameState
                        },
                        isProcessingNextRound: false // 添加防抖动标志
                    };
                    // 初始化牌堆和宝藏牌
                    const { permanentDeck, treasureCards } = initializeDeck();
                    rooms[roomId].gameState.permanentDeck = permanentDeck;
                    rooms[roomId].gameState.treasureCards = treasureCards;
                    
                    // 第一轮开始前先加入面额为5的宝藏牌
                    const firstTreasure = treasureCards[0];
                    rooms[roomId].gameState.roundDeck = [...permanentDeck, firstTreasure];
                    
                    // 初始洗牌
                    shuffleDeck(rooms[roomId].gameState.roundDeck);
                    
                    console.log("初始化牌堆和宝藏牌完成，第一轮宝藏牌面额:", firstTreasure.value);
                }

                // 提取玩家名字以便进行更精确的匹配
                // 假设ID格式是 player-timestamp-randomstring-playerName
                const extractPlayerName = (id) => {
                    if (!id || typeof id !== 'string') return '';
                    const parts = id.split('-');
                    if (parts.length >= 4) {
                        // 返回最后一部分作为玩家名字
                        return parts.slice(3).join('-');
                    }
                    return '';
                };

                // 尝试通过ID和名字找到玩家
                let existingPlayerIndex = rooms[roomId].players.findIndex(p => 
                    p.playerId === playerId || 
                    (p.playerName === playerName && extractPlayerName(p.playerId) === playerName)
                );
                
                if (existingPlayerIndex >= 0) {
                    const existingPlayer = rooms[roomId].players[existingPlayerIndex];
                    console.log(`玩家 ${playerName} (ID: ${playerId}) 已经在房间 ${roomId} 中，更新连接`);
                    console.log(`原ID: ${existingPlayer.playerId}, 新ID: ${playerId}`);
                    
                    // 更新玩家的WebSocket连接和ID
                    existingPlayer.ws = ws;
                    existingPlayer.playerId = playerId; // 更新为新的ID
                    
                    // 更新玩家连接映射
                    playerConnections.set(playerId, {
                        ws,
                        roomId,
                        playerName
                    });
                    
                    // 移除旧的连接映射
                    if (existingPlayer.playerId !== playerId) {
                        playerConnections.delete(existingPlayer.playerId);
                    }
                    
                    // 发送当前房间状态
                    const gameState = rooms[roomId].gameState;
                    ws.send(JSON.stringify({
                        type: 'gameState',
                        message: `重新连接到房间 ${roomId}`,
                        players: createSerializablePlayerInfo(rooms[roomId].players),
                        currentRound: gameState.currentRound,
                        deckSize: gameState.roundDeck.length,
                        drawnCards: gameState.drawnCards,
                        isRoundOver: gameState.roundOver || false,
                        votingPhase: gameState.votingPhase || false,
                        gemsOnGround: gameState.gemsOnGround || 0,
                        treasuresOnGround: gameState.treasuresOnGround || []
                    }));
                    
                    // 通知其他玩家有玩家重新连接
                    rooms[roomId].players.forEach((player) => {
                        if (player.ws && player.ws !== ws) {
                            player.ws.send(JSON.stringify({
                                type: 'playerReconnected',
                                message: `玩家 ${playerName} 重新连接到游戏`,
                                players: createSerializablePlayerInfo(rooms[roomId].players)
                            }));
                        }
                    });
                    
                    return;
                }

                // 将新玩家加入房间
                rooms[roomId].playerNamesArray = [...new Set([...rooms[roomId].playerNamesArray, playerName])];
                rooms[roomId].players.push({ 
                  ws, 
                  playerId, 
                  playerName, 
                  gemNumber: 0, 
                  roundGems: 0, // 本轮获得的宝石
                  inCamp: false,
                  hasVoted: false // 是否已投票
                });
                
                // 更新玩家连接映射
                playerConnections.set(playerId, {
                    ws,
                    roomId,
                    playerName
                });

                console.log(`${playerName} (ID: ${playerId}) 加入房间 ${roomId}`);
                console.log(`当前房间玩家: ${rooms[roomId].playerNamesArray.join(', ')}`);
                console.log(`玩家ID列表: ${rooms[roomId].players.map(p => p.playerId).join(', ')}`);
                
                // 创建可序列化的玩家信息
                const playersInfo = createSerializablePlayerInfo(rooms[roomId].players);
                
                // 发送给当前玩家
                ws.send(JSON.stringify({ 
                    type: 'gameState',
                    message: `已加入房间 ${roomId}`, 
                    players: playersInfo,
                    currentRound: rooms[roomId].gameState.currentRound,
                    deckSize: rooms[roomId].gameState.roundDeck.length,
                    drawnCards: rooms[roomId].gameState.drawnCards,
                    isRoundOver: rooms[roomId].gameState.roundOver || false,
                    votingPhase: rooms[roomId].gameState.votingPhase || false,
                    gemsOnGround: rooms[roomId].gameState.gemsOnGround || 0,
                    treasuresOnGround: rooms[roomId].gameState.treasuresOnGround || []
                }));

                // 通知其他玩家有新玩家加入
                rooms[roomId].players.forEach((player) => {
                    if (player.ws && player.ws !== ws) {
                        player.ws.send(JSON.stringify({ 
                            type: 'playerJoined',
                            message: `${playerName} 加入了房间 ${roomId}`, 
                            players: playersInfo
                        }));
                    }
                });
        }

        // 玩家投票
        if (type === 'vote') {
                const { choice } = data;
            const gameState = rooms[roomId].gameState;
                
                // 检查是否处于投票阶段
                if (!gameState.votingPhase) {
                    ws.send(JSON.stringify({
                        type: 'error',
                        message: '当前不是投票阶段'
                    }));
                    console.log(`玩家 ${playerName} 尝试投票，但当前不是投票阶段`);
                    return;
                }
                
                // 找到当前玩家
                const playerIndex = rooms[roomId].players.findIndex(p => p.playerId === playerId);
                if (playerIndex === -1) {
                    ws.send(JSON.stringify({
                        type: 'error',
                        message: '玩家不存在'
                    }));
                    console.log(`玩家ID ${playerId} 不存在`);
                    return;
                }
                
                // 检查玩家是否已经回到营地
                const player = rooms[roomId].players[playerIndex];
                if (player.inCamp) {
                    ws.send(JSON.stringify({
                        type: 'error',
                        message: '你已经回到营地，不能参与投票'
                    }));
                    console.log(`玩家 ${playerName} 已在营地，不能投票`);
                    return;
                }
                
                // 记录玩家投票
            gameState.playerVotes[playerId] = choice;
                player.hasVoted = true;
                
                console.log(`玩家 ${playerName} 投票选择: ${choice}, 设置hasVoted=true`);
                
                // 通知玩家投票已记录
                ws.send(JSON.stringify({
                    type: 'voteRecorded',
                    message: `你选择了${choice === 'leave' ? '离开矿场' : '继续探险'}`
                }));
                
                // 通知所有玩家有人完成了投票（但不透露具体选择）
                rooms[roomId].players.forEach((p) => {
                    if (p.ws && !p.inCamp) {
                        p.ws.send(JSON.stringify({
                            type: 'playerVoted',
                            playerName: player.playerName,
                            votingStatus: rooms[roomId].players.map(p => ({
                                playerName: p.playerName,
                                hasVoted: p.hasVoted,
                                inCamp: p.inCamp
                            }))
                        }));
                    }
                });

                // 检查是否所有仍在探险的玩家都投票完毕
                const adventuringPlayers = rooms[roomId].players.filter(p => !p.inCamp);
                const allVoted = adventuringPlayers.every(p => p.hasVoted);
                
                console.log(`房间 ${roomId} 投票状态: ${adventuringPlayers.length}人在探险, ${adventuringPlayers.filter(p => p.hasVoted).length}人已投票`);
                
                if (allVoted) {
                    console.log(`房间 ${roomId} 所有探险玩家都已投票，处理投票结果`);
                processVotes(roomId);
                } else {
                    // 打印调试信息，看看哪些玩家还没有投票
                    console.log("等待投票的玩家:", adventuringPlayers
                        .filter(p => !p.hasVoted)
                        .map(p => `${p.playerName} (${p.playerId})`)
                    );
                }
            }

            // 处理获取房间状态请求
            if (type === 'getRoomState') {
              if (rooms[roomId]) {
                const playersInfo = createSerializablePlayerInfo(rooms[roomId].players);
                ws.send(JSON.stringify({
                  players: playersInfo,
                  currentRound: rooms[roomId].gameState.currentRound,
                  deckSize: rooms[roomId].gameState.roundDeck.length,
                  drawnCards: rooms[roomId].gameState.drawnCards
                }));
              }
            }

            // 处理获取完整游戏状态请求
            if (type === 'getGameState') {
              if (rooms[roomId]) {
                const gameState = rooms[roomId].gameState;
                
                console.log(`向玩家 ${playerName} 发送游戏状态: roundOver=${gameState.roundOver}, votingPhase=${gameState.votingPhase}, 轮次=${gameState.currentRound}`);
                
                ws.send(JSON.stringify({
                  type: 'gameState',
                  players: createSerializablePlayerInfo(rooms[roomId].players),
                  currentRound: gameState.currentRound,
                  deckSize: gameState.roundDeck.length,
                  drawnCards: gameState.drawnCards,
                  isRoundOver: gameState.roundOver || false,
                  votingPhase: gameState.votingPhase || false,
                  gemsOnGround: gameState.gemsOnGround || 0,
                  treasuresOnGround: gameState.treasuresOnGround || []
                }));
              }
            }

            // 处理开牌请求
            if (type === 'drawCard') {
              if (rooms[roomId] && rooms[roomId].gameState) {
                drawCard(roomId, ws);
              }
            }

            // 处理重置游戏请求
            if (type === 'resetGame') {
              if (rooms[roomId]) {
                resetGame(roomId);
              }
            }

            // 处理显示牌堆请求
            if (type === 'showDeck') {
              if (rooms[roomId] && rooms[roomId].gameState) {
                showDeck(roomId, ws);
              }
            }

            // 处理下一轮请求
            if (type === 'nextRound') {
              const gameState = rooms[roomId].gameState;
              
              // 检查轮次是否已经结束
              if (!gameState.roundOver) {
                ws.send(JSON.stringify({
                  type: 'error',
                  message: '当前轮次尚未结束，不能开始下一轮'
                }));
                console.log(`房间 ${roomId} 拒绝下一轮请求: 当前轮次尚未结束`);
                return;
              }
              
              // 检查是否有其他玩家正在处理下一轮请求
              if (rooms[roomId].isProcessingNextRound) {
                ws.send(JSON.stringify({
                  type: 'error',
                  message: '正在处理其他玩家的下一轮请求，请稍候'
                }));
                console.log(`房间 ${roomId} 拒绝下一轮请求: 正在处理其他请求`);
                return;
              }
              
              // 设置处理状态锁
              rooms[roomId].isProcessingNextRound = true;
              
              // 开始下一轮
              startNextRound(roomId);
              
              // 通知所有玩家进入新一轮
              rooms[roomId].players.forEach((player) => {
                if (player.ws) {
                  player.ws.send(JSON.stringify({
                    type: 'newRound',
                    currentRound: gameState.currentRound,
                    message: `第 ${gameState.currentRound} 轮开始`,
                    players: createSerializablePlayerInfo(rooms[roomId].players)
                  }));
                }
              });
              
              // 3秒后重置状态锁
              setTimeout(() => {
                rooms[roomId].isProcessingNextRound = false;
              }, 3000);
              
              return;
            }

            // 处理安慰剂开牌请求
            if (type === 'drawPlaceboCard') {
              if (rooms[roomId] && rooms[roomId].gameState) {
                const gameState = rooms[roomId].gameState;
                const allInCamp = rooms[roomId].players.every(player => player.inCamp);
                if (!gameState.roundOver || !allInCamp) {
                  ws.send(JSON.stringify({
                    type: 'error',
                    message: '仅当所有玩家已离场且本轮结束后，才能使用安慰剂开牌'
                  }));
                  return;
                }
                if (gameState.hasPlaceboDisaster) {
                  ws.send(JSON.stringify({
                    type: 'error',
                    message: '安慰剂阶段已经遇到双灾难，无法继续开牌'
                  }));
                  return;
                }
                // 进入安慰剂模式后复用 drawCard，但在 drawCard 内隔离所有结算副作用
                gameState.isPlaceboPhase = true;
                drawCard(roomId, ws);
              }
            }
        } catch (err) {
            console.error('处理消息出错:', err);
        }
    });

    ws.on('close', () => {
        console.log('玩家断开游戏服务器');
        
        // 处理玩家断开连接
        if (currentPlayerId && currentRoomId) {
            const room = rooms[currentRoomId];
            if (room) {
                const playerIndex = room.players.findIndex(p => p.playerId === currentPlayerId);
                if (playerIndex >= 0) {
                    console.log(`玩家 ${room.players[playerIndex].playerName} 断开连接，但仍保留在房间 ${currentRoomId} 中`);
                    // 标记连接为空，允许重连
                    room.players[playerIndex].ws = null;
                    
                    // 通知其他玩家
                    room.players.forEach((player) => {
                        if (player.ws && player.playerId !== currentPlayerId) {
                            player.ws.send(JSON.stringify({
                                type: 'playerDisconnected',
                                message: `玩家 ${room.players[playerIndex].playerName} 断开连接`,
                                players: createSerializablePlayerInfo(room.players)
                            }));
                        }
                    });
                }
            }
            
            // 从连接映射中移除
            playerConnections.delete(currentPlayerId);
        }
    });
});

function startNewRound(roomId) {
  const gameState = rooms[roomId].gameState;

  console.log(`开始房间 ${roomId} 第${gameState.currentRound}轮`);

  // 初始化所有牌堆（如果是第一次初始化）
  if (!gameState.permanentDeck) {
  const { permanentDeck, treasureCards } = initializeDeck();
  gameState.permanentDeck = permanentDeck; // 永久牌堆
    gameState.treasureCards = treasureCards; // 宝藏牌集合
  }

  // 重置轮次内牌堆
  gameState.roundDeck = [...gameState.permanentDeck]; // 轮次内牌堆是从永久牌堆复制的
  gameState.drawnCards = []; // 清空已翻开的牌
  gameState.playerVotes = {}; // 清空玩家投票
  gameState.gemsOnGround = 0; // 清空场上宝石
  gameState.treasuresOnGround = []; // 清空场上宝藏牌
  gameState.votingPhase = false; // 重置投票阶段
  gameState.roundOver = false; // 明确重置轮次结束状态

  // 处理轮次和宝藏牌
  if (!gameState.currentRound || gameState.currentRound > 5) {
    // 如果轮次无效或已经超过5轮，重置为第一轮
  gameState.currentRound = 1;
  }
  
  // 将所有未被拿走的宝藏牌加入牌堆
  gameState.treasureCards.forEach((treasureCard, index) => {
    // 如果宝藏牌未被拿走且是当前轮次或之前轮次的牌
    if (!treasureCard.taken && index < gameState.currentRound) {
      gameState.roundDeck.push(treasureCard);
      console.log(`加入第${index + 1}轮的宝藏牌，面额:`, treasureCard.value);
    }
  });

  // 洗牌
  shuffleDeck(gameState.roundDeck);
  console.log(`第${gameState.currentRound}轮洗牌完成，牌堆大小:`, gameState.roundDeck.length);

  // 重置所有玩家状态
  rooms[roomId].players.forEach((player) => {
    player.inCamp = false; // 所有玩家重新开始探险
    player.roundGems = 0; // 重置本轮宝石
    player.hasVoted = false; // 重置投票状态
  });

  // 发送给所有玩家
  rooms[roomId].players.forEach((player) => {
    if (player.ws) {
      player.ws.send(JSON.stringify({
        type: 'roundStart', // 添加消息类型
        message: `第${gameState.currentRound}轮开始`,
        currentRound: gameState.currentRound,
        deckSize: gameState.roundDeck.length,
        drawnCards: gameState.drawnCards,
        players: createSerializablePlayerInfo(rooms[roomId].players),
        gemsOnGround: gameState.gemsOnGround,
        treasuresOnGround: gameState.treasuresOnGround,
        votingPhase: gameState.votingPhase
      }));
    }
  });
}

function shuffleDeck(deck) {
    // 简单洗牌算法
    for (let i = deck.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [deck[i], deck[j]] = [deck[j], deck[i]]; // 交换
    }
}

// 初始化宝石牌、灾厄牌和宝藏牌
function initializeDeck() {
  let permanentDeck = [];

  // 添加灾厄牌（五种类型，每种3张）
  const disasterValues = [-14, -11, -8, -5, -2]; // 每种灾难牌的面值
  disasterValues.forEach(value => {
    for (let i = 0; i < 3; i++) { // 每种灾难牌3张
      permanentDeck.push({ type: CARD_TYPE.DISASTER, value: value });
    }
  });

  // 添加宝石牌（3-17），宝石面额就是数字
  for (let i = 3; i <= 17; i++) {
    permanentDeck.push({ type: CARD_TYPE.GEM, value: i });
  }

  // 宝藏牌按轮次加入
  let treasureCards = [
    { type: CARD_TYPE.TREASURE, value: 5, taken: false }, // 第一轮加入面额为5的宝藏牌
    { type: CARD_TYPE.TREASURE, value: 7, taken: false }, // 第二轮加入面额为7的宝藏牌
    { type: CARD_TYPE.TREASURE, value: 8, taken: false }, // 第三轮加入面额为8的宝藏牌
    { type: CARD_TYPE.TREASURE, value: 10, taken: false }, // 第四轮加入面额为10的宝藏牌
    { type: CARD_TYPE.TREASURE, value: 12, taken: false }, // 第五轮加入面额为12的宝藏牌
  ];

  return { permanentDeck, treasureCards };
}

function processVotes(roomId) {
    const gameState = rooms[roomId].gameState;
    const players = rooms[roomId].players;

  console.log(`处理房间 ${roomId} 的投票结果`);
  
  // 获取仍在探险的玩家
  const adventuringPlayers = players.filter(player => !player.inCamp);
  
  // 分离选择离开和选择继续的玩家
  const leavingPlayers = adventuringPlayers.filter(
    player => gameState.playerVotes[player.playerId] === 'leave'
  );
  
  const stayingPlayers = adventuringPlayers.filter(
    player => gameState.playerVotes[player.playerId] === 'stay'
  );
  
  console.log(`投票结果: ${leavingPlayers.length}人选择离开, ${stayingPlayers.length}人选择继续`);
  
  // 处理选择离开的玩家
  if (leavingPlayers.length > 0) {
    // 计算每个离开的玩家可以分到的场上宝石数量
    const gemsPerPlayer = Math.floor(gameState.gemsOnGround / leavingPlayers.length);
    const remainingGems = gameState.gemsOnGround % leavingPlayers.length;
    
    // 分配场上的宝石给离开的玩家
    leavingPlayers.forEach(player => {
      // 玩家带走本轮获得的宝石
      player.gemNumber += player.roundGems;
      
      // 玩家分得场上的宝石
      player.gemNumber += gemsPerPlayer;
      
      // 标记玩家已回到营地
      player.inCamp = true;
      player.hasVoted = false;
      player.roundGems = 0; // 清空本轮宝石计数
      
      console.log(`玩家 ${player.playerName} 离开矿场，带走 ${player.roundGems + gemsPerPlayer} 宝石`);
    });
    
    // 更新场上剩余的宝石
    gameState.gemsOnGround = remainingGems;
    
    // 如果只有一个玩家离开，他可以带走场上的宝藏牌
    if (leavingPlayers.length === 1 && gameState.treasuresOnGround.length > 0) {
      const luckyPlayer = leavingPlayers[0];
      
      // 处理每张宝藏牌
      gameState.treasuresOnGround.forEach(treasure => {
        // 玩家获得宝藏牌的面额作为宝石
        luckyPlayer.gemNumber += treasure.value;
        
        // 标记宝藏牌已被拿走
        const treasureIndex = gameState.treasureCards.findIndex(
          t => t.value === treasure.value
        );
        if (treasureIndex !== -1) {
          gameState.treasureCards[treasureIndex].taken = true;
        }
        
        console.log(`玩家 ${luckyPlayer.playerName} 带走宝藏牌，面额 ${treasure.value}`);
      });
      
      // 清空场上的宝藏牌
      const treasuresTaken = [...gameState.treasuresOnGround];
      gameState.treasuresOnGround = [];
      
      // 通知所有玩家有人带走了宝藏
      players.forEach(player => {
        if (player.ws) {
          player.ws.send(JSON.stringify({
            type: 'treasureTaken',
            playerName: luckyPlayer.playerName,
            treasures: treasuresTaken,
            message: `${luckyPlayer.playerName} 带走了宝藏!`
          }));
        }
      });
    }
  }
  
  // 重置投票阶段和投票记录
  gameState.votingPhase = false;
  gameState.playerVotes = {};
  
  // 重置所有玩家的投票状态
  players.forEach(player => {
    player.hasVoted = false;
  });
  
  console.log(`投票阶段结束，重置votingPhase=${gameState.votingPhase}`);
  
  // 检查是否所有玩家都已经回到营地
  const allInCamp = players.every(player => player.inCamp);
  if (allInCamp) {
    gameState.roundOver = true;
    console.log(`所有玩家都已回到营地，轮次结束`);
  }
  
  // 通知所有玩家投票结果
  players.forEach(player => {
    if (player.ws) {
      player.ws.send(JSON.stringify({
        type: 'voteResults',
        leavingPlayers: leavingPlayers.map(p => p.playerName),
        stayingPlayers: stayingPlayers.map(p => p.playerName),
        players: createSerializablePlayerInfo(players),
        gemsOnGround: gameState.gemsOnGround,
        treasuresOnGround: gameState.treasuresOnGround,
        roundOver: gameState.roundOver,
        votingPhase: gameState.votingPhase,
        message: `${leavingPlayers.length}人选择离开，${stayingPlayers.length}人选择继续探险`
      }));
    }
  });
}

// 开始下一轮
function startNextRound(roomId) {
  const gameState = rooms[roomId].gameState;
  
  // 重置安慰剂相关状态
  console.log(`[安慰剂] 开始新一轮前的状态: isPlaceboPhase=${gameState.isPlaceboPhase}, hasPlaceboDisaster=${gameState.hasPlaceboDisaster}`);
  gameState.isPlaceboPhase = false;
  gameState.hasPlaceboDisaster = false;
  console.log(`[安慰剂] 重置安慰剂状态: isPlaceboPhase=${gameState.isPlaceboPhase}, hasPlaceboDisaster=${gameState.hasPlaceboDisaster}`);
  
  console.log(`开始房间 ${roomId} 第${gameState.currentRound}轮`);
  
  // 检查轮次是否已经结束
  if (!gameState.roundOver) {
    console.log(`房间 ${roomId} 当前轮次尚未结束，不能开始下一轮`);
    return;
  }
  
  // 增加轮次计数
  gameState.currentRound++;
  
  // 检查游戏是否应该结束
  if (gameState.currentRound > 5) {
    endGame(roomId);
    return;
  }
  
  // 重置轮次结束状态
  gameState.roundOver = false;
  console.log(`房间 ${roomId} 重置轮次结束状态: roundOver = ${gameState.roundOver}`);
  
  // 开始新的一轮
  startNewRound(roomId);
}

// 结束游戏
function endGame(roomId) {
  const players = rooms[roomId].players;
  
  // 发送游戏结束消息
    players.forEach((player) => {
    if (player.ws) {
      player.ws.send(JSON.stringify({
        message: '游戏结束',
        gameOver: true,
        players: createSerializablePlayerInfo(players)
      }));
    }
  });
}

// 翻牌
function drawCard(roomId, senderWs) {
  const gameState = rooms[roomId].gameState;
  
  console.log(`[安慰剂] 开牌前状态检查:`);
  console.log(`- isPlaceboPhase: ${gameState.isPlaceboPhase}`);
  console.log(`- hasPlaceboDisaster: ${gameState.hasPlaceboDisaster}`);
  console.log(`- roundOver: ${gameState.roundOver}`);
  
  // 检查是否可以开始安慰剂阶段
  const allInCamp = rooms[roomId].players.every(player => player.inCamp);
  if (gameState.roundOver && !gameState.isPlaceboPhase && allInCamp) {
    // 进入安慰剂阶段
    gameState.isPlaceboPhase = true;
    console.log(`[安慰剂] 进入安慰剂阶段: isPlaceboPhase=${gameState.isPlaceboPhase}`);
  }
  
  // 如果不是安慰剂阶段，执行正常开牌的检查
  if (!gameState.isPlaceboPhase) {
    // 检查是否处于投票阶段
    if (gameState.votingPhase) {
      senderWs.send(JSON.stringify({
        type: 'error',
        message: '当前处于决策阶段，请等待所有玩家完成决策'
      }));
      return;
    }
    
    // 检查轮次是否已经结束
    if (gameState.roundOver) {
      senderWs.send(JSON.stringify({
        type: 'error',
        message: '本轮已经结束，请等待下一轮'
      }));
      return;
    }
  } else {
    // 安慰剂阶段的检查
    if (!allInCamp) {
      senderWs.send(JSON.stringify({
        type: 'error',
        message: '当前仍有玩家在场，不能进行安慰剂开牌'
      }));
      return;
    }
    if (gameState.hasPlaceboDisaster) {
      senderWs.send(JSON.stringify({
        type: 'error',
        message: '安慰剂阶段已经遇到双灾难，无法继续开牌'
      }));
      console.log(`[安慰剂] 拒绝开牌：已经遇到双灾难`);
      return;
    }
  }
  
  // 检查牌堆是否为空
  if (gameState.roundDeck.length === 0) {
    gameState.roundOver = true;
    console.log(`房间 ${roomId} 牌堆为空，本轮结束`);
    rooms[roomId].players.forEach((player) => {
      if (player.ws) {
        player.ws.send(JSON.stringify({
          type: 'roundOver',
          message: '牌堆已空，本轮结束',
          roundOver: true
        }));
      }
    });
    return;
  }
  
  console.log(`房间 ${roomId} 开始翻牌，当前牌堆大小: ${gameState.roundDeck.length}`);
  
  // 从牌堆顶部抽一张牌
  const drawnCard = gameState.roundDeck.pop();
  // 将牌加入已抽取的牌堆（无论是否是安慰剂阶段）
  gameState.drawnCards.push(drawnCard);
  
  // 处理宝石分配
  let message = '';
  if (drawnCard.type === CARD_TYPE.GEM) {
    message = distributeGems(roomId, drawnCard.value);
  } else if (drawnCard.type === CARD_TYPE.TREASURE) {
    // 宝藏牌直接放到场上（仅在非安慰剂阶段）
    if (!gameState.isPlaceboPhase) {
      gameState.treasuresOnGround.push(drawnCard);
    }
    message = `翻开了一张宝藏牌，面额为${drawnCard.value}`;
  } else if (drawnCard.type === CARD_TYPE.DISASTER) {
    message = `翻开了一张${getDisasterType(drawnCard.value)}灾难牌`;
  }
  
  // 检查是否翻到了灾难牌
  const isDisaster = drawnCard.type === CARD_TYPE.DISASTER;
  let doubleDisasterValue = null;
  
  // 如果是灾难牌，检查之前是否已经翻到过同类型的灾难
  if (isDisaster) {
    const sameDisasterCards = gameState.drawnCards.filter(
      card => card.type === CARD_TYPE.DISASTER && card.value === drawnCard.value
    );
    
    const sameDisasterCount = sameDisasterCards.length;
    console.log(`[安慰剂] 检测到灾难牌: 值=${drawnCard.value}, 同类型数量=${sameDisasterCount}, 是否安慰剂=${gameState.isPlaceboPhase}`);
    
    // 如果这是第二张同类型的灾难牌，则结束本轮
    if (sameDisasterCount >= 2) {
      // 如果是在安慰剂阶段，设置hasPlaceboDisaster标志
      if (gameState.isPlaceboPhase) {
        gameState.hasPlaceboDisaster = true;
        message = `安慰剂: 翻到第二张${getDisasterType(drawnCard.value)}灾难牌，安慰剂阶段结束`;
        console.log(`[安慰剂] 遇到双灾难: hasPlaceboDisaster=${gameState.hasPlaceboDisaster}`);
      } else {
        gameState.roundOver = true;
        doubleDisasterValue = drawnCard.value;
        message = `翻到第二张${getDisasterType(drawnCard.value)}灾难牌，本轮结束`;
        // 清空所有仍在探险的玩家的本轮宝石
        rooms[roomId].players.forEach(player => {
          if (!player.inCamp) {
            player.roundGems = 0;
          }
        });
      }
    }
  }
  
  // 如果轮次没有结束且不是安慰剂阶段，进入投票阶段
  if (!gameState.roundOver && !gameState.isPlaceboPhase) {
    // 设置投票阶段标志
    gameState.votingPhase = true;
    console.log(`房间 ${roomId} 进入投票阶段`);
    
    // 重置所有仍在探险玩家的投票状态
    rooms[roomId].players.forEach(player => {
      if (!player.inCamp) {
        player.hasVoted = false;
        console.log(`重置玩家 ${player.playerName} 的投票状态为 false`);
      }
    });
  }
  
  // 修改消息前缀
  if (gameState.isPlaceboPhase && !message.startsWith('安慰剂:')) {
    message = '安慰剂: ' + message;
  }
  
  // 通知所有玩家
  rooms[roomId].players.forEach((player) => {
    if (player.ws) {
      player.ws.send(JSON.stringify({
        type: 'cardDrawn',
        drawnCard: drawnCard,
        deckSize: gameState.roundDeck.length,
        roundOver: gameState.roundOver,
        votingPhase: gameState.votingPhase,
        message: message,
        players: createSerializablePlayerInfo(rooms[roomId].players),
        gemsOnGround: gameState.gemsOnGround,
        treasuresOnGround: gameState.treasuresOnGround,
        doubleDisasterValue: doubleDisasterValue,
        hasPlaceboDisaster: gameState.hasPlaceboDisaster || false,
        isPlaceboPhase: gameState.isPlaceboPhase
      }));
    }
  });
  
  // 如果轮次结束，不需要投票
  if (gameState.roundOver) {
    console.log(`房间 ${roomId} 轮次结束，跳过投票阶段`);
    return;
  }
  
  // 打印当前投票阶段状态
  console.log(`房间 ${roomId} 当前投票阶段: ${gameState.votingPhase}`);
  console.log(`仍在探险的玩家: ${rooms[roomId].players.filter(p => !p.inCamp).map(p => p.playerName).join(', ')}`);
}

// 分配宝石
function distributeGems(roomId, gemValue) {
  const gameState = rooms[roomId].gameState;
  const adventuringPlayers = rooms[roomId].players.filter(player => !player.inCamp);
  const playerCount = adventuringPlayers.length;
  
  if (playerCount === 0) return '没有玩家在探险中';
  
  // 如果不是安慰剂阶段，才实际分配宝石
  if (!gameState.isPlaceboPhase) {
    // 计算每个玩家可以分到的宝石数量
    const gemsPerPlayer = Math.floor(gemValue / playerCount);
    // 计算剩余的宝石数量
    const remainingGems = gemValue % playerCount;
    
    // 给每个玩家分配宝石
    adventuringPlayers.forEach(player => {
      player.roundGems += gemsPerPlayer;
    });
    
    // 剩余的宝石放到场上
    gameState.gemsOnGround += remainingGems;
    
    return `翻开了面额为${gemValue}的宝石牌，每人分得${gemsPerPlayer}个宝石，场上剩余${remainingGems}个宝石`;
  } else {
    // 安慰剂阶段，只返回消息不实际分配
    return `安慰剂: 如果继续探险，每人可获得 ${Math.floor(gemValue / playerCount)} 宝石`;
  }
}

// 重置游戏
function resetGame(roomId) {
  // 保留玩家列表，但重置其状态
  const players = rooms[roomId].players;
  
  // 重新初始化房间
  rooms[roomId] = {
    players: players.map(player => ({
      ...player,
      gemNumber: 0,
      roundGems: 0,
      inCamp: false,
      hasVoted: false
    })),
    playerNamesArray: rooms[roomId].playerNamesArray,
    gameState: {
      currentRound: 1,
      roundDeck: [],
      drawnCards: [],
      treasureCards: [],
      playerVotes: {},
      gemsOnGround: 0,
      treasuresOnGround: [],
      votingPhase: false,
      finished: false,
      roundOver: false,
      isPlaceboPhase: false,
      hasPlaceboDisaster: false // 重置双灾难标志
    },
    isProcessingNextRound: false // 重置处理下一轮的标志
  };

  // 初始化牌堆和宝藏牌
  const { permanentDeck, treasureCards } = initializeDeck();
  rooms[roomId].gameState.permanentDeck = permanentDeck;
  rooms[roomId].gameState.treasureCards = treasureCards;
  
  // 第一轮开始前先加入面额为5的宝藏牌
  const firstTreasure = treasureCards[0]; // 获取面额为5的宝藏牌
  rooms[roomId].gameState.roundDeck = [...permanentDeck, firstTreasure];
  
  // 初始洗牌
  shuffleDeck(rooms[roomId].gameState.roundDeck);
  
  console.log("游戏重置完成，第一轮宝藏牌面额:", firstTreasure.value);

  // 重置安慰剂阶段标志
  rooms[roomId].gameState.isPlaceboPhase = false;

  // 通知所有玩家游戏已重置
  rooms[roomId].players.forEach((player) => {
    if (player.ws) {
      player.ws.send(JSON.stringify({
        type: 'gameReset', // 添加消息类型
        message: '游戏已重置',
        currentRound: 1,
        deckSize: rooms[roomId].gameState.roundDeck.length,
        drawnCards: [], // 确保发送空的已翻开牌数组
        players: createSerializablePlayerInfo(rooms[roomId].players)
      }));
    }
  });
}

// 显示牌堆内容
function showDeck(roomId, ws) {
  const gameState = rooms[roomId].gameState;
  
  // 创建牌堆内容的描述
  const deckDescription = {
    totalCards: gameState.roundDeck.length,
    currentRound: gameState.currentRound,
    gems: gameState.roundDeck.filter(card => card.type === CARD_TYPE.GEM)
      .map(card => card.value)
      .sort((a, b) => a - b),
    disasters: gameState.roundDeck.filter(card => card.type === CARD_TYPE.DISASTER)
      .reduce((acc, card) => {
        const type = getDisasterType(card.value);
        acc[type] = (acc[type] || 0) + 1;
        return acc;
      }, {}),
    treasures: gameState.roundDeck.filter(card => card.type === CARD_TYPE.TREASURE)
      .map(card => `面额${card.value}的宝藏牌`)
  };

  // 创建已翻开卡牌的描述
  const drawnDescription = {
    totalDrawn: gameState.drawnCards.length,
    gems: gameState.drawnCards.filter(card => card.type === CARD_TYPE.GEM)
      .map(card => card.value)
      .sort((a, b) => a - b),
    disasters: gameState.drawnCards.filter(card => card.type === CARD_TYPE.DISASTER)
      .reduce((acc, card) => {
        const type = getDisasterType(card.value);
        acc[type] = (acc[type] || 0) + 1;
        return acc;
      }, {}),
    treasures: gameState.drawnCards.filter(card => card.type === CARD_TYPE.TREASURE)
      .map(card => `面额${card.value}的宝藏牌`)
  };

  // 宝藏牌状态
  const treasureStatus = gameState.treasureCards.map((card, index) => {
    return {
      round: index + 1,
      value: card.value,
      status: card.taken ? '已被拿走' : '未被拿走',
      inCurrentDeck: gameState.roundDeck.some(deckCard => 
        deckCard.type === CARD_TYPE.TREASURE && deckCard.value === card.value
      ) ? '在当前牌堆中' : '不在当前牌堆中'
    };
  });

  // 在服务器控制台输出牌堆信息
  console.log('\n=================== 当前游戏状态 ===================');
  console.log(`当前轮次: ${gameState.currentRound}`);
  console.log('\n----- 牌堆内容 -----');
  console.log('总卡牌数:', deckDescription.totalCards);
  console.log('宝石牌:', deckDescription.gems);
  console.log('灾难牌:', deckDescription.disasters);
  console.log('宝藏牌:', deckDescription.treasures);
  
  console.log('\n----- 已翻开卡牌 -----');
  console.log('总翻开数:', drawnDescription.totalDrawn);
  console.log('宝石牌:', drawnDescription.gems);
  console.log('灾难牌:', drawnDescription.disasters);
  console.log('宝藏牌:', drawnDescription.treasures);
  
  console.log('\n----- 宝藏牌状态 -----');
  treasureStatus.forEach(treasure => {
    console.log(`第${treasure.round}轮 (面额${treasure.value}): ${treasure.status}, ${treasure.inCurrentDeck}`);
  });
  console.log('===================================================\n');
  
  // 发送给请求的玩家
  ws.send(JSON.stringify({
    message: '牌堆信息已在服务器控制台显示'
  }));
}

// 获取灾难类型
function getDisasterType(value) {
  const disasterTypes = {
    '-14': '毒蛇',
    '-11': '矿难',
    '-8': '僵尸',
    '-5': '火焰',
    '-2': '蜘蛛'
  };
  return disasterTypes[value] || '未知灾难';
}

console.log(`游戏服务器运行在 ${config.gameServerUrl}`);