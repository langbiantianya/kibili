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
    global: !!opts.global
  };
  scopes.push(scope);
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
  if (i >= 0) scopes.splice(i, 1);
}

/**
 * 按名字批量注销 (兼容旧代码; 优先用 onKey() 返回的注销函数)
 * @param {string} name
 */
export function offKey(name) {
  for (let i = scopes.length - 1; i >= 0; i--) {
    if (scopes[i].name === name) scopes.splice(i, 1);
  }
}

/**
 * 清空所有作用域 (仅测试用)
 */
export function clearKeys() {
  scopes.length = 0;
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
