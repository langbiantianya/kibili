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
const {
  softkeyMenu, openSoftkeyMenu, closeSoftkeyMenu, clearSoftkeyMenu,
  softkeyMenuMove, softkeyMenuActivate, softkeyMenuBack, softkeyMenuSide
} = await import('../src/lib/stores/softkey.js');

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

check('输入框聚焦时: 空输入框的退格键仍然交给页面 (当返回用)', () => {
  clearKeys();
  resetDom();
  let hit = 0;
  onKey('page', { Back: () => { hit++; } });
  const input = new FakeElement('input');
  doc.body.appendChild(input);
  input.focus();
  press('Back');
  eq(hit, 1, '空输入框没有字可删, 退格键 (=返回键) 应该交给页面');
  input.value = 'abc';
  press('Back');
  eq(hit, 1, '输入框里有字时, 退格键留给输入法删字, 不交给页面');
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
check('返回键: 退格键(Back)/Smart Touch 返回键 触发返回, 右软键不触发', () => {
  clearKeys();
  resetDom();
  let backCount = 0;
  // 照抄 main.js 里 app-back 的注册方式 (右软键不在返回家族里, EndCall 也不在)
  const off = onKey('app-back', {
    Back: () => { backCount++; },
    GoBack: () => { backCount++; },
    BrowserBack: () => { backCount++; }
  }, { priority: -100, global: true });
  press('Backspace');
  eq(backCount, 1, '退格键应该触发返回');
  press('GoBack');
  eq(backCount, 2, 'Smart Touch 返回键应该触发返回');
  press('SoftRight');
  eq(backCount, 2, '右软键不是返回键, 不应该触发返回');
  off();
  clearKeys();
});

check('通话键/挂断键: 网页永远不拦, 页面显式声明也不处理', () => {
  clearKeys();
  resetDom();
  let got = 0;
  const off = onKey('page', {
    Call: () => { got++; },
    EndCall: () => { got++; }
  }, { priority: 10 });
  const e1 = press('EndCall');
  eq(got, 0, '挂断键不应该被页面处理');
  eq(e1.defaultPrevented, false, '挂断键不应该被 preventDefault');
  const e2 = press('Call');
  eq(got, 0, '通话键不应该被页面处理');
  eq(e2.defaultPrevented, false, '通话键不应该被 preventDefault');
  off();
  clearKeys();
});

check('通话键/挂断键: 模态独占时也不拦', () => {
  clearKeys();
  resetDom();
  let got = 0;
  const close = openModalScope('modal', {
    EndCall: () => { got++; }
  });
  const e = press('EndCall');
  eq(got, 0, '模态也不该拿挂断键当取消');
  eq(e.defaultPrevented, false, '挂断键不应该被 preventDefault');
  close();
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

// ── 6. 用户主页 store (按 uid 缓存) ────────────────────────────────────
check('用户主页: 换人时各自缓存自己的数据和焦点', async () => {
  const { userPage, userPageFocus, switchUser } = await import('../src/lib/stores/userpage.js');
  const { get } = await import('svelte/store');

  // 假装在看 111 的主页, 已经翻到投稿 tab 的第 4 条
  userPage.update(s => ({ ...s, uid: 111, activeTab: 1, videos: [{ bvid: 'BV1' }] }));
  userPageFocus.video = 3;

  eq(switchUser(222), true, '换到另一个人应该返回 true');
  eq(get(userPage).uid, 222, '换人后 uid 应该变了');
  eq(get(userPage).videos.length, 0, '新用户的数据应该是空的');
  eq(userPageFocus.video, -1, '新用户的焦点位置应该重置');

  eq(switchUser(111), true, '换回去应该返回 true');
  eq(get(userPage).uid, 111, '换回来 uid 应该恢复');
  eq(get(userPage).videos.length, 1, '换回来数据应该还在缓存里');
  eq(get(userPage).activeTab, 1, '换回来 tab 也应该记住');
  eq(userPageFocus.video, 3, '换回来焦点位置应该记住');

  eq(switchUser(111), false, '同一个人再切一次应该什么都不做');
});

// ── 7. 用户资料字段映射 ────────────────────────────────────────────────
// 名片接口 (x/web-interface/card) 的字段是分层的, 记错位置就会显示成 0:
//   粉丝/关注在 card 里面, 投稿/获赞在**顶层**
check('用户资料: 投稿数和获赞数取名片响应的顶层字段', async () => {
  const { mapUserProfile } = await import('../src/lib/api/user.js');

  // 真实响应 (x/web-interface/card, mid=946974) 的形状
  const cardRes = {
    card: {
      mid: 946974,
      name: '影视飓风',
      sex: '男',
      face: 'https://i0.hdslb.com/face.jpg',
      sign: '无限进步！',
      level_info: { current_level: 6 },
      fans: 18661047,
      attention: 686,
      Official: { title: '2025百大UP主' }
    },
    follower: 18661047,
    following: false,        // 布尔值! 不是关注数
    archive_count: 950,      // 投稿数在顶层
    article_count: 0,
    like_num: 129421015      // 获赞数也在顶层
  };

  const info = mapUserProfile(cardRes, null);
  eq(info.archive, 950, '投稿数应该取顶层的 archive_count');
  eq(info.likeNum, 129421015, '获赞数应该取顶层的 like_num');
  eq(info.fans, 18661047, '粉丝数应该取 card.fans');
  eq(info.attention, 686, '关注数应该取 card.attention');
  eq(info.sex, '男', '性别应该取 card.sex');
  eq(info.level, 6, '等级应该取 card.level_info.current_level');
  eq(info.official, '2025百大UP主', '认证应该取 card.Official.title');
  eq(info.uid, 946974, 'UID 应该取 card.mid');
  eq(info.name, '影视飓风', '昵称应该取 card.name');
});

check('用户资料: 空间接口被风控挡掉时, 名片照样能出数据', async () => {
  const { mapUserProfile } = await import('../src/lib/api/user.js');
  const info = mapUserProfile({
    card: { mid: 2, name: '哔哩哔哩', sex: '女' },
    archive_count: 29,
    like_num: 0
  }, null);
  eq(info.name, '哔哩哔哩', '名字应该来自名片');
  eq(info.archive, 29, '投稿数应该来自名片顶层');
  eq(info.sex, '女', '性别应该来自名片');
  eq(info.likeNum, 0, '没有获赞数据时应该是 0 而不是 undefined');
});

check('用户资料: 空间信息的字段优先于名片', async () => {
  const { mapUserProfile } = await import('../src/lib/api/user.js');
  const info = mapUserProfile(
    { card: { mid: 2, name: '哔哩哔哩', sex: '男' }, archive_count: 29, like_num: 100 },
    { mid: 2, name: '哔哩哔哩弹幕网', sex: 1, birthday: '2000-01-01', archive_count: 30 }
  );
  eq(info.name, '哔哩哔哩弹幕网', '名字应该优先用空间信息');
  eq(info.birthday, '2000-01-01', '生日应该来自空间信息');
  eq(info.archive, 30, '投稿数应该优先用空间信息');
  eq(info.likeNum, 100, '空间信息没有获赞数时用名片的');
});

check('用户资料: 两个接口都没数据时返回 null', async () => {
  const { mapUserProfile } = await import('../src/lib/api/user.js');
  eq(mapUserProfile(null, null), null, '两个接口都没数据应该返回 null');
  eq(mapUserProfile(undefined, undefined), null, 'undefined 也应该返回 null');
});

// ── 8. 设置项 ──────────────────────────────────────────────────────────
// 设置是存在 localStorage 里的, 这里用一个假的 localStorage 来测
// "老版本存的数据"升级之后的行为
check('设置: 老数据没有 autoPlay 字段时缺省是"立刻播放"', async () => {
  // 模拟老版本存过的设置 (只有 quality/muted, 没有 autoPlay)
  const store = new Map([
    ['settings:v1', JSON.stringify({ quality: 16, muted: false })]
  ]);
  globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => { store.set(k, v); },
    removeItem: (k) => { store.delete(k); }
  };

  const { settings } = await import('../src/lib/stores/settings.js');
  const { get } = await import('svelte/store');
  eq(get(settings).autoPlay, true, '老数据缺省应该是 true (保持原来的行为)');

  // 关掉之后要能存回去
  settings.update(s => ({ ...s, autoPlay: false }));
  eq(get(settings).autoPlay, false, '关掉之后应该是 false');
  eq(JSON.parse(store.get('settings:v1')).autoPlay, false, '关掉之后应该写进 localStorage');
});

// ── 9. 统一的视频卡片形状 ──────────────────────────────────────────────
// 首页推荐流 / 关注页动态流 / 用户主页投稿列表 —— 三个来源的字段完全不一样,
// 在 api/videocard.js 里统一成 { stat: { play, like } }, 卡片组件只认这一种
check('卡片形状: 推荐流的播放量取 stat.view, 点赞取 stat.like', async () => {
  const { mapRecommend } = await import('../src/lib/api/videocard.js');
  const c = mapRecommend({
    bvid: 'BV1', cid: 2, aid: 3, title: 't', pic: 'p', duration: 10,
    owner: { mid: 5, name: 'UP' },
    stat: { view: 12345, like: 678, danmaku: 9 }
  });
  eq(c.stat.play, 12345, '播放量应该取 stat.view');
  eq(c.stat.like, 678, '点赞应该取 stat.like');
  eq(c.owner.name, 'UP', 'UP 主名字');
  eq(c.duration, 10, '时长');
});

check('卡片形状: 动态流的播放量是字符串, 点赞取 module_stat.like.count', async () => {
  const { mapDynamicVideo } = await import('../src/lib/api/videocard.js');
  const item = {
    modules: {
      module_dynamic: {
        major: {
          type: 'MAJOR_TYPE_ARCHIVE',
          archive: {
            bvid: 'BV2', aid: 4, cid: 6, title: 't2', cover: 'c2',
            duration_text: '3:21',
            stat: { play: '275.7万', danmaku: '2.5万' }
          }
        }
      },
      module_stat: {
        like: { count: 209628, status: false },
        forward: { count: 755 },
        comment: { count: 5831 }
      }
    }
  };
  const c = mapDynamicVideo(item);
  eq(c.stat.play, '275.7万', '播放量就是接口给的字符串');
  eq(c.stat.like, 209628, '点赞取 module_stat.like.count');
  eq(c.duration, '3:21', '时长用 duration_text');

  eq(mapDynamicVideo({ modules: { module_dynamic: { major: { type: 'MAJOR_TYPE_ARTICLE' } } } }), null,
    '不是视频的动态应该返回 null');
});

check('卡片形状: 投稿列表没有点赞数 (留 null, 由列表层按需补)', async () => {
  const { mapUserVideo } = await import('../src/lib/api/videocard.js');
  const c = mapUserVideo({
    bvid: 'BV3', aid: 7, title: 't3', pic: 'p3', length: '44:42',
    author: '影视飓风', mid: 946974, play: 2745681, comment: 5816, video_review: 24622
  });
  eq(c.stat.play, 2745681, '播放量取 v.play');
  eq(c.stat.like, null, '投稿接口不给点赞数, 应该是 null');
  eq(c.duration, '44:42', '时长用 length');
  eq(c.owner.name, '影视飓风', 'UP 主名字用 author');
});

// ── 10. 动态详情: 各类型动态的统一解析 ──────────────────────────────────
// 动态类型有十几种, 字段位置各不相同。api/dynamic.js 的 parseDynamicMajor
// 按 major.type 分派, parseDynamicItem 处理转发 (item.orig) 和评论对象。
// 这里用真机抓到的真实响应做回归。
check('动态解析: 视频动态 (MAJOR_TYPE_ARCHIVE)', async () => {
  const { parseDynamicMajor } = await import('../src/lib/api/dynamic.js');
  const m = parseDynamicMajor({
    type: 'MAJOR_TYPE_ARCHIVE',
    archive: {
      aid: '117476029435376', bvid: 'BV1xx411c7mD', title: '测试视频',
      cover: 'http://cover.jpg', desc: '视频简介', duration_text: '10:30',
      jump_url: '//b23.tv/xxx', stat: { play: '1.2万', danmaku: '300' }
    }
  });
  eq(m.kind, 'video', '视频动态 kind 应该是 video');
  eq(m.title, '测试视频', '标题');
  eq(m.bvid, 'BV1xx411c7mD', 'bvid');
  eq(m.duration, '10:30', '时长');
  eq(m.cover, 'http://cover.jpg', '封面');
});

check('动态解析: 图文动态 (MAJOR_TYPE_OPUS) — 标题 + 正文 + 图片', async () => {
  const { parseDynamicMajor } = await import('../src/lib/api/dynamic.js');
  const m = parseDynamicMajor({
    type: 'MAJOR_TYPE_OPUS',
    opus: {
      title: '明音凛时装', jump_url: '//www.bilibili.com/opus/123',
      pics: [{ url: 'http://p1.jpg', width: 1080, height: 1920 }],
      summary: { text: '正文内容', rich_text_nodes: [{ text: '正文内容', type: 'RICH_TEXT_NODE_TYPE_TEXT' }] }
    }
  });
  eq(m.kind, 'opus', '图文动态 kind 应该是 opus');
  eq(m.title, '明音凛时装', '标题');
  eq(m.text, '正文内容', '正文取 summary.text');
  eq(m.images.length, 1, '图片数量');
  eq(m.images[0].src, 'http://p1.jpg', '图片地址');
  eq(m.cover, 'http://p1.jpg', '封面取第一张图');
});

check('动态解析: 图文动态正文为空时用富文本节点兜底', async () => {
  const { parseDynamicMajor } = await import('../src/lib/api/dynamic.js');
  const m = parseDynamicMajor({
    type: 'MAJOR_TYPE_OPUS',
    opus: {
      title: '', summary: {
        text: '',
        rich_text_nodes: [
          { text: '#话题#', type: 'RICH_TEXT_NODE_TYPE_TOPIC' },
          { text: '正文', type: 'RICH_TEXT_NODE_TYPE_TEXT' }
        ]
      }
    }
  });
  eq(m.text, '#话题#正文', '富文本节点应该拼成纯文本');
});

check('动态解析: 专栏 / 合集 / 剧集 / 一般类型', async () => {
  const { parseDynamicMajor } = await import('../src/lib/api/dynamic.js');
  const a = parseDynamicMajor({
    type: 'MAJOR_TYPE_ARTICLE',
    article: { title: '专栏标题', desc: '专栏摘要', covers: ['http://c1.jpg'], label: '1.2万阅读' }
  });
  eq(a.kind, 'article', '专栏 kind');
  eq(a.title, '专栏标题', '专栏标题');
  eq(a.cover, 'http://c1.jpg', '专栏封面取 covers[0]');
  eq(a.label, '1.2万阅读', '专栏 label');

  const s = parseDynamicMajor({
    type: 'MAJOR_TYPE_UGC_SEASON',
    ugc_season: { title: '合集名', cover: 'http://s.jpg', desc: '合集简介', duration_text: '05:00' }
  });
  eq(s.kind, 'season', '合集 kind');
  eq(s.title, '合集名', '合集标题');

  const p = parseDynamicMajor({
    type: 'MAJOR_TYPE_PGC',
    pgc: { title: '番剧名', cover: 'http://p.jpg', badge: { text: '第1季' } }
  });
  eq(p.kind, 'pgc', '剧集 kind');
  eq(p.badge, '第1季', '角标文案');

  const c = parseDynamicMajor({
    type: 'MAJOR_TYPE_COMMON',
    common: { title: '装扮', desc: '装扮描述', cover: 'http://d.jpg' }
  });
  eq(c.kind, 'common', '一般类型 kind');
  eq(c.title, '装扮', '一般类型标题');
});

check('动态解析: 失效动态 (MAJOR_TYPE_NONE)', async () => {
  const { parseDynamicMajor } = await import('../src/lib/api/dynamic.js');
  const m = parseDynamicMajor({ type: 'MAJOR_TYPE_NONE', none: { tips: '该动态已失效' } });
  eq(m.kind, 'invalid', '失效动态 kind 应该是 invalid');
  eq(m.desc, '该动态已失效', '失效文案');
});

check('动态解析: 转发动态从 item.orig 取原内容', async () => {
  const { parseDynamicItem } = await import('../src/lib/api/dynamic.js');
  // 真机实测: 转发动态的 major 是 null, 原动态在 item.orig
  const item = {
    id_str: '1261496426755522577',
    type: 'DYNAMIC_TYPE_FORWARD',
    basic: { comment_id_str: '1261496426755522577', comment_type: 17, rid_str: '1261496336551772169' },
    modules: {
      module_author: { mid: 111, name: '转发者', face: 'http://f.jpg' },
      module_dynamic: {
        desc: { text: '转发动态' },
        major: null
      },
      module_stat: { like: { count: 13 }, comment: { count: 2 }, forward: { count: 0 } }
    },
    orig: {
      id_str: '1261496336551772169',
      type: 'DYNAMIC_TYPE_AV',
      modules: {
        module_author: { mid: 222, name: '原作者', face: 'http://o.jpg' },
        module_dynamic: {
          desc: { text: '原动态正文' },
          major: {
            type: 'MAJOR_TYPE_ARCHIVE',
            archive: { bvid: 'BV1orig411c7mD', title: '原视频', cover: 'http://v.jpg', duration_text: '03:00' }
          }
        }
      }
    }
  };
  const p = parseDynamicItem(item);
  eq(p.isForward, true, '应该识别为转发');
  eq(p.major.kind, 'forward', '转发 kind');
  ok(p.orig, 'orig 应该解析出来');
  eq(p.orig.author.name, '原作者', '原作者名字');
  eq(p.orig.content, '原动态正文', '原动态正文');
  eq(p.orig.major.kind, 'video', '原动态主体是视频');
  eq(p.orig.major.bvid, 'BV1orig411c7mD', '原视频 bvid');
  // 评论对象: 转发评论挂在动态本身 (type=17)
  eq(p.comment.oid, '1261496426755522577', '转发评论 oid 是动态本身 id');
  eq(p.comment.type, 17, '转发评论 type=17');
});

check('动态解析: 转发原动态是图文时也能拿到图片', async () => {
  const { parseDynamicItem } = await import('../src/lib/api/dynamic.js');
  const item = {
    id_str: '9', type: 'DYNAMIC_TYPE_FORWARD',
    modules: { module_author: { name: 'a' }, module_dynamic: { desc: { text: '转发动态' }, major: null } },
    orig: {
      id_str: '8', type: 'DYNAMIC_TYPE_DRAW',
      modules: {
        module_author: { name: '影视飓风' },
        module_dynamic: {
          desc: null,
          major: {
            type: 'MAJOR_TYPE_OPUS',
            opus: { title: '原图文', summary: { text: '原正文' }, pics: [{ url: 'http://x.jpg' }] }
          }
        }
      }
    }
  };
  const p = parseDynamicItem(item);
  eq(p.orig.major.kind, 'opus', '原动态主体是图文');
  eq(p.orig.major.title, '原图文', '原图文标题');
  eq(p.orig.major.images.length, 1, '原图文图片');
  // desc 为 null 时正文退回 summary.text
  eq(p.orig.content, '原正文', '原动态正文退回 opus.summary.text');
});

check('动态解析: 视频动态的评论对象是视频 aid (type=1)', async () => {
  const { parseDynamicItem } = await import('../src/lib/api/dynamic.js');
  const p = parseDynamicItem({
    id_str: '1', type: 'DYNAMIC_TYPE_AV',
    basic: { comment_id_str: '117476029435376', comment_type: 1, rid_str: '117476029435376' },
    modules: {
      module_author: { name: 'up' },
      module_dynamic: { desc: null, major: { type: 'MAJOR_TYPE_ARCHIVE', archive: { bvid: 'BV1', title: 't' } } }
    }
  });
  eq(p.comment.oid, '117476029435376', '评论 oid 用 basic.comment_id_str');
  eq(p.comment.type, 1, '评论 type 用 basic.comment_type');
});

check('动态解析: basic 缺字段时按动态类型兜底评论对象', async () => {
  const { parseDynamicItem } = await import('../src/lib/api/dynamic.js');
  const art = parseDynamicItem({
    id_str: '2', type: 'DYNAMIC_TYPE_ARTICLE',
    modules: { module_author: { name: 'up' }, module_dynamic: { major: { type: 'MAJOR_TYPE_OPUS', opus: {} } } }
  });
  eq(art.comment.type, 12, '专栏兜底 type=12');
  const av = parseDynamicItem({
    id_str: '3', type: 'DYNAMIC_TYPE_AV',
    modules: { module_author: { name: 'up' }, module_dynamic: { major: { type: 'MAJOR_TYPE_ARCHIVE', archive: {} } } }
  });
  eq(av.comment.type, 1, '视频兜底 type=1');
});

check('动态解析: 相关内容卡片 (游戏/商品/预约/投票)', async () => {
  const { parseDynamicItem } = await import('../src/lib/api/dynamic.js');
  const p = parseDynamicItem({
    id_str: '4', type: 'DYNAMIC_TYPE_DRAW',
    modules: {
      module_author: { name: 'up' },
      module_dynamic: {
        major: { type: 'MAJOR_TYPE_OPUS', opus: {} },
        additional: {
          type: 'ADDITIONAL_TYPE_COMMON',
          common: {
            title: '异环', cover: 'http://g.png', head_text: '相关游戏',
            desc1: '角色扮演/开放世界', desc2: '异环1.4版本现已开启！'
          }
        }
      }
    }
  });
  ok(p.additional, 'additional 应该解析出来');
  eq(p.additional.type, 'ADDITIONAL_TYPE_COMMON', '卡片类型');
  eq(p.additional.title, '异环', '卡片标题');
  eq(p.additional.label, '相关游戏', '卡片头文案');
  eq(p.additional.desc, '角色扮演/开放世界 · 异环1.4版本现已开启！', '两行描述合并');
});

check('动态解析: 空 major (转发) 不崩, 返回 null', async () => {
  const { parseDynamicMajor } = await import('../src/lib/api/dynamic.js');
  eq(parseDynamicMajor(null), null, 'null 应该返回 null');
});

check('动态解析: 列表里带 opus 的 DRAW 动态按 major.type 走图文分支', async () => {
  const { parseDynamicMajor } = await import('../src/lib/api/dynamic.js');
  // 真机实测: DYNAMIC_TYPE_DRAW 的 major.type 是 MAJOR_TYPE_OPUS,
  // 不能靠"哪个字段存在"来判断类型
  const m = parseDynamicMajor({
    type: 'MAJOR_TYPE_OPUS',
    opus: { title: 't', summary: { text: 'x' }, pics: [{ url: 'http://a.jpg' }] },
    archive: null, draw: null, article: null, common: null
  });
  eq(m.kind, 'opus', '应该按 major.type 走图文');
  eq(m.images.length, 1, '图片');
});

check('动态解析: 转发者没写评论时 "转发动态" 是占位符, 不当正文', async () => {
  const { parseDynamicItem } = await import('../src/lib/api/dynamic.js');
  const p = parseDynamicItem({
    id_str: '9', type: 'DYNAMIC_TYPE_FORWARD',
    modules: {
      module_author: { name: '转发者' },
      module_dynamic: { desc: { text: '转发动态' }, major: null }
    },
    orig: {
      id_str: '8', type: 'DYNAMIC_TYPE_AV',
      modules: {
        module_author: { name: '原作者' },
        module_dynamic: { desc: { text: '原正文' }, major: { type: 'MAJOR_TYPE_ARCHIVE', archive: { bvid: 'BV1', title: 't' } } }
      }
    }
  });
  eq(p.content, '', '"转发动态"占位符应该被清掉');
  eq(p.orig.content, '原正文', '原动态正文不受影响');
});

check('动态解析: 转发者写了评论时正文保留', async () => {
  const { parseDynamicItem } = await import('../src/lib/api/dynamic.js');
  const p = parseDynamicItem({
    id_str: '9', type: 'DYNAMIC_TYPE_FORWARD',
    modules: {
      module_author: { name: '转发者' },
      module_dynamic: { desc: { text: '卡池开了卡池开了！' }, major: null }
    },
    orig: {
      id_str: '8', type: 'DYNAMIC_TYPE_AV',
      modules: {
        module_author: { name: '原作者' },
        module_dynamic: { desc: { text: '原正文' }, major: { type: 'MAJOR_TYPE_ARCHIVE', archive: { bvid: 'BV1' } } }
      }
    }
  });
  eq(p.content, '卡池开了卡池开了！', '转发者的评论要保留');
});

check('动态解析: 老式 DRAW 主体只有图片没有正文 (不带 features 时接口返回这种)', async () => {
  const { parseDynamicMajor } = await import('../src/lib/api/dynamic.js');
  const m = parseDynamicMajor({
    type: 'MAJOR_TYPE_DRAW',
    draw: { id: 412793826, items: [{ src: 'http://a.jpg', width: 2500, height: 1000 }] }
  });
  eq(m.kind, 'images', 'DRAW 类型 kind 应该是 images');
  eq(m.images.length, 1, '图片数量');
  eq(m.images[0].src, 'http://a.jpg', '图片地址');
  eq(m.text, '', 'DRAW 形态没有正文');
});

check('动态解析: OPUS 形态有正文也有图片 (带 features 时接口返回这种)', async () => {
  const { parseDynamicMajor } = await import('../src/lib/api/dynamic.js');
  const m = parseDynamicMajor({
    type: 'MAJOR_TYPE_OPUS',
    opus: {
      title: '', jump_url: 'opus/1',
      summary: { text: '正文内容', rich_text_nodes: [{ text: '正文内容', type: 'RICH_TEXT_NODE_TYPE_TEXT' }] },
      pics: [{ url: 'http://b.jpg', width: 1080, height: 1920 }]
    }
  });
  eq(m.kind, 'opus', 'OPUS 类型 kind 应该是 opus');
  eq(m.text, '正文内容', '正文');
  eq(m.images.length, 1, '图片数量');
});

check('动态解析: 直播推荐 (LIVE_RCMD) 的标题在 live_play_info 里', async () => {
  const { parseDynamicMajor } = await import('../src/lib/api/dynamic.js');
  const m = parseDynamicMajor({
    type: 'MAJOR_TYPE_LIVE_RCMD',
    live_rcmd: {
      reserve_type: 0,
      content: JSON.stringify({
        type: 1,
        live_play_info: { room_id: 21685249, title: '重播：新长征路上从遵义出发', cover: 'http://c.jpg', uname: '某主播' }
      })
    }
  });
  eq(m.kind, 'live', '直播推荐 kind');
  eq(m.title, '重播：新长征路上从遵义出发', '标题取 live_play_info.title');
  eq(m.cover, 'http://c.jpg', '封面取 live_play_info.cover');
  eq(m.desc, '主播 某主播', '描述带主播名');
});

// ── 11. 评论对话树: 按 parent 建树, 多层级显示 ──────────────────────────
// 子评论接口 GET /x/v2/reply/reply 的 data.replies 见过两种形态:
//   ① 平铺: 每条带 parent, 靠 parent 串成树
//   ② 嵌套: 每条自带 replies 数组 (递归嵌套)
// utils/commenttree.js 两种都要能建出正确的层级, 否则多层级评论显示会错位。
check('评论树: 平铺列表按 parent 建出层级', async () => {
  const { buildCommentTree } = await import('../src/lib/utils/commenttree.js');
  const tree = buildCommentTree([
    { rpid: 2, parent: 1, member: { uname: '甲' } },
    { rpid: 3, parent: 1, member: { uname: '乙' } },
    { rpid: 4, parent: 2, member: { uname: '丙' } },
    { rpid: 5, parent: 4, member: { uname: '丁' } }
  ], 1, '楼主');
  eq(tree.length, 4, '一共 4 条');
  // 楼中楼的顺序: 一条评论后面紧跟它的回复
  eq(tree[0].node.rpid, 2, '第一条是 rpid=2');
  eq(tree[0].depth, 0, '回复根评论的是第 0 层');
  eq(tree[1].node.rpid, 4, 'rpid=4 紧跟在它回复的 rpid=2 后面');
  eq(tree[1].depth, 1, '回复二级评论的是第 1 层');
  eq(tree[2].node.rpid, 5, 'rpid=5 紧跟在 rpid=4 后面');
  eq(tree[2].depth, 2, '回复三级评论的是第 2 层');
  eq(tree[3].node.rpid, 3, 'rpid=3 是根评论的另一条直属回复, 排最后');
  eq(tree[3].depth, 0, '同为根评论的直属回复');
});

check('评论树: 嵌套形态 (自带 replies) 也能拍平建树', async () => {
  const { buildCommentTree } = await import('../src/lib/utils/commenttree.js');
  const tree = buildCommentTree([
    {
      rpid: 2, parent: 1, member: { uname: '甲' },
      replies: [
        { rpid: 4, parent: 2, member: { uname: '丙' } }
      ]
    },
    { rpid: 3, parent: 1, member: { uname: '乙' } }
  ], 1, '楼主');
  eq(tree.length, 3, '嵌套里的也要算进来');
  eq(tree[0].depth, 0, 'rpid=2 是直属回复');
  eq(tree[1].node.rpid, 4, '嵌套的 rpid=4 排在它父评论后面');
  eq(tree[1].depth, 1, '嵌套的层级是 1');
  eq(tree[2].node.rpid, 3, 'rpid=3 排最后');
});

check('评论树: 「回复 @某某」用 parent 反查作者', async () => {
  const { buildCommentTree } = await import('../src/lib/utils/commenttree.js');
  const tree = buildCommentTree([
    { rpid: 2, parent: 1, member: { uname: '甲' } },
    { rpid: 4, parent: 2, member: { uname: '丙' } }
  ], 1, '楼主');
  eq(tree[0].replyName, '楼主', '回复根评论的显示根评论作者');
  eq(tree[1].replyName, '甲', '回复二级评论的显示二级评论作者');
});

check('评论树: parent 指向列表外的 rpid 当成根评论的直属回复', async () => {
  const { buildCommentTree } = await import('../src/lib/utils/commenttree.js');
  const tree = buildCommentTree([
    { rpid: 7, parent: 999, member: { uname: '甲' } }
  ], 1, '楼主');
  eq(tree.length, 1, '不能丢条目');
  eq(tree[0].depth, 0, '当成第 0 层');
  eq(tree[0].replyName, '', '找不到父评论就不显示"回复 @某某"');
});

check('评论树: 空列表返回空树', async () => {
  const { buildCommentTree } = await import('../src/lib/utils/commenttree.js');
  eq(buildCommentTree([], 1, '楼主').length, 0, '空列表');
  eq(buildCommentTree(null, 1, '楼主').length, 0, 'null 列表');
});

check('评论树: 数据里有环也不能死循环', async () => {
  const { buildCommentTree } = await import('../src/lib/utils/commenttree.js');
  const tree = buildCommentTree([
    { rpid: 2, parent: 3, member: { uname: '甲' } },
    { rpid: 3, parent: 2, member: { uname: '乙' } }
  ], 1, '楼主');
  ok(tree.length <= 2, '环里的条目最多各出现一次');
});

check('评论树: 拍平嵌套时保留所有条目', async () => {
  const { flattenCommentNodes } = await import('../src/lib/utils/commenttree.js');
  const flat = flattenCommentNodes([
    { rpid: 1, replies: [{ rpid: 2, replies: [{ rpid: 3 }] }] }
  ]);
  eq(flat.length, 3, '三层嵌套拍平成 3 条');
  eq(flat[2].rpid, 3, '最里层也在');
});

check('评论树: 根评论混进回复列表里也不能重复渲染', async () => {
  const { buildCommentTree } = await import('../src/lib/utils/commenttree.js');
  const tree = buildCommentTree([
    { rpid: 1, parent: 0, member: { uname: '楼主' } },
    { rpid: 2, parent: 1, member: { uname: '甲' } }
  ], 1, '楼主');
  eq(tree.length, 1, '根评论自己不算一条回复');
  eq(tree[0].node.rpid, 2, '只剩真正的那条回复');
  eq(tree[0].replyName, '楼主', '回复根评论的显示根评论作者');
});

check('别用「x = x」触发 Svelte 更新 (引用没变, DOM 不会重渲染)', async () => {
  // Svelte 3 把 `x = x` 编译成 `$$invalidate(0, x)`, 引用没变就不标脏 →
  // 界面永远不更新 (评论展开"按了没反应"就是踩了这个)。
  // 要更新必须换引用: `x = { ...x }` 或 `x[k] = v; x = { ...x }`。
  const { readdirSync, readFileSync, statSync } = await import('node:fs');
  const { join } = await import('node:path');
  const srcDir = join(process.cwd(), 'src');
  const bad = [];
  function walk(dir) {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      const st = statSync(p);
      if (st.isDirectory()) { walk(p); continue; }
      if (!/\.(svelte|js)$/.test(name)) continue;
      const text = readFileSync(p, 'utf8');
      const re = /^[ \t]*([A-Za-z_$][\w$]*)[ \t]*=[ \t]*\1[ \t]*;/gm;
      let m;
      while ((m = re.exec(text))) bad.push(p.replace(srcDir + '/', '') + ' → ' + m[0].trim());
    }
  }
  walk(srcDir);
  eq(bad.length, 0, '源码里有自赋值写法 (Svelte 3 里不会触发更新):\n    ' + bad.join('\n    '));
});

// ── 7. 软键菜单 (二级 / 三级) ──────────────────────────────────────────
/** 造一棵菜单树: 二级三项, 其中两项还有子项 (三级) */
function makeMenuTree(log) {
  return {
    slot: 'right',
    label: '更多',
    title: '更多操作',
    items: [
      { label: 'UP 主页', action: () => log.push('home') },
      {
        label: '分享',
        items: [
          { label: '复制链接', action: () => log.push('copy') },
          { label: '分享给好友', action: () => log.push('share') }
        ]
      },
      {
        label: '收藏',
        items: [
          { label: '稍后再看', action: () => log.push('later') },
          { label: '收藏到文件夹', disabled: true, action: () => log.push('folder') }
        ]
      }
    ]
  };
}

/** 当前菜单状态的快照 */
function menuState() {
  const s = get(softkeyMenu);
  return {
    open: s.open,
    depth: s.stack.length,
    index: s.index,
    labels: s.stack.length ? s.stack[s.stack.length - 1].items.map(i => i.label) : [],
    title: s.stack.length ? s.stack[s.stack.length - 1].title : ''
  };
}

check('软键菜单: 作用域注册菜单 → 菜单树跟着作用域一起注册', () => {
  clearKeys();
  const log = [];
  const off = onKey('page', { SoftLeft: () => {} }, { menu: makeMenuTree(log) });
  const s = get(softkeyMenu);
  eq(!!s.registered, true, '注册后应该有菜单树');
  eq(s.registered.label, '更多', '软键文案取菜单树的 label');
  eq(s.registered.slot, 'right', '菜单默认占右软键');
  eq(s.open, false, '注册不等于打开');
  off();
  clearKeys();
});

check('软键菜单: 作用域注销 → 菜单一起释放 (不会漏到下一个页面)', () => {
  clearKeys();
  const log = [];
  const off = onKey('page', { SoftLeft: () => {} }, { menu: makeMenuTree(log) });
  ok(get(softkeyMenu).registered, '注册后有菜单树');
  off();
  eq(get(softkeyMenu).registered, null, '注销后菜单树应该被释放');
  clearKeys();
});

check('软键菜单: 打开 → 显示二级菜单 (栈的第一层)', () => {
  clearKeys();
  const log = [];
  openSoftkeyMenu(makeMenuTree(log));
  const st = menuState();
  eq(st.open, true, '菜单应该打开了');
  eq(st.depth, 1, '打开时在二级菜单 (栈深 1)');
  eq(st.labels.join(','), 'UP 主页,分享,收藏', '二级菜单的项');
  eq(st.index, 0, '默认高亮第一项');
  closeSoftkeyMenu();
});

check('软键菜单: 上下移动高亮, 到头绕回另一头', () => {
  clearKeys();
  const log = [];
  openSoftkeyMenu(makeMenuTree(log));
  softkeyMenuMove(1);
  eq(menuState().index, 1, '下移一项');
  softkeyMenuMove(-1);
  eq(menuState().index, 0, '上移一项');
  softkeyMenuMove(-1);
  eq(menuState().index, 2, '从第一项往上绕到最后一项');
  softkeyMenuMove(1);
  eq(menuState().index, 0, '从最后一项往下绕回第一项');
  closeSoftkeyMenu();
});

check('软键菜单: 中键打开有子项的项 → 进入三级菜单', () => {
  clearKeys();
  const log = [];
  openSoftkeyMenu(makeMenuTree(log));
  softkeyMenuMove(1);                    // 高亮「分享」
  softkeyMenuActivate();
  const st = menuState();
  eq(st.depth, 2, '应该进了三级菜单 (栈深 2)');
  eq(st.labels.join(','), '复制链接,分享给好友', '三级菜单的项');
  eq(st.title, '分享', '三级菜单的标题是父项的文案');
  eq(st.index, 0, '进入后高亮第一项');
  closeSoftkeyMenu();
  eq(log.join(','), '', '进菜单不该执行动作');
});

check('软键菜单: 三级菜单里按中键执行动作并关掉菜单', () => {
  clearKeys();
  const log = [];
  openSoftkeyMenu(makeMenuTree(log));
  softkeyMenuMove(1);
  softkeyMenuActivate();                 // 进「分享」
  softkeyMenuMove(1);                    // 高亮「分享给好友」
  softkeyMenuActivate();
  eq(log.join(','), 'share', '应该执行了叶子项的动作');
  eq(menuState().open, false, '执行完菜单应该关掉');
});

check('软键菜单: 禁用项按中键没反应 (也不执行动作)', () => {
  clearKeys();
  const log = [];
  openSoftkeyMenu(makeMenuTree(log));
  softkeyMenuMove(2);                    // 高亮「收藏」
  softkeyMenuActivate();                 // 进三级
  softkeyMenuMove(1);                    // 高亮「收藏到文件夹」(禁用)
  softkeyMenuActivate();
  eq(log.join(','), '', '禁用项不该执行动作');
  eq(menuState().open, true, '禁用项不该关掉菜单');
  closeSoftkeyMenu();
});

check('软键菜单: 返回键回到上一级, 高亮还原到刚才那一项', () => {
  clearKeys();
  const log = [];
  openSoftkeyMenu(makeMenuTree(log));
  softkeyMenuMove(2);                    // 高亮「收藏」
  softkeyMenuActivate();                 // 进三级
  softkeyMenuBack();
  const st = menuState();
  eq(st.depth, 1, '应该退回二级菜单');
  eq(st.index, 2, '高亮应该还原成刚才那一项 (收藏)');
  closeSoftkeyMenu();
});

check('软键菜单: 在二级按返回键 → 整个关掉', () => {
  clearKeys();
  const log = [];
  openSoftkeyMenu(makeMenuTree(log));
  softkeyMenuBack();
  eq(menuState().open, false, '应该关掉菜单');
});

check('软键菜单: 左右方向键也能进/退层级', () => {
  clearKeys();
  const log = [];
  openSoftkeyMenu(makeMenuTree(log));
  softkeyMenuMove(1);                    // 高亮「分享」(有子项)
  softkeyMenuSide(1);                    // → 进入三级
  eq(menuState().depth, 2, '右方向键应该进了三级');
  softkeyMenuSide(-1);                   // ← 退回二级
  eq(menuState().depth, 1, '左方向键应该退回二级');
  closeSoftkeyMenu();
});

check('软键菜单: 菜单源是函数时, 打开菜单的那一刻才求值 (菜单项跟着异步状态走)', () => {
  clearKeys();
  const log = [];
  let ownerReady = false;
  const off = onKey('page', { SoftLeft: () => {} }, {
    menu: () => ({
      slot: 'right',
      label: '更多',
      title: '更多操作',
      items: [
        { label: 'UP 主页', disabled: !ownerReady, action: () => log.push('home') }
      ]
    })
  });
  // 注册时作者信息还没到 → 「UP 主页」是灰的
  eq(get(softkeyMenu).registered.items[0].disabled, true, '注册时应该还是禁用');
  ownerReady = true;                     // 作者信息到了
  openSoftkeyMenu();
  const st = menuState();
  eq(st.open, true, '应该打开了');
  eq(st.labels.join(','), 'UP 主页', '菜单项在打开时重新求值');
  off();
  clearKeys();
  closeSoftkeyMenu();
});

check('软键菜单: 菜单打开期间独占按键 (页面收不到上下键)', () => {
  clearKeys();
  const log = [];
  const pageGot = [];
  const offPage = onKey('page', {
    Up: () => pageGot.push('up'),
    Down: () => pageGot.push('down')
  }, { softkeys: true });
  // 模拟软键栏: 菜单打开时注册一个独占作用域
  const offMenu = onKey('softkey-menu', {
    Up: () => softkeyMenuMove(-1),
    Down: () => softkeyMenuMove(1)
  }, { exclusive: true, priority: 100 });
  openSoftkeyMenu(makeMenuTree(log));
  press('ArrowDown');
  press('ArrowUp');
  eq(pageGot.join(','), '', '菜单打开时页面不该收到上下键');
  eq(menuState().index, 0, '菜单自己消化了上下键 (绕回第一项)');
  offMenu();
  closeSoftkeyMenu();
  offPage();
  clearKeys();
});

check('软键菜单: 空菜单打不开 (按软键没反应, 不吞按键)', () => {
  clearKeys();
  eq(openSoftkeyMenu({ items: [] }), false, '没有菜单项就不该打开');
  eq(get(softkeyMenu).open, false, '菜单不该是打开状态');
  clearSoftkeyMenu();
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
