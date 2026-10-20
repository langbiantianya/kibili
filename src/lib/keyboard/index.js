// 按键导航总线
//
// 整个应用只有这一个按键入口。视图不再各自监听 window, 而是注册"按键作用域"
// (scope), 由总线统一分发。这样可以一次性解决:
//
//   1. 旧实现里 "视图自己 addEventListener('keydown')" 与 "全局总线" 两套体系并存,
//      同一次按键可能被处理两遍 (播放器: 软键在 keyup 触发, 页面在 keydown 触发)。
//   2. 路由切换时旧页面的 handler 残留, 抢走新页面的按键。
//   3. keydown 与 keyup 的 e.key 名字可能不同, 长按定时器因此泄漏。
//      现在 keydown/keyup 走同一套归一化, 长按状态由总线统一维护。
//   4. 输入框聚焦时旧实现是"一票否决" —— 所有按键都被丢掉, 连方向键都不能用。
//      现在只有文字类按键让给输入法, 方向键/中键/软键仍然可以交给页面。
//
// ── 分发顺序 ───────────────────────────────────────────────────────────
//   1. 模态框 (exclusive scope) 独占期间: 只有模态能响应, 且只对它声明的按键
//      preventDefault —— 输入框照常编辑文字。
//   2. 输入框聚焦: 文字类按键 (数字/字母/空格/退格/标点) 直接放行给输入法。
//   3. 按优先级从高到低找第一个能处理该键的 scope。
//   4. 都没处理时走框架默认行为: Up/Down = 焦点漫游, Enter = 激活当前焦点。
//
// ── 快捷键表写法 ───────────────────────────────────────────────────────
//   onKey('demo', {
//     Up: () => {},                       // keydown 立即触发
//     SoftLeft: { press: fn, long: fn2 }  // press 在 keyup (短按), long 长按触发
//   })

import { canonicalKey, isTextKey, matchKey, learnKeyCode, SYSTEM_KEYS, LEGACY_ALIAS } from './keys.js';
import {
  moveFocus, focusFirst, focusLast, activateFocused, getFocusables,
  currentRegion, findNavRoot, isNavable, roam,
  scrollIntoViewCenter, findScroller, setLastFocused
} from './roving.js';
import {
  onKey, offKey, clearKeys, hasKeyHandler, activeScopes,
  exclusiveScope, describeScopes
} from './scopes.js';

export {
  onKey, offKey, clearKeys, hasKeyHandler, activeScopes, exclusiveScope,
  moveFocus, focusFirst, focusLast, activateFocused, getFocusables,
  currentRegion, findNavRoot, isNavable, roam, scrollIntoViewCenter, findScroller,
  canonicalKey, isTextKey, matchKey, SYSTEM_KEYS
};

/** 默认长按阈值 (ms) */
const LONG_PRESS_THRESHOLD = 400;
/** 默认长按重复间隔 (ms) */
const LONG_PRESS_REPEAT = 800;

let installed = false;

/** 当前按下的键 (规范名 → true) */
const pressed = {};

/** 长按状态: 规范名 → { spec, longFired, longTimer, repeatTimer, scope } */
const holds = {};

/**
 * 安装全局监听 (只会装一次)
 */
export function installKeyboard() {
  if (installed) return;
  installed = true;
  window.addEventListener('keydown', onKeyDown, false);
  window.addEventListener('keyup', onKeyUp, false);
  // Gecko 48 没有 focusin 事件, 用捕获阶段的 focus 事件代替
  window.addEventListener('focus', onFocusCapture, true);
}

/**
 * 捕获阶段记录最近焦点
 * @param {FocusEvent} e
 */
function onFocusCapture(e) {
  // 记录到 roving.js, 供 currentRegion() 推断焦点应该落在哪个区域
  setLastFocused(e.target);
}

/**
 * 元素是否是文字输入控件
 * @param {Element} el
 * @returns {boolean}
 */
