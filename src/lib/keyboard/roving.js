// 焦点漫游 (roving focus)
//
// KaiOS 是 D-pad 设备, 没有鼠标。用户用方向键在 [data-navable] 元素之间移动,
// 中键 (Enter) 激活当前元素。
//
// ── 这一层修掉的问题 ───────────────────────────────────────────────────
// 1. 向上移动时如果当前焦点不在列表里, 旧实现会跳到"第一个"元素。
//    现在: 向下 → 第一个, 向上 → 最后一个 (和 D-pad 的直觉一致)。
// 2. 旧实现用 document 找全部 [data-navable], 方向键会在"标签栏 / 列表 / 顶栏"
//    之间乱串。现在引入 [data-nav-root] 区域概念: 焦点所在区域优先,
//    找不到才回退到整页。
// 3. 旧实现只认 document.activeElement, 页面切换后焦点丢失时行为不可预期。
//    现在记录"最近一次获得焦点的元素", 用来推断区域。
// 4. activateFocused() 在没有焦点时什么都不做 (按中键没反应)。
//    现在会先聚焦到第一个可导航元素再激活。

/** 可导航元素选择器 */
const NAVABLE_SELECTOR = '[data-navable]:not([disabled])';

/**
 * 元素是否处于可渲染状态
 *
 * offsetParent 为 null 表示元素或某个祖先是 display:none。但 position:fixed
 * 的元素 offsetParent 同样是 null, 需要用 computed style 兜底区分。
 */
function isRendered(el) {
  if (!el) return false;
  if (el.offsetParent !== null) return true;
  const cs = window.getComputedStyle(el);
  return !!cs && cs.position === 'fixed';
}

/**
 * 取一个容器内所有可导航元素 (已按文档顺序排好, 隐藏的会被剔除)
 *
 * @param {Element|Document} [root]
 * @returns {Array<Element>}
 */
export function getFocusables(root) {
  const scope = root || document;
  if (!scope || typeof scope.querySelectorAll !== 'function') return [];
  const nodes = scope.querySelectorAll(NAVABLE_SELECTOR);
  const out = [];
  for (let i = 0; i < nodes.length; i++) {
    if (isRendered(nodes[i])) out.push(nodes[i]);
  }
  return out;
}

/**
 * 找到元素所属的导航区域 (最近的 [data-nav-root] 祖先)
 *
 * @param {Element} el
 * @returns {Element|null}
 */
export function findNavRoot(el) {
  let node = el;
  while (node && node !== document.body && node !== document.documentElement) {
    if (node.hasAttribute && node.hasAttribute('data-nav-root')) return node;
    node = node.parentElement;
  }
  return null;
}

/**
 * 当前应该参与漫游的区域
 *
 * 优先级:
 *   1. 当前焦点所在的 [data-nav-root] 区域 (焦点元素本身可导航或在区域内都算)
 *   2. 最近一次获得焦点的可导航元素所在的区域
 *   3. 整页
 *
 * @returns {Element|Document}
 */
export function currentRegion() {
  const active = document.activeElement;
  if (active && active !== document.body && active !== document.documentElement) {
    // 焦点元素在某个区域里 (比如区域内的输入框) → 就用这个区域
    const root = findNavRoot(active);
    if (root) return root;
    if (isNavable(active)) return document;
  }
  const recent = lastFocusedElement();
  if (recent && isNavable(recent) && document.contains(recent)) {
    return findNavRoot(recent) || document;
  }
  return document;
}

/**
 * 是否是可导航元素
 * @param {Element} el
 * @returns {boolean}
 */
export function isNavable(el) {
  return !!(el && el.hasAttribute && el.hasAttribute('data-navable'));
}

/** @type {Element|null} 最近一次获得焦点的元素 */
let lastFocused = null;

/**
 * 记录最近一次获得焦点的元素
 * @returns {Element|null}
 */
export function lastFocusedElement() {
  return lastFocused;
}

/**
 * 手动设置"最近焦点" (测试用 / 主动调用)
 * @param {Element|null} el
 */
export function setLastFocused(el) {
  lastFocused = el;
}

/**
 * 在容器内移动焦点
 *
 * @param {number} delta +1 向下 / -1 向上
 * @param {Element|Document} [root] 指定容器; 省略则用当前区域
 * @returns {boolean} 焦点是否真的移动了
 */
