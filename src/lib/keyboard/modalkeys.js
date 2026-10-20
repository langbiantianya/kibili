// 模态组件 (回复框等) 的按键独占
//
// ── 旧实现的问题 ───────────────────────────────────────────────────────
// 旧实现在 window 的**捕获阶段**处理按键并调用 stopImmediatePropagation():
//
//   window.addEventListener('keydown', handler, true)   // 捕获阶段
//   ...
//   e.stopImmediatePropagation()
//
// 捕获阶段在 window 上调用 stopImmediatePropagation(), 事件就**不会再往下传**,
// 目标元素 (textarea) 根本收不到 keydown —— 退格键删不掉字。
// 而且它靠一个 pendingKeyUp 标志吞掉后续 keyup, 这个标志在模态关闭后不会复位,
// 会把之后任意一次 keyup 吞掉 (比如刚关掉回复框, 紧接着的"中键"就没反应)。
//
// ── 新实现 ─────────────────────────────────────────────────────────────
// 模态框注册一个 exclusive scope。独占期间:
//   - 只有模态声明的按键会被处理 (左软键=取消 / 右软键=发送 / 中键=发送)
//   - 模态没声明的按键**不** preventDefault, 输入框照常编辑文字、移动光标
//   - 没有 pendingKeyUp 之类的跨事件标志, 不会误吞后续按键
//
// 用法:
//   let closeScope = null;
//   function open() {
//     closeScope = openModalScope('reply', {
//       SoftLeft:  () => close(),
//       SoftRight: () => send(),
//       Enter:     () => send(),
//       Back:      () => { if (!textarea.value) close(); }
//     });
//   }
//   function close() {
//     if (closeScope) { closeScope(); closeScope = null; }
//   }

import { onKey } from './scopes.js';

/** 模态作用域的优先级 (高于页面, 低于框架兜底) */
export const MODAL_PRIORITY = 100;

/**
 * 打开一个模态按键作用域
 *
 * @param {string} name 名字 (调试用)
 * @param {Object<string, Function|Object>} map 按键表
 * @param {Object} [opts]
 * @param {number} [opts.priority=100]
 * @returns {Function} 关闭函数 (同时注销作用域)
 */
export function openModalScope(name, map, opts) {
  opts = opts || {};
  return onKey(name, map, {
    exclusive: true,
    priority: typeof opts.priority === 'number' ? opts.priority : MODAL_PRIORITY
  });
}

/**
 * 关闭模态作用域
 * @param {Function} closer openModalScope 返回的关闭函数
 */
export function closeModalScope(closer) {
  if (typeof closer === 'function') closer();
}

/**
 * 是否正处于模态独占状态
 * @param {Function} getExclusiveScope 由 scopes.js 提供
 * @returns {boolean}
 */
export function isModalActive(getExclusiveScope) {
  return typeof getExclusiveScope === 'function' && !!getExclusiveScope();
}
