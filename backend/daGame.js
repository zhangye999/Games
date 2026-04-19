/**
 * 大A宝藏（印加宝藏股市版）— 独立游戏服，请勿与印加宝藏 game.js 混用。
 */
const WebSocket = require('ws');
const config = require('./config');
const wss = new WebSocket.Server({ port: config.daGameServerPort });

const rooms = {};
const CARD_TYPE = {
  GEM: 'gem',
  DISASTER: 'disaster',
  TREASURE: 'treasure',
};

const INITIAL_WALLET = 10000;
const MIN_STAKE = 1000;

function round2(x) {
  return Math.round(Number(x) * 100) / 100;
}

function createSerializablePlayerInfo(players) {
  return players.map((player) => ({
    playerId: player.playerId,
    playerName: player.playerName,
    totalCapital: round2(player.wallet),
    roundCapital: round2(player.roundCapital),
    ownedTreasures: [...(player.ownedTreasures || [])],
    inCamp: player.inCamp || false,
    hasVoted: player.hasVoted || false,
    stakingSubmitted: !!player.stakingSubmitted,
    gemNumber: round2(player.wallet),
    couldNotEnterRound: !!player.couldNotEnterRound,
  }));
}

function normalizeDifficulty(d) {
  if (d === 'mild') return 'mild';
  if (d === 'choppy') return 'choppy';
  if (d === 'volatile') return 'volatile';
  return 'brutal';
}

function getRoomDifficulty(room) {
  return normalizeDifficulty(room.gameState.marketDifficulty);
}

/** 每有 1 人在场外，宝石有效涨幅额外提升的比例（相对已放大后的基数） */
function gemBonusPerAbsent(difficulty) {
  return normalizeDifficulty(difficulty) === 'mild' ? 0.2 : 0.3;
}

/**
 * 震荡：基数×2（约 6%~34% 档）；波动：基数×3（约 9%~51% 档）；其余为 1
 */
function gemBaseScale(difficulty) {
  const d = normalizeDifficulty(difficulty);
  if (d === 'choppy') return 2;
  if (d === 'volatile') return 3;
  return 1;
}

/**
 * 同类灾难第 n 次出现时的场内资金乘数。
 * 残酷/震荡：×0.9 / ×0.5 / ×0.1；温和：×0.97 / ×0.9 / ×0.7；波动：×0.9 / ×0.7 / ×0.5
 */
function disasterMultiplier(countThisType, difficulty) {
  const d = normalizeDifficulty(difficulty);
  if (d === 'mild') {
    if (countThisType === 1) return 0.97;
    if (countThisType === 2) return 0.9;
    return 0.7;
  }
  if (d === 'volatile') {
    if (countThisType === 1) return 0.9;
    if (countThisType === 2) return 0.7;
    return 0.5;
  }
  /** 残酷、震荡 */
  if (countThisType === 1) return 0.9;
  if (countThisType === 2) return 0.5;
  return 0.1;
}

/**
 * 多人同时离场后的抛压：离场者兑付 ×payout，留守者场内 ×cave（与指数一致）
 */
function exitPressureMultiplier(leavingCount, difficulty) {
  const d = normalizeDifficulty(difficulty);
  if (leavingCount <= 1) return { payout: 1, cave: 1 };
  if (d === 'mild') {
    if (leavingCount === 2) return { payout: 0.97, cave: 0.97 };
    if (leavingCount === 3) return { payout: 0.9, cave: 0.9 };
    return { payout: 0.7, cave: 0.7 };
  }
  /** 残酷、震荡、波动 */
  if (leavingCount === 2) return { payout: 0.9, cave: 0.9 };
  if (leavingCount === 3) return { payout: 0.7, cave: 0.7 };
  return { payout: 0.5, cave: 0.5 };
}

function extractPlayerName(id) {
  if (!id || typeof id !== 'string') return '';
  const parts = id.split('-');
  if (parts.length >= 4) return parts.slice(3).join('-');
  return '';
}