function isTextField(el) {
  if (!el || !el.tagName) return false;
  const tag = el.tagName.toUpperCase();
  if (tag === 'TEXTAREA') return true;
  if (tag !== 'INPUT') return false;
  const type = (el.getAttribute('type') || 'text').toLowerCase();
  // button / checkbox / radio 之类的 input 不算文字输入
  return ['text', 'search', 'url', 'tel', 'email', 'password', 'number', ''].indexOf(type) >= 0;
}

/**
 * 元素是否是下拉框 (方向键归它自己, 不做默认漫游)
 * @param {Element} el
 * @returns {boolean}
 */
function isSelectWidget(el) {
  return !!(el && el.tagName && el.tagName.toUpperCase() === 'SELECT');
}

/**
 * 在 scope 的按键表里查找处理器
 * @param {Object} map
 * @param {string} key 规范名
 * @param {KeyboardEvent} e
 * @returns {Function|Object|null}
 */
function lookup(map, key, e) {
  if (!map) return null;
  if (map[key]) return map[key];
  // 兼容旧的 'ArrowUp' 写法
  const legacy = LEGACY_ALIAS[key];
  if (legacy && map[legacy]) return map[legacy];
  // 兜底: 原始 e.key / keyCode
  if (e && e.key && map[e.key]) return map[e.key];
  if (e && e.keyCode && map[e.keyCode]) return map[e.keyCode];
  return null;
}

/**
 * 全局 keydown 处理
 * @param {KeyboardEvent} e
 */
function onKeyDown(e) {
  const key = canonicalKey(e);
  if (!key) return;
  pressed[key] = true;

  // 自学习 keyCode → 规范名: 不同机型同一按键的 keyCode 可能不同,
  // 见过一次之后, 之后 e.key === 'Unidentified' 的事件也能认出来
  learnKeyCode(e);

  // 1) 模态框独占
  const modal = exclusiveScope();
  if (modal) {
    const spec = lookup(modal.map, key, e);
    if (spec) {
      if (runSpec(spec, key, e, modal)) e.preventDefault();
    }
    // 模态没声明的按键一律放行, 让输入框/页面自己处理
    return;
  }

  // 2) 输入框聚焦时的文字键让给输入法
  const target = e.target;
  if (isTextField(target) && isTextKey(key)) return;

  // 3) 按优先级找能处理该键的 scope
  //    处理器返回 false 表示"我没处理" → 继续找优先级更低的作用域
  const scopes = activeScopes();
  for (let i = 0; i < scopes.length; i++) {
    const scope = scopes[i];
    const spec = lookup(scope.map, key, e);
    if (!spec) {
      // 该作用域没具名声明这个键, 但声明了 catchAll → 它接管
      // (用于"本页吃掉所有按键"的场景, 例如按键检测页)
      if (!scope.catchAll) continue;
      if (runSpec(scope.catchAll, key, e, scope)) {
        e.preventDefault();
        return;
      }
      continue;
    }
    if (runSpec(spec, key, e, scope)) {
      e.preventDefault();
      return;
    }
  }

  // 4) 框架默认行为
  //    输入框/下拉框聚焦时不做默认导航, 除非页面显式处理了
  if (isTextField(target) || isSelectWidget(target)) return;

  //    系统键 (电源/相机/拨号/短信/通知/语音助手...) 一律不拦截:
  //    官方文档要求 "Never block the user from leaving your app",
  //    长按电源/挂断键要能直接退出应用, 应用不能吞掉它们。
  if (SYSTEM_KEYS.indexOf(key) >= 0) return;

  if (defaultAction(key, e)) {
    e.preventDefault();
  }
}

/**
 * 框架默认行为
 *
 * @param {string} key 规范名
 * @param {KeyboardEvent} e
 * @returns {boolean} 是否处理了
 */
function defaultAction(key, e) {
  if (key === 'Up') return moveFocus(-1);
  if (key === 'Down') return moveFocus(1);
  if (key === 'Enter') {
    // 按住不放会连发 keydown (e.repeat), 不能反复激活同一个元素
    if (e && e.repeat) return false;
    return activateFocused();
  }
  return false;
}

