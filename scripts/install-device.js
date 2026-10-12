#!/usr/bin/env node
// KaiOS 真机安装脚本 (打包好的应用安装到设备上)
//
//   npm run build
//   node scripts/install-device.js
//
// 为什么不能 `adb install`: KaiOS 没有 pm/adb install 通道, 应用必须以
// packaged app 形式装进 /data/local/webapps, 标准做法 (WebIDE / OmniSD / make-kaios-install
// 都是这条路) 是:
//   1) 把 build/ 压成 application.zip (manifest.webapp 在压缩包根目录)
//   2) 推到 /data/local/tmp/b2g/<appId>/application.zip
//   3) 通过设备调试协议找到 webapps actor, 发 install 请求
//   4) close 旧实例 → 安装 → launch
//
// 依赖: adb (在 PATH 里), 以及 zip (或 Windows 上的 PowerShell)
// 调试模式: 手机拨号 *#*#33284#*#* (状态栏出现 bug 图标) 或
//           设置 → 设备 → 开发者 → 调试器 → 选择 ADB 和 DevTools。
//           注意重启手机后调试模式会被清除, 需要重新打开。

import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const buildDir = path.join(root, 'build');
const zipPath = path.join(root, 'application.zip');
const DEVICE_PORT = 6000;
const DEVICE_SOCKET = 'localfilesystem:/data/local/debugger-socket';

function fail(msg) {
  console.error('✗ ' + msg);
  process.exit(1);
}

function sh(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { encoding: 'utf8', ...opts });
  if (r.status !== 0) fail(`${cmd} ${args.join(' ')}\n  ${(r.stderr || r.stdout || '').trim()}`);
  return (r.stdout || '').trim();
}

const adb = args => sh('adb', args);
const delay = ms => new Promise(r => setTimeout(r, ms));

/** appId 取自 manifest 的 origin (app://bilibili.com -> bilibili.com), 安装目录与 app:// 地址都用它 */
function resolveAppId() {
  const mf = JSON.parse(readFileSync(path.join(root, 'public', 'manifest.webapp'), 'utf8'));
  const m = /^app:\/\/([^/]+)/.exec(mf.origin || '');
  if (!m) fail('manifest.webapp 的 origin 缺失或不是 app:// 开头, 无法推导 appId');
  return m[1];
}

function pack() {
  if (!existsSync(buildDir)) fail('build/ 不存在, 请先执行 npm run build');
  if (existsSync(zipPath)) unlinkSync(zipPath);
  // manifest.webapp 必须在压缩包根目录; 直接列出 build/ 下的条目 (不依赖 shell 展开通配符)
  const entries = readdirSync(buildDir);
  if (!entries.length) fail('build/ 是空的');
  if (process.platform === 'win32') {
    sh('powershell', ['-NoProfile', '-Command',
      `Compress-Archive -Path '${buildDir}\\*' -DestinationPath '${zipPath}' -Force`]);
  } else {
    sh('zip', ['-Xr', zipPath, ...entries], { cwd: buildDir });
  }
}

function push(id) {
  adb(['shell', 'mkdir', '-p', `/data/local/tmp/b2g/${id}`]);
  adb(['push', zipPath, `/data/local/tmp/b2g/${id}/application.zip`]);
}

// ---- 设备调试协议: 定长包 "N:{json}" ----
class Client {
  constructor(sock) {
    this.sock = sock;
    this.buf = Buffer.alloc(0);
    this.queue = [];
    sock.on('data', d => this.onData(d));
    sock.on('close', () => {
      const err = new Error('调试连接断开');
      this.queue.splice(0).forEach(w => w.reject(err));
    });
  }

  onData(chunk) {
    this.buf = Buffer.concat([this.buf, chunk]);
    for (;;) {
      const sep = this.buf.indexOf(0x3a); // ':'
      if (sep < 0) return;
      const len = Number(this.buf.slice(0, sep).toString('ascii'));
      if (!Number.isFinite(len) || this.buf.length < sep + 1 + len) return;
      const msg = JSON.parse(this.buf.slice(sep + 1, sep + 1 + len).toString('utf8'));
      this.buf = this.buf.slice(sep + 1 + len);
      this.deliver(msg);
    }
  }