wss.on('connection', (ws) => {
  let currentPlayerId = null;
  let currentRoomId = null;
  let currentPlayerName = null;

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      const { type, roomId, playerId, playerName, marketDifficulty: joinMarketDifficulty } = data;
      console.log(`[大A] ${type} 房间:${roomId} 玩家:${playerName}`);

      if (type === 'joinRoom') {
        currentPlayerId = playerId;
        currentRoomId = roomId;
        currentPlayerName = playerName;

        if (!rooms[roomId]) {
          rooms[roomId] = {
            players: [],
            playerNamesArray: [],
            gameState: makeInitialGameState(),
            isProcessingNextRound: false,
          };
          rooms[roomId].gameState.marketDifficulty = normalizeDifficulty(joinMarketDifficulty);
          initDeckForRoom(rooms[roomId]);
        }

        let existingPlayerIndex = rooms[roomId].players.findIndex(
          (p) =>
            p.playerId === playerId ||
            (p.playerName === playerName && extractPlayerName(p.playerId) === playerName)
        );

        if (existingPlayerIndex >= 0) {
          const existingPlayer = rooms[roomId].players[existingPlayerIndex];
          existingPlayer.ws = ws;
          existingPlayer.playerId = playerId;
          sendGameState(ws, rooms[roomId], `重新连接到房间 ${roomId}`);
          broadcastExcept(rooms[roomId], ws, {
            type: 'playerReconnected',
            message: `玩家 ${playerName} 重新连接`,
            players: createSerializablePlayerInfo(rooms[roomId].players),
          });
          return;
        }

        rooms[roomId].playerNamesArray = [...new Set([...rooms[roomId].playerNamesArray, playerName])];
        rooms[roomId].players.push({
          ws,
          playerId,
          playerName,
          wallet: INITIAL_WALLET,
          roundCapital: 0,
          ownedTreasures: [],
          inCamp: false,
          hasVoted: false,
          stakingSubmitted: false,
          couldNotEnterRound: false,
        });

        const playersInfo = createSerializablePlayerInfo(rooms[roomId].players);
        ws.send(
          JSON.stringify({
            type: 'gameState',
            message: `已加入房间 ${roomId}`,
            players: playersInfo,
            currentRound: rooms[roomId].gameState.currentRound,
            deckSize: rooms[roomId].gameState.roundDeck.length,
            drawnCards: rooms[roomId].gameState.drawnCards,
            isRoundOver: rooms[roomId].gameState.roundOver,
            votingPhase: rooms[roomId].gameState.votingPhase,
            stakingPhase: rooms[roomId].gameState.stakingPhase,
            treasuresOnGround: rooms[roomId].gameState.treasuresOnGround,
            roundMarketIndex: rooms[roomId].gameState.roundMarketIndex,
            sessionMarketIndex: rooms[roomId].gameState.sessionMarketIndex,
            chartHistory: rooms[roomId].gameState.chartHistory || [],
            fullSessionChartHistory: rooms[roomId].gameState.fullSessionChartHistory || [],
            marketDifficulty: getRoomDifficulty(rooms[roomId]),
          })
        );

        broadcastExcept(rooms[roomId], ws, {
          type: 'playerJoined',
          message: `${playerName} 加入房间`,
          players: playersInfo,
        });
      }

      if (type === 'getGameState' && rooms[roomId]) {
        sendGameState(ws, rooms[roomId], '游戏状态');
      }

      if (type === 'submitStake' && rooms[roomId]) {
        handleSubmitStake(roomId, playerId, playerName, data.amount, ws);
      }

      if (type === 'vote' && rooms[roomId]) {
        handleVote(roomId, playerId, playerName, data.choice, ws);
      }

      if (type === 'drawCard' && rooms[roomId]) {
        drawCard(roomId, ws);
      }

      if (type === 'nextRound' && rooms[roomId]) {
        const gameState = rooms[roomId].gameState;
        if (!gameState.roundOver) {
          ws.send(JSON.stringify({ type: 'error', message: '当前轮次尚未结束' }));
          return;
        }
        if (rooms[roomId].isProcessingNextRound) {
          ws.send(JSON.stringify({ type: 'error', message: '正在处理下一轮，请稍候' }));
          return;
        }
        rooms[roomId].isProcessingNextRound = true;
        startNextRound(roomId);
        const gsAfter = rooms[roomId].gameState;
        if (!gsAfter.finished) {
          rooms[roomId].players.forEach((player) => {
            if (player.ws) {
              player.ws.send(
                JSON.stringify({
                  type: 'newRound',
                  currentRound: gsAfter.currentRound,
                  message: `第 ${gsAfter.currentRound} 轮开始`,
                  players: createSerializablePlayerInfo(rooms[roomId].players),
                  stakingPhase: gsAfter.stakingPhase,
                  roundMarketIndex: gsAfter.roundMarketIndex,
                  sessionMarketIndex: gsAfter.sessionMarketIndex,
                  chartHistory: gsAfter.chartHistory || [],
                  fullSessionChartHistory: gsAfter.fullSessionChartHistory || [],
                  marketDifficulty: getRoomDifficulty(rooms[roomId]),
                })
              );
            }
          });
        }
        setTimeout(() => {
          rooms[roomId].isProcessingNextRound = false;
        }, 3000);
      }

      if (type === 'resetGame' && rooms[roomId]) {
        resetGame(roomId);
      }
    } catch (err) {
      console.error('[大A] 处理消息出错:', err);
    }
  });

  ws.on('close', () => {
    if (currentPlayerId && currentRoomId && rooms[currentRoomId]) {
      const room = rooms[currentRoomId];
      const idx = room.players.findIndex((p) => p.playerId === currentPlayerId);
      if (idx >= 0) {
        room.players[idx].ws = null;
        broadcastExcept(room, null, {
          type: 'playerDisconnected',
          message: `玩家 ${room.players[idx].playerName} 断开`,
          players: createSerializablePlayerInfo(room.players),
        });
      }
    }
  });
});