export function moveFocus(delta, root) {
  const container = root || currentRegion();
  const list = getFocusables(container);
  if (!list.length) return false;

  const cur = document.activeElement;
  const i = list.indexOf(cur);
  let next;

  if (i < 0) {
    // 焦点不在这个区域里: 向下从头开始, 向上从末尾开始
    next = delta > 0 ? list[0] : list[list.length - 1];
  } else {
    let j = i + delta;
    if (j < 0) j = 0;
    if (j >= list.length) j = list.length - 1;
    next = list[j];
  }

  if (!next || next === cur) return false;
  next.focus();
  scrollIntoViewCenter(next);
  return true;
}

/**
 * 聚焦容器里的第一个可导航元素
 * @param {Element|Document} [root]
 * @returns {boolean}
 */
export function focusFirst(root) {
  const list = getFocusables(root || currentRegion());
  if (!list.length) return false;
  const el = list[0];
  el.focus();
  scrollIntoViewCenter(el);
  return true;
}

/**
 * 聚焦容器里的最后一个可导航元素
 * @param {Element|Document} [root]
 * @returns {boolean}
 */
export function focusLast(root) {
  const list = getFocusables(root || currentRegion());
  if (!list.length) return false;
  const el = list[list.length - 1];
  el.focus();
  scrollIntoViewCenter(el);
  return true;
}

/**
 * 激活当前焦点元素
 *
 * 没有焦点时先聚焦到第一个可导航元素再激活, 避免"按中键没反应"。
 *
 * @returns {boolean} 是否激活成功
 */
export function activateFocused() {
  let el = document.activeElement;
  if (!el || el === document.body || el === document.documentElement) {
    if (!focusFirst()) return false;
    el = document.activeElement;
    if (!el || el === document.body) return false;
  }
  // 表单控件交给浏览器默认行为 (Enter 提交 / 下拉选择)
  const tag = el.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return false;
  if (tag === 'A' || tag === 'BUTTON' || isNavable(el)) {
    el.click();
    return true;
  }
  return false;
}

/**
 * 当前焦点元素在区域内的序号 (没有焦点返回 -1)
 *
 * 配合 focusAt() 实现"记住并恢复焦点位置": 离开列表页时记下序号,
 * 回来时把焦点放回同一条。
 *
 * @param {Element|Document} [root] 区域; 省略则用当前区域
 * @returns {number}
 */
export function focusIndex(root) {
  const list = getFocusables(root || currentRegion());
  return list.indexOf(document.activeElement);
}

/**
 * 把焦点移到区域内的第 index 个可导航元素
 *
 * @param {Element|Document} root
 * @param {number} index
 * @returns {boolean} 是否成功 (区域里没有那么多元素时返回 false)
 */
export function focusAt(root, index) {
  const list = getFocusables(root);
  if (!list.length) return false;
  if (index < 0 || index >= list.length) return false;
  const el = list[index];
  el.focus();
  scrollIntoViewCenter(el);
  return true;
}

/**
 * 在容器内漫游, 到边界时回调 (用于无限滚动加载更多)
 *
 * @param {number} delta +1 向下 / -1 向上
 * @param {Function} [onEdge] 到边界 (没能移动) 时的回调
 * @param {Element|Document} [root]
 * @returns {boolean} 焦点是否移动了
 */
export function roam(delta, onEdge, root) {
  const moved = moveFocus(delta, root);
  if (!moved && typeof onEdge === 'function') onEdge(delta);
  return moved;
}

/**
 * 找到元素所在的滚动容器
 * @param {Element} el
 * @returns {Element|null}
 */
export function findScroller(el) {
  let node = el && el.parentElement;
  while (node && node !== document.body && node !== document.documentElement) {
    const cs = window.getComputedStyle(node);
    if (cs && /(auto|scroll)/.test(cs.overflowY)) {
      if (node.scrollHeight > node.clientHeight) return node;
    }
    node = node.parentElement;
  }
  return null;
}

/**
 * 把元素滚动到可视区中央 (KaiOS 屏幕只有 240x320, 居中比"刚好可见"好读)
 * @param {Element} el
 */
export function scrollIntoViewCenter(el) {
  if (!el || !el.getBoundingClientRect) return;
  const r = el.getBoundingClientRect();
  const scroller = findScroller(el);
  if (scroller) {
    const sr = scroller.getBoundingClientRect();
    const target = scroller.scrollTop + (r.top - sr.top) - (scroller.clientHeight - r.height) / 2;
    scroller.scrollTo(0, Math.max(0, target));
    return;
  }
  // 没有内部滚动容器时退回窗口滚动
  const target = (window.pageYOffset || 0) + (r.top - (window.innerHeight - r.height) / 2);
  if (window.scrollTo) window.scrollTo(0, Math.max(0, target));
}
