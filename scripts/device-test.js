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

// 软键菜单 (二级/三级) 的探针
//
// ui-probe.js 是通用 UI 探针, 不认识菜单面板 (它是浮在页面上的覆盖层),
// 所以菜单的状态单独探: 面板在不在、面包屑、当前层的项、高亮在哪、
// 层级点亮了几个、软键栏此刻显示什么。
const MENU_PROBE = `(function () {
  function txt(el) { return el ? String(el.innerText || '').replace(/\\s+/g, ' ').trim() : ''; }
  var layer = document.querySelector('.menu-layer');
  var out = { open: false, bar: { left: '', center: '', right: '' }, barVisible: false, crumbs: [], items: [], selected: -1, disabled: [], dots: 0, last: '' };
  var bar = document.querySelector('.softkey-bar');
  if (bar) {
    out.bar.left = txt(bar.querySelector('.left'));
    out.bar.center = txt(bar.querySelector('.center'));
    out.bar.right = txt(bar.querySelector('.right'));
    // 软键栏是不是真的画出来了: 藏起来时是 display:none → 没有布局盒
    out.barVisible = bar.getClientRects().length > 0;
  }
  out.open = !!layer;
  if (layer) {
    var cs = layer.querySelectorAll('.menu-crumb');
    for (var i = 0; i < cs.length; i++) out.crumbs.push(txt(cs[i]));
    var its = layer.querySelectorAll('.menu-text');
    for (var j = 0; j < its.length; j++) out.items.push(txt(its[j]));
    var btns = layer.querySelectorAll('.menu-item');
    for (var k = 0; k < btns.length; k++) {
      var cn = String(btns[k].className || '');
      var t = txt(btns[k].querySelector('.menu-text'));
      if (cn.indexOf('selected') >= 0) out.selected = k;
      if (cn.indexOf('disabled') >= 0) out.disabled.push(t);
    }
    var ds = layer.querySelectorAll('.menu-dot');
    for (var d = 0; d < ds.length; d++) if (String(ds[d].className || '').indexOf('on') >= 0) out.dots++;
  }
  var last = document.querySelector('.last-main');
  if (last) out.last = txt(last);
  // ── 分组标题 / 副提示 ────────────────────────────────────────────
  // 视频页的菜单按语义分成 互动 / 播放控制 / 其它 三组, 播放控制那组
  // 还带"长按 → 键"这样的副提示 (提示还有更快的键)。
  out.groups = [];
  out.hints = [];
  if (layer) {
    var gs = layer.querySelectorAll('.menu-group');
    for (var g = 0; g < gs.length; g++) out.groups.push(txt(gs[g]));
    var hs = layer.querySelectorAll('.menu-hint');
    for (var h = 0; h < hs.length; h++) out.hints.push(txt(hs[h]));
  }
  // ── 播放进度: 用来验证菜单里的"快进/快退"真的动了进度 ──────────
  var media = document.querySelector('video') || document.querySelector('audio');
  out.media = { time: 0, duration: 0 };
  if (media) {
    out.media.time = Math.round((media.currentTime || 0) * 10) / 10;
    out.media.duration = Math.round((media.duration || 0) * 10) / 10;
  }
  // ── 高亮项必须还在列表可视区里 ──────────────────────────────────
  // 菜单有十几项, 超出面板高度; 高亮往下走时列表要自动跟着滚,
  // 否则选中项会跑到屏幕外 (用户看不到自己选的是哪一项)。
  out.selectedVisible = false;
  if (layer) {
    var selEl = layer.querySelector('.menu-item.selected');
    var listEl = layer.querySelector('.menu-list');
    if (selEl && listEl) {
      var sr = selEl.getBoundingClientRect();
      var lr = listEl.getBoundingClientRect();
      out.selectedVisible = sr.top >= lr.top - 1 && sr.bottom <= lr.bottom + 1;
    }
  }
  // ── 箭头位置: 必须在文字**同一行**、且贴着右边 ─────────────────────
  //
  // 这是 KaiOS 2.4 (Gecko 48) 的一个坑: <button> 当 flex 容器时, 子元素
  // 不会被当成 flex item 排布, "文字撑满 + 右边小箭头" 会被挤成两行,
  // 箭头掉到下一行。菜单项因此用 div 而不是 button。
  // 这里量一下箭头的位置, 防止改回 button 之后又踩坑。
  out.chevrons = [];
  var its2 = layer ? layer.querySelectorAll('.menu-item') : [];
  for (var m = 0; m < its2.length; m++) {
    var sub2 = its2[m].querySelector('.menu-sub');
    if (!sub2) continue;
    var ir = its2[m].getBoundingClientRect();
    var sr2 = sub2.getBoundingClientRect();
    var tx = its2[m].querySelector('.menu-text');
    var tr2 = tx ? tx.getBoundingClientRect() : null;
    out.chevrons.push({
      label: txt(tx),
      sameLine: sr2.top >= ir.top - 1 && sr2.bottom <= ir.bottom + 1,
      rightSide: !tr2 || sr2.left >= tr2.right - 1,
      rightAligned: sr2.left >= ir.left + ir.width * 0.6
    });
  }
  return JSON.stringify(out);
})()`;
const DEVICE_PORT = 6000;
const DEVICE_SOCKET = 'localfilesystem:/data/local/debugger-socket';

const argv = process.argv.slice(2);
const flag = name => argv.includes(name);
const opt = name => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : ''; };
const shotDir = opt('--shot');
const only = (opt('--only') || '').split(',').filter(Boolean);

