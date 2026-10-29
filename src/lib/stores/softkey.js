// 软键菜单 —— 软键栏的二级 / 三级操作
//
// ── 为什么需要这一层 ───────────────────────────────────────────────────
// 软键栏只有三个格子 (左 / 中 / 右), 一个页面能派的动作却有十几个
// (分享 / 收藏 / 稍后再看 / 下载 / 复制链接 …)。
// 全部塞进软键栏是不可能的 —— 240px 宽的屏幕只放得下三个短标签。
//
// 所以把软键栏当成**一级菜单**, 右软键(= "更多") 打开**二级菜单**,
// 二级菜单里的项如果还有子项, 再打开**三级菜单**:
//
//   一级: [ 全屏 ]              [ 播放 ]        [ 更多 ▸ ]   ← 软键栏
//   二级: ┌──────────────────────────────────┐
//         │ 更多操作                    ●●    │
//         │ ──────────────────────────────── │
//         │  UP 主页                        │
//         │  分享                        ▸  │  ← 有子项
//         │  收藏                        ▸  │  ← 有子项
//         └──────────────────────────────────┘
//   三级: ┌──────────────────────────────────┐
//         │ ‹ 分享                     ●●    │  ← 面包屑: 能看出从哪来的
//         │ ──────────────────────────────── │
//         │  复制链接                       │
//         │  分享到动态                     │
//         └──────────────────────────────────┘
//
// ── 层级怎么表示 ───────────────────────────────────────────────────────
// 用**栈** (stack) 而不是"当前层 + 父层"两个字段:
//   stack[0]      → 二级菜单 (根菜单)
//   stack[1]      → 三级菜单
//   stack[2]      → 四级菜单 (有就支持, 没有也不碍事)
//
// 每层记着自己是从哪一项进来的 (parentIndex), 往回退时能把高亮还原到
// 父菜单的那一项 —— 用户按返回键回到上级时, 光标应该还停在他刚才点的那项上。
//
// ── 与软键文案的关系 ───────────────────────────────────────────────────
// 菜单**不碰** `ui.softkeys`:
//   - 菜单没打开时, 软键栏显示的还是页面自己的文案 (左/中/右)
//   - 菜单打开时, 软键栏临时变成菜单的操作提示 (关/选)
// 两者在 SoftkeyBar.svelte 里按 `$softkeyMenu.open` 二选一渲染,
// 所以页面照常 setSoftkeys() 就行, 不用管菜单的存在。
//
// ── 两种用法 ───────────────────────────────────────────────────────────
// A) 页面把某个软键"让"给菜单 (软键栏接管, 页面别再自己绑这个键):
//
//      onKey('video', { ... }, { softkeys: true, menu: () => videoMenu() });
//
//    软键栏会接管该软键: 按它 = 打开菜单, 文案 = label。
//    menu 可以是一个对象, 也可以是一个**函数** —— 函数在菜单打开的那一刻
//    才求值, 所以菜单项能跟着页面的异步状态走 (例如"作者信息到了才能进
//    UP 主页")。
//    菜单跟着按键作用域一起释放 (见 scopes.js), 不会漏到下一个页面。
//
// B) 页面自己派活, 手动开菜单 (软键文案仍然归页面):
//
//      onKey('video', {
//        SoftRight: () => openSoftkeyMenu(videoMenu())
//      }, { softkeys: true });

import { writable, get } from 'svelte/store';

/**
 * 菜单项
 * @typedef {Object} SoftkeyMenuItem
 * @property {string} label 文案
 * @property {string} [icon] 图标 (emoji, 可选)
 * @property {boolean} [disabled] 禁用 (灰掉, 按中键没反应)
 * @property {Function} [action] 叶子项的动作
 * @property {Array<SoftkeyMenuItem>} [items] 子项 → 打开下一级菜单
 */

/**
 * 菜单树 (二级菜单的根)
 * @typedef {Object} SoftkeyMenuTree
 * @property {string} [title] 面板标题 / 面包屑第一级
 * @property {string} [label] 打开菜单的软键文案 (默认「更多」)
 * @property {string} [slot] 菜单占哪个软键: left / right (默认 right)
 *        ⚠️ 不能占 center —— 中间那格是中键 (OK) 的提示, 而中键是
 *        "打开当前选中项" 的语义, 让给菜单会把页面弄哑。
 * @property {Array<SoftkeyMenuItem>} items 菜单项
 */