  /** 连接建立时设备会先发一条 root 问候 (applicationType), 它不是任何请求的回包 */
  deliver(msg) {
    if (msg && msg.applicationType) return;
    for (let i = 0; i < this.queue.length; i++) {
      const w = this.queue[i];
      if (msg.from === w.to || msg.error) {
        this.queue.splice(i, 1);
        if (msg.error) w.reject(new Error(msg.message || '请求失败: ' + JSON.stringify(msg)));
        else w.resolve(msg);
        return;
      }
    }
  }

  /** webapps/root 这批 actor 的回包不带 type 字段, 靠 from 匹配回包 */
  req(to, type, extra = {}) {
    return new Promise((resolve, reject) => {
      const payload = JSON.stringify({ to, type, ...extra });
      const b = Buffer.from(payload, 'utf8');
      this.queue.push({ to, resolve, reject });
      this.sock.write(Buffer.byteLength(payload) + ':' + b);
    });
  }
}

function connect() {
  return new Promise((resolve, reject) => {
    const sock = net.connect(DEVICE_PORT, '127.0.0.1');
    sock.once('error', reject);
    sock.once('connect', () => resolve(new Client(sock)));
  });
}

// 设备调试端口: 先清掉同端口的旧转发再重建 (重复创建会让旧监听失效, 连接被拒),
// 设备侧调试 socket 也是按需打开的, 所以失败重试
async function connectWithRetry(times = 5) {
  let lastErr;
  for (let i = 0; i < times; i++) {
    try {
      spawnSync('adb', ['forward', '--remove', `tcp:${DEVICE_PORT}`], { encoding: 'utf8' });
      adb(['forward', `tcp:${DEVICE_PORT}`, DEVICE_SOCKET]);
      return await connect();
    } catch (e) {
      lastErr = e;
      await delay(600);
    }
  }
  fail('无法连接设备调试端口 (检查: 调试模式是否已开启 / USB 是否已授权)\n  ' + (lastErr && lastErr.message || lastErr));
}

async function main() {
  const id = resolveAppId();
  const manifestURL = `app://${id}/manifest.webapp`;

  console.log('→ 打包 ' + buildDir);
  pack();
  console.log('→ 推送 application.zip 到 /data/local/tmp/b2g/' + id + '/ (tmpfs, 重启会清空)');
  push(id);

  console.log('→ 转发设备调试端口');
  const c = await connectWithRetry();

  const { webappsActor } = await c.req('root', 'listTabs');
  if (!webappsActor) fail('设备上没有 webapps actor (确认已开启调试模式并已 adb 授权)');

  const before = await c.req(webappsActor, 'getAll').catch(() => ({ apps: [] }));
  const prev = (before.apps || []).find(a => a.id === id);

  console.log('→ 关闭正在运行的实例 (否则手机上仍是旧代码)');
  await c.req(webappsActor, 'close', { manifestURL }).catch(() => {});

  console.log('→ 触发安装');
  const ack = await c.req(webappsActor, 'install', { appId: id, appType: 2 });
  if (ack && ack.error) fail('安装请求失败: ' + JSON.stringify(ack));

  // 安装是异步的: 等 installTime 变化 / 应用出现
  let app = null;
  for (let i = 0; i < 30; i++) {
    await delay(1000);
    const r = await c.req(webappsActor, 'getAll').catch(() => ({ apps: [] }));
    const cur = (r.apps || []).find(a => a.id === id);
    if (cur && cur.installState === 'installed' && (!prev || cur.installTime !== prev.installTime)) {
      app = cur;
      break;
    }
  }
  if (!app) fail('30 秒内没等到安装完成');

  console.log('→ 启动应用');
  await c.req(webappsActor, 'launch', { manifestURL });
  await delay(1500);
  const running = await c.req(webappsActor, 'listRunningApps').catch(() => ({ apps: [] }));
  const ok = (running.apps || []).indexOf(manifestURL) >= 0;

  console.log('');
  console.log('  appId     : ' + app.id);
  console.log('  名称      : ' + app.name);
  console.log('  manifest  : ' + app.manifestURL);
  console.log('  权限等级  : ' + ['web', 'privileged', 'certified'][app.appStatus] + '  (systemXHR 需要 privileged)');
  console.log('  已安装    : ' + app.installState + (app.enabled ? ' (enabled)' : ' (disabled)'));
  console.log('  运行中    : ' + (ok ? '是' : '否'));
  console.log('');
  console.log(ok
    ? '✓ 安装完成; adb shell b2g-ps 可以看到应用进程'
    : '⚠ 应用已安装但未运行, 试试手动从桌面打开');
  c.sock.end();
}

main().catch(e => fail(e && e.message ? e.message : String(e)));