function makeInitialGameState() {
  return {
    currentRound: 1,
    roundDeck: [],
    drawnCards: [],
    treasureCards: [],
    permanentDeck: null,
    playerVotes: {},
    treasuresOnGround: [],
    votingPhase: false,
    roundOver: false,
    stakingPhase: true,
    finished: false,
    /** 本轮虚拟指数，每轮开始重置为 100 */
    roundMarketIndex: 100,
    /** 全局虚拟指数，整局游戏连续（仅重置游戏时归零） */
    sessionMarketIndex: 100,
    chartHistory: [],
    fullSessionChartHistory: [],
    /** 'brutal' | 'mild'，由首个加入房间的玩家与匹配服约定 */
    marketDifficulty: 'brutal',
  };
}

function initDeckForRoom(room) {
  const { permanentDeck, treasureCards } = initializeDeck();
  room.gameState.permanentDeck = permanentDeck;
  room.gameState.treasureCards = treasureCards;
  const firstTreasure = treasureCards[0];
  room.gameState.roundDeck = [...permanentDeck, firstTreasure];
  shuffleDeck(room.gameState.roundDeck);
}

function sendGameState(ws, room, message) {
  const gs = room.gameState;
  ws.send(
    JSON.stringify({
      type: 'gameState',
      message,
      players: createSerializablePlayerInfo(room.players),
      currentRound: gs.currentRound,
      deckSize: gs.roundDeck.length,
      drawnCards: gs.drawnCards,
      isRoundOver: gs.roundOver,
      votingPhase: gs.votingPhase,
      stakingPhase: gs.stakingPhase,
      treasuresOnGround: gs.treasuresOnGround,
      roundMarketIndex: gs.roundMarketIndex,
      sessionMarketIndex: gs.sessionMarketIndex,
      chartHistory: gs.chartHistory || [],
      fullSessionChartHistory: gs.fullSessionChartHistory || [],
      marketDifficulty: getRoomDifficulty(room),
    })
  );
}

function broadcastExcept(room, excludeWs, payload) {
  room.players.forEach((player) => {
    if (player.ws && player.ws !== excludeWs) {
      player.ws.send(JSON.stringify(payload));
    }
  });
}

function broadcastAll(room, payload) {
  room.players.forEach((player) => {
    if (player.ws) player.ws.send(JSON.stringify(payload));
  });
}