/**
 * 菜单状态
 * @typedef {Object} SoftkeyMenuState
 * @property {Object|null} registered 注册的菜单树 (未打开时也用它显示软键文案)
 * @property {boolean} open 菜单是否打开
 * @property {Array<{title: string, items: Array, parentIndex: number}>} stack 层级栈
 * @property {number} index 当前层选中项下标
 * @property {number} maxDepth 菜单树的最大层级 (画层级指示点用)
 */

/** @type {import('svelte/store').Writable<SoftkeyMenuState>} */
export const softkeyMenu = writable({
  registered: null,
  open: false,
  stack: [],
  index: 0,
  maxDepth: 1
});

/** 菜单树的原始来源 (对象, 或返回对象的函数) */
let menuSource = null;

/** 当前持有菜单的 owner (一般是按键作用域); null = 页面手动设置的 */
let menuOwner = null;

/**
 * 求值菜单来源 (函数 → 当场调用, 拿到最新的树)
 * @returns {SoftkeyMenuTree|null}
 */
function resolveSource() {
  if (typeof menuSource === 'function') {
    try {
      return menuSource() || null;
    } catch (err) {
      if (typeof console !== 'undefined' && console.error) {
        console.error('[softkey-menu] menu source failed:', err);
      }
      return null;
    }
  }
  return menuSource || null;
}

/**
 * 菜单树的层级深度 (叶子算 1 层)
 * @param {Array} items
 * @returns {number}
 */
function treeDepth(items) {
  let max = 0;
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    if (it && Array.isArray(it.items) && it.items.length) {
      const d = treeDepth(it.items);
      if (d > max) max = d;
    }
  }
  return max + 1;
}

/**
 * 规整菜单树 (补默认值, 丢掉空项)
 * @param {SoftkeyMenuTree|null|undefined} tree
 * @returns {Object|null}
 */
function normalizeTree(tree) {
  if (!tree) return null;
  const items = Array.isArray(tree.items) ? tree.items.filter(Boolean) : [];
  // 只认左/右软键; 其余一律当右软键 (中间那格归中键, 不能让给菜单)
  const slot = tree.slot === 'left' ? 'left' : 'right';
  return {
    title: typeof tree.title === 'string' ? tree.title : '',
    label: typeof tree.label === 'string' && tree.label ? tree.label : '更多',
    slot: slot,
    items: items,
    depth: treeDepth(items)
  };
}

/**
 * 注册菜单树
 *
 * 注册后该软键**归菜单管**: 软键栏显示 tree.label, 按它打开菜单。
 * 页面不要再自己绑这个键 —— 否则文案和行为会对不上
 * (本项目的硬规矩: 文案必须和行为一致)。
 *
 * @param {SoftkeyMenuTree|Function|null} tree 菜单树, 或返回菜单树的函数
 *        (函数在菜单打开的那一刻才求值, 菜单项能跟着异步状态走)
 * @param {Object} [owner] 持有者 (一般是按键作用域); 作用域注销时自动释放
 */
export function setSoftkeyMenu(tree, owner) {
  menuSource = tree || null;
  menuOwner = owner || null;
  softkeyMenu.update(s => ({ ...s, registered: normalizeTree(resolveSource()) }));
}

/**
 * 释放菜单树
 *
 * 只有当前持有者能释放 —— 别的作用域卸载时不能把别人的菜单清掉。
 * 页面手动设置的菜单 (没有 owner) 归页面自己管, 用 clearSoftkeyMenu() 清。
 *
 * @param {Object} owner
 */
export function releaseSoftkeyMenu(owner) {
  if (!menuOwner || menuOwner !== owner) return;
  menuSource = null;
  menuOwner = null;
  softkeyMenu.update(s => ({
    ...s,
    registered: null,
    open: false,
    stack: [],
    index: 0
  }));
}

/**
 * 注销菜单树 (页面手动设置的那种)
 */
export function clearSoftkeyMenu() {
  menuSource = null;
  menuOwner = null;
  softkeyMenu.update(s => ({
    ...s,
    registered: null,
    open: false,
    stack: [],
    index: 0
  }));
}

/**
 * 打开菜单
 *
 * 不传 tree 时用注册的菜单树 (注册的是函数的话, 这里才求值 → 拿到最新的项)。
 *
 * @param {SoftkeyMenuTree} [tree]
 * @returns {boolean} 是否真的打开了 (没有可显示的项就返回 false)
 */
export function openSoftkeyMenu(tree) {
  const cur = get(softkeyMenu);
  const src = tree || resolveSource() || cur.registered;
  const t = normalizeTree(src);
  if (!t || !t.items.length) return false;
  softkeyMenu.update(s => ({
    ...s,
    open: true,
    stack: [{
      title: t.title || t.label,
      items: t.items,
      parentIndex: 0
    }],
    index: 0,
    maxDepth: t.depth
  }));
  return true;
}

