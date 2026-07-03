// Central keydown bus with a stack of per-route handlers
// 用法: onMount 注册, onDestroy 注销
//   onKey('home', { ArrowDown: () => moveFocus(+1), Enter: () => activateFocused() });
//   offKey('home');

import { isInputFocused } from '../utils/platform.js';
export { moveFocus, focusFirst, activateFocused } from './roving.js';

const stack = [];   // [{ name, map }]
let installed = false;

function matches(map, e) {
  if (!map) return null;
  if (map[e.key]) return map[e.key];
  if (map[e.keyCode]) return map[e.keyCode];
  return null;
}

function install() {
  if (installed) return;
  installed = true;
  window.addEventListener('keydown', e => {
    // T9 / 文本输入框激活时, 让出数字键 / * / #
    if (isInputFocused(e)) return;

    // 自顶向下匹配栈
    for (let i = stack.length - 1; i >= 0; i--) {
      const fn = matches(stack[i].map, e);
      if (fn) {
        e.preventDefault();
        try { fn(e); } catch (err) { console.error('key handler err:', err); }
        return;
      }
    }
  }, false);
}

export function onKey(name, map) {
  install();
  // 若已存在同名, 替换
  const i = stack.findIndex(s => s.name === name);
  if (i >= 0) stack[i] = { name, map };
  else stack.push({ name, map });
}

export function offKey(name) {
  const i = stack.findIndex(s => s.name === name);
  if (i >= 0) stack.splice(i, 1);
}

export function clearKeys() {
  stack.length = 0;
}

export function hasKeyHandler() {
  return stack.length > 0;
}