function validateStake(player, amount) {
  const w = round2(player.wallet);
  const a = round2(Number(amount));
  if (!Number.isFinite(a) || a < 0) return { ok: false, reason: '无效金额' };
  if (w < MIN_STAKE) {
    return { ok: false, reason: `资金不足 ${MIN_STAKE}，无法入场` };
  }
  if (a > w) return { ok: false, reason: '超过可用资金' };
  if (a < MIN_STAKE) return { ok: false, reason: `最低带入 ${MIN_STAKE}` };
  return { ok: true, value: a };
}

function wealthTotal(p) {
  return round2(p.wallet + (p.inCamp ? 0 : p.roundCapital));
}

/** 资金不足最低入市：本轮仅观望，仍计为「不在场」参与涨幅加成 */
function applyCannotEnterStake(room) {
  room.players.forEach((player) => {
    player.couldNotEnterRound = false;
    if (round2(player.wallet) < MIN_STAKE) {
      player.inCamp = true;
      player.stakingSubmitted = true;
      player.roundCapital = 0;
      player.hasVoted = false;
      player.couldNotEnterRound = true;
    } else {
      player.inCamp = false;
      player.stakingSubmitted = false;
      player.roundCapital = 0;
      player.hasVoted = false;
    }
  });
}

/**
 * 宝石牌：在场外人数越多，有效涨幅越高 — round/session 两路指数同步乘同一因子。
 * 抛压：多人离场表决结束后，与场内资金相同乘数作用于两路指数。
 */
function appendChartSnapshot(room, kind = 'card') {
  const gs = room.gameState;
  if (!gs.chartHistory) gs.chartHistory = [];
  if (!gs.fullSessionChartHistory) gs.fullSessionChartHistory = [];
  const wealthByPlayer = {};
  room.players.forEach((p) => {
    wealthByPlayer[p.playerId] = wealthTotal(p);
  });
  const point = {
    kind,
    round: gs.currentRound,
    stepInRound: gs.drawnCards.length,
    roundMarketIndex: round2(gs.roundMarketIndex),
    sessionMarketIndex: round2(gs.sessionMarketIndex),
    wealthByPlayer,
  };
  gs.chartHistory.push({ ...point });
  gs.fullSessionChartHistory.push({ ...point });
}

function applyCardToVirtualIndices(gs, room, drawnCard) {
  const diff = getRoomDifficulty(room);
  let factor = 1;
  if (drawnCard.type === CARD_TYPE.GEM) {
    const absent = room.players.filter((p) => p.inCamp).length;
    const basePct = drawnCard.value;
    const scaledBase = basePct * gemBaseScale(diff);
    const bonus = gemBonusPerAbsent(diff);
    const effectivePct = scaledBase * (1 + bonus * absent);
    factor = 1 + effectivePct / 100;
  } else if (drawnCard.type === CARD_TYPE.DISASTER) {
    const same = gs.drawnCards.filter(
      (c) => c.type === CARD_TYPE.DISASTER && c.value === drawnCard.value
    ).length;
    factor = disasterMultiplier(same, diff);
  } else {
    return;
  }
  gs.roundMarketIndex = round2(gs.roundMarketIndex * factor);
  gs.sessionMarketIndex = round2(gs.sessionMarketIndex * factor);
}

/** 多人离场抛压：与 exitPressureMultiplier 的场内乘数一致 */
function applyMarketPressureFromExits(gs, leavingCount, room) {
  if (leavingCount <= 1) return;
  const { cave } = exitPressureMultiplier(leavingCount, getRoomDifficulty(room));
  gs.roundMarketIndex = round2(gs.roundMarketIndex * cave);
  gs.sessionMarketIndex = round2(gs.sessionMarketIndex * cave);
}