/**
 * 关闭菜单 (回到最外层)
 */
export function closeSoftkeyMenu() {
  softkeyMenu.update(s => ({ ...s, open: false, stack: [], index: 0 }));
}

/**
 * 当前层的信息
 * @param {SoftkeyMenuState} [s]
 * @returns {{title: string, items: Array}|null}
 */
export function currentFrame(s) {
  const st = s || get(softkeyMenu);
  if (!st.open || !st.stack.length) return null;
  return st.stack[st.stack.length - 1];
}

/**
 * 上下移动高亮 (到头绕回另一头 —— 菜单是个闭环, 不像列表要卡边界)
 *
 * @param {number} delta -1 向上 / +1 向下
 * @returns {boolean} 是否处理了
 */
export function softkeyMenuMove(delta) {
  const s = get(softkeyMenu);
  if (!s.open || !s.stack.length) return false;
  const frame = s.stack[s.stack.length - 1];
  const n = frame.items.length;
  if (!n) return true;
  let idx = s.index + delta;
  if (idx < 0) idx = n - 1;
  if (idx >= n) idx = 0;
  if (idx !== s.index) {
    softkeyMenu.update(cur => ({ ...cur, index: idx }));
  }
  return true;
}

/**
 * 中键 (OK): 激活当前项
 *
 * 有子项 → 进入下一级; 是叶子 → 执行动作并关闭菜单。
 *
 * @returns {boolean} 是否处理了
 */
export function softkeyMenuActivate() {
  const s = get(softkeyMenu);
  if (!s.open || !s.stack.length) return false;
  const frame = s.stack[s.stack.length - 1];
  const item = frame.items[s.index];
  if (!item) return true;
  if (item.disabled) return true;   // 禁用项: 吞掉按键但什么都不做

  // 有子项 → 下一级 (三级 / 四级…)
  if (Array.isArray(item.items) && item.items.length) {
    softkeyMenu.update(cur => ({
      ...cur,
      stack: cur.stack.concat([{
        // 这一级的标题: 菜单项可以自带 title (比如四级菜单用歌名当标题,
        // 不带 "✓ " 这种前缀); 没写就用项的文案
        title: item.title || item.label || '',
        items: item.items,
        parentIndex: cur.index
      }]),
      index: 0
    }));
    return true;
  }

  // 叶子项 → 执行动作
  if (typeof item.action === 'function') {
    // 先关菜单再执行: 动作里可能弹模态 / 跳路由, 菜单要让位
    closeSoftkeyMenu();
    try {
      item.action(item);
    } catch (err) {
      if (typeof console !== 'undefined' && console.error) {
        console.error('[softkey-menu] action failed:', err);
      }
    }
  }
  return true;
}

/**
 * 返回键: 回到上一级; 已经在最外层就整个关掉
 *
 * @returns {boolean} 是否处理了
 */
export function softkeyMenuBack() {
  const s = get(softkeyMenu);
  if (!s.open) return false;
  if (s.stack.length > 1) {
    const popped = s.stack[s.stack.length - 1];
    softkeyMenu.update(cur => ({
      ...cur,
      stack: cur.stack.slice(0, -1),
      // 高亮还原到父菜单里刚才那一项
      index: typeof popped.parentIndex === 'number' ? popped.parentIndex : 0
    }));
    return true;
  }
  closeSoftkeyMenu();
  return true;
}

/**
 * 左右方向键: → 进入下一级, ← 回到上一级
 *
 * @param {number} dir -1 左 / +1 右
 * @returns {boolean} 是否处理了
 */
export function softkeyMenuSide(dir) {
  const s = get(softkeyMenu);
  if (!s.open || !s.stack.length) return false;
  if (dir > 0) {
    const frame = s.stack[s.stack.length - 1];
    const item = frame.items[s.index];
    if (item && !item.disabled && Array.isArray(item.items) && item.items.length) {
      return softkeyMenuActivate();
    }
    return true;   // 没有子项: 吞掉按键, 不做别的
  }
  if (s.stack.length > 1) return softkeyMenuBack();
  return true;
}

/**
 * 当前层里某一项的下标 (给鼠标点击用)
 * @param {number} i
 * @returns {boolean}
 */
export function softkeyMenuSelect(i) {
  const s = get(softkeyMenu);
  if (!s.open || !s.stack.length) return false;
  const frame = s.stack[s.stack.length - 1];
  if (i < 0 || i >= frame.items.length) return false;
  if (i !== s.index) {
    softkeyMenu.update(cur => ({ ...cur, index: i }));
  }
  return true;
}
