// 播放模式 (顺序播放 / 列表循环 / 单曲循环 / 随机播放)
//
// ── 为什么单独一个文件 ──────────────────────────────────────────────────
// 这个文件是**纯逻辑**: 不碰 DOM、不碰网络、不碰 store。
// 引擎 (player/engine.js) 只问它"下一首该是谁", 无头自测
// (scripts/test-keyboard.js) 也能直接测这几条分支, 不用起真机。
//
// ── 四种模式各是什么行为 ────────────────────────────────────────────────
//   顺序播放 order        播完最后一首就停
//   列表循环 repeat-list  播完最后一首回到第一首, 一直循环
//   单曲循环 repeat-one   这一首反复播 (手动点「下一首」还是往下走一首)
//   随机播放 shuffle      随机来下一首 (不会又选中正在放的这首)
//
// ── 动作只有三种 ────────────────────────────────────────────────────────
//   { type: 'play',   index }  播列表里的第 index 项 (要重新拉流)
//   { type: 'replay', index }  把当前这首从头再放一遍 (不重新拉流)
//   { type: 'stop',   index }  到头了, 停下来

/**
 * @typedef {'order'|'repeat-list'|'repeat-one'|'shuffle'} PlayModeId
 */

/**
 * 播放模式表 (菜单里的顺序 = 这里面的顺序)
 *
 * @type {Array<{id: PlayModeId, label: string, hint: string}>}
 */
export const PLAY_MODES = [
  { id: 'repeat-one', label: '单曲循环', hint: '反复播这一首' },
  { id: 'repeat-list', label: '列表循环', hint: '播完回到第一首' },
  { id: 'order', label: '顺序播放', hint: '播完最后一首就停' },
  { id: 'shuffle', label: '随机播放', hint: '随机来下一首' }
];

/** 默认模式 (没存过 / 存坏了都是它) */
export const DEFAULT_PLAY_MODE = 'order';

/**
 * 这是不是一个认识的模式 id
 *
 * @param {any} id
 * @returns {boolean}
 */
export function isPlayMode(id) {
  for (let i = 0; i < PLAY_MODES.length; i++) {
    if (PLAY_MODES[i].id === id) return true;
  }
  return false;
}

/**
 * 模式 id → 文案 (不认识的一律当顺序播放)
 *
 * @param {any} id
 * @returns {string}
 */
export function playModeLabel(id) {
  for (let i = 0; i < PLAY_MODES.length; i++) {
    if (PLAY_MODES[i].id === id) return PLAY_MODES[i].label;
  }
  return playModeLabel(DEFAULT_PLAY_MODE);
}

/**
 * 模式 id → 副提示 (菜单里那一行小字)
 *
 * @param {any} id
 * @returns {string}
 */
export function playModeHint(id) {
  for (let i = 0; i < PLAY_MODES.length; i++) {
    if (PLAY_MODES[i].id === id) return PLAY_MODES[i].hint;
  }
  return playModeHint(DEFAULT_PLAY_MODE);
}

/**
 * 下一首该干嘛
 *
 * @param {PlayModeId} mode  当前播放模式
 * @param {number} cur        正在播的是列表里的第几项 (-1 = 还没开始)
 * @param {number} len        列表有多长
 * @param {boolean} auto      true = 播完自动接下一首; false = 用户手动点「下一首」
 * @param {Function} [rnd]    随机数 (自测可以注入一个假的)
 * @returns {{type: 'play'|'replay'|'stop', index: number}}
 */
export function nextAction(mode, cur, len, auto, rnd) {
  if (!len || len < 1) return { type: 'stop', index: -1 };
  // 还没开始 (或者当前下标越界了) → 从第一首放
  if (cur < 0 || cur >= len) return { type: 'play', index: 0 };

  // 单曲循环: 播完 → 这首从头再来一遍
  if (mode === 'repeat-one') {
    if (auto) return { type: 'replay', index: cur };
    // 手动点「下一首」→ 还是往下走一首 (不然按了像坏了)
    return { type: 'play', index: (cur + 1) % len };
  }

  // 随机播放: 随便挑一首 (不会又挑中正在放的这首)
  if (mode === 'shuffle') {
    if (len < 2) return { type: 'replay', index: cur };
    return { type: 'play', index: pickRandom(len, cur, rnd) };
  }

  const idx = cur + 1;
  if (idx < len) return { type: 'play', index: idx };
  // 到底了: 顺序播放就停在这儿; 列表循环 (和手动点「下一首」) 回到第一首
  if (auto && mode !== 'repeat-list') return { type: 'stop', index: -1 };
  return { type: 'play', index: 0 };
}

/**
 * 上一首该干嘛
 *
 * 随机播放不做"回上一首"(没存播放历史, 硬凑一个会让人以为有历史),
 * 一律按列表顺序往回走。
 *
 * @param {PlayModeId} mode
 * @param {number} cur
 * @param {number} len
 * @returns {{type: 'play'|'replay'|'stop', index: number}}
 */
export function prevAction(mode, cur, len) {
  if (!len || len < 1) return { type: 'stop', index: -1 };
  if (cur < 0 || cur >= len) return { type: 'play', index: 0 };
  if (cur > 0) return { type: 'play', index: cur - 1 };
  // 本来就是第一首: 列表循环往回绕到最后一首, 其它模式停在第一首
  if (mode === 'repeat-list') return { type: 'play', index: len - 1 };
  return { type: 'play', index: 0 };
}

/**
 * 随机挑一个下标 (避开 cur)
 *
 * @param {number} len
 * @param {number} cur
 * @param {Function} [rnd]
 * @returns {number}
 */
function pickRandom(len, cur, rnd) {
  const r = typeof rnd === 'function' ? rnd : Math.random;
  let idx = Math.floor(r() * len);
  if (!isFinite(idx) || idx < 0) idx = 0;
  if (idx >= len) idx = len - 1;
  // 别又选中正在放的这首
  if (len > 1 && idx === cur) idx = (idx + 1) % len;
  return idx;
}
