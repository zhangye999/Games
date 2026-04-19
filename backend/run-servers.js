/**
 * 同时启动匹配服、印加宝藏、大A宝藏（不依赖 concurrently）
 * 若报 EADDRINUSE，先结束旧进程：npm run free-ports
 */
const { spawn } = require('child_process');
const path = require('path');

const root = __dirname;
const node = process.execPath;
const servers = [
  { name: 'match', file: 'server.js' },
  { name: 'incan', file: 'game.js' },
  { name: 'da', file: 'daGame.js' },
];

const children = servers.map(({ name, file }) => {
  const child = spawn(node, [path.join(root, file)], {
    stdio: 'inherit',
    cwd: root,
    env: process.env,
  });
  child.on('error', (err) => {
    console.error(`[${name}]`, err);
  });
  return child;
});

function shutdown() {
  console.log('\n正在关闭所有服务…');
  for (const c of children) {
    if (c && !c.killed) c.kill('SIGTERM');
  }
  setTimeout(() => process.exit(0), 500);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