function handleSubmitStake(roomId, playerId, playerName, amount, ws) {
  const room = rooms[roomId];
  const gs = room.gameState;
  if (!gs.stakingPhase) {
    ws.send(JSON.stringify({ type: 'error', message: '当前不是入市阶段' }));
    return;
  }
  if (gs.votingPhase || gs.roundOver) {
    ws.send(JSON.stringify({ type: 'error', message: '当前无法提交资金' }));
    return;
  }
  const player = room.players.find((p) => p.playerId === playerId);
  if (!player || player.inCamp) {
    ws.send(JSON.stringify({ type: 'error', message: '无法提交' }));
    return;
  }
  if (player.stakingSubmitted) {
    ws.send(JSON.stringify({ type: 'error', message: '你已提交过入市资金' }));
    return;
  }

  const v = validateStake(player, amount);
  if (!v.ok) {
    ws.send(JSON.stringify({ type: 'error', message: v.reason }));
    return;
  }

  player.wallet = round2(player.wallet - v.value);
  player.roundCapital = round2(v.value);
  player.stakingSubmitted = true;

  ws.send(
    JSON.stringify({
      type: 'stakeRecorded',
      message: `已带入资金 ${v.value}`,
    })
  );

  const mustStake = room.players.filter((p) => !p.inCamp);
  const allDone = mustStake.length === 0 || mustStake.every((p) => p.stakingSubmitted);
  if (allDone) {
    gs.stakingPhase = false;
    if (!gs.chartHistory || gs.chartHistory.length === 0) {
      gs.roundMarketIndex = 100;
      appendChartSnapshot(room, 'staking');
    }
    broadcastAll(room, {
      type: 'stakingComplete',
      message: '全员已入场，可以开牌',
      players: createSerializablePlayerInfo(room.players),
      stakingPhase: false,
      roundMarketIndex: gs.roundMarketIndex,
      sessionMarketIndex: gs.sessionMarketIndex,
      chartHistory: gs.chartHistory || [],
      fullSessionChartHistory: gs.fullSessionChartHistory || [],
      marketDifficulty: getRoomDifficulty(room),
    });
  } else {
    broadcastAll(room, {
      type: 'playerStaked',
      playerName,
      players: createSerializablePlayerInfo(room.players),
    });
  }
}

function handleVote(roomId, playerId, playerName, choice, ws) {
  const gs = rooms[roomId].gameState;
  if (!gs.votingPhase) {
    ws.send(JSON.stringify({ type: 'error', message: '当前不是表决阶段' }));
    return;
  }
  const player = rooms[roomId].players.find((p) => p.playerId === playerId);
  if (!player || player.inCamp) {
    ws.send(JSON.stringify({ type: 'error', message: '无法表决' }));
    return;
  }

  gs.playerVotes[playerId] = choice;
  player.hasVoted = true;

  ws.send(
    JSON.stringify({
      type: 'voteRecorded',
      message: `你选择了${choice === 'leave' ? '退出' : '继续持有'}`,
    })
  );

  broadcastAll(rooms[roomId], {
    type: 'playerVoted',
    playerName,
    votingStatus: rooms[roomId].players.map((p) => ({
      playerName: p.playerName,
      hasVoted: p.hasVoted,
      inCamp: p.inCamp,
    })),
  });

  const adventuring = rooms[roomId].players.filter((p) => !p.inCamp);
  if (adventuring.every((p) => p.hasVoted)) {
    processVotes(roomId);
  }
}

function initializeDeck() {
  let permanentDeck = [];
  const disasterValues = [-14, -11, -8, -5, -2];
  disasterValues.forEach((value) => {
    for (let i = 0; i < 3; i++) {
      permanentDeck.push({ type: CARD_TYPE.DISASTER, value });
    }
  });
  for (let i = 3; i <= 17; i++) {
    permanentDeck.push({ type: CARD_TYPE.GEM, value: i });
  }
  const treasureCards = [
    { type: CARD_TYPE.TREASURE, value: 5, taken: false },
    { type: CARD_TYPE.TREASURE, value: 7, taken: false },
    { type: CARD_TYPE.TREASURE, value: 8, taken: false },
    { type: CARD_TYPE.TREASURE, value: 10, taken: false },
    { type: CARD_TYPE.TREASURE, value: 12, taken: false },
  ];
  return { permanentDeck, treasureCards };
}

function shuffleDeck(deck) {
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
}

