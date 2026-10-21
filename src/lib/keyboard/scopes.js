// 按键作用域 (scope) 注册表
//
// 一个 scope = "某个界面/组件想接管哪些按键"。
// 视图通过 onKey() 注册, 组件销毁时注销。
//
// ── 为什么不用"名字 + 全局栈" ──────────────────────────────────────────
// 旧实现是 onKey(name, map) 往一个全局数组 push, offKey(name) 按名字 splice。
// Svelte 3 的组件替换顺序是"新组件先 onMount, 旧组件后 onDestroy", 于是:
//   新实例 onKey('home', ...)   → 覆盖旧实例的 handler
//   旧实例 offKey('home')       → 把新实例的 handler 删掉了
// 结果是路由切换后按键完全失灵, 或者旧页面的 handler 残留抢键。
//
// 现在每个 scope 是独立对象, onKey() 返回它自己的注销函数:
//   onMount(() => onKey('home', map))   ← Svelte 会把返回值当 onDestroy 回调
// 组件销毁时只会移除"自己"注册的那个 scope, 同名实例之间互不干扰。
//
// ── 优先级 ─────────────────────────────────────────────────────────────
// 旧实现是"最后注册的优先", 隐式且脆弱。现在显式声明 priority:
//   100  模态框 (exclusive, 独占)
//    10  播放器这类需要压过页面默认行为的作用域
//     0  页面/组件 (默认)
//  -100  应用级兜底 (返回键) —— 全局 scope, 任何页面没接管时才生效
// 同优先级仍然按"后注册优先", 保持直觉。
//
// ── 软键栏的所有权 ────────────────────────────────────────────────────
// 参考 KaiUI 的 SoftKey 组件: 软键的**文案**和**处理器**应该由同一个对象持有,
// 组件卸载时一起释放, 否则会出现"软键栏写着刷新、按下去没人响应"这类问题。
//
// onKey() 的 opts.softkeys 让本作用域接管软键栏:
//   softkeys: true                → 只接管生命周期, 文案由页面自己 setSoftkeys() 改
//   softkeys: [left,right,center] → 接管并立即设置成这三个文案
// 作用域注销时自动还原。
//
// opts.menu 让本作用域接管软键栏的**二级/三级菜单** (见 stores/softkey.js):
//   menu: { label, title, items }        → 菜单树 (对象)
//   menu: () => ({ label, title, items }) → 返回菜单树的函数 (打开菜单时才求值)
// 作用域注销时菜单自动释放, 不会漏到下一个页面。

import { claimSoftkeys, releaseSoftkeys } from '../stores/ui.js';
import { setSoftkeyMenu, releaseSoftkeyMenu } from '../stores/softkey.js';

/** @type {Array<Object>} */
let scopes = [];
let seq = 0;

/**
 * 注册一个按键作用域
 *
 * @param {string} name 作用域名 (仅用于调试与批量注销)
 * @param {Object<string, Function|Object>} map 按键表
 *        键名用规范名: Up / Down / Left / Right / Enter / SoftLeft / SoftRight /
 *        Back / 数字字符。值可以是:
 *          - 函数        → keydown 立即触发
 *          - { press, long, repeat, threshold } → press 在 keyup 触发 (短按),
 *                          long 在长按 threshold 毫秒后触发, repeat 毫秒后重复触发
 * @param {Object} [opts]
 * @param {number} [opts.priority=0] 优先级, 越大越优先
 * @param {boolean} [opts.exclusive=false] 独占: 生效期间只有它能响应按键
 * @param {boolean} [opts.global=false] 全局: 路由切换时不清理
 * @param {Function} [opts.catchAll] 兜底处理器: 接管本作用域**没具名声明**的
 *        任何按键。用于"本页要吃掉所有按键"的场景 (例如按键检测页:
 *        不能让任何键把页面带走)。返回 false 表示不处理, 继续往下找。
 * @param {boolean|Array<string>} [opts.softkeys] 接管软键栏
 *        true → 只接管生命周期 (文案由页面自己 setSoftkeys 改)
 *        [left, right, center] → 接管并立即设置成这三个文案
 *        作用域注销时自动还原 (参考 KaiUI SoftKey 的 unregisterSoftKeys)
 * @param {Object|Function} [opts.menu] 接管软键栏的二级/三级菜单
 *        对象或返回对象的函数 (函数在菜单打开时才求值, 菜单项能跟着异步状态走)
 *        作用域注销时自动释放
 * @returns {Function} 注销函数
 */
export function onKey(name, map, opts) {
  opts = opts || {};
  const scope = {
    id: ++seq,
    name: name,
    map: map || {},
    priority: typeof opts.priority === 'number' ? opts.priority : 0,
    exclusive: !!opts.exclusive,
    global: !!opts.global,
    catchAll: typeof opts.catchAll === 'function' ? opts.catchAll : null,
    softkeys: opts.softkeys || null,
    menu: opts.menu || null
  };
  scopes.push(scope);

  // 接管软键栏: 文案和处理器由同一个作用域持有, 注销时一起释放
  if (scope.softkeys) {
    const labels = Array.isArray(scope.softkeys) ? scope.softkeys : null;
    claimSoftkeys(scope, labels);
  }
  // 接管软键菜单 (二级/三级): 同样跟着作用域一起释放
  if (scope.menu) {
    setSoftkeyMenu(scope.menu, scope);
  }
  return function off() {
    removeScope(scope);
  };
}

/**
 * 移除一个 scope 对象 (内部使用)
 * @param {Object} scope
 */
export function removeScope(scope) {
  const i = scopes.indexOf(scope);
  if (i >= 0) {
    scopes.splice(i, 1);
    // 一并归还软键栏
    if (scope.softkeys) releaseSoftkeys(scope);
    // 一并归还软键菜单
    if (scope.menu) releaseSoftkeyMenu(scope);
  }
}

/**
 * 按名字批量注销 (兼容旧代码; 优先用 onKey() 返回的注销函数)
 * @param {string} name
 */
export function offKey(name) {
  for (let i = scopes.length - 1; i >= 0; i--) {
    if (scopes[i].name === name) removeScope(scopes[i]);
  }
}

/**
 * 清空所有作用域 (仅测试用)
 */
export function clearKeys() {
  while (scopes.length) {
    removeScope(scopes[scopes.length - 1]);
  }
}

/**
 * 是否还有任何作用域
 * @returns {boolean}
 */
export function hasKeyHandler() {
  return scopes.length > 0;
}

/**
 * 当前生效的作用域, 按优先级从高到低排列
 * @returns {Array<Object>}
 */
export function activeScopes() {
  return scopes.slice().sort((a, b) => {
    if (a.priority !== b.priority) return b.priority - a.priority;
    return b.id - a.id;
  });
}

/**
 * 当前生效的独占作用域 (模态框)
 * @returns {Object|null}
 */
export function exclusiveScope() {
  for (let i = scopes.length - 1; i >= 0; i--) {
    if (scopes[i].exclusive) return scopes[i];
  }
  return null;
}

/**
 * 调试用: 列出所有作用域
 * @returns {Array<string>}
 */
export function describeScopes() {
  return activeScopes().map(s => s.name + '(' + s.priority + (s.exclusive ? ',exclusive' : '') + ')');
}
