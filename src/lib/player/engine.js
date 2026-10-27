// 听视频 (纯音频) 的播放引擎
//
// ── 为什么音频元素要常驻 ──────────────────────────────────────────────
// 听视频页可以被"最小化": 收起页面, 底部浮一条迷你条, **音频继续放**。
// 所以 <audio> 元素不能属于那个页面 —— 页面一卸载, 声音就断了。
// 它挂在根组件 (App.svelte) 里, 跨路由不销毁; 引擎通过 setAudioElement()
// 拿到引用。
//
// ── 流地址每次重新拉 ──────────────────────────────────────────────────
// B 站的音频地址带有效期 (deadline 参数), 存进播放列表过阵子就失效。
// 播放列表里只存视频信息 (bvid/cid/标题/封面), 每次真正播的时候才去拉地址。

import { get } from 'svelte/store';
import { getVideoInfo, getDashUrls } from '../api/video.js';
import {
  playlist, nowPlaying, playState, currentIndex, miniVisible, miniProgress
} from '../stores/player.js';

/** @type {HTMLAudioElement|null} */
let el = null;
let bound = false;
/** 拉流时的请求序号 (用户连点换歌时, 只认最后一次) */
let loadSeq = 0;

/**
 * 把根组件里的 <audio> 交给引擎
 *
 * @param {HTMLAudioElement|null} e
 */
export function setAudioElement(e) {
  el = e;
  if (el && !bound) {
    bound = true;
    el.addEventListener('timeupdate', onTimeUpdate);
    el.addEventListener('durationchange', onDurationChange);
    el.addEventListener('play', () => patchState({ playing: true }));
    el.addEventListener('pause', () => patchState({ playing: false }));
    el.addEventListener('ended', () => { nextTrack(true); });
    el.addEventListener('error', () => { patchState({ playing: false, loading: false }); });
  }
}

/** @returns {HTMLAudioElement|null} */
export function getAudioElement() {
  return el;
}

function patchState(patch) {
  playState.update(s => ({ ...s, ...patch }));
}

// ── 事件处理 ──────────────────────────────────────────────────────────

function onTimeUpdate() {
  if (!el) return;
  const time = el.currentTime || 0;
  const duration = el.duration && isFinite(el.duration) ? el.duration : 0;
  patchState({ time, duration, playing: !el.paused });
  miniProgress.set(duration > 0 ? Math.min(1, time / duration) : 0);
}

function onDurationChange() {
  if (!el) return;
  const duration = el.duration && isFinite(el.duration) ? el.duration : 0;
  patchState({ duration });
}

// ── 播放 ──────────────────────────────────────────────────────────────

/**
 * 播列表里的第 index 项
 *
 * @param {number} index
 */
export async function playIndex(index) {
  const items = get(playlist).items;
  if (index < 0 || index >= items.length) return;
  const item = items[index];
  currentIndex.set(index);
  nowPlaying.set(item);
  await loadAndPlay(item);
}

/**
 * 直接播某一个视频 (不在播放列表里也能播, 比如从详情页跳过来)
 *
 * @param {Object} item { bvid, cid, title, pic, owner, duration }
 */
export async function playItem(item) {
  if (!item || !item.bvid) return;
  const items = get(playlist).items;
  const at = items.findIndex(v => v.bvid === item.bvid);
  if (at >= 0) {
    currentIndex.set(at);
  } else {
    currentIndex.set(-1);
  }
  nowPlaying.set(item);
  await loadAndPlay(item);
}

/**
 * 拉地址 + 起播
 *
 * @param {any} item
 */
async function loadAndPlay(item) {
  if (!el) return;
  const seq = ++loadSeq;
  patchState({ loading: true });
  try {
    let cid = item.cid;
    if (!cid) {
      const info = await getVideoInfo(item.bvid);
      if (seq !== loadSeq) return;
      cid = info && info.cid;
    }
    if (!cid) throw new Error('拿不到 cid');
    // 听视频只要音频: DASH 的 audio 流 (m4s), 老 Gecko 播得动
    const dash = await getDashUrls(item.bvid, cid, 16);
    if (seq !== loadSeq) return;
    const url = dash && dash.audioUrl;
    if (!url) throw new Error('拿不到音频地址');
    el.src = url;
    el.currentTime = 0;
    el.playbackRate = 1;
    patchState({ rate: 1 });
    await el.play();
    patchState({ playing: true, loading: false, time: 0 });
  } catch (e) {
    if (seq !== loadSeq) return;
    patchState({ playing: false, loading: false });
  }
}

/** 播放 / 暂停切换 */
export function togglePlay() {
  if (!el) return;
  if (!el.src) {
    // 还没开始播: 从当前项开始
    const idx = get(currentIndex);
    if (idx >= 0) playIndex(idx);
    else {
      const items = get(playlist).items;
      if (items.length) playIndex(0);
    }
    return;
  }
  if (el.paused) {
    el.play().catch(() => {});
    patchState({ playing: true });
  } else {
    el.pause();
    patchState({ playing: false });
  }
}

/** 下一首 (播完自动切下一首也走这里) */
export function nextTrack(auto) {
  const items = get(playlist).items;
  if (!items.length) return;
  let idx = get(currentIndex);
  if (idx < 0) idx = 0;
  else idx = idx + 1;
  if (idx >= items.length) {
    // 到底了: 自动连播就停在这, 手动点"下一首"就回到第一首
    if (auto) {
      patchState({ playing: false });
      return;
    }
    idx = 0;
  }
  playIndex(idx);
}

/** 上一首 */
export function prevTrack() {
  const items = get(playlist).items;
  if (!items.length) return;
  let idx = get(currentIndex);
  if (idx <= 0) idx = 0;
  else idx = idx - 1;
  playIndex(idx);
}

/**
 * 跳一段 (快进/快退)
 *
 * @param {number} sec 正数快进, 负数快退
 */
export function seekBy(sec) {
  if (!el || !el.src) return;
  const dur = el.duration && isFinite(el.duration) ? el.duration : 0;
  let t = (el.currentTime || 0) + sec;
  if (t < 0) t = 0;
  if (dur > 0 && t > dur) t = dur;
  try { el.currentTime = t; } catch (e) {}
}

/**
 * 倍速 (长按 → 键 = 2 倍速, 松手恢复 1 倍)
 *
 * @param {number} rate
 */
export function setRate(rate) {
  if (!el) return;
  try {
    el.playbackRate = rate;
  } catch (e) {}
  patchState({ rate });
}

/** 停止播放并清掉"正在播放" */
export function stopPlayback() {
  if (el) {
    try { el.pause(); } catch (e) {}
    try { el.src = ''; } catch (e) {}
  }
  loadSeq++;
  nowPlaying.set(null);
  currentIndex.set(-1);
  miniVisible.set(false);
  patchState({ playing: false, time: 0, duration: 0, rate: 1, loading: false });
  miniProgress.set(0);
}