function startNewRound(roomId) {
  const room = rooms[roomId];
  const gs = room.gameState;

  if (!gs.permanentDeck) {
    const { permanentDeck, treasureCards } = initializeDeck();
    gs.permanentDeck = permanentDeck;
    gs.treasureCards = treasureCards;
  }

  gs.roundDeck = [...gs.permanentDeck];
  gs.drawnCards = [];
  gs.playerVotes = {};
  gs.treasuresOnGround = [];
  gs.votingPhase = false;
  gs.roundOver = false;
  gs.stakingPhase = true;

  if (!gs.currentRound || gs.currentRound > 5) gs.currentRound = 1;

  gs.treasureCards.forEach((treasureCard, index) => {
    if (!treasureCard.taken && index < gs.currentRound) {
      gs.roundDeck.push(treasureCard);
    }
  });

  shuffleDeck(gs.roundDeck);

  gs.roundMarketIndex = 100;
  gs.chartHistory = [];

  applyCannotEnterStake(room);

  const mustStake = room.players.filter((p) => !p.inCamp);
  if (mustStake.length === 0) {
    gs.stakingPhase = false;
    gs.roundOver = true;
  }

  appendChartSnapshot(room, 'round_start');

  broadcastAll(room, {
    type: 'roundStart',
    message: `第${gs.currentRound}轮开始，请提交入场资金`,
    currentRound: gs.currentRound,
    deckSize: gs.roundDeck.length,
    drawnCards: gs.drawnCards,
    players: createSerializablePlayerInfo(room.players),
    treasuresOnGround: gs.treasuresOnGround,
    votingPhase: gs.votingPhase,
    stakingPhase: gs.stakingPhase,
    roundMarketIndex: gs.roundMarketIndex,
    sessionMarketIndex: gs.sessionMarketIndex,
    chartHistory: gs.chartHistory || [],
    fullSessionChartHistory: gs.fullSessionChartHistory || [],
    roundOver: gs.roundOver,
    marketDifficulty: getRoomDifficulty(room),
  });
}

function startNextRound(roomId) {
  const gs = rooms[roomId].gameState;
  if (!gs.roundOver) return;
  gs.currentRound++;
  if (gs.currentRound > 5) {
    endGame(roomId);
    return;
  }
  gs.roundOver = false;
  startNewRound(roomId);
}

function getDisasterType(value) {
  const m = {
    '-14': '毒蛇',
    '-11': '矿难',
    '-8': '僵尸',
    '-5': '火焰',
    '-2': '蜘蛛',
  };
  return m[String(value)] || '灾难';
}

