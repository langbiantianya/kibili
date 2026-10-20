#!/usr/bin/env node
// 按键框架无头自测
//
// 用最小的 DOM 替身在 Node 里跑 lib/keyboard 的纯逻辑, 不需要真机:
//   - 按键归一化 (KaiOS 各机型上报的 key 名/keyCode 不一致)
//   - 作用域的优先级 / 同名实例互不干扰 / 注销
//   - 输入框聚焦时"文字键让给输入法、导航键仍归页面"
//   - 模态独占 (回复框打开时页面按键不响应, 且输入框照常编辑)
//   - 焦点漫游的首/末/边界行为
//
// 运行: node scripts/test-keyboard.js

// ── 最小 DOM 替身 ──────────────────────────────────────────────────────
class FakeElement {
  constructor(tag, attrs) {
    this.tagName = String(tag).toUpperCase();
    this.attrs = attrs || {};
    this.children = [];
    this.parentElement = null;
    this.offsetParent = {};
    this.listeners = {};
    this.rect = { top: 0, bottom: 20, left: 0, right: 20, width: 20, height: 20 };
    this.style = { position: 'static', overflowY: 'visible' };
    this.clickCount = 0;
    this.onclick = null;
  }
  getAttribute(n) { return n in this.attrs ? this.attrs[n] : null; }
  setAttribute(n, v) { this.attrs[n] = String(v); }
  hasAttribute(n) { return n in this.attrs; }
  get type() { return this.getAttribute('type'); }
  focus() { doc.activeElement = this; doc.dispatch('focus', { target: this }); }
  click() {
    this.clickCount++;
    if (this.onclick) this.onclick({ target: this });
  }
  getBoundingClientRect() { return this.rect; }
  contains(node) {
    while (node) {
      if (node === this) return true;
      node = node.parentElement;
    }
    return false;
  }
  appendChild(child) {
    child.parentElement = this;
    this.children.push(child);
    return child;
  }
  querySelectorAll(sel) {
    const out = [];
    walk(this, (el) => {
      if (el !== this && matches(el, sel)) out.push(el);
    });
    return out;
  }
}

function walk(node, fn) {
  fn(node);
  for (const c of node.children) walk(c, fn);
}

/** 只支持框架实际用到的选择器 */
function matches(el, sel) {
  const parts = sel.split(',').map(s => s.trim());
  for (const part of parts) {
    if (matchesSimple(el, part)) return true;
  }
  return false;
}

function matchesSimple(el, sel) {
  if (sel === '[data-nav-root]') return el.hasAttribute('data-nav-root');
  if (sel === '[data-navable]') return el.hasAttribute('data-navable');
  if (sel === '[data-navable]:not([disabled])') {
    return el.hasAttribute('data-navable') && !el.hasAttribute('disabled');
  }
  if (sel.indexOf('.') === 0) {
    const cls = (el.attrs.class || '').split(/\s+/);
    return cls.indexOf(sel.slice(1)) >= 0;
  }
  throw new Error('测试替身不支持的选择器: ' + sel);
}

class FakeDocument {
  constructor() {
    this.body = new FakeElement('body');
    this.documentElement = new FakeElement('html');
    this.body.parentElement = this.documentElement;
    this.activeElement = this.body;
    this.listeners = {};
  }
  querySelectorAll(sel) { return this.body.querySelectorAll(sel); }
  querySelector(sel) { return this.querySelectorAll(sel)[0] || null; }
  contains(node) { return this.body.contains(node); }
  addEventListener(type, fn) { (this.listeners[type] = this.listeners[type] || []).push(fn); }
  removeEventListener(type, fn) {
    const arr = this.listeners[type] || [];
    const i = arr.indexOf(fn);
    if (i >= 0) arr.splice(i, 1);
  }
  dispatch(type, ev) {
    ev = ev || {};
    ev.type = type;
    ev.preventDefault = ev.preventDefault || function () { ev.defaultPrevented = true; };
    ev.stopPropagation = ev.stopPropagation || function () {};
    (this.listeners[type] || []).slice().forEach(fn => fn(ev));
  }
}

const doc = new FakeDocument();

const fakeWindow = {
  listeners: {},
  addEventListener(type, fn) { (this.listeners[type] = this.listeners[type] || []).push(fn); },
  removeEventListener(type, fn) {
    const arr = this.listeners[type] || [];
    const i = arr.indexOf(fn);
    if (i >= 0) arr.splice(i, 1);
  },
  dispatch(type, ev) {
    ev = ev || {};
    ev.type = type;
    ev.preventDefault = ev.preventDefault || function () { ev.defaultPrevented = true; };
    ev.stopPropagation = ev.stopPropagation || function () {};
    (this.listeners[type] || []).slice().forEach(fn => fn(ev));
  },
  getComputedStyle(el) { return el.style || { position: 'static', overflowY: 'visible' }; },
  scrollTo() {}
};

globalThis.window = fakeWindow;
globalThis.document = doc;

