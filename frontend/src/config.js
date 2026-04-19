// 游戏服务器配置（浏览器访问局域网 IP 时，WebSocket 需指向同一主机，不能用写死的 localhost）

function wsHostname() {
  if (typeof window === 'undefined') return 'localhost';
  return window.location.hostname;
}

function wsProtocol() {
  if (typeof window === 'undefined') return 'ws';
  return window.location.protocol === 'https:' ? 'wss' : 'ws';
}

const PORT = {
  match: Number(import.meta.env.VITE_WS_PORT_MATCH) || 3000,
  game: Number(import.meta.env.VITE_WS_PORT_GAME) || 8080,
  daGame: Number(import.meta.env.VITE_WS_PORT_DA_GAME) || 8081,
};

export const config = {
  get matchServerUrl() {
    return `${wsProtocol()}://${wsHostname()}:${PORT.match}`;
  },
  get gameServerUrl() {
    return `${wsProtocol()}://${wsHostname()}:${PORT.game}`;
  },
  get daGameServerUrl() {
    return `${wsProtocol()}://${wsHostname()}:${PORT.daGame}`;
  },
};

/**
 * 将 localStorage 或匹配服下发的 ws://localhost:… / 127.0.0.1 改为当前页面主机；
 * 页面为 https 时把 ws 升为 wss（若你未配 wss，请仍用 http 打开前端）。
 */
export function resolveWebSocketUrl(url) {
  if (url == null || typeof url !== 'string' || !url.trim()) return null;
  try {
    const u = new URL(url);
    if (u.hostname === 'localhost' || u.hostname === '127.0.0.1') {
      u.hostname = wsHostname();
    }
    if (typeof window !== 'undefined' && window.location.protocol === 'https:' && u.protocol === 'ws:') {
      u.protocol = 'wss:';
    }
    return u.toString();
  } catch {
    return url;
  }
}
