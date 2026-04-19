/**
 * 结束占用本机 3000 / 8080 / 8081 的进程（Windows 下用于解决 EADDRINUSE）
 * 用法: node kill-port-servers.js
 */
const { execSync } = require('child_process');

const PORTS = [3000, 8080, 8081];

function killPortsWindows() {
  let netstat;
  try {
    netstat = execSync('netstat -ano', { encoding: 'utf8' });
  } catch (e) {
    console.error('无法执行 netstat:', e.message);
    process.exit(1);
  }

  const pids = new Set();
  for (const line of netstat.split(/\r?\n/)) {
    if (!line.includes('LISTENING')) continue;
    const parts = line.trim().split(/\s+/);
    if (parts.length < 5) continue;
    const localAddr = parts[1];
    const pid = parts[parts.length - 1];
    if (!/^\d+$/.test(pid)) continue;
    const portStr = localAddr.includes(':') ? localAddr.split(':').pop() : '';
    const portNum = parseInt(portStr, 10);
    if (!PORTS.includes(portNum)) continue;
    pids.add(pid);
  }

  if (pids.size === 0) {
    console.log('未发现占用端口', PORTS.join(', '), '的监听进程。');
    return;
  }

  for (const pid of pids) {
    try {
      console.log('结束进程 PID', pid, '…');
      execSync(`taskkill /PID ${pid} /F`, { stdio: 'inherit' });
    } catch (e) {
      console.error('taskkill 失败 PID', pid, e.message);
    }
  }
  console.log('完成。可重新执行 npm start');
}

if (process.platform === 'win32') {
  killPortsWindows();
} else {
  console.log('非 Windows 系统请手动结束占用端口的进程，或使用: lsof -i :3000 等');
  process.exit(1);
}
