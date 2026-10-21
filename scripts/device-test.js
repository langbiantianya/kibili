#!/usr/bin/env node
// KaiOS 真机自动测试 (冒烟检查)
//
//   npm run build && node scripts/install-device.js     # 先装上要测的版本
//   node scripts/device-test.js
//   node scripts/device-test.js --shot ./shots           # 每个页面存一张真机截图
//   node scripts/device-test.js --only home,player       # 只跑部分页面
//
// 检查项 (全部在真机上跑, 不依赖模拟器):
//   * 页面可达 + 软键栏存在
//   * 各页面的软键文案与实际绑定的动作一致 (右软键不是返回键)
//   * 列表底部不能被裁掉 (height:100% + 兄弟元素 这类布局错)
//   * 文字不能超出 240px 视口
//   * 图片必须加载成功 (封面/头像)
//   * 界面文字里的字符必须在系统字体里存在字形 (emoji 在 KaiOS 上会渲染成空白)
//   * 焦点元素应在可视区内
//   * 真机按键: 右软键必须能返回上一层 (sendevent 注入)
//   * 全程不得有未捕获 JS 异常
//
// 退出码: 0 = 全过, 1 = 有失败项。
// 依赖: adb 已授权, 手机处于调试模式, 应用已安装 (设备调试 socket 同时只接受一个客户端)
import { spawnSync } from 'node:child_process';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const PROBE = readFileSync(path.join(__dirname, 'lib', 'ui-probe.js'), 'utf8');
const DEVICE_PORT = 6000;
const DEVICE_SOCKET = 'localfilesystem:/data/local/debugger-socket';

const argv = process.argv.slice(2);
const flag = name => argv.includes(name);
const opt = name => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : ''; };
const shotDir = opt('--shot');
const only = (opt('--only') || '').split(',').filter(Boolean);

// 每个页面: 路径 + 等待时间(毫秒) + 期望的软键文案
const PAGES = [
  { name: 'home', hash: '#/home', wait: 6000, softkeys: { left: '刷新' } },
  { name: 'following', hash: '#/following', wait: 6000, softkeys: { left: '刷新', center: '打开' } },
  { name: 'profile', hash: '#/profile', wait: 4000, softkeys: { left: '', center: '打开', right: '' } },
  { name: 'history', hash: '#/history', wait: 7000, softkeys: { left: '刷新' } },
  { name: 'favorites', hash: '#/favorites', wait: 6000, softkeys: {} },
  { name: 'settings', hash: '#/settings', wait: 3000, softkeys: {} },
  { name: 'about', hash: '#/about', wait: 3000, softkeys: {} },
  // 按键检测页: 不绑任何软键快捷键, 软键栏只有中键提示
  { name: 'keytest', hash: '#/keytest', wait: 3000, softkeys: { center: '选择' } },
  { name: 'search', hash: '#/search', wait: 5000, softkeys: { left: '刷新', center: '', right: '搜索' } },
  { name: 'search-results', hash: '#/search-results?keyword=%E5%8E%9F%E7%A5%9E', wait: 8000, softkeys: {} },
  // 用户主页: 路由带 uid, 自己的主页和别人的主页同一条路由
  // (切 tab 走左右方向键, 右软键不占这一格; 中间软键随 tab 变, 所以不写 center 断言)
  { name: 'user', hash: '#/user?uid=946974', wait: 9000, softkeys: { left: '刷新', right: '' } },
  { name: 'player', hash: '#/player?bvid=BV1ZqpE6uEKd', wait: 9000, softkeys: { right: '主页' } },
  // 全屏播放器: 右软键**不绑**主页 (全屏要沉浸), 所以这一格必须没有文案
  { name: 'fullscreen', hash: '#/fullscreen?bvid=BV1ZqpE6uEKd&t=0', wait: 9000, softkeys: { right: '' } },
];