/**
 * 执行按键处理器
 *
 * 两种写法:
 *   - 函数        → 立即在 keydown 触发
 *   - { press, long, repeat, threshold } → press 在 keyup 触发 (短按),
 *                     long 在长按 threshold 毫秒后触发, 之后每 repeat 毫秒重复
 *
 * 函数返回 false 表示"我没处理这个键" —— 总线不会 preventDefault,
 * 键会继续走浏览器默认行为 (例如退格键删字)。模态框的退格键就靠这个:
 * 输入框非空时返回 false, 让 textarea 正常删字; 为空时才拦截并关闭。
 *
 * @param {Function|Object} spec
 * @param {string} key
 * @param {KeyboardEvent} e
 * @param {Object} scope
 * @returns {boolean} 是否真的处理了 (决定要不要 preventDefault)
 */
function runSpec(spec, key, e, scope) {
  if (typeof spec === 'function') {
    const r = safeCall(spec, e, key);
    return r !== false;
  }
  if (!spec || typeof spec !== 'object') return false;

  handleSpec(spec, key, e, scope);
  return true;
}

/**
 * 建立长按状态 (对象式按键表的实现)
 *
 * @param {Object} spec
 * @param {string} key
 * @param {KeyboardEvent} e
 * @param {Object} scope
 */
function handleSpec(spec, key, e, scope) {
  if (typeof spec === 'function') {
    safeCall(spec, e, key);
    return;
  }
  if (!spec || typeof spec !== 'object') return;

  // 已经在按住中 (系统自动重复): 长按由 repeat 定时器负责, 这里不重复起定时器
  if (holds[key]) {
    if (e.repeat && spec.long && holds[key].longFired) {
      // 交给 repeat 定时器, 不在这里重复触发
    }
    return;
  }

  const hold = {
    spec: spec,
    scope: scope,
    longFired: false,
    longTimer: null,
    repeatTimer: null
  };
  holds[key] = hold;

  const threshold = typeof spec.threshold === 'number' ? spec.threshold : LONG_PRESS_THRESHOLD;
  const repeat = typeof spec.repeat === 'number' ? spec.repeat : LONG_PRESS_REPEAT;

  if (spec.long) {
    hold.longTimer = setTimeout(() => {
      hold.longFired = true;
      safeCall(spec.long, e, key);
      if (spec.repeat !== false) {
        hold.repeatTimer = setInterval(() => {
          safeCall(spec.long, e, key);
        }, repeat);
      }
    }, threshold);
  }
}

/**
 * 全局 keyup 处理 (只用于收尾长按状态, 不分发按键)
 * @param {KeyboardEvent} e
 */
function onKeyUp(e) {
  const key = canonicalKey(e);
  if (!key) return;
  delete pressed[key];

  const hold = holds[key];
  if (!hold) return;
  delete holds[key];

  if (hold.longTimer) clearTimeout(hold.longTimer);
  if (hold.repeatTimer) clearInterval(hold.repeatTimer);

  // release 一定会被调用 (用于"长按期间进入某种状态, 松手时恢复"这类逻辑)
  if (hold.spec && typeof hold.spec.release === 'function') {
    safeCall(hold.spec.release, e, key);
  }

  // 长按已经触发过就不再触发短按
  if (!hold.longFired && hold.spec && typeof hold.spec.press === 'function') {
    safeCall(hold.spec.press, e, key);
  }
}

/**
 * 调用处理器, 捕获异常避免一个页面的报错把整个按键系统带崩
 * @param {Function} fn
 * @param {KeyboardEvent} e
 * @param {string} key
 * @returns {*} 处理器的返回值 (false 表示"没处理")
 */
function safeCall(fn, e, key) {
  try {
    return fn(e, key);
  } catch (err) {
    if (typeof console !== 'undefined' && console.error) {
      console.error('[keyboard] handler failed for key ' + key + ':', err);
    }
    return undefined;
  }
}

/**
 * 当前某个键是否处于按下状态
 * @param {string} key 规范名
 * @returns {boolean}
 */
export function isKeyDown(key) {
  return !!pressed[canonicalKey({ key: key })];
}

/**
 * 调试: 列出当前作用域
 * @returns {Array<string>}
 */
export function describe() {
  return describeScopes();
}
