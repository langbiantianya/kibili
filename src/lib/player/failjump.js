// 某首放不了 → 该跳到哪一首?
//
// ── 为什么单独一个文件 ────────────────────────────────────────────────────
// 和 player/playmode.js 一个思路: **纯逻辑**, 不碰 DOM、不碰网络、不碰 store。
// 引擎 (player/engine.js) 只问它"跳到第几首", 无头自测
// (scripts/test-keyboard.js) 也能直接测这几条分支, 不用起真机。
//
// ── 和"手动点下一首"不一样 ────────────────────────────────────────────────
//   单曲循环 repeat-one  → 也当下一首处理 (反复播一首放不了的歌没意义)
//   顺序播放 order       → 到最后一首就停 (不绕回第一首)
//   列表循环 repeat-list → 绕回第一首
//   随机播放 shuffle     → 随便挑一首 (别又挑中放不了的这首)

import { pickRandom } from './playmode.js';

/**
 * 某首放不了 → 跳到列表里的第几首
 *
 * @param {import('./playmode.js').PlayModeId} mode  当前播放模式
 * @param {number} cur    正在放的是列表里的第几项 (-1 = 还没开始 / 不在列表里)
 * @param {number} len    列表有多长
 * @param {Function} [rnd] 随机数 (自测可以注入一个假的)
 * @returns {number} 要跳到的下标; -1 = 到头了, 停下来 (别再跳)
 */
export function failJumpIndex(mode, cur, len, rnd) {
  // 列表空着 → 没什么可跳的, 停
  if (!len || len < 1) return -1;
  // 当前这首不在列表里 → 从第一首开始
  if (cur < 0 || cur >= len) return 0;

  const idx = cur + 1;
  if (idx < len) return idx;

  // 已经是最后一首了:
  //   顺序播放 → 到头了, 停 (不绕回第一首)
  if (mode === 'order') return -1;
  //   随机播放 → 随便挑一首 (别又挑中放不了的这首)
  if (mode === 'shuffle') {
    if (len < 2) return 0;
    return pickRandom(len, cur, rnd);
  }
  //   单曲循环 / 列表循环 → 绕回第一首
  //     (单曲循环当下一首处理: 反复播一首放不了的歌没意义)
  return 0;
}