function sh(cmd, args) {
  const r = spawnSync(cmd, args, { encoding: 'utf8' });
  if (r.status !== 0) {
    console.error(`✗ ${cmd} ${args.join(' ')}\n  ${(r.stderr || r.stdout || '').trim()}`);
    process.exit(1);
  }
  return (r.stdout || '').trim();
}

function resolveManifestURL() {
  const mf = JSON.parse(readFileSync(path.join(root, 'public', 'manifest.webapp'), 'utf8'));
  const m = /^app:\/\/([^/]+)/.exec(mf.origin || '');
  return m ? `app://${m[1]}/manifest.webapp` : 'app://bilibili.com/manifest.webapp';
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

/** 设备按键 (matrix_keypad): KaiOS 把 Linux 键码映射成 DOM key 名 */
const KEYS = { 139: 'SoftLeft', 158: 'SoftRight', 352: 'Enter', 103: 'ArrowUp', 108: 'ArrowDown', 105: 'ArrowLeft', 106: 'ArrowRight', 14: 'Backspace' };
// 返回键 = 退格键 (Linux KEY_BACKSPACE) → DOM 'Backspace' → 规范名 'Back'
function press(linuxKey) {
  const ev = k => spawnSync('adb', ['shell', `sendevent /dev/input/event1 1 ${k} 1; sendevent /dev/input/event1 0 0 0; sendevent /dev/input/event1 1 ${k} 0; sendevent /dev/input/event1 0 0 0`], { encoding: 'utf8' });
  ev(linuxKey);
  return KEYS[linuxKey] || String(linuxKey);
}

const sock = await connect();
let buf = Buffer.alloc(0);
let waiters = [];
const pageErrors = [];

// 设备调试 socket 偶发不返回 (页面卡死 / USB 掉线), 没有超时保护的话整个脚本会永久挂住。
// 所有请求都带超时, 超时后当成失败项继续往下跑, 而不是把进程挂在这里。
const DEFAULT_TIMEOUT = 20000;
const OVERALL_TIMEOUT = 20 * 60 * 1000;
const overallTimer = setTimeout(() => {
  console.error(`\n✗ 全量回归超过 ${Math.round(OVERALL_TIMEOUT / 1000)}s 仍未结束, 强制退出`);
  process.exit(1);
}, OVERALL_TIMEOUT);
overallTimer.unref?.();

sock.on('data', chunk => {
  buf = Buffer.concat([buf, chunk]);
  for (;;) {
    const sep = buf.indexOf(0x3a);
    if (sep < 0) return;
    const len = Number(buf.slice(0, sep).toString('ascii'));
    if (!Number.isFinite(len) || buf.length < sep + 1 + len) return;
    const msg = JSON.parse(buf.slice(sep + 1, sep + 1 + len).toString('utf8'));
    buf = buf.slice(sep + 1 + len);
    deliver(msg);
  }
});

function failAll(err) {
  const list = waiters.splice(0, waiters.length);
  for (const w of list) {
    clearTimeout(w.timer);
    w.reject(err);
  }
}

sock.on('error', e => failAll(new Error('设备调试连接出错: ' + (e && e.message))));
sock.on('close', () => failAll(new Error('设备调试连接已断开')));

function deliver(msg) {
  if (msg && msg.applicationType) return;
  if (msg.type === 'pageError') {
    pageErrors.push((msg.pageError && msg.pageError.errorMessage) || 'unknown');
    return;
  }
  for (let i = 0; i < waiters.length; i++) {
    const w = waiters[i];
    if (msg.from === w.to || msg.error) {
      waiters.splice(i, 1);
      clearTimeout(w.timer);
      if (msg.error) w.reject(new Error(msg.message || JSON.stringify(msg)));
      else w.resolve(msg);
      return;
    }
  }
}

function req(to, type, extra = {}, timeoutMs = DEFAULT_TIMEOUT) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({ to, type, ...extra });
    const b = Buffer.from(payload, 'utf8');
    const waiter = { to, resolve, reject, timer: null };
    waiter.timer = setTimeout(() => {
      const i = waiters.indexOf(waiter);
      if (i >= 0) waiters.splice(i, 1);
      reject(new Error(`请求超时 ${timeoutMs}ms: ${type} → ${to}`));
    }, timeoutMs);
    waiters.push(waiter);
    try {
      sock.write(Buffer.byteLength(payload) + ':' + b);
    } catch (e) {
      const i = waiters.indexOf(waiter);
      if (i >= 0) waiters.splice(i, 1);
      clearTimeout(waiter.timer);
      reject(new Error('写入设备调试端口失败: ' + (e && e.message)));
    }
  });
}