// 每个页面: 路径 + 等待时间(毫秒) + 期望的软键文案
const PAGES = [
  { name: 'home', hash: '#/home', wait: 6000, softkeys: { left: '刷新', right: '更多' } },
  { name: 'following', hash: '#/following', wait: 6000, softkeys: { left: '刷新', center: '打开', right: '更多' } },
  { name: 'profile', hash: '#/profile', wait: 4000, softkeys: { left: '', center: '打开', right: '更多' } },
  { name: 'history', hash: '#/history', wait: 7000, softkeys: { left: '刷新' } },
  { name: 'favorites', hash: '#/favorites', wait: 6000, softkeys: {} },
  { name: 'settings', hash: '#/settings', wait: 3000, softkeys: {} },
  { name: 'about', hash: '#/about', wait: 3000, softkeys: {} },
  // 按键检测页: 不绑任何软键快捷键, 软键栏只有中键提示
  { name: 'keytest', hash: '#/keytest', wait: 3000, softkeys: { center: '选择' } },
  // 菜单测试页: 右软键 = 「更多」菜单 (二级/三级)
  { name: 'menu-test', hash: '#/menu-test', wait: 3000, softkeys: { left: '', center: '选择', right: '更多' } },
  { name: 'search', hash: '#/search', wait: 5000, softkeys: { left: '刷新', center: '', right: '搜索' } },
  { name: 'search-results', hash: '#/search-results?keyword=%E5%8E%9F%E7%A5%9E', wait: 8000, softkeys: {} },
  // 用户主页: 路由带 uid, 自己的主页和别人的主页同一条路由
  // (切 tab 走左右方向键, 右软键不占这一格; 中间软键随 tab 变, 所以不写 center 断言)
  { name: 'user', hash: '#/user?uid=946974', wait: 9000, softkeys: { left: '刷新', right: '' } },
  { name: 'player', hash: '#/player?bvid=BV1ZqpE6uEKd', wait: 9000, softkeys: { right: '更多' } },
  // 全屏播放器: 右软键 = 「更多」(二级/三级菜单, 和视频详情页同一份);
  // 左软键 = 显示/隐藏软键栏 (文案跟着栏的显隐走, 见 fullscreen-menu 用例);
  // 中键提示跟着播放状态走 (播放/暂停), 所以这里不写 center / left 断言
  { name: 'fullscreen', hash: '#/fullscreen?bvid=BV1ZqpE6uEKd&t=0', wait: 9000, softkeys: { right: '更多' } },
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

/**
 * 合成按键: 直接在页面里派发 keydown/keyup
 *
 * 这台机器上左软键是 KEY_MENU —— 真按下去系统会弹自己的菜单, 应用被挂到
 * 后台 (XHR 回调不回来), 没法测。左软键相关的用例改用这个:
 * DOM 层收到的 key 名和真机一样是 SoftLeft, 按键总线的分发路径完全相同。
 */
async function pressJs(key) {
  const text = '(function(){var k=' + JSON.stringify(key) +
    ';window.dispatchEvent(new KeyboardEvent("keydown",{key:k,bubbles:true}));' +
    'window.dispatchEvent(new KeyboardEvent("keyup",{key:k,bubbles:true}));return true;})()';
  await withActor(a => req(a, 'evaluateJS', { text }, DEFAULT_TIMEOUT));
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
  let snap;
  try {
    await goto(page.hash);
    await delay(page.wait);
    snap = await probe();
  } catch (e) {
    // 设备偶尔漏回包 (调试 socket 卡住) —— 判这一项失败, 别让整个脚本崩掉
    results.push({ page: page.name, fails: [String(e.message)] });
    console.log('✗ ' + page.name.padEnd(16) + String(e.message));
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
    // 截图失败 (设备卡住) 不影响这一项的结论
    try {
      if (await screenshot(file)) console.log('   截图: ' + file);
    } catch (e) {}
  }
}

// 真机按键: 软键菜单 (软键栏的二级/三级操作) 的完整交互
//
// 这一段是**真机按键**跑出来的, 不是模拟:
//   右软键 → 展开二级菜单 → ↓ 移动高亮 → 中键进三级 → 退格回二级
//   → 中键执行叶子动作 → 动作被页面记下来
//
// 故意**不按左软键**: 这台机器上左软键是 KEY_MENU, 按下去系统会弹自己的菜单,
// 应用被挂到后台 (XHR 回调不回来) —— 测菜单用退格键就够了, 行为完全一样。
if (!only.length || only.indexOf('menu') >= 0) {
  const fails = [];
  const shot = name => (shotDir ? path.join(shotDir, 'menu-' + name + '.png') : '');
  try {
    await goto('#/menu-test');
    await delay(3000);

    const menuProbe = async () => {
      const text = '(function(){return (\n' + MENU_PROBE + '\n);})()';
      const r = await withActor(a => req(a, 'evaluateJS', { text }, DEFAULT_TIMEOUT));
      if (r.exception) throw new Error('菜单探针异常: ' + JSON.stringify(r.exception.preview || r.exception).slice(0, 200));
      return JSON.parse(r.result);
    };

    // ── 1) 右软键 → 二级菜单 ────────────────────────────────────────
    press(158);
    await delay(1200);
    let m = await menuProbe();
    if (!m.open) fails.push('按右软键没有展开菜单');
    if (m.bar.left !== '关闭') fails.push('二级菜单左软键应该是「关闭」实际「' + m.bar.left + '」');
    if (m.bar.center !== '选择') fails.push('二级菜单中键应该是「选择」实际「' + m.bar.center + '」');
    if (m.bar.right !== '') fails.push('二级菜单右软键应该没有文案实际「' + m.bar.right + '」');
    if (m.items.join(',') !== 'UP 主页,分享,收藏') fails.push('二级菜单的项不对: ' + m.items.join(','));
    if (m.crumbs.join(',') !== '更多操作') fails.push('面包屑不对: ' + m.crumbs.join(','));
    if (m.selected !== 0) fails.push('默认应该高亮第一项, 实际第 ' + (m.selected + 1) + ' 项');
    if (m.dots !== 1) fails.push('层级点应该亮 1 个, 实际 ' + m.dots);
    // 箭头必须和文字同一行、且贴着右边 (Gecko 48 的 button+flex 坑)
    for (const c of (m.chevrons || [])) {
      if (!c.sameLine) fails.push('「' + c.label + '」的箭头掉到了下一行 (Gecko 48 的 button+flex 坑)');
      if (!c.rightSide) fails.push('「' + c.label + '」的箭头压在文字上');
      if (!c.rightAligned) fails.push('「' + c.label + '」的箭头没贴着右边');
    }
    if (shot('level2')) await screenshot(shot('level2'));

    // ── 2) ↓ 移动高亮 → 中键进三级 ─────────────────────────────────
    press(108);
    await delay(600);
    m = await menuProbe();
    if (m.selected !== 1) fails.push('按 ↓ 之后应该高亮第二项, 实际第 ' + (m.selected + 1) + ' 项');

    press(352);
    await delay(1200);
    m = await menuProbe();
    if (!m.open) fails.push('按中键后菜单应该还开着');
    if (m.items.join(',') !== '复制链接,分享给好友') fails.push('三级菜单的项不对: ' + m.items.join(','));
    if (m.crumbs.join(',') !== '更多操作,分享') fails.push('三级面包屑不对: ' + m.crumbs.join(','));
    if (m.bar.left !== '上一级') fails.push('三级菜单左软键应该是「上一级」实际「' + m.bar.left + '」');
    if (m.selected !== 0) fails.push('进三级后应该高亮第一项, 实际第 ' + (m.selected + 1) + ' 项');
    if (m.dots !== 2) fails.push('层级点应该亮 2 个, 实际 ' + m.dots);
    if (shot('level3')) await screenshot(shot('level3'));

    // ── 3) 退格键 → 回二级, 高亮还原到刚才那一项 ───────────────────
    press(14);
    await delay(1200);
    m = await menuProbe();
    if (!m.open) fails.push('按退格键后菜单应该还开着 (回到二级)');
    if (m.items.join(',') !== 'UP 主页,分享,收藏') fails.push('退格后应该回到二级菜单, 实际: ' + m.items.join(','));
    if (m.selected !== 1) fails.push('退格后高亮应该还原成刚才那一项(分享), 实际第 ' + (m.selected + 1) + ' 项');
    if (m.bar.left !== '关闭') fails.push('回到二级后左软键应该又是「关闭」实际「' + m.bar.left + '」');
    if (shot('back')) await screenshot(shot('back'));

    // ── 4) 中键执行叶子动作 → 菜单关掉, 页面记下动作 ───────────────
    press(352);          // 再进三级
    await delay(1000);
    press(352);          // 执行第一项「复制链接」
    await delay(1200);
    m = await menuProbe();
    if (m.open) fails.push('执行动作后菜单应该关掉');
    if (m.last.indexOf('复制链接') < 0) fails.push('页面应该记下执行了「复制链接」, 实际「' + m.last + '」');
    if (m.bar.right !== '更多') fails.push('菜单关掉后右软键应该恢复成「更多」实际「' + m.bar.right + '」');
    if (shot('action')) await screenshot(shot('action'));

    // ── 5) 退格键在最外层 → 整个关掉 (其实菜单已经关了, 这里确认没卡住) ──
    press(14);
    await delay(800);
    m = await menuProbe();
    if (m.open) fails.push('菜单应该是关着的');

    results.push({ page: 'menu', fails });
    console.log((fails.length ? '✗' : '✓') + ' ' + 'menu'.padEnd(16) +
      (fails.length ? fails.join(' | ') : '二级/三级菜单: 展开 → 进三级 → 退格回退 → 执行动作 全通过'));
  } catch (e) {
    results.push({ page: 'menu', fails: [String(e.message)] });
    console.log('✗ ' + 'menu'.padEnd(16) + String(e.message));
  }
}

// 真机按键: 视频页的**软键菜单**
//
// 视频页的二级菜单只留 4 个入口 (UP 主页 / 播放控制 / 互动 / 分享),
// 快进快退音量、点赞投币收藏全都收在**三级菜单**里。这里验四件事:
//   1) 二级菜单的项和顺序都和代码里写的一致 (没有分组标题/副提示)
//   2) 「播放控制」进三级后, 四项带"长按 → 键"这类副提示
//   3) 「互动」进三级后, 退格键能退回二级并把高亮还原到「互动」
//   4) 三级里选中键执行「快进」, 播放进度真的往前推了 5 秒
if (!only.length || only.indexOf('video-menu') >= 0) {
  const fails = [];
  const shot = name => (shotDir ? path.join(shotDir, 'video-menu-' + name + '.png') : '');
  try {
    await goto('#/player?bvid=BV1ZqpE6uEKd');
    await delay(9000);

    const menuProbe = async () => {
      const text = '(function(){return (\n' + MENU_PROBE + '\n);})()';
      const r = await withActor(a => req(a, 'evaluateJS', { text }, DEFAULT_TIMEOUT));
      if (r.exception) throw new Error('菜单探针异常: ' + JSON.stringify(r.exception.preview || r.exception).slice(0, 200));
      return JSON.parse(r.result);
    };

    // ── 0) 先让视频真的加载出来 ────────────────────────────────────
    // 设置里关了「打开视频立刻播放」时, 页面上根本没有 <video> 元素,
    // 快进/快退就没有东西可推。按一下中键把流拉起来 (已经在播的话就是暂停,
    // 不影响验证 seek)。
    let pre = await menuProbe();
    if (!(pre.media && pre.media.duration > 0)) {
      press(352);
      await delay(8000);
      pre = await menuProbe();
    }

    // ── 1) 右软键 → 视频页的分类菜单 ───────────────────────────────
    press(158);
    await delay(1500);
    let m = await menuProbe();
    if (!m.open) fails.push('按右软键没有展开视频页菜单');
    if (m.bar.left !== '关闭') fails.push('视频页菜单左软键应该是「关闭」实际「' + m.bar.left + '」');
    if (m.bar.center !== '选择') fails.push('视频页菜单中键应该是「选择」实际「' + m.bar.center + '」');
    if (m.bar.right !== '') fails.push('视频页菜单右软键应该没有文案实际「' + m.bar.right + '」');

    // 二级菜单只留 4 个入口, 顺序按顺手程度: UP 主页 → 播放控制 → 互动 → 分享
    const wantItems = 'UP 主页,播放控制,互动,分享';
    if (m.items.join(',') !== wantItems) fails.push('视频页菜单的项不对: ' + m.items.join(','));
    if (m.groups.length) fails.push('二级菜单不该有分组标题: ' + m.groups.join(','));
    if (m.hints.length) fails.push('二级菜单不该有副提示: ' + m.hints.join(','));
    if (m.selected !== 0) fails.push('默认应该高亮第一项(UP 主页), 实际第 ' + (m.selected + 1) + ' 项');
    if (m.items[0] !== 'UP 主页') fails.push('第一个位置应该是「UP 主页」实际「' + m.items[0] + '」');
    if (m.items[1] !== '播放控制') fails.push('第二个位置应该是「播放控制」实际「' + m.items[1] + '」');
    // 播放控制/互动/分享 都有子项 → 右边必须有箭头
    const withArrow = (m.chevrons || []).map(c => c.label).join(',');
    if (withArrow !== '播放控制,互动,分享') fails.push('有子项的项不对: ' + withArrow);
    for (const c of (m.chevrons || [])) {
      if (!c.sameLine) fails.push('「' + c.label + '」的箭头掉到了下一行');
      if (!c.rightSide) fails.push('「' + c.label + '」的箭头压在文字上');
      if (!c.rightAligned) fails.push('「' + c.label + '」的箭头没贴着右边');
    }
    if (shot('level2')) await screenshot(shot('level2'));

    // ── 2) ↓ 选「播放控制」→ 中键进三级菜单 ───────────────────────
    press(108);
    await delay(500);
    m = await menuProbe();
    if (m.items[m.selected] !== '播放控制') fails.push('高亮的不是「播放控制」而是「' + m.items[m.selected] + '」');
    if (!m.selectedVisible) fails.push('「播放控制」滚出可视区了');

    press(352);
    await delay(1200);
    m = await menuProbe();
    if (!m.open) fails.push('按中键后三级菜单应该开着');
    if (m.items.join(',') !== '快进,快退,音量加,音量减') fails.push('播放控制的三级菜单项不对: ' + m.items.join(','));
    const wantHints = '长按 → 键,长按 ← 键,长按 ↑ 键,长按 ↓ 键';
    if (m.hints.join(',') !== wantHints) fails.push('播放控制的副提示不对: ' + m.hints.join(','));
    if (m.crumbs.join(',') !== '更多操作,播放控制') fails.push('三级面包屑不对: ' + m.crumbs.join(','));
    if (m.bar.left !== '上一级') fails.push('三级菜单左软键应该是「上一级」实际「' + m.bar.left + '」');
    if (m.dots !== 2) fails.push('层级点应该亮 2 个, 实际 ' + m.dots);
    if (m.selected !== 0) fails.push('进三级后应该高亮第一项(快进), 实际第 ' + (m.selected + 1) + ' 项');
    if (shot('level3-play')) await screenshot(shot('level3-play'));

    // ── 3) 三级里选中键执行「快进」→ 播放进度 +5 秒 ────────────────
    const before = (m.media && m.media.time) || 0;
    const dur = (m.media && m.media.duration) || 0;
    press(352);
    await delay(1500);
    m = await menuProbe();
    if (m.open) fails.push('执行「快进」之后菜单应该关掉');
    if (m.bar.right !== '更多') fails.push('菜单关掉后右软键应该恢复成「更多」实际「' + m.bar.right + '」');
    const after = (m.media && m.media.time) || 0;
    // 已经放到片尾了就没法再往前推 5 秒, 这种情况下跳过这条断言
    const canSeek = dur > 0 && before + 5 < dur - 0.5;
    if (canSeek) {
      // 播放中进度本来就会自己往前走, 所以只要比"执行前 + 5 秒"更靠前就行
      if (after < before + 4) fails.push('「快进」应该把进度往前推 5 秒, 实际 ' + before + ' → ' + after);
    }
    if (shot('seek')) await screenshot(shot('seek'));

    // ── 4) 再开菜单 → 「互动」进三级, 退格键回退并还原高亮 ────────
    press(158);
    await delay(1200);
    for (let i = 0; i < 2; i++) { press(108); await delay(320); }
    await delay(500);
    m = await menuProbe();
    if (m.items[m.selected] !== '互动') fails.push('高亮的不是「互动」而是「' + m.items[m.selected] + '」');

    press(352);
    await delay(1200);
    m = await menuProbe();
    if (m.items.join(',') !== '一键三连,点赞,投币,收藏') fails.push('互动的三级菜单项不对: ' + m.items.join(','));
    if (m.crumbs.join(',') !== '更多操作,互动') fails.push('互动的三级面包屑不对: ' + m.crumbs.join(','));
    if (m.dots !== 2) fails.push('层级点应该亮 2 个, 实际 ' + m.dots);
    if (shot('level3-social')) await screenshot(shot('level3-social'));

    press(14);
    await delay(1200);
    m = await menuProbe();
    if (!m.open) fails.push('按退格键后应该回到二级菜单');
    if (m.items[m.selected] !== '互动') fails.push('退格后高亮应该还原成「互动」实际「' + m.items[m.selected] + '」');
    if (m.bar.left !== '关闭') fails.push('回到二级后左软键应该又是「关闭」实际「' + m.bar.left + '」');

    // ── 5) 「分享」的三级菜单 ─────────────────────────────────────
    press(108);
    await delay(500);
    press(352);
    await delay(1200);
    m = await menuProbe();
    if (m.items.join(',') !== '复制链接,分享给好友') fails.push('分享的三级菜单项不对: ' + m.items.join(','));
    if (m.crumbs.join(',') !== '更多操作,分享') fails.push('分享的三级面包屑不对: ' + m.crumbs.join(','));

    // 退格键回到二级, 整个菜单关掉
    press(14);
    await delay(1000);
    press(14);
    await delay(1000);
    m = await menuProbe();
    if (m.open) fails.push('退格两次后菜单应该整个关掉');

    results.push({ page: 'video-menu', fails });
    console.log((fails.length ? '✗' : '✓') + ' ' + 'video-menu'.padEnd(16) +
      (fails.length ? fails.join(' | ') :
        '视频页菜单: 二级 4 入口 + 播放控制/互动三级菜单 + 副提示 + 快进 5 秒 全通过' +
        (canSeek ? '' : ' (视频没加载出来, 快进没验证)')));
  } catch (e) {
    results.push({ page: 'video-menu', fails: [String(e.message)] });
    console.log('✗ ' + 'video-menu'.padEnd(16) + String(e.message));
  }
}

// 真机按键: 全屏播放页的**软键菜单**
//
// 全屏页的二级菜单挂在**右软键**上 (和视频详情页同一份、同一侧),
// 左软键空着; 播放/暂停走中键 (OK), 中键提示跟着真实播放状态走 ——
// 正在播放显示「暂停」, 已经暂停显示「播放」。
//
// 这台机器上左软键是 KEY_MENU, 真按下去系统会弹自己的菜单并把应用挂到
// 后台, 所以需要按左软键的地方用 evaluateJS 派发合成的 SoftLeft (DOM 层
// 收到的 key 名和真机一样, 按键总线的分发路径也完全相同)。
// 右软键是真机上能真按的键 (KEY_SOFTRIGHT 158 → SoftRight), 直接 sendevent。
//
// 另外验一件容易做错的事: 菜单里的副提示必须和**实际绑定**对得上 ——
// 全屏画面转了 90°, 方向键也跟着转 (↑/↓ 快退快进, ←/→ 音量),
// 所以提示里写的是「短按 ↓ 键」而不是详情页的「长按 → 键」。
if (!only.length || only.indexOf('fullscreen-menu') >= 0) {
  const fails = [];
  const shot = name => (shotDir ? path.join(shotDir, 'fullscreen-menu-' + name + '.png') : '');
  try {
    await goto('#/fullscreen?bvid=BV1ZqpE6uEKd&t=0');
    await delay(9000);

    const menuProbe = async () => {
      const text = '(function(){return (\n' + MENU_PROBE + '\n);})()';
      const r = await withActor(a => req(a, 'evaluateJS', { text }, DEFAULT_TIMEOUT));
      if (r.exception) throw new Error('菜单探针异常: ' + JSON.stringify(r.exception.preview || r.exception).slice(0, 200));
      return JSON.parse(r.result);
    };

    // ── 1) 软键栏: 左 = 隐藏/显示, 中 = 播放/暂停, 右 = 更多 ──────
    let m = await menuProbe();
    if (m.bar.right !== '更多') fails.push('全屏右软键应该是「更多」实际「' + m.bar.right + '」');
    if (m.bar.center !== '播放' && m.bar.center !== '暂停') {
      fails.push('全屏中软键应该是「播放」或「暂停」实际「' + m.bar.center + '」');
    }
    // 左软键的文案写的是**按下之后会做什么**: 栏显示着 → 「隐藏」, 栏藏着 → 「显示」
    const wantLeft = m.barVisible ? '隐藏' : '显示';
    if (m.bar.left !== wantLeft) {
      fails.push('全屏左软键应该是「' + wantLeft + '」实际「' + m.bar.left + '」');
    }
    if (m.open) fails.push('刚进全屏时菜单不该是开着的');

    // ── 2) 右软键 → 展开二级菜单 ───────────────────────────────────
    // 右软键是真机上能真按的键 (KEY_SOFTRIGHT → SoftRight), 直接 sendevent
    press(158);
    await delay(1200);
    m = await menuProbe();
    if (!m.open) fails.push('按右软键没有展开菜单');
    if (m.bar.left !== '关闭') fails.push('菜单打开后左软键应该是「关闭」实际「' + m.bar.left + '」');
    if (m.bar.center !== '选择') fails.push('菜单打开后中软键应该是「选择」实际「' + m.bar.center + '」');
    if (m.bar.right !== '') fails.push('菜单打开后右软键应该没有文案实际「' + m.bar.right + '」');
    const wantItems = 'UP 主页,播放控制,互动,分享';
    if (m.items.join(',') !== wantItems) fails.push('全屏菜单的项不对: ' + m.items.join(','));
    if (m.crumbs.join(',') !== '更多操作') fails.push('全屏菜单的面包屑不对: ' + m.crumbs.join(','));
    if (m.selected !== 0) fails.push('默认应该高亮第一项, 实际第 ' + (m.selected + 1) + ' 项');
    for (const c of (m.chevrons || [])) {
      if (!c.sameLine) fails.push('「' + c.label + '」的箭头掉到了下一行');
      if (!c.rightSide) fails.push('「' + c.label + '」的箭头压在文字上');
      if (!c.rightAligned) fails.push('「' + c.label + '」的箭头没贴着右边');
    }
    if (shot('level2')) await screenshot(shot('level2'));

    // ── 3) 播放控制 → 三级菜单, 副提示必须和全屏的绑定对得上 ────────
    press(108);
    await delay(500);
    press(352);
    await delay(1200);
    m = await menuProbe();
    if (m.items.join(',') !== '快进,快退,音量加,音量减') fails.push('播放控制的三级菜单项不对: ' + m.items.join(','));
    const wantHints = '短按 ↓ 键,短按 ↑ 键,短按 → 键,短按 ← 键';
    if (m.hints.join(',') !== wantHints) fails.push('全屏的副提示不对: ' + m.hints.join(','));
    if (m.crumbs.join(',') !== '更多操作,播放控制') fails.push('三级面包屑不对: ' + m.crumbs.join(','));
    if (m.bar.left !== '上一级') fails.push('三级菜单左软键应该是「上一级」实际「' + m.bar.left + '」');
    if (shot('level3')) await screenshot(shot('level3'));

    // 退格 → 回二级; 再按左软键 (菜单开着时它写着「关闭」) → 整个关掉
    press(14);
    await delay(1000);
    await pressJs('SoftLeft');
    await delay(1000);
    m = await menuProbe();
    if (m.open) fails.push('菜单应该是关着的');
    if (m.bar.left !== wantLeft) fails.push('菜单关掉后左软键应该恢复成「' + wantLeft + '」实际「' + m.bar.left + '」');
    if (m.bar.right !== '更多') fails.push('菜单关掉后右软键应该恢复成「更多」实际「' + m.bar.right + '」');

    // ── 3.5) 左软键 = 显示/隐藏整条软键栏 (沉浸模式) ────────────────
    // 文案写的是"按下之后会做什么": 栏显示着 → 「隐藏」, 栏藏着 → 「显示」。
    // 按两下回到原状态 (设置也跟着来回切)。
    const shown0 = m.barVisible;
    await pressJs('SoftLeft');
    await delay(1200);
    m = await menuProbe();
    if (m.barVisible === shown0) fails.push('按左软键应该把软键栏' + (shown0 ? '藏起来' : '显示出来'));
    if (m.bar.left !== (shown0 ? '显示' : '隐藏')) {
      fails.push('软键栏' + (shown0 ? '藏起来' : '显示出来') + '后左软键文案应该是「' + (shown0 ? '显示' : '隐藏') + '」实际「' + m.bar.left + '」');
    }
    await pressJs('SoftLeft');
    await delay(1200);
    m = await menuProbe();
    if (m.barVisible !== shown0) fails.push('再按一次左软键软键栏应该回到原状态');
    if (m.bar.left !== wantLeft) fails.push('软键栏回到原状态后左软键文案应该还是「' + wantLeft + '」实际「' + m.bar.left + '」');

    // ── 4) 提示和实际绑定对得上: ↓ = 快进 (提示写的就是「短按 ↓ 键」) ──
    // 先把视频拉起来 (设置里关了「打开视频立刻播放」时页面上没有 <video>)
    let pre = await menuProbe();
    if (!(pre.media && pre.media.duration > 0)) {
      press(352);
      await delay(8000);
    }
    const before = ((await menuProbe()).media || {}).time || 0;
    press(108);
    await delay(1200);
    const after = ((await menuProbe()).media || {}).time || 0;
    if (after <= before) fails.push('按 ↓ 键应该快进 (提示写着「短按 ↓ 键」), 进度没动: ' + before + ' → ' + after);

    // ── 5) 中键提示跟着播放状态走: 播放中显示「暂停」, 暂停中显示「播放」 ──
    // 文案必须和行为一致: 提示写「暂停」的时候按下去就该暂停。
    const label0 = (await menuProbe()).bar.center;
    if (label0 !== '播放' && label0 !== '暂停') {
      fails.push('全屏中软键应该是「播放」或「暂停」实际「' + label0 + '」');
    }
    const opposite = label0 === '播放' ? '暂停' : '播放';
    press(352);           // OK: 播放 ⇄ 暂停
    await delay(2500);
    const label1 = (await menuProbe()).bar.center;
    if (label1 !== opposite) {
      fails.push('按 OK 键后中软键应该变成「' + opposite + '」实际「' + label1 + '」');
    }
    press(352);           // 再按一次, 应该变回来
    await delay(2500);
    const label2 = (await menuProbe()).bar.center;
    if (label2 !== label0) {
      fails.push('再按一次 OK 键中软键应该变回「' + label0 + '」实际「' + label2 + '」');
    }
    if (shot('ok-label')) await screenshot(shot('ok-label'));

    results.push({ page: 'fullscreen-menu', fails });
    console.log((fails.length ? '✗' : '✓') + ' ' + 'fullscreen-menu'.padEnd(16) +
      (fails.length ? fails.join(' | ') :
        '全屏菜单: 右软键开关菜单 + 内容同详情页 + 副提示跟着绑定走 + 中键提示跟着播放状态走 全通过'));
  } catch (e) {
    results.push({ page: 'fullscreen-menu', fails: [String(e.message)] });
    console.log('✗ ' + 'fullscreen-menu'.padEnd(16) + String(e.message));
  }
}

// 真机按键: 设置里「全屏播放显示软键栏」关掉之后的行为
//
// 关掉 = **整条软键栏藏起来** (沉浸模式), 不是"二级菜单打不开":
//   软键栏藏着 → 右软键照样能展开二级菜单, 4 个入口一个不少
//   菜单关掉 → 软键栏继续藏着 (不会又冒出来)
//
// 菜单**开着的时候**软键栏会临时露出来 —— 菜单的操作提示 (关闭 / 选择)
// 就写在这一行上, 而且菜单面板贴着软键栏上沿摆, 栏不见了底下就空一条。
if (!only.length || only.indexOf('fullscreen-nobar') >= 0) {
  const fails = [];
  const shot = name => (shotDir ? path.join(shotDir, 'fullscreen-nobar-' + name + '.png') : '');
  const evalJS = async text => {
    const r = await withActor(a => req(a, 'evaluateJS', { text }, DEFAULT_TIMEOUT));
    if (r.exception) throw new Error('探针异常: ' + JSON.stringify(r.exception.preview || r.exception).slice(0, 200));
    return String(r.result == null ? '' : r.result);
  };
  const menuProbe = async () => {
    const text = '(function(){return (\n' + MENU_PROBE + '\n);})()';
    return JSON.parse(await evalJS(text));
  };
  // 设置页里那一项: 聚焦它 (之后按 OK 键 = 激活焦点项, 和用户操作一条路)
  const FOCUS_ROW = '(function(){var it=document.querySelectorAll(".menu-item");' +
    'for(var i=0;i<it.length;i++){if((it[i].innerText||"").indexOf("全屏播放显示软键栏")>=0){it[i].focus();return "ok";}}' +
    'return "NOT_FOUND";})()';
  const ROW_VALUE = '(function(){var it=document.querySelectorAll(".menu-item");' +
    'for(var i=0;i<it.length;i++){if((it[i].innerText||"").indexOf("全屏播放显示软键栏")>=0){' +
    'return ((it[i].querySelector(".value")||{}).innerText||"").trim();}}return "NOT_FOUND";})()';

  try {
    // ── 1) 在设置页把「全屏播放显示软键栏」关掉 ─────────────────
    await goto('#/settings');
    await delay(2500);
    const v0 = await evalJS(ROW_VALUE);
    if (v0 === 'NOT_FOUND') fails.push('设置页里找不到「全屏播放显示软键栏」这一项');
    if (v0 === '开') {
      await evalJS(FOCUS_ROW);
      press(352);              // OK 键 = 激活当前焦点项 → 把这个开关关掉
      await delay(1500);
    }
    const v1 = await evalJS(ROW_VALUE);
    if (v1 !== '关') fails.push('没能把「全屏播放显示软键栏」关掉, 现在是「' + v1 + '」');

    // ── 2) 进全屏: 软键栏应该整个藏起来 ─────────────────────────
    await goto('#/fullscreen?bvid=BV1ZqpE6uEKd&t=0');
    await delay(7000);
    let m = await menuProbe();
    if (m.barVisible) fails.push('关掉设置后全屏的软键栏应该藏起来, 但它还在');
    if (m.bar.left !== '显示') fails.push('软键栏藏着时左软键文案应该是「显示」实际「' + m.bar.left + '」');
    if (m.open) fails.push('刚进全屏时菜单不该是开着的');
    if (shot('hidden')) await screenshot(shot('hidden'));

    // ── 3) 软键栏藏着, 右软键照样能展开**完整**菜单 ──────────────
    press(158);
    await delay(1500);
    m = await menuProbe();
    if (!m.open) fails.push('软键栏藏着的时候按右软键应该照样能展开菜单');
    if (m.items.join(',') !== 'UP 主页,播放控制,互动,分享') {
      fails.push('藏栏时菜单的项不对: ' + m.items.join(','));
    }
    if (!m.barVisible) fails.push('菜单开着的时候软键栏应该露出来当「关闭 / 选择」的提示');
    if (m.bar.left !== '关闭') fails.push('菜单打开后左软键应该是「关闭」实际「' + m.bar.left + '」');
    if (m.bar.center !== '选择') fails.push('菜单打开后中软键应该是「选择」实际「' + m.bar.center + '」');
    if (shot('menu')) await screenshot(shot('menu'));

    // ── 4) 关掉菜单 → 软键栏继续藏着 ────────────────────────────
    await pressJs('SoftLeft');
    await delay(1500);
    m = await menuProbe();
    if (m.open) fails.push('菜单应该是关着的');
    if (m.barVisible) fails.push('菜单关掉后软键栏应该继续藏着, 但它冒出来了');

    // ── 4.5) 栏藏着的时候, 左软键照样能把它叫回来 ────────────────
    await pressJs('SoftLeft');
    await delay(1500);
    m = await menuProbe();
    if (!m.barVisible) fails.push('栏藏着的时候按左软键应该能把它显示出来');
    if (m.bar.left !== '隐藏') fails.push('栏显示出来后左软键文案应该是「隐藏」实际「' + m.bar.left + '」');
    // 再按一下 → 藏回去 (设置也跟着回到关的状态)
    await pressJs('SoftLeft');
    await delay(1500);
    m = await menuProbe();
    if (m.barVisible) fails.push('再按一次左软键软键栏应该重新藏起来');

    // ── 5) 把设置改回原样 (别把用户设备留在改过的状态) ───────────
    await goto('#/settings');
    await delay(2500);
    if (v0 === '开') {
      await evalJS(FOCUS_ROW);
      press(352);
      await delay(1500);
    }
    const v2 = await evalJS(ROW_VALUE);
    if (v2 !== v0) fails.push('设置没能改回原样: 期望「' + v0 + '」实际「' + v2 + '」');

    results.push({ page: 'fullscreen-nobar', fails });
    console.log((fails.length ? '✗' : '✓') + ' ' + 'fullscreen-nobar'.padEnd(16) +
      (fails.length ? fails.join(' | ') :
        '关掉设置: 软键栏藏起来 + 右软键照样展开完整菜单 + 关菜单后继续藏 全通过'));
  } catch (e) {
    results.push({ page: 'fullscreen-nobar', fails: [String(e.message)] });
    console.log('✗ ' + 'fullscreen-nobar'.padEnd(16) + String(e.message));
  }
}

// 真机按键: 子页面的**返回键 (退格键)** 必须回到上一级。
// 先进入 /profile 再进 /settings, 让历史栈里的上一级确定是 /profile,
// 这样能抓住"首页残留的搜索处理器把返回键劫持到 /search"这类回归 (旧断言只看
// before !== after, 被劫持到 /search 也算通过)。
if (!only.length || only.indexOf('back-key') >= 0) {  try {
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

// 真机按键: 主页三个 Tab 的**二级菜单**
//
// 右软键现在统一是「更多」: 原来绑在右软键上的动作收进二级菜单,
// 菜单最后一项固定是「退出应用」(全局收口)。
if (!only.length || only.indexOf('tab-menu') >= 0) {
  const fails = [];
  const shot = name => (shotDir ? path.join(shotDir, 'tab-menu-' + name + '.png') : '');
  const menuProbe = async () => {
    const text = '(function(){return (\n' + MENU_PROBE + '\n);})()';
    const r = await withActor(a => req(a, 'evaluateJS', { text }, DEFAULT_TIMEOUT));
    if (r.exception) throw new Error('菜单探针异常: ' + JSON.stringify(r.exception.preview || r.exception).slice(0, 200));
    return JSON.parse(r.result);
  };
  try {
    // ── 1) 首页: 搜索 + 退出应用 ────────────────────────────────
    await goto('#/home');
    await delay(4000);
    let m = await menuProbe();
    if (m.bar.right !== '更多') fails.push('首页右软键应该是「更多」实际「' + m.bar.right + '」');
    press(158);
    await delay(1500);
    m = await menuProbe();
    if (!m.open) fails.push('首页按右软键没有展开菜单');
    if (m.items.join(',') !== '搜索,退出应用') fails.push('首页菜单的项不对: ' + m.items.join(','));
    if (m.bar.right !== '') fails.push('菜单打开后右软键应该没有文案实际「' + m.bar.right + '」');
    if (m.bar.center !== '选择') fails.push('菜单打开后中软键应该是「选择」实际「' + m.bar.center + '」');
    if (shot('home')) await screenshot(shot('home'));
    await pressJs('SoftLeft');   // 关闭
    await delay(1000);

    // ── 2) 关注: 切 Tab + 退出应用 ───────────────────────────────
    await goto('#/following');
    await delay(4000);
    press(158);
    await delay(1500);
    m = await menuProbe();
    if (!m.open) fails.push('关注页按右软键没有展开菜单');
    const items = m.items || [];
    if (items.length !== 2) fails.push('关注页菜单应该两项, 实际: ' + items.join(','));
    else {
      if (items[0].indexOf('切到') !== 0) fails.push('关注页菜单第一项应该是「切到…」实际「' + items[0] + '」');
      if (items[1] !== '退出应用') fails.push('关注页菜单最后一项应该是「退出应用」实际「' + items[1] + '」');
    }
    if (shot('following')) await screenshot(shot('following'));
    await pressJs('SoftLeft');
    await delay(1000);

    // ── 3) 我的: 这一页原来没绑右软键 → 菜单里只有「退出应用」 ────
    await goto('#/profile');
    await delay(4000);
    press(158);
    await delay(1500);
    m = await menuProbe();
    if (!m.open) fails.push('我的页按右软键没有展开菜单');
    if (m.items.join(',') !== '退出应用') fails.push('我的页菜单的项不对: ' + m.items.join(','));
    if (shot('profile')) await screenshot(shot('profile'));

    results.push({ page: 'tab-menu', fails });
    console.log((fails.length ? '✗' : '✓') + ' ' + 'tab-menu'.padEnd(16) +
      (fails.length ? fails.join(' | ') :
        '三个 Tab: 右软键变「更多」+ 原动作进菜单 + 末项「退出应用」 全通过'));
  } catch (e) {
    results.push({ page: 'tab-menu', fails: [String(e.message)] });
    console.log('✗ ' + 'tab-menu'.padEnd(16) + String(e.message));
  }
}

// 真机: 主页菜单里跳到搜索页后, **返回键要能退回主页**
//
// 老毛病: 搜索页一进来就自动聚焦输入框, 而框架把"文字键"喂给输入法 ——
// 退格键 (就是返回键) 被**空**输入框吃掉, 用户按返回键没反应, 直接卡在那一页。
// 跳过去的路由本身没问题 (history.length 确实 +1), 是按键被吞了。
// 现在空输入框的退格键会交给页面 → 返回键正常退回上一页。
if (!only.length || only.indexOf('search-back') >= 0) {
  const fails = [];
  const shot = name => (shotDir ? path.join(shotDir, 'search-back-' + name + '.png') : '');
  const evalJS = async text => {
    const r = await withActor(a => req(a, 'evaluateJS', { text }, DEFAULT_TIMEOUT));
    if (r.exception) throw new Error('探针异常: ' + JSON.stringify(r.exception.preview || r.exception).slice(0, 200));
    return String(r.result == null ? '' : r.result);
  };
  try {
    await goto('#/home');
    await delay(4000);
    // 右软键 → 二级菜单 → 中键选「搜索」
    press(158);
    await delay(1500);
    press(352);
    await delay(3000);
    let hash = await evalJS('location.hash');
    if (hash !== '#/search') fails.push('菜单里点「搜索」应该跳到搜索页, 实际「' + hash + '」');
    const focus = await evalJS('(function(){var a=document.activeElement;return a?a.tagName:"none";})()');
    if (focus !== 'INPUT') fails.push('搜索页的焦点应该落在输入框上, 实际「' + focus + '」');
    const empty = await evalJS('(function(){var i=document.querySelector("input");return i?String(i.value===""):"no input";})()');
    if (empty !== 'true') fails.push('搜索页刚进来时输入框应该是空的 (否则测不到"空输入框"这条路径)');
    if (shot('search')) await screenshot(shot('search'));

    // 空输入框 + 返回键 → 应该退回主页
    press(14);
    await delay(2500);
    hash = await evalJS('location.hash');
    if (hash !== '#/home') fails.push('在搜索页按返回键应该退回主页, 实际「' + hash + '」');
    if (shot('back')) await screenshot(shot('back'));

    results.push({ page: 'search-back', fails });
    console.log((fails.length ? '✗' : '✓') + ' ' + 'search-back'.padEnd(16) +
      (fails.length ? fails.join(' | ') :
        '菜单跳搜索页后返回键能退回主页 全通过'));
  } catch (e) {
    results.push({ page: 'search-back', fails: [String(e.message)] });
    console.log('✗ ' + 'search-back'.padEnd(16) + String(e.message));
  }
}

// 真机: 「退出应用」—— 菜单最后一项
//
// 退出前先把路由重置到 '/' (首页), 再关掉应用窗口。
// window.close() 在 KaiOS 2.4 上是真的能结束应用 (实测: 调完之后
// console actor 消失, b2g-ps 里也没有这个应用了)。
//
// 这个用例会**把应用关掉**, 所以必须放在最后跑; 跑完再把应用拉起来,
// 顺便验证重新打开落在首页 (路由确实被重置过)。
if (!only.length || only.indexOf('exit-app') >= 0) {
  const fails = [];
  const shot = name => (shotDir ? path.join(shotDir, 'exit-app-' + name + '.png') : '');
  const menuProbe = async () => {
    const text = '(function(){return (\n' + MENU_PROBE + '\n);})()';
    const r = await withActor(a => req(a, 'evaluateJS', { text }, DEFAULT_TIMEOUT));
    if (r.exception) throw new Error('菜单探针异常: ' + JSON.stringify(r.exception.preview || r.exception).slice(0, 200));
    return JSON.parse(r.result);
  };
  try {
    // 先停在一个子页: 退出时应该被重置回首页
    await goto('#/settings');
    await delay(2500);
    await goto('#/home');
    await delay(3500);
    press(158);
    await delay(1500);
    let m = await menuProbe();
    if (!m.open) fails.push('按右软键没有展开菜单');
    const n = (m.items || []).length;
    if (!n || m.items[n - 1] !== '退出应用') {
      fails.push('菜单最后一项应该是「退出应用」实际「' + ((m.items || [])[n - 1] || '') + '」');
    }
    // 高亮移到最后一项 (↓ 是绕圈的, 按 n-1 次正好落在末项)
    for (let i = 0; i < n - 1; i++) {
      press(108);
      await delay(350);
    }
    await delay(600);
    m = await menuProbe();
    if (m.selected !== n - 1) {
      fails.push('高亮应该落在最后一项 (第 ' + n + ' 项), 实际第 ' + (m.selected + 1) + ' 项');
    }
    if (shot('menu')) await screenshot(shot('menu'));

    // 中键 = 激活 → 退出应用
    press(352);
    await delay(4000);

    // 应用应该被关掉了: 再取状态会失败
    let closed = false;
    try {
      await withActor(a => req(a, 'evaluateJS', { text: 'location.hash' }, 6000));
    } catch (e) {
      closed = true;
    }
    if (!closed) fails.push('点了「退出应用」之后应用还活着');

    // 重新拉起来: 路由应该被重置过 → 落在首页
    await req(webappsActor, 'launch', { manifestURL });
    await delay(6000);
    const again = await withActor(a => req(a, 'evaluateJS', { text: 'location.hash' }, DEFAULT_TIMEOUT));
    if (!/^#\/(home)?$/.test(String(again.result || ''))) {
      fails.push('退出后重新打开应该落在首页, 实际「' + again.result + '」');
    }
    if (shot('relaunch')) await screenshot(shot('relaunch'));

    results.push({ page: 'exit-app', fails });
    console.log((fails.length ? '✗' : '✓') + ' ' + 'exit-app'.padEnd(16) +
      (fails.length ? fails.join(' | ') :
        '退出应用: 路由先重置到 / + 真把应用关掉 + 重开落在首页 全通过'));
  } catch (e) {
    results.push({ page: 'exit-app', fails: [String(e.message)] });
    console.log('✗ ' + 'exit-app'.padEnd(16) + String(e.message));
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