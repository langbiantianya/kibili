// 按键检测的共享状态
//
// 为什么要放在模块里而不是组件里:
//   检测页可能被软键退出, 数据得留下来; 重新进入时还能看到上一次测到的结果。
//
// 同时把数据挂到 window.__keytest 上 —— 这样在真机上不用人眼看屏幕, 直接
//   node scripts/device-console.js --eval 'JSON.stringify(window.__keytest)'
// 就能把实测结果拉回机器上做比对。
//
// 检测页本身只负责"把原始事件喂进来", 归一化 (canonicalKey) 仍然用
// lib/keyboard/keys.js —— 也就是说这里显示的"框架规范名"就是框架真正用的那个,
// 不存在"检测页自己另算一套"的问题。

import { writable } from 'svelte/store';

/** 日志最多留多少条 */
const MAX_LOG = 12;

function blank() {
  return { log: [], seen: {}, unknown: [], last: null, total: 0 };
}

/**
 * 检测状态
 * @type {import('svelte/store').Writable<Object>}
 */
export const keytest = writable(blank());

/**
 * 把当前状态挂到 window 上 (真机用 adb 拉结果)
 * @param {Object} state
 */
function publish(state) {
  if (typeof window === 'undefined') return;
  window.__keytest = {
    total: state.total,
    last: state.last,
    log: state.log,
    seen: state.seen,
    unknown: state.unknown
  };
}

/**
 * 记录一次按键
 *
 * @param {Object} rec
 * @param {string} rec.dom    原始 e.key
 * @param {string} rec.code   原始 e.code
 * @param {number} rec.keyCode 原始 e.keyCode
 * @param {boolean} rec.repeat
 * @param {string} rec.name   框架归一化后的规范名 ('' = 框架认不出来)
 * @param {boolean} [rec.text] 是否是文字类按键
 */
export function recordKey(input) {
  keytest.update(s => {
    // 给每条记录一个递增 id —— 日志列表要用它当 key, Date.now() 会撞
    const rec = Object.assign({ id: s.total + 1 }, input);
    const seen = Object.assign({}, s.seen);
    if (rec.name) {
      const prev = seen[rec.name];
      seen[rec.name] = {
        dom: rec.dom,
        code: rec.code,
        keyCode: rec.keyCode,
        count: (prev ? prev.count : 0) + 1
      };
    }
    // 框架认不出来的原始 key 单独记一份 —— 这是最需要警惕的一类
    const unknown = rec.name
      ? s.unknown
      : [rec.dom].concat(s.unknown.filter(x => x !== rec.dom)).slice(0, MAX_LOG);

    const next = {
      log: [rec].concat(s.log).slice(0, MAX_LOG),
      seen: seen,
      unknown: unknown,
      last: rec,
      total: s.total + 1
    };
    publish(next);
    return next;
  });
}

/**
 * 清空检测数据
 */
export function clearKeytest() {
  const next = blank();
  publish(next);
  keytest.set(next);
}

// 真机自动化用: 通过 adb 清空检测数据, 不用真去按左软键
//   node scripts/device-console.js --eval 'window.__keytestReset()'
if (typeof window !== 'undefined') {
  window.__keytestReset = clearKeytest;
}
