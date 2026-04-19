/* 以下是原后端访问方案（前后端同域名/同主机部署时可重新启用）
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
*/

// 以下是新的方案（前端部署在 GitHub Pages，后端使用独立域名，如 Cloudflare 托管的 sigmaboy.cn）
const DEFAULT_PUBLIC_WS = 'wss://api.sigmaboy.cn';
const PUBLIC_WS_BASE = (import.meta.env.VITE_WS_BASE || DEFAULT_PUBLIC_WS).replace(/\/+$/, '');

function buildWsUrl(path, fallbackPort) {
  const customUrl = import.meta.env[path];
  if (customUrl && customUrl.trim()) return customUrl.trim();
  return `${PUBLIC_WS_BASE}:${fallbackPort}`;
}

const WS_URL_BY_PORT = {
  '3000': buildWsUrl('VITE_WS_MATCH_URL', 3000),
  '8080': buildWsUrl('VITE_WS_GAME_URL', 8080),
  '8081': buildWsUrl('VITE_WS_DA_GAME_URL', 8081),
};

export const config = {
  get matchServerUrl() {
    return WS_URL_BY_PORT['3000'];
  },
  get gameServerUrl() {
    return WS_URL_BY_PORT['8080'];
  },
  get daGameServerUrl() {
    return WS_URL_BY_PORT['8081'];
  },
};
// 以上是新的方案

/**
 * 将 localStorage 或匹配服下发的 ws://localhost:… / 127.0.0.1 改为当前页面主机；
 * 页面为 https 时把 ws 升为 wss。
 */
export function resolveWebSocketUrl(url) {
  if (url == null || typeof url !== 'string' || !url.trim()) return null;
  try {
    const u = new URL(url);
    const mappedUrl = WS_URL_BY_PORT[u.port];
    if (mappedUrl) {
      const mapped = new URL(mappedUrl);
      const publicHost = new URL(PUBLIC_WS_BASE).hostname;
      const shouldMap =
        u.hostname === 'localhost' ||
        u.hostname === '127.0.0.1' ||
        u.hostname === '0.0.0.0' ||
        (publicHost && u.hostname === publicHost);
      if (shouldMap) return mapped.toString();
    }
    if (u.hostname === 'localhost' || u.hostname === '127.0.0.1' || u.hostname === '0.0.0.0') {
      const publicHost = new URL(PUBLIC_WS_BASE).hostname;
      if (publicHost) u.hostname = publicHost;
    }
    if (typeof window !== 'undefined' && window.location.protocol === 'https:' && u.protocol === 'ws:') {
      u.protocol = 'wss:';
    }
    return u.toString();
  } catch {
    return url;
  }
}