// ── 断言工具 ────────────────────────────────────────────────────────────
let passed = 0;
const failures = [];
const tests = [];

function check(name, fn) {
  tests.push({ name, fn });
}

function eq(actual, expected, msg) {
  if (actual !== expected) {
    throw new Error((msg || '') + ' 期望 ' + JSON.stringify(expected) + ', 实际 ' + JSON.stringify(actual));
  }
}

function ok(value, msg) {
  if (!value) throw new Error(msg || '期望为真');
}

// ── 被测模块 ────────────────────────────────────────────────────────────
// 全部包在 async main() 里, 避免用顶层 await (Node 14.0 不支持)
async function main() {
const { canonicalKey, isTextKey, matchKey, resetLearnedKeyCodes } = await import('../src/lib/keyboard/keys.js');
const { onKey, offKey, clearKeys, activeScopes, exclusiveScope } = await import('../src/lib/keyboard/scopes.js');
const kb = await import('../src/lib/keyboard/index.js');
const { moveFocus, focusFirst, getFocusables, focusIndex, focusAt } = await import('../src/lib/keyboard/roving.js');
const { openModalScope } = await import('../src/lib/keyboard/modalkeys.js');
const { requestSystemVolume } = await import('../src/lib/player/volume.js');
const { setSoftkeys } = await import('../src/lib/stores/ui.js');
const { get } = await import('svelte/store');
const { ui } = await import('../src/lib/stores/ui.js');

/** 读当前软键文案 */
function softkeys() {
  const s = get(ui).softkeys;
  return s.left + '|' + s.right + '|' + s.center;
}

kb.installKeyboard();

/** 造一个按键事件 */
function keyEvent(key, extra) {
  const e = {
    key: key,
    keyCode: 0,
    repeat: false,
    shiftKey: false,
    target: doc.activeElement,
    defaultPrevented: false
  };
  if (extra) Object.assign(e, extra);
  e.preventDefault = function () { e.defaultPrevented = true; };
  e.stopPropagation = function () {};
  return e;
}

function press(key, extra) {
  const e = keyEvent(key, extra);
  fakeWindow.dispatch('keydown', e);
  fakeWindow.dispatch('keyup', e);
  return e;
}

function resetDom() {
  doc.body.children.length = 0;
  doc.activeElement = doc.body;
}

/** 造一列可导航元素 */
function makeList(n, opts) {
  const root = new FakeElement('div', { 'data-nav-root': '1' });
  const items = [];
  for (let i = 0; i < n; i++) {
    const el = new FakeElement('div', { 'data-navable': '1' });
    if (opts && opts.className) el.setAttribute('class', opts.className);
    root.appendChild(el);
    items.push(el);
  }
  doc.body.appendChild(root);
  return { root, items };
}

// ── 1. 按键归一化 ──────────────────────────────────────────────────────
check('方向键: ArrowUp/Up 归一为 Up', () => {
  eq(canonicalKey({ key: 'ArrowUp' }), 'Up');
  eq(canonicalKey({ key: 'Up' }), 'Up');
});

check('中键: Enter/Accept 归一为 Enter', () => {
  eq(canonicalKey({ key: 'Enter' }), 'Enter');
  eq(canonicalKey({ key: 'Accept' }), 'Enter');
});

check('软键: SoftLeft/SoftRight 保持原样', () => {
  eq(canonicalKey({ key: 'SoftLeft' }), 'SoftLeft');
  eq(canonicalKey({ key: 'SoftRight' }), 'SoftRight');
});

check('退格/返回: Backspace/Back 归一为 Back, BrowserBack 保持独立', () => {
  // BrowserBack 必须和 Back 分开: Back 是退格键 (在输入框里要删字),
  // BrowserBack 是浏览器返回键 (直接当"返回"用)
  eq(canonicalKey({ key: 'Backspace' }), 'Back');
  eq(canonicalKey({ key: 'Back' }), 'Back');
  eq(canonicalKey({ key: 'BrowserBack' }), 'BrowserBack');
  eq(canonicalKey({ key: 'GoBack' }), 'GoBack');
  eq(canonicalKey({ key: 'EndCall' }), 'EndCall');
});

check('e.key 不可用时用 keyCode 兜底 (Unidentified) — Gecko 48 / KaiOS 2.4 的值', () => {
  eq(canonicalKey({ key: 'Unidentified', keyCode: 13 }), 'Enter');
  eq(canonicalKey({ key: 'Unidentified', keyCode: 38 }), 'Up');
  eq(canonicalKey({ key: 'Unidentified', keyCode: 40 }), 'Down');
  eq(canonicalKey({ key: 'Unidentified', keyCode: 37 }), 'Left');
  eq(canonicalKey({ key: 'Unidentified', keyCode: 39 }), 'Right');
  eq(canonicalKey({ key: 'Unidentified', keyCode: 8 }), 'Back');
  // Gecko 48: VOLUME_MUTE 181 / VOLUME_DOWN 182 / VOLUME_UP 183
  eq(canonicalKey({ key: 'Unidentified', keyCode: 181 }), 'Mute');
  eq(canonicalKey({ key: 'Unidentified', keyCode: 182 }), 'VolumeDown');
  eq(canonicalKey({ key: 'Unidentified', keyCode: 183 }), 'VolumeUp');
});

check('软键在 Gecko 48 里没有 DOM keyCode, 只能靠 e.key', () => {
  // 之前把 183 当成 SoftLeft 是错的 —— 183 在 Gecko 48 里是 VolumeUp
  eq(canonicalKey({ key: 'Unidentified', keyCode: 183 }), 'VolumeUp');
  eq(canonicalKey({ key: 'Unidentified', keyCode: 187 }), '');
  eq(canonicalKey({ key: 'SoftLeft' }), 'SoftLeft');
  eq(canonicalKey({ key: 'SoftRight' }), 'SoftRight');
});

check('跨版本: KaiOS 3 的音量 keyCode 和 2.4 相反, 靠自学习纠正', () => {
  clearKeys();
  resetDom();
  resetLearnedKeyCodes();
  // 静态表按 2.4 (183=VolumeUp), 但这台机器实际是 KaiOS 3 (182=VolumeUp)
  press('VolumeUp', { keyCode: 182 });
  eq(canonicalKey({ key: 'Unidentified', keyCode: 182 }), 'VolumeUp',
    '自学习应该用本机实测值覆盖静态表');
  resetLearnedKeyCodes();
  clearKeys();
});

check('运行时自学习: 见过一次 keyCode 之后, Unidentified 也能认出来', () => {
  // 某些机型 SoftRight 上报的 keyCode 不是 0
  clearKeys();
  resetDom();
  resetLearnedKeyCodes();
  press('SoftRight', { keyCode: 187 });
  eq(canonicalKey({ key: 'Unidentified', keyCode: 187 }), 'SoftRight');
  resetLearnedKeyCodes();
  clearKeys();
});

check('真机硬件键: 音量/静音/挂断/符号键都能归一', () => {
  eq(canonicalKey({ key: 'AudioVolumeUp' }), 'VolumeUp');
  eq(canonicalKey({ key: 'AudioVolumeDown' }), 'VolumeDown');
  eq(canonicalKey({ key: 'AudioVolumeMute' }), 'Mute');
  eq(canonicalKey({ key: 'EndCall' }), 'EndCall');
  eq(canonicalKey({ key: 'Power' }), 'Power');
  eq(canonicalKey({ key: 'Symbol' }), 'Symbol');
  eq(canonicalKey({ key: 'GoBack' }), 'GoBack');
  eq(canonicalKey({ key: 'BrowserBack' }), 'BrowserBack');
  eq(canonicalKey({ key: 'Camera' }), 'Camera');
  eq(canonicalKey({ key: 'Call' }), 'Call');
  eq(canonicalKey({ key: 'Message' }), 'Message');
  eq(canonicalKey({ key: 'Notification' }), 'Notification');
  eq(canonicalKey({ key: 'MicrophoneToggle' }), 'MicrophoneToggle');
});

check('Power 和 EndCall 共用 keyCode 95, 但靠 e.key 区分', () => {
  eq(canonicalKey({ key: 'Power' }), 'Power');
  eq(canonicalKey({ key: 'EndCall' }), 'EndCall');
});

check('符号输入键属于文字类 (输入框聚焦时让给输入法)', () => {
  ok(isTextKey('Symbol'));
  ok(!isTextKey('VolumeUp'));
  ok(!isTextKey('EndCall'));
});

check('数字键保持字符形式', () => {
  eq(canonicalKey({ key: '0' }), '0');
  eq(canonicalKey({ key: '5' }), '5');
  eq(canonicalKey({ key: 'Unidentified', keyCode: 53 }), '5');
});

check('文字键判定: 数字/字母/退格是文字键, 方向键不是', () => {
  ok(isTextKey('0'));
  ok(isTextKey('9'));
  ok(isTextKey('a'));
  ok(isTextKey('Z'));
  ok(isTextKey('Space'), '空格是文字键');
  ok(isTextKey('Back'), '退格是文字键');
  ok(!isTextKey('Up'));
  ok(!isTextKey('Down'));
  ok(!isTextKey('Enter'));
  ok(!isTextKey('SoftLeft'));
  ok(!isTextKey('SoftRight'));
});

check('matchKey 兼容旧写法 ArrowUp', () => {
  ok(matchKey({ key: 'ArrowUp' }, 'Up'));
  ok(matchKey({ key: 'Up' }, 'Up'));
  ok(!matchKey({ key: 'Down' }, 'Up'));
});

// ── 2. 作用域: 优先级 / 实例隔离 / 注销 ─────────────────────────────────
check('作用域按优先级排序 (大的优先)', () => {
  clearKeys();
  onKey('low', { Enter: () => 'low' }, { priority: -10 });
  onKey('high', { Enter: () => 'high' }, { priority: 10 });
  const list = activeScopes();
  eq(list[0].name, 'high');
  eq(list[1].name, 'low');
  clearKeys();
});

check('同名实例互不干扰: 注销一个不影响另一个 (旧实现的经典 bug)', () => {
  clearKeys();
  const offA = onKey('home', { Enter: () => 'A' });
  const offB = onKey('home', { Enter: () => 'B' });
  eq(activeScopes().length, 2);
  offA();
  eq(activeScopes().length, 1, '注销 A 后 B 仍然存在');
  eq(activeScopes()[0].name, 'home');
  offB();
  eq(activeScopes().length, 0);
});

check('后注册的同优先级作用域优先', () => {
  clearKeys();
  onKey('a', { Enter: () => 'a' });
  onKey('b', { Enter: () => 'b' });
  eq(activeScopes()[0].name, 'b');
  clearKeys();
});

check('offKey(name) 能批量注销', () => {
  clearKeys();
  onKey('x', { Enter: () => {} });
  onKey('x', { Enter: () => {} });
  offKey('x');
  eq(activeScopes().length, 0);
});

check('回归: Svelte 的挂载顺序 (新组件 onMount 先于旧组件 onDestroy) 不会误删新作用域', () => {
  // 旧实现的经典 bug:
  //   新实例 onKey('home', …)  → 覆盖旧实例
  //   旧实例 offKey('home')    → 把新实例的 handler 也删掉了
  // 结果路由切换后按键完全失灵 / 旧页面 handler 残留抢键。
  clearKeys();
  resetDom();
  let hit = '';
  // 旧实例 (先挂载)
  const offOld = onKey('home', { Enter: () => { hit = 'old'; } });
  // 新实例 (Svelte 先跑新组件的 onMount)
  const offNew = onKey('home', { Enter: () => { hit = 'new'; } });
  // 再跑旧组件的 onDestroy
  offOld();
  press('Enter');
  eq(hit, 'new', '旧实例销毁后新实例的 handler 必须还在');
  offNew();
  clearKeys();
});

// ── 3. 分发: 优先级 / 默认行为 ──────────────────────────────────────────
check('高优先级的作用域先拿到按键', () => {
  clearKeys();
  resetDom();
  let hit = '';
  onKey('page', { Enter: () => { hit = 'page'; } });
  onKey('player', { Enter: () => { hit = 'player'; } }, { priority: 10 });
  press('Enter');
  eq(hit, 'player');
  clearKeys();
});

check('高优先级的作用域返回 false 时, 继续交给低优先级的作用域', () => {
  clearKeys();
  resetDom();
  let hit = '';
  onKey('page', { Enter: () => { hit = 'page'; } });
  onKey('player', { Enter: () => false }, { priority: 10 });  // "我没处理"
  press('Enter');
  eq(hit, 'page', '高优先级说"没处理"时应落到低优先级');
  clearKeys();
});

check('系统键 (电源/相机/拨号...) 不会被框架拦截', () => {
  clearKeys();
  resetDom();
  const e = press('Power');
  eq(e.defaultPrevented, false, '电源键不能被 preventDefault, 否则长按无法退出应用');
  const e2 = press('Camera');
  eq(e2.defaultPrevented, false, '相机键要留给系统');
  const e3 = press('MicrophoneToggle');
  eq(e3.defaultPrevented, false, '语音助手键要留给系统');
  clearKeys();
});

check('系统键: 页面显式声明时可以接管 (应用主动选择)', () => {
  clearKeys();
  resetDom();
  let hit = 0;
  onKey('page', { Camera: () => { hit++; } });
  const e = press('Camera');
  eq(hit, 1);
  eq(e.defaultPrevented, true);
  clearKeys();
});

check('按住中键不放不会反复激活 (e.repeat)', () => {
  clearKeys();
  resetDom();
  const { items } = makeList(1);
  let clicked = 0;
  items[0].onclick = () => { clicked++; };
  items[0].focus();
  // 连发 3 次 keydown (按住不放)
  fakeWindow.dispatch('keydown', keyEvent('Enter', { repeat: true }));
  fakeWindow.dispatch('keydown', keyEvent('Enter', { repeat: true }));
  fakeWindow.dispatch('keydown', keyEvent('Enter', { repeat: true }));
  eq(clicked, 0, '自动重复不应该触发激活');
  clearKeys();
});

check('默认行为: Enter 激活当前焦点元素', () => {
  clearKeys();
  resetDom();
  const { items } = makeList(2);
  let clicked = 0;
  items[0].onclick = () => { clicked++; };
  items[0].focus();
  press('Enter');
  eq(clicked, 1, 'Enter 应该触发一次 click');
  clearKeys();
});

check('默认行为: Up/Down 在可导航元素之间移动焦点', () => {
  clearKeys();
  resetDom();
  const { items } = makeList(3);
  items[0].focus();
  press('Down');
  eq(doc.activeElement, items[1]);
  press('Down');
  eq(doc.activeElement, items[2]);
  press('Down');
  eq(doc.activeElement, items[2], '到末尾后不再移动');
  press('Up');
  eq(doc.activeElement, items[1]);
  clearKeys();
});

check('默认行为: 没有焦点时 Down 落到第一个, Up 落到最后一个 (旧实现 Up 也落到第一个)', () => {
  clearKeys();
  resetDom();
  const { items } = makeList(3);
  doc.activeElement = doc.body;
  press('Up');
  eq(doc.activeElement, items[2], '向上应该落到最后一个');
  doc.activeElement = doc.body;
  press('Down');
  eq(doc.activeElement, items[0], '向下应该落到第一个');
  clearKeys();
});

check('焦点漫游限制在 data-nav-root 区域内', () => {
  clearKeys();
  resetDom();
  const { root, items } = makeList(2);
  const other = new FakeElement('div', { 'data-navable': '1' });
  doc.body.appendChild(other);
  items[0].focus();
  press('Down');
  eq(doc.activeElement, items[1]);
  press('Down');
  eq(doc.activeElement, items[1], '不应该跳出区域跑到区域外面');
  clearKeys();
});

check('区域内的输入框聚焦时, 方向键仍然在同一个区域里漫游', () => {
  clearKeys();
  resetDom();
  const { root, items } = makeList(2);
  const input = new FakeElement('input');
  root.appendChild(input);
  let hit = 0;
  onKey('page', { Down: () => { hit++; moveFocus(1); } });
  input.focus();
  press('Down');
  eq(hit, 1);
  eq(doc.activeElement, items[0], '应该落到区域内的第一个可导航元素');
  clearKeys();
});

check('被跳过的元素 (offsetParent 为 null) 不参与漫游', () => {
  clearKeys();
  resetDom();
  const { items } = makeList(3);
  items[1].offsetParent = null;
  items[0].focus();
  press('Down');
  eq(doc.activeElement, items[2], '隐藏的元素应被跳过');
  clearKeys();
});

// ── 4. 输入框焦点策略 ──────────────────────────────────────────────────
check('输入框聚焦时: 数字键不触发页面作用域 (留给输入法)', () => {
  clearKeys();
  resetDom();
  let hit = 0;
  onKey('page', { '0': () => { hit++; } });
  const input = new FakeElement('input');
  doc.body.appendChild(input);
  input.focus();
  press('0');
  eq(hit, 0);
  clearKeys();
});

check('输入框聚焦时: 方向键仍然交给页面 (可以跳到列表)', () => {
  clearKeys();
  resetDom();
  const { items } = makeList(2);
  let hit = 0;
  onKey('page', { Down: () => { hit++; moveFocus(1); } });
  const input = new FakeElement('input');
  doc.body.appendChild(input);
  input.focus();
  press('Down');
  eq(hit, 1, '显式注册的 Down 仍然应该响应');
  eq(doc.activeElement, items[0]);
  clearKeys();
});

check('输入框聚焦时: 框架默认的焦点漫游被抑制 (不会把焦点抢出输入框)', () => {
  clearKeys();
  resetDom();
  const { items } = makeList(2);
  const input = new FakeElement('input');
  doc.body.appendChild(input);
  input.focus();
  press('Down');
  eq(doc.activeElement, input, '默认漫游不应该在输入框聚焦时触发');
  clearKeys();
});

check('输入框聚焦时: 软键仍然有效', () => {
  clearKeys();
  resetDom();
  let hit = 0;
  onKey('page', { SoftLeft: () => { hit++; } });
  const input = new FakeElement('input');
  doc.body.appendChild(input);
  input.focus();
  press('SoftLeft');
  eq(hit, 1);
  clearKeys();
});

// ── 5. 模态独占 ────────────────────────────────────────────────────────
check('模态独占时: 页面作用域不响应按键', () => {
  clearKeys();
  resetDom();
  let pageHit = 0;
  let modalHit = 0;
  onKey('page', { Enter: () => { pageHit++; } });
  const close = openModalScope('modal', { Enter: () => { modalHit++; } });
  press('Enter');
  eq(pageHit, 0, '模态打开时页面不应该响应');
  eq(modalHit, 1);
  close();
  clearKeys();
});

check('模态独占时: 模态没声明的按键不拦截 (输入框照常编辑)', () => {
  clearKeys();
  resetDom();
  const close = openModalScope('modal', { SoftLeft: () => {} });
  const e = press('Back');
  eq(e.defaultPrevented, false, '退格键不应该被拦截, 否则删不掉字');
  close();
  clearKeys();
});

check('模态关闭后: 页面作用域恢复响应', () => {
  clearKeys();
  resetDom();
  let hit = 0;
  onKey('page', { Enter: () => { hit++; } });
  const close = openModalScope('modal', { Enter: () => {} });
  press('Enter');
  eq(hit, 0);
  close();
  press('Enter');
  eq(hit, 1);
  clearKeys();
});

check('模态的处理器返回 false 时不拦截默认行为', () => {
  clearKeys();
  resetDom();
  const close = openModalScope('modal', {
    Back: () => false   // "我没处理" → 退格键交给输入框
  });
  const e = press('Back');
  eq(e.defaultPrevented, false);
  close();
  clearKeys();
});

// ── 6. 长按 ────────────────────────────────────────────────────────────
check('长按: press 在松手时触发, long 不会触发', async () => {
  clearKeys();
  resetDom();
  let pressed = 0;
  let long = 0;
  onKey('p', {
    Up: { press: () => { pressed++; }, long: () => { long++; }, threshold: 30, repeat: false }
  });
  fakeWindow.dispatch('keydown', keyEvent('Up'));
  fakeWindow.dispatch('keyup', keyEvent('Up'));
  eq(pressed, 1, '短按应触发 press');
  eq(long, 0, '短按不应触发 long');
  clearKeys();
});

check('长按: 按住超过阈值触发 long, 且不再触发 press', async () => {
  clearKeys();
  resetDom();
  let pressed = 0;
  let long = 0;
  onKey('p', {
    Up: { press: () => { pressed++; }, long: () => { long++; }, threshold: 20, repeat: false }
  });
  fakeWindow.dispatch('keydown', keyEvent('Up'));
  await new Promise(r => setTimeout(r, 60));
  fakeWindow.dispatch('keyup', keyEvent('Up'));
  eq(long, 1, '长按应触发 long');
  eq(pressed, 0, '长按后不应再触发 press');
  clearKeys();
});

check('长按: release 在松手时一定会被调用', async () => {
  clearKeys();
  resetDom();
  let released = 0;
  onKey('p', {
    Down: { press: () => {}, long: () => {}, release: () => { released++; }, threshold: 20, repeat: false }
  });
  fakeWindow.dispatch('keydown', keyEvent('Down'));
  await new Promise(r => setTimeout(r, 60));
  fakeWindow.dispatch('keyup', keyEvent('Down'));
  eq(released, 1);
  clearKeys();
});

// ── 7. 归一化后 keydown / keyup 用的是同一个键名 ───────────────────────
check('keydown 与 keyup 的键名不一致时, 长按状态仍能正确收尾', async () => {
  clearKeys();
  resetDom();
  let released = 0;
  onKey('p', {
    Up: { press: () => {}, long: () => {}, release: () => { released++; }, threshold: 20, repeat: false }
  });
  // keydown 上报 'ArrowUp', keyup 上报 'Up' —— 旧实现这里会漏掉 keyup, 定时器泄漏
  fakeWindow.dispatch('keydown', keyEvent('ArrowUp'));
  await new Promise(r => setTimeout(r, 60));
  fakeWindow.dispatch('keyup', keyEvent('Up'));
  eq(released, 1, 'keyup 用别名也应该能收尾');
  clearKeys();
});

// ── 8. 焦点与激活 ──────────────────────────────────────────────────────
check('activateFocused: 没有焦点时先聚焦第一个再激活', () => {
  clearKeys();
  resetDom();
  const { items } = makeList(2);
  let clicked = 0;
  items[0].onclick = () => { clicked++; };
  doc.activeElement = doc.body;
  kb.activateFocused();
  eq(clicked, 1);
  eq(doc.activeElement, items[0]);
  clearKeys();
});

check('getFocusables 过滤掉 disabled 的元素', () => {
  resetDom();
  const { root, items } = makeList(2);
  items[0].setAttribute('disabled', '');
  eq(getFocusables(root).length, 1);
  resetDom();
});

check('focusAt: 把焦点放到区域内第 N 个元素', () => {
  resetDom();
  const { root, items } = makeList(4);
  doc.activeElement = doc.body;
  eq(focusAt(root, 2), true);
  eq(doc.activeElement, items[2], '焦点应该落在第 3 个元素上');
  resetDom();
});

check('focusAt: 下标越界时不乱动焦点', () => {
  resetDom();
  const { root, items } = makeList(2);
  doc.activeElement = doc.body;
  eq(focusAt(root, 9), false, '超出范围应该返回 false');
  eq(focusAt(root, -1), false, '负数应该返回 false');
  eq(doc.activeElement, doc.body, '失败时不应该动焦点');
  resetDom();
});

check('focusIndex: 记录当前焦点在区域里的序号', () => {
  resetDom();
  const { root, items } = makeList(3);
  doc.activeElement = doc.body;
  eq(focusIndex(root), -1, '没有焦点时返回 -1');
  items[1].focus();
  eq(focusIndex(root), 1, '焦点在第 2 个元素上时返回 1');
  resetDom();
});

check('focusAt / focusIndex 组合: 记住位置再恢复', () => {
  resetDom();
  const { root, items } = makeList(5);
  doc.activeElement = doc.body;
  items[3].focus();
  const saved = focusIndex(root);
  // 模拟"离开页面" —— 焦点掉回 body
  doc.activeElement = doc.body;
  eq(focusAt(root, saved), true);
  eq(doc.activeElement, items[3], '应该回到记住的那一条');
  resetDom();
});

// ── 9. 软键栏的所有权 (参考 KaiUI SoftKey) ─────────────────────────────
check('软键文案随作用域一起生效: onKey(..., { softkeys }) ', () => {
  clearKeys();
  resetDom();
  const off = onKey('page', { SoftLeft: () => {} }, { softkeys: ['刷新', '返回', '打开'] });
  eq(softkeys(), '刷新|返回|打开', '注册后软键栏应该显示作用域声明的文案');
  off();
  clearKeys();
});

check('软键文案随作用域一起注销: 作用域销毁后自动还原', () => {
  clearKeys();
  resetDom();
  const before = softkeys();
  const off = onKey('page', { SoftLeft: () => {} }, { softkeys: ['刷新', '返回', '打开'] });
  eq(softkeys(), '刷新|返回|打开');
  off();
  eq(softkeys(), before, '注销后应该还原成接管前的文案');
  clearKeys();
});

check('软键文案: 路由切换的交错顺序不会还原错 (Svelte 新组件先 onMount)', () => {
  clearKeys();
  resetDom();
  const before = softkeys();
  // 旧页面注册
  const offOld = onKey('old-page', { SoftLeft: () => {} }, { softkeys: ['旧', '旧', '旧'] });
  // 新页面注册 (Svelte: 新组件先 onMount)
  const offNew = onKey('new-page', { SoftLeft: () => {} }, { softkeys: ['新', '新', '新'] });
  // 旧页面销毁 (Svelte: 旧组件后 onDestroy)
  offOld();
  eq(softkeys(), '新|新|新', '旧页面销毁不能把新页面的文案覆盖掉');
  offNew();
  eq(softkeys(), before);
  clearKeys();
});

check('软键文案: 动态文案 (softkeys: true) 也会跟着更新', () => {
  clearKeys();
  resetDom();
  const off = onKey('page', { SoftLeft: () => {} }, { softkeys: true });
  setSoftkeys('动态', '返回', '');
  eq(softkeys(), '动态|返回|');
  off();
  clearKeys();
});

check('模态框接管软键: 打开时显示取消/发送, 关闭后自动还原', () => {
  clearKeys();
  resetDom();
  const before = softkeys();
  const off = onKey('page', { SoftLeft: () => {} }, { softkeys: ['全屏', '返回', '播放'] });
  const close = openModalScope('modal', { SoftLeft: () => {} }, { softkeys: ['取消', '发送', ''] });
  eq(softkeys(), '取消|发送|', '模态打开时应该显示模态自己的文案');
  close();
  eq(softkeys(), '全屏|返回|播放', '模态关闭后应该还原成底层页面的文案');
  off();
  eq(softkeys(), before);
  clearKeys();
});

// ── 3. catchAll (整页拦截按键) ──────────────────────────────────────────
check('catchAll: 接管本作用域没具名声明的按键', () => {
  clearKeys();
  resetDom();
  const got = [];
  const off = onKey('page', { SoftLeft: () => { got.push('named'); } }, {
    catchAll: (e, key) => { got.push('catch:' + key); }
  });
  const e = press('SoftRight');
  eq(got.join(','), 'catch:SoftRight', '没具名声明的键应该交给 catchAll');
  ok(e.defaultPrevented, 'catchAll 处理过的键应该被 preventDefault');
  off();
  clearKeys();
});

check('catchAll: 同作用域内具名声明优先于 catchAll', () => {
  clearKeys();
  resetDom();
  const got = [];
  const off = onKey('page', { SoftLeft: () => { got.push('named'); } }, {
    catchAll: (e, key) => { got.push('catch:' + key); }
  });
  press('SoftLeft');
  eq(got.join(','), 'named');
  off();
  clearKeys();
});

check('catchAll: 返回 false 表示不处理, 继续找低优先级作用域', () => {
  clearKeys();
  resetDom();
  const got = [];
  const offHigh = onKey('high', {}, { priority: 50, catchAll: () => false });
  const offLow = onKey('low', { SoftRight: () => { got.push('low'); } }, { priority: 0 });
  press('SoftRight');
  eq(got.join(','), 'low');
  offHigh();
  offLow();
  clearKeys();
});

check('catchAll: 高优先级的 catchAll 会盖过低优先级的具名处理器', () => {
  clearKeys();
  resetDom();
  const got = [];
  const offHigh = onKey('high', {}, {
    priority: 50,
    catchAll: (e, key) => { got.push('catch:' + key); return true; }
  });
  const offLow = onKey('low', { SoftRight: () => { got.push('low'); } }, { priority: 0 });
  const e = press('SoftRight');
  eq(got.join(','), 'catch:SoftRight');
  ok(e.defaultPrevented);
  offHigh();
  offLow();
  clearKeys();
});

check('catchAll: 放行方向键后, 框架默认的焦点漫游仍然生效', () => {
  clearKeys();
  resetDom();
  const list = makeList(3);
  const off = onKey('page', {}, {
    catchAll: (e, key) => key !== 'Up' && key !== 'Down' && key !== 'Enter'
  });
  press('Down');
  ok(doc.activeElement === list.items[0], '放行 Down 之后焦点应该漫游到第一个元素');
  press('Down');
  ok(doc.activeElement === list.items[1], '再按一次应该走到第二个元素');
  off();
  clearKeys();
});

// ── 4. 返回键家族 ──────────────────────────────────────────────────────
check('返回键: 退格键(Back)/挂断键(EndCall) 触发返回, 右软键不触发', () => {
  clearKeys();
  resetDom();
  let backCount = 0;
  // 照抄 main.js 里 app-back 的注册方式 (右软键不在返回家族里)
  const off = onKey('app-back', {
    Back: () => { backCount++; },
    EndCall: () => { backCount++; },
    GoBack: () => { backCount++; },
    BrowserBack: () => { backCount++; }
  }, { priority: -100, global: true });
  press('Backspace');
  eq(backCount, 1, '退格键应该触发返回');
  press('EndCall');
  eq(backCount, 2, '挂断键应该触发返回');
  press('SoftRight');
  eq(backCount, 2, '右软键不是返回键, 不应该触发返回');
  off();
  clearKeys();
});

check('返回键: 右软键留给页面自己派活, 不被全局兜底抢走', () => {
  clearKeys();
  resetDom();
  const got = [];
  const offBack = onKey('app-back', { Back: () => { got.push('back'); } }, { priority: -100, global: true });
  const offPage = onKey('page', { SoftRight: () => { got.push('page'); } }, { priority: 0 });
  press('SoftRight');
  eq(got.join(','), 'page', '页面声明的右软键动作应该生效');
  press('Backspace');
  eq(got.join(','), 'page,back', '退格键仍然走全局返回');
  offPage();
  offBack();
  clearKeys();
});

// ── 5. 系统音量 (KaiOS) ────────────────────────────────────────────────
// 音量只走系统: 应用不维护自己的音量, 也不画自己的滑块
// (KaiOS 2.4 的 volumeManager 读不到当前音量, 画出来只会和系统对不上)
const navDesc = Object.getOwnPropertyDescriptor(globalThis, 'navigator');

/** 临时替换全局 navigator (Node 21+ 自带只读的 navigator) */
function setNavigator(value) {
  Object.defineProperty(globalThis, 'navigator', {
    value: value,
    configurable: true,
    writable: true
  });
}

function restoreNavigator() {
  if (navDesc) Object.defineProperty(globalThis, 'navigator', navDesc);
  else delete globalThis.navigator;
}

check('系统音量: 调高走 requestUp, 调低走 requestDown', () => {
  const calls = [];
  setNavigator({
    volumeManager: {
      requestUp: () => calls.push('up'),
      requestDown: () => calls.push('down')
    }
  });
  eq(requestSystemVolume(1), true, '调高应该成功');
  eq(requestSystemVolume(-1), true, '调低应该成功');
  eq(calls.join(','), 'up,down', '方向不能反');
  eq(requestSystemVolume(0), false, 'delta 为 0 不该发请求');
  eq(calls.length, 2, 'delta 为 0 不该调 requestUp/Down');
  restoreNavigator();
});

check('系统音量: 设备没有音量接口时不报错', () => {
  setNavigator({});
  eq(requestSystemVolume(1), false, '没有 volumeManager 应该返回 false');
  setNavigator(undefined);
  eq(requestSystemVolume(1), false, '连 navigator 都没有也不该抛异常');
  restoreNavigator();
});

check('系统音量: 系统接口抛异常时兜住', () => {
  setNavigator({
    volumeManager: {
      requestUp: () => { throw new Error('boom'); },
      requestDown: () => { throw new Error('boom'); }
    }
  });
  eq(requestSystemVolume(1), false, '抛异常应该被兜住并返回 false');
  restoreNavigator();
});

// ── 运行 ────────────────────────────────────────────────────────────────
// 顺序执行 (测试之间共用全局的按键总线, 并发/交叠会互相污染)
for (const t of tests) {
  try {
    await t.fn();
    passed++;
  } catch (err) {
    failures.push({ name: t.name, message: err && err.message });
  }
}

clearKeys();

console.log('按键框架自测: ' + passed + ' 通过, ' + failures.length + ' 失败');
if (failures.length) {
  failures.forEach(f => {
    console.error('  ✗ ' + f.name + '\n    ' + f.message);
  });
  process.exit(1);
}
console.log('  ✓ 全部通过');
}

main().catch(err => {
  console.error('按键框架自测崩溃:', err);
  process.exit(1);
});
