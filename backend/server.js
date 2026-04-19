const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const WebSocket = require('ws');
const config = require('./config');

const app = express();
app.use(cors());
app.use(bodyParser.json());

const PORT = config.matchServerPort;
const MAX_QUEUE_SIZE = 50;

// 匹配队列（印加宝藏 / 大A宝藏 分开排；大A再按市场难度分队列）
const matchQueues = {
  incan: { 3: [], 4: [], 5: [], 6: [] },
  da: {
    brutal: { 3: [], 4: [], 5: [], 6: [] },
    mild: { 3: [], 4: [], 5: [], 6: [] },
    choppy: { 3: [], 4: [], 5: [], 6: [] },
    volatile: { 3: [], 4: [], 5: [], 6: [] },
  },
};

let roomIdCounter = 1;
let daRoomIdCounter = 1;

function removeSocketFromQueues(sock) {
  for (const pc of [3, 4, 5, 6]) {
    const q = matchQueues.incan[pc];
    const idx = q.findIndex((e) => e.ws === sock);
    if (idx >= 0) {
      q.splice(idx, 1);
      return true;
    }
  }
  for (const diff of ['brutal', 'mild', 'choppy', 'volatile']) {
    for (const pc of [3, 4, 5, 6]) {
      const q = matchQueues.da[diff][pc];
      const idx = q.findIndex((e) => e.ws === sock);
      if (idx >= 0) {
        q.splice(idx, 1);
        return true;
      }
    }
  }
  return false;
}

function isSocketInQueue(sock) {
  for (const pc of [3, 4, 5, 6]) {
    if (matchQueues.incan[pc].some((e) => e.ws === sock)) return true;
  }
  for (const diff of ['brutal', 'mild', 'choppy', 'volatile']) {
    for (const pc of [3, 4, 5, 6]) {
      if (matchQueues.da[diff][pc].some((e) => e.ws === sock)) return true;
    }
  }
  return false;
}

// 创建 HTTP 服务器并绑定 WebSocket
const server = app.listen(PORT, () => {
  console.log(`匹配服务器运行在 http://${config.host}:${PORT}`);
});

const wss = new WebSocket.Server({ server });

function gameServerWsUrl(gameKey, hostname) {
  const port = gameKey === 'da' ? config.daGameServerPort : config.gameServerPort;
  const host = hostname && String(hostname).trim() ? hostname.trim() : config.host;
  return `ws://${host}:${port}`;
}

wss.on('connection', (ws, req) => {
  const hostHeader = req.headers.host || '';
  ws.matchClientHost = hostHeader.split(':')[0] || null;
  console.log('有玩家连接到匹配服务器');

  ws.on('message', (message) => {
    try {
      const {
        type,
        playerCount,
        playerName,
        gameType: rawGameType,
        marketDifficulty: rawMarketDifficulty,
      } = JSON.parse(message);

      if (type === 'leaveQueue') {
        removeSocketFromQueues(ws);
        ws.send(JSON.stringify({ success: true, leftQueue: true }));
        return;
      }
  
      if (type === 'join') {
        if (isSocketInQueue(ws)) {
          return ws.send(
            JSON.stringify({ success: false, message: '你已在匹配队列中，请勿重复加入' })
          );
        }
        const gameKey = rawGameType === 'da' ? 'da' : 'incan';
        let queues;
        let daDifficulty = 'brutal';
        if (gameKey === 'da') {
          if (rawMarketDifficulty === 'mild') daDifficulty = 'mild';
          else if (rawMarketDifficulty === 'choppy') daDifficulty = 'choppy';
          else if (rawMarketDifficulty === 'volatile') daDifficulty = 'volatile';
          else daDifficulty = 'brutal';
          queues = matchQueues.da[daDifficulty];
        } else {
          queues = matchQueues.incan;
        }

        if (!queues[playerCount] || queues[playerCount].length >= MAX_QUEUE_SIZE) {
          return ws.send(JSON.stringify({ success: false, message: '匹配队列已满！' }));
        }
  
        const playerId = `player-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
        queues[playerCount].push({ ws, playerId, playerName });
  
        if (queues[playerCount].length >= playerCount) {
          const players = queues[playerCount].splice(0, playerCount);
          const roomId =
            gameKey === 'da' ? `da-room-${daRoomIdCounter++}` : `room-${roomIdCounter++}`;
          const gameServer = gameServerWsUrl(
            gameKey,
            players[0].ws.matchClientHost || config.host
          );

          console.log(
            `[${gameKey}] 创建房间 ${roomId} (${gameKey === 'da' ? daDifficulty : ''})，玩家：`,
            players.map((p) => p.playerName)
          );
  
          players.forEach(({ ws, playerId, playerName }) => {
            ws.send(JSON.stringify({
              success: true,
              roomId,
              playerId,
              playerName,
              gameServer,
              gameType: gameKey,
              ...(gameKey === 'da' ? { marketDifficulty: daDifficulty } : {}),
            }));
          });
        } else {
          ws.send(
            JSON.stringify({
              success: false,
              message: `当前匹配队列人数：${queues[playerCount].length}，等待更多玩家...`,
            })
          );
        }
      }
    } catch (err) {
      console.error('匹配服务器处理消息出错：', err);
      ws.send(JSON.stringify({ success: false, message: '服务器处理出错！' }));
    }
  });

  ws.on('close', () => {
    removeSocketFromQueues(ws);
    console.log('玩家断开匹配服务器');
  });
});
