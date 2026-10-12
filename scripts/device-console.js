#!/usr/bin/env node
// 抓真机上应用内的 console 输出与未捕获异常 (KaiOS 的 logcat 里没有这些)
//
//   node scripts/device-console.js            # 跟踪, Ctrl-C 退出
//   node scripts/device-console.js --once     # 打印已缓存的消息后退出
//   node scripts/device-console.js --eval 'console.log("hi")'   # 在应用里执行一段 JS
//
// 为什么需要它: KaiOS 上应用内的 console.log/warn/error 和未捕获异常都不会进 logcat,
// 要拿到它们得连设备调试协议 (WebIDE 走的是同一条路)。
//
// 注意: 设备调试 socket 同时只接受一个客户端, 别和 WebIDE / 另一个脚本同时连。
//
// 依赖: adb (在 PATH 里) 且手机已开启调试模式
import { spawn, spawnSync } from 'node:child_process';
import path from 'node:path';
import net from 'node:net';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const DEVICE_PORT = 6000;
const DEVICE_SOCKET = 'localfilesystem:/data/local/debugger-socket';
const once = process.argv.includes('--once');

function resolveManifestURL() {
  const mf = JSON.parse(readFileSync(path.join(root, 'public', 'manifest.webapp'), 'utf8'));
  const m = /^app:\/\/([^/]+)/.exec(mf.origin || '');
  return m ? `app://${m[1]}/manifest.webapp` : 'app://bilibili.com/manifest.webapp';
}

function sh(cmd, args) {
  const r = spawnSync(cmd, args, { encoding: 'utf8' });
  if (r.status !== 0) {
    console.error(`✗ ${cmd} ${args.join(' ')}\n  ${(r.stderr || '').trim()}`);
    process.exit(1);
  }
  return (r.stdout || '').trim();
}

function connect(times = 5) {
  return new Promise((resolve, reject) => {
    let left = times;
    const attempt = () => {
      spawnSync('adb', ['forward', '--remove', `tcp:${DEVICE_PORT}`], { encoding: 'utf8' });
      sh('adb', ['forward', `tcp:${DEVICE_PORT}`, DEVICE_SOCKET]);
      const sock = net.connect(DEVICE_PORT, '127.0.0.1');
      sock.once('connect', () => resolve(sock));
      sock.once('error', () => {
        sock.destroy();
        if (--left > 0) setTimeout(attempt, 600);
        else reject(new Error('无法连接设备调试端口 (确认调试模式已开启)'));
      });
    };
    attempt();
  });
}

const sock = await connect();

/** 定长包 "N:{json}"; webapps/root 的回包不带 type 字段 */
let buf = Buffer.alloc(0);
let waiters = [];
let consoleActor = null;

sock.on('data', chunk => {
  buf = Buffer.concat([buf, chunk]);
  for (;;) {
    const sep = buf.indexOf(0x3a);
    if (sep < 0) return;
    const len = Number(buf.slice(0, sep).toString('ascii'));
    if (!Number.isFinite(len) || buf.length < sep + 1 + len) return;
    const msg = JSON.parse(buf.slice(sep + 1, sep + 1 + len).toString('utf8'));
    buf = buf.slice(sep + 1 + len);
    handle(msg);
  }
});

function req(to, type, extra = {}) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({ to, type, ...extra });
    const b = Buffer.from(payload, 'utf8');
    waiters.push({ to, resolve, reject });
    sock.write(Buffer.byteLength(payload) + ':' + b);
  });
}

function fmtArg(a) {
  if (a === null || a === undefined) return String(a);
  if (typeof a === 'object') {
    if (a.type === 'longString') return '"' + String(a.initial || '').slice(0, 120) + '"…';
    if (a.preview) return a.preview.kind === 'ArrayLike' ? `[${a.preview.length}]` : '{…}';
    if (a.class) return `<${a.class}>`;
    return JSON.stringify(a).slice(0, 120);
  }
  return String(a);
}

function handle(msg) {
  // 连接建立时设备会先发一条 root 问候 (applicationType), 它不是任何请求的回包
  if (msg && msg.applicationType) return;
  // 事件流: consoleAPICall / pageError / logMessage (来自 console actor)
  if (msg.type === 'consoleAPICall') {
    const args = (msg.message && msg.message.arguments || []).map(fmtArg);
    console.log(`[${msg.message.level || 'log'}] ${args.join(' ')}`);
    return;
  }
  if (msg.type === 'pageError') {
    const e = msg.pageError || {};
    console.log('[pageerror] ' + (e.errorMessage || '') + ' @' + (e.sourceName || '') + ':' + (e.lineNumber || ''));
    return;
  }
  if (msg.type === 'logMessage') {
    console.log('[log] ' + String(msg.message || '').slice(0, 300));
    return;
  }
  for (let i = 0; i < waiters.length; i++) {
    const w = waiters[i];
    if (msg.from === w.to || msg.error) {
      waiters.splice(i, 1);
      if (msg.error) w.reject(new Error(msg.message || JSON.stringify(msg)));
      else w.resolve(msg);
      return;
    }
  }
}

const { webappsActor } = await req('root', 'listTabs');
if (!webappsActor) {
  console.error('✗ 设备上没有 webapps actor (确认应用已安装并在运行)');
  process.exit(1);
}
const app = await req(webappsActor, 'getAppActor', { manifestURL: resolveManifestURL() });
consoleActor = (app.actor && app.actor.consoleActor) || null;
if (!consoleActor) {
  console.error('✗ 应用当前没有打开的窗口 (先在手机上打开应用)');
  process.exit(1);
}

await req(consoleActor, 'startListeners', { listeners: ['PageError', 'ConsoleAPI', 'LogMessage'] });
console.log('已连接 ' + resolveManifestURL() + ' 的 console actor (appId ' + app.actor.title + ')，下面是应用内输出:');
console.log('(Ctrl-C 退出)');

const evalIdx = process.argv.indexOf('--eval');
if (evalIdx >= 0 && process.argv[evalIdx + 1]) {
  const src = process.argv[evalIdx + 1];
  const r = await req(consoleActor, 'evaluateJS', { text: src });
  if (r.exception) console.log('[exception] ' + JSON.stringify(r.exception).slice(0, 300));
  else {
    const v = r.result;
    console.log('[eval] 返回: ' + (typeof v === 'string' ? v : JSON.stringify(v === undefined ? null : v)));
  }
}

if (once) {
  setTimeout(() => { sock.end(); process.exit(0); }, 1500);
}