function drawCard(roomId, senderWs) {
  const room = rooms[roomId];
  const gs = room.gameState;

  if (gs.stakingPhase) {
    senderWs.send(JSON.stringify({ type: 'error', message: '请先完成全员入场资金' }));
    return;
  }
  if (gs.votingPhase) {
    senderWs.send(JSON.stringify({ type: 'error', message: '当前为表决阶段' }));
    return;
  }
  if (gs.roundOver) {
    senderWs.send(JSON.stringify({ type: 'error', message: '本轮已结束' }));
    return;
  }

  if (gs.roundDeck.length === 0) {
    gs.roundOver = true;
    broadcastAll(room, {
      type: 'roundOver',
      message: '牌堆已空，本轮结束',
      roundOver: true,
      players: createSerializablePlayerInfo(room.players),
      roundMarketIndex: gs.roundMarketIndex,
      sessionMarketIndex: gs.sessionMarketIndex,
      chartHistory: gs.chartHistory || [],
      fullSessionChartHistory: gs.fullSessionChartHistory || [],
      marketDifficulty: getRoomDifficulty(room),
    });
    return;
  }

  const drawnCard = gs.roundDeck.pop();
  gs.drawnCards.push(drawnCard);
  let message = '';
  let tripleDisasterEnd = false;

  if (drawnCard.type === CARD_TYPE.GEM) {
    const absent = room.players.filter((p) => p.inCamp).length;
    const basePct = drawnCard.value;
    const diff = getRoomDifficulty(room);
    const scale = gemBaseScale(diff);
    const scaledBase = basePct * scale;
    const bonus = gemBonusPerAbsent(diff);
    const effectivePct = scaledBase * (1 + bonus * absent);
    room.players.forEach((p) => {
      if (!p.inCamp && p.roundCapital > 0) {
        p.roundCapital = round2(p.roundCapital * (1 + effectivePct / 100));
      }
    });
    let modeNote = '';
    if (diff === 'choppy') modeNote = '震荡：基数×2；';
    else if (diff === 'volatile') modeNote = '波动：基数×3；';
    message = `收益牌 +${basePct}%（${modeNote}在场有效涨幅 ${round2(effectivePct)}%，不在场人数 ${absent}，不在场加成 ${bonus * 100}%/人）`;
  } else if (drawnCard.type === CARD_TYPE.TREASURE) {
    gs.treasuresOnGround.push(drawnCard);
    message = `翻开宝藏牌，兑付涨幅 +${drawnCard.value}%（终局结算）`;
  } else if (drawnCard.type === CARD_TYPE.DISASTER) {
    const same = gs.drawnCards.filter(
      (c) => c.type === CARD_TYPE.DISASTER && c.value === drawnCard.value
    ).length;
    const mult = disasterMultiplier(same, getRoomDifficulty(room));
    const name = getDisasterType(drawnCard.value);
    const remPct = Math.round(mult * 100);
    const dropPct = Math.round((1 - mult) * 100);
    if (same === 1) {
      message = `${name} 首次出现，场内资金 ×${remPct}%（跌${dropPct}%）`;
    } else if (same === 2) {
      message = `${name} 第二次出现，场内资金 ×${remPct}%（跌${dropPct}%）`;
    } else {
      message = `${name} 第三次出现，场内资金 ×${remPct}%（跌${dropPct}%），本轮结束`;
    }
    room.players.forEach((p) => {
      if (!p.inCamp) {
        p.roundCapital = round2(p.roundCapital * mult);
      }
    });
    if (same >= 3) {
      tripleDisasterEnd = true;
      room.players.forEach((p) => {
        if (!p.inCamp) {
          p.wallet = round2(p.wallet + p.roundCapital);
          p.roundCapital = 0;
          p.inCamp = true;
          p.hasVoted = false;
        }
      });
      gs.roundOver = true;
      gs.votingPhase = false;
      gs.playerVotes = {};
    }
  }

  applyCardToVirtualIndices(gs, room, drawnCard);
  appendChartSnapshot(room, 'card');

  if (!tripleDisasterEnd && !gs.roundOver) {
    gs.votingPhase = true;
    room.players.forEach((p) => {
      if (!p.inCamp) p.hasVoted = false;
    });
  }

  broadcastAll(room, {
    type: 'cardDrawn',
    drawnCard,
    deckSize: gs.roundDeck.length,
    roundOver: gs.roundOver,
    votingPhase: gs.votingPhase,
    message,
    players: createSerializablePlayerInfo(room.players),
    treasuresOnGround: gs.treasuresOnGround,
    stakingPhase: gs.stakingPhase,
    roundMarketIndex: gs.roundMarketIndex,
    sessionMarketIndex: gs.sessionMarketIndex,
    chartHistory: gs.chartHistory || [],
    fullSessionChartHistory: gs.fullSessionChartHistory || [],
    tripleDisasterEnd,
    marketDifficulty: getRoomDifficulty(room),
  });
}