const delay = ms => new Promise(r => setTimeout(r, ms));

const manifestURL = resolveManifestURL();
const { webappsActor } = await req('root', 'listTabs');
if (!webappsActor) { console.error('✗ 设备上没有 webapps actor'); process.exit(1); }

async function appActor() {
  const app = await req(webappsActor, 'getAppActor', { manifestURL });
  return app.actor && app.actor.consoleActor;
}

async function screenshot(file) {
  const { deviceActor } = await req('root', 'listTabs');
  const r = await req(deviceActor, 'screenshotToDataURL');
  let data = r.value;
  if (data && data.type === 'longString') {
    data = data.initial || '';
    while (data.length < (r.value.length || 0)) {
      const more = await req(r.value.actor, 'substring', { start: data.length, end: r.value.length });
      if (!more.substring) break;
      data += more.substring;
    }
  }
  if (typeof data !== 'string' || data.indexOf('data:image') !== 0) return false;
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, Buffer.from(data.split(',')[1], 'base64'));
  return true;
}

const results = [];
let consoleActor = await appActor();
if (!consoleActor) {
  console.log('→ 应用没有打开, 先启动一次');
  await req(webappsActor, 'launch', { manifestURL });
  await delay(4000);
  consoleActor = await appActor();
}
if (!consoleActor) { console.error('✗ 拿不到应用 console actor (确认应用已安装并在运行)'); process.exit(1); }
await req(consoleActor, 'startListeners', { listeners: ['PageError'] });

async function probe(timeoutMs = DEFAULT_TIMEOUT) {
  // evaluateJS 按语句执行, 顶层不能写 return, 所以整体包一层 IIFE
  const text = '(function(){return (\n' + PROBE + '\n);})()';
  const r = await withActor(a => req(a, 'evaluateJS', { text }, timeoutMs));
  if (r.exception) throw new Error('UI 探针异常: ' + JSON.stringify(r.exception.preview || r.exception).slice(0, 300));
  return JSON.parse(r.result);
}

/** 页面重载或路由重建后 console actor 会换 id, 这里重新取一次 */
async function withActor(fn) {
  let lastErr;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await fn(consoleActor);
    } catch (e) {
      lastErr = e;
      const msg = String(e && e.message);
      // actor 失效要重新拿; 超时也重试一次, 设备偶尔会漏回包
      if (!/No such actor/.test(msg) && !/请求超时/.test(msg)) throw e;
      const again = await appActor();
      if (!again) throw e;
      consoleActor = again;
      await req(consoleActor, 'startListeners', { listeners: ['PageError'] });
    }
  }
  throw lastErr;
}

async function goto(hash) {
  await withActor(a => req(a, 'evaluateJS', { text: `(location.hash = ${JSON.stringify(hash)}, 1)` }, 10000));
}

try {
  console.log('设备: ' + manifestURL + '  视口 ' + (await probe()).viewport.join('x'));
} catch (e) {
  console.log('设备: ' + manifestURL + '  (初始探针失败: ' + e.message + ')');
}
console.log('');

for (const page of PAGES) {
  if (only.length && only.indexOf(page.name) < 0) continue;
  const fails = [];
  await goto(page.hash);
  await delay(page.wait);
  let snap;
  try {
    snap = await probe();
  } catch (e) {
    results.push({ page: page.name, fails: [String(e.message)] });
    continue;
  }

  if (!snap.softkeys) fails.push('软键栏缺失');
  for (const side of ['left', 'center', 'right']) {
    // 只断言显式写出来的位置; 写成 '' 表示"这一格必须没有文案"
    if (!page.softkeys || !(side in page.softkeys)) continue;
    const want = page.softkeys[side];
    const got = snap.softkeys ? snap.softkeys[side] : '?';
    if (got !== want) {
      fails.push(`软键 ${side} 期望「${want}」实际「${got}」`);
    }
  }
  // 全屏/播放器/设置页本来就没有可聚焦元素
  if (!snap.navables && !['player', 'fullscreen', 'settings'].includes(page.name)) {
    fails.push('没有可聚焦元素 (data-navable)');
  }
  for (const g of snap.missingGlyphs) fails.push('字体无字形: ' + g);
  for (const it of snap.issues) {
    if (it.t === 'imageFailed') fails.push('图片加载失败: ' + it.el);
    else if (it.t === 'scrollBoxClipped') fails.push(`可滚动区域被裁剪: ${it.el} (被 ${it.clippedBy} 裁掉)`);
    // 全屏播放器是按**横屏**设计的: 视频转了 90°, 进度条是 320x320 的固定层 ——
    // 竖屏 (240 宽) 下超出视口是设计如此, 不是布局 bug
    else if (it.t === 'outOfViewportX' && page.name !== 'fullscreen') fails.push(`超出 240px 视口: ${it.el}`);
  }
  if (snap.focus && snap.focus.inViewport === false) fails.push('焦点元素不在可视区: ' + snap.focus.el);

  results.push({ page: page.name, fails, snap });
  console.log((fails.length ? '✗' : '✓') + ' ' + page.name.padEnd(16) +
    (fails.length ? fails.join(' | ') : `softkeys=${JSON.stringify(snap.softkeys)} navables=${snap.navables}`));

  if (shotDir) {
    const file = path.join(shotDir, page.name + '.png');
    if (await screenshot(file)) console.log('   截图: ' + file);
  }
}

// 真机按键: 子页面的**返回键 (退格键)** 必须回到上一级。
// 先进入 /profile 再进 /settings, 让历史栈里的上一级确定是 /profile,
// 这样能抓住"首页残留的搜索处理器把返回键劫持到 /search"这类回归 (旧断言只看
// before !== after, 被劫持到 /search 也算通过)。
if (!only.length || only.indexOf('back-key') >= 0) {
  try {
    await goto('#/profile');
    await delay(2000);
    await goto('#/settings');
    await delay(3000);
    const before = (await probe()).route;
    const key = press(14);   // 退格键 = 返回键
    await delay(2500);
    const after = (await probe()).route;
    const ok = after === '#/profile';
    results.push({ page: 'back-key', fails: ok ? [] : [`按 ${key} 未返回上一级: 期望 #/profile 实际 ${after}`] });
    console.log((ok ? '✓' : '✗') + ' ' + 'back-key'.padEnd(16) + (ok ? `返回键 ${before} → ${after}` : `返回键未返回上一级, ${before} → ${after}`));
  } catch (e) {
    results.push({ page: 'back-key', fails: [String(e.message)] });
    console.log('✗ ' + 'back-key'.padEnd(16) + String(e.message));
  }
}

if (pageErrors.length) {
  results.push({ page: 'pageerror', fails: pageErrors.slice(0, 3) });
  console.log('✗ ' + 'pageerror'.padEnd(16) + pageErrors.slice(0, 3).join(' | '));
}

const failed = results.filter(r => r.fails.length);
console.log('');
console.log(`结果: ${results.length - failed.length}/${results.length} 项通过` + (failed.length ? ' — 有失败项' : ''));
sock.end();
process.exit(failed.length ? 1 : 0);