function processVotes(roomId) {
  const room = rooms[roomId];
  const gs = room.gameState;
  const players = room.players;
  const adventuring = players.filter((p) => !p.inCamp);
  const leaving = adventuring.filter((p) => gs.playerVotes[p.playerId] === 'leave');
  const staying = adventuring.filter((p) => gs.playerVotes[p.playerId] === 'stay');
  const { payout, cave } = exitPressureMultiplier(leaving.length, getRoomDifficulty(room));

  if (leaving.length > 0) {
    leaving.forEach((player) => {
      const out = round2(player.roundCapital * payout);
      player.wallet = round2(player.wallet + out);
      player.roundCapital = 0;
      player.inCamp = true;
      player.hasVoted = false;
    });

    staying.forEach((player) => {
      player.roundCapital = round2(player.roundCapital * cave);
      player.hasVoted = false;
    });

    if (leaving.length === 1 && gs.treasuresOnGround.length > 0) {
      const lucky = leaving[0];
      gs.treasuresOnGround.forEach((treasure) => {
        lucky.ownedTreasures = lucky.ownedTreasures || [];
        lucky.ownedTreasures.push(treasure.value);
        const idx = gs.treasureCards.findIndex((t) => t.value === treasure.value);
        if (idx !== -1) gs.treasureCards[idx].taken = true;
      });
      const taken = [...gs.treasuresOnGround];
      gs.treasuresOnGround = [];
      broadcastAll(room, {
        type: 'treasureTaken',
        playerName: lucky.playerName,
        treasures: taken,
        message: `${lucky.playerName} 独走带走宝藏`,
      });
    }
  }

  gs.votingPhase = false;
  gs.playerVotes = {};
  players.forEach((p) => {
    p.hasVoted = false;
  });

  const allInCamp = players.every((p) => p.inCamp);
  if (allInCamp) {
    gs.roundOver = true;
  }

  if (leaving.length >= 2) {
    applyMarketPressureFromExits(gs, leaving.length, room);
  }
  appendChartSnapshot(room, 'vote');

  broadcastAll(room, {
    type: 'voteResults',
    leavingPlayers: leaving.map((p) => p.playerName),
    stayingPlayers: staying.map((p) => p.playerName),
    players: createSerializablePlayerInfo(players),
    treasuresOnGround: gs.treasuresOnGround,
    roundOver: gs.roundOver,
    votingPhase: gs.votingPhase,
    message: `${leaving.length}人退出，${staying.length}人继续持有`,
    roundMarketIndex: gs.roundMarketIndex,
    sessionMarketIndex: gs.sessionMarketIndex,
    chartHistory: gs.chartHistory || [],
    fullSessionChartHistory: gs.fullSessionChartHistory || [],
    marketDifficulty: getRoomDifficulty(room),
  });
}

function computeFinalCapital(player) {
  let w = round2(player.wallet);
  for (const v of player.ownedTreasures || []) {
    w = round2(w * (1 + Number(v) / 100));
  }
  return w;
}

function endGame(roomId) {
  const room = rooms[roomId];
  const gs = room.gameState;
  gs.finished = true;
  gs.roundOver = true;
  const players = room.players;
  const ranked = players.map((p) => ({
    playerName: p.playerName,
    playerId: p.playerId,
    gemNumber: computeFinalCapital(p),
    ownedTreasures: [...(p.ownedTreasures || [])],
  }));
  ranked.sort((a, b) => b.gemNumber - a.gemNumber);

  players.forEach((p) => {
    if (p.ws) {
      p.ws.send(
        JSON.stringify({
          type: 'gameOver',
          message: '游戏结束（终局宝藏已结算）',
          players: ranked,
        })
      );
    }
  });
}

function resetGame(roomId) {
  const room = rooms[roomId];
  const oldPlayers = room.players;
  const prevDiff = room.gameState.marketDifficulty;
  rooms[roomId] = {
    players: oldPlayers.map((p) => ({
      ...p,
      wallet: INITIAL_WALLET,
      roundCapital: 0,
      ownedTreasures: [],
      inCamp: false,
      hasVoted: false,
      stakingSubmitted: false,
      couldNotEnterRound: false,
    })),
    playerNamesArray: room.playerNamesArray,
    gameState: makeInitialGameState(),
    isProcessingNextRound: false,
  };
  rooms[roomId].gameState.marketDifficulty = normalizeDifficulty(prevDiff);
  initDeckForRoom(rooms[roomId]);
  rooms[roomId].players.forEach((p) => {
    p.stakingSubmitted = false;
    p.roundCapital = 0;
    p.inCamp = false;
  });
  rooms[roomId].gameState.stakingPhase = true;

  broadcastAll(rooms[roomId], {
    type: 'gameReset',
    message: '游戏已重置',
    currentRound: 1,
    deckSize: rooms[roomId].gameState.roundDeck.length,
    drawnCards: [],
    players: createSerializablePlayerInfo(rooms[roomId].players),
    stakingPhase: true,
    roundMarketIndex: rooms[roomId].gameState.roundMarketIndex,
    sessionMarketIndex: rooms[roomId].gameState.sessionMarketIndex,
    chartHistory: rooms[roomId].gameState.chartHistory || [],
    fullSessionChartHistory: rooms[roomId].gameState.fullSessionChartHistory || [],
    marketDifficulty: getRoomDifficulty(rooms[roomId]),
  });
}

console.log(`[大A宝藏] 游戏服 ws://${config.host}:${config.daGameServerPort}